from fastapi import APIRouter, HTTPException, Depends
import duckdb
import os
import uuid
import numpy as np
from datetime import datetime

from database import db
from models.metadata import SavedModelMetadata
from models.query import QueryRequest, GenerateRequest, ObservationQueryRequest, SaveModelRequest, PredictionQueryRequest
from routers.auth import get_current_user

router = APIRouter(prefix="/query", tags=["query"])
STORAGE_DIR = "data/storage"

async def build_duckdb_query(request: QueryRequest, current_user: dict):
    # Get unique table_ids involved
    table_ids = set()
    for col in request.columns:
        table_ids.add(col.table_id)
        
    if not table_ids:
        raise HTTPException(status_code=400, detail="No columns selected.")
        
    # Fetch file metadata from MongoDB
    files = await db.table_metadata.find({"table_id": {"$in": list(table_ids)}}).to_list(length=100)
    file_map = {f["table_id"]: f for f in files}
    
    for tid in table_ids:
        if tid not in file_map:
            raise HTTPException(status_code=404, detail=f"Table {tid} not found or inaccessible.")
            
    # Build FROM and JOIN clauses
    table_list = list(table_ids)
    base_table_id = table_list[0]
    base_path = file_map[base_table_id]["storage_path"]
    
    # Use double quotes for identifiers and single quotes for strings (paths)
    from_clause = f"FROM '{base_path}' AS \"{base_table_id}\""
    
    join_clauses = []
    joined_tables = {base_table_id}
    
    if len(table_ids) > 1:
        if request.joins and len(request.joins) > 0:
            relationships = [j.model_dump() for j in request.joins]
        else:
            # Fetch relationships from DB as fallback
            rels_cursor = db.relationships.find({
                "is_active": True,
                "source_table_id": {"$in": list(table_ids)},
                "target_table_id": {"$in": list(table_ids)},
                "created_by": str(current_user["_id"])
            })
            relationships = await rels_cursor.to_list(length=1000)
        
        pending_rels = relationships[:]
        
        while pending_rels:
            progress = False
            for r in pending_rels[:]:
                src = r["source_table_id"]
                tgt = r["target_table_id"]
                j_type = r.get("join_type", "INNER").upper()
                
                if tgt not in joined_tables and src in joined_tables:
                    tgt_path = file_map[tgt]["storage_path"]
                    join_clauses.append(f"{j_type} JOIN '{tgt_path}' AS \"{tgt}\" ON \"{src}\".\"{r['source_column']}\" = \"{tgt}\".\"{r['target_column']}\"")
                    joined_tables.add(tgt)
                    pending_rels.remove(r)
                    progress = True
                elif src not in joined_tables and tgt in joined_tables:
                    src_path = file_map[src]["storage_path"]
                    flipped_type = j_type
                    if j_type == "LEFT": flipped_type = "RIGHT"
                    elif j_type == "RIGHT": flipped_type = "LEFT"
                    
                    join_clauses.append(f"{flipped_type} JOIN '{src_path}' AS \"{src}\" ON \"{tgt}\".\"{r['target_column']}\" = \"{src}\".\"{r['source_column']}\"")
                    joined_tables.add(src)
                    pending_rels.remove(r)
                    progress = True
                elif src in joined_tables and tgt in joined_tables:
                    # Already joined both
                    pending_rels.remove(r)
                    progress = True
                    
            if not progress:
                break
                
    if len(joined_tables) < len(table_ids):
        unjoined = table_ids - joined_tables
        for uid in unjoined:
            upath = file_map[uid]["storage_path"]
            join_clauses.append(f"CROSS JOIN '{upath}' AS \"{uid}\"")
    
    # Build SELECT clause
    select_parts = []
    for col in request.columns:
        alias = col.alias if col.alias else col.column
        
        col_type = None
        for c in file_map[col.table_id]["columns"]:
            if c["name"] == col.column:
                col_type = c["type"]
                break
                
        cast_str = f"\"{col.table_id}\".\"{col.column}\""
        if col_type == "Integer":
            cast_str = f"CAST({cast_str} AS BIGINT)"
        elif col_type == "Float":
            cast_str = f"CAST({cast_str} AS DOUBLE)"
        elif col_type == "Boolean":
            cast_str = f"CAST({cast_str} AS BOOLEAN)"
        elif col_type == "String":
            cast_str = f"CAST({cast_str} AS VARCHAR)"
        elif col_type == "Date":
            cast_str = f"CAST({cast_str} AS TIMESTAMP)"
            
        select_parts.append(f"{cast_str} AS \"{alias}\"")
        
    select_clause = "SELECT " + ", ".join(select_parts)
    
    query_string = f"{select_clause} {from_clause} " + " ".join(join_clauses)
    return query_string

@router.post("/preview")
async def preview_query(request: QueryRequest, current_user = Depends(get_current_user)):
    try:
        sql = await build_duckdb_query(request, current_user)
        # Limit preview to 50 rows
        sql += " LIMIT 50"
        
        df = duckdb.query(sql).df()
        return df.fillna("").to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {str(e)}")

@router.post("/generate")
async def generate_table(request: GenerateRequest, current_user = Depends(get_current_user)):
    try:
        sql = await build_duckdb_query(request, current_user)
        df = duckdb.query(sql).df()
        
        if df.empty:
            raise HTTPException(status_code=400, detail="The resulting table is empty.")
            
        table_id = str(uuid.uuid4())
        parquet_path = os.path.join(STORAGE_DIR, f"{table_id}.parquet")
        
        df.columns = df.columns.astype(str)
        df.to_parquet(parquet_path, engine="pyarrow")
        
        # Build columns metadata
        def map_dtype_to_string(dtype):
            dtype_str = str(dtype).lower()
            if 'int' in dtype_str: return 'Integer'
            elif 'float' in dtype_str: return 'Float'
            elif 'datetime' in dtype_str or 'date' in dtype_str: return 'Date'
            elif 'bool' in dtype_str: return 'Boolean'
            else: return 'String'

        row_count = len(df)
        columns_meta = []
        for col, dtype in df.dtypes.items():
            unique_count = df[col].nunique(dropna=True)
            try:
                min_val = df[col].min() if not df[col].isnull().all() else None
                max_val = df[col].max() if not df[col].isnull().all() else None
                if min_val is not None and max_val is not None:
                    if 'datetime' in str(dtype):
                        min_val = min_val.isoformat() if hasattr(min_val, 'isoformat') else str(min_val)
                        max_val = max_val.isoformat() if hasattr(max_val, 'isoformat') else str(max_val)
                    else:
                        min_val = min_val.item() if hasattr(min_val, 'item') else min_val
                        max_val = max_val.item() if hasattr(max_val, 'item') else max_val
            except Exception:
                min_val = None
                max_val = None

            columns_meta.append({
                "name": str(col), 
                "type": map_dtype_to_string(dtype),
                "unique_count": int(unique_count),
                "min_val": min_val,
                "max_val": max_val
            })
            
        table_doc = {
            "table_id": table_id,
            "filename": f"{request.table_name}.parquet",
            "storage_path": parquet_path,
            "row_count": row_count,
            "columns": columns_meta,
            "department": current_user.get("department") or "Global",
            "visibility": "private",
            "uploaded_at": datetime.utcnow(),
            "uploaded_by": str(current_user["_id"]),
            "is_generated": True
        }
        
        await db.table_metadata.insert_one(table_doc)
        
        table_doc["_id"] = str(table_doc["_id"])
        table_doc["id"] = table_doc["_id"]
        return table_doc
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Generation failed: {str(e)}")

@router.post("/observations")
async def generate_observation(request: ObservationQueryRequest, current_user = Depends(get_current_user)):
    try:
        if request.chart_type == "map":
            if not request.lat_column or not request.lon_column or not request.val_column:
                raise HTTPException(status_code=400, detail="Latitude, Longitude, and Value columns are required for Map.")
                
            lat_cast = f"TRY_CAST(\"{request.lat_column}\" AS DOUBLE)"
            lon_cast = f"TRY_CAST(\"{request.lon_column}\" AS DOUBLE)"
            val_cast = f"TRY_CAST(\"{request.val_column}\" AS DOUBLE)"
            label_col = f"\"{request.label_column}\"" if request.label_column else "NULL"
            
            where_sql = f"WHERE {lat_cast} IS NOT NULL AND {lon_cast} IS NOT NULL"
            
            if request.dataset_type == "model":
                model_doc = await db.saved_models.find_one({"model_id": request.table_id})
                if not model_doc:
                    raise HTTPException(status_code=404, detail="Model not found.")
                from models.query import QueryColumn, JoinCondition
                q_cols = [QueryColumn(**c) for c in model_doc["columns"]]
                q_joins = [JoinCondition(**j) for j in model_doc["joins"]]
                base_request = QueryRequest(columns=q_cols, joins=q_joins)
                base_sql = await build_duckdb_query(base_request, current_user)
                
                if request.group_by and request.aggregation:
                    agg_func = request.aggregation.upper()
                    if agg_func not in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
                        raise HTTPException(status_code=400, detail="Invalid aggregation function.")
                    sql = f"SELECT {lat_cast} as \"{request.lat_column}\", {lon_cast} as \"{request.lon_column}\", {agg_func}({val_cast}) as \"{request.val_column}\", MAX({label_col}) as label FROM ({base_sql}) {where_sql} GROUP BY {lat_cast}, {lon_cast} LIMIT 2000"
                else:
                    sql = f"SELECT {lat_cast} as \"{request.lat_column}\", {lon_cast} as \"{request.lon_column}\", {val_cast} as \"{request.val_column}\", {label_col} as label FROM ({base_sql}) {where_sql} LIMIT 2000"
            else:
                file_doc = await db.table_metadata.find_one({"table_id": request.table_id})
                if not file_doc:
                    raise HTTPException(status_code=404, detail="Table not found.")
                storage_path = file_doc["storage_path"]
                
                if request.group_by and request.aggregation:
                    agg_func = request.aggregation.upper()
                    if agg_func not in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
                        raise HTTPException(status_code=400, detail="Invalid aggregation function.")
                    sql = f"SELECT {lat_cast} as \"{request.lat_column}\", {lon_cast} as \"{request.lon_column}\", {agg_func}({val_cast}) as \"{request.val_column}\", MAX({label_col}) as label FROM '{storage_path}' {where_sql} GROUP BY {lat_cast}, {lon_cast} LIMIT 2000"
                else:
                    sql = f"SELECT {lat_cast} as \"{request.lat_column}\", {lon_cast} as \"{request.lon_column}\", {val_cast} as \"{request.val_column}\", {label_col} as label FROM '{storage_path}' {where_sql} LIMIT 2000"
                
        elif request.chart_type == "table"  and request.table_columns:
            cols_sql = ", ".join([f"\"{c}\"" for c in request.table_columns])
            if request.dataset_type == "model":
                model_doc = await db.saved_models.find_one({"model_id": request.table_id})
                if not model_doc:
                    raise HTTPException(status_code=404, detail="Model not found.")
                from models.query import QueryColumn, JoinCondition
                q_cols = [QueryColumn(**c) for c in model_doc["columns"]]
                q_joins = [JoinCondition(**j) for j in model_doc["joins"]]
                base_request = QueryRequest(columns=q_cols, joins=q_joins)
                base_sql = await build_duckdb_query(base_request, current_user)
                sql = f"SELECT {cols_sql} FROM ({base_sql}) LIMIT 1000"
            else:
                file_doc = await db.table_metadata.find_one({"table_id": request.table_id})
                if not file_doc:
                    raise HTTPException(status_code=404, detail="Table not found.")
                storage_path = file_doc["storage_path"]
                sql = f"SELECT {cols_sql} FROM '{storage_path}' LIMIT 1000"
        else:
            if not request.x_column or not request.y_column:
                raise HTTPException(status_code=400, detail="x_column and y_column are required for this chart type.")
            
            x_cast = f"\"{request.x_column}\""
            y_cast = f"\"{request.y_column}\""
            
            def get_duckdb_type(t):
                if t == "Integer": return "BIGINT"
                if t == "Float": return "DOUBLE"
                if t == "String": return "VARCHAR"
                if t == "Boolean": return "BOOLEAN"
                if t == "Date": return "TIMESTAMP"
                return None
                
            x_duck = get_duckdb_type(request.x_cast_type) if request.x_cast_type else None
            
            # Simplify Casting: If group_by is enabled, use the grouped column without aggressive casting.
            if request.group_by and request.group_axis == 'x':
                x_cast = f"\"{request.x_column}\""
            elif x_duck:
                if x_duck == "BIGINT":
                    x_cast = f"TRY_CAST(TRY_CAST({x_cast} AS DOUBLE) AS BIGINT)"
                else:
                    x_cast = f"TRY_CAST({x_cast} AS {x_duck})"
            
            y_duck = get_duckdb_type(request.y_cast_type) if request.y_cast_type else None
            
            if request.group_by and request.group_axis == 'y':
                y_cast = f"\"{request.y_column}\""
            elif y_duck:
                if y_duck == "BIGINT":
                    y_cast = f"TRY_CAST(TRY_CAST({y_cast} AS DOUBLE) AS BIGINT)"
                    y_cast = f"TRY_CAST({y_cast} AS {y_duck})"
                    
            where_sql = f"WHERE {x_cast} IS NOT NULL AND {y_cast} IS NOT NULL"
            
            # Additional safety constraints per chart type
            if request.chart_type in ["pie", "treemap"]:
                where_sql += f" AND {y_cast} > 0"
                
            # Base source based on dataset type
            if request.dataset_type == "model":
                model_doc = await db.saved_models.find_one({"model_id": request.table_id})
                if not model_doc:
                    raise HTTPException(status_code=404, detail="Model not found.")
                from models.query import QueryColumn, JoinCondition
                q_cols = [QueryColumn(**c) for c in model_doc["columns"]]
                q_joins = [JoinCondition(**j) for j in model_doc["joins"]]
                base_request = QueryRequest(columns=q_cols, joins=q_joins)
                base_sql = await build_duckdb_query(base_request, current_user)
                source_sql = f"({base_sql})"
            else:
                file_doc = await db.table_metadata.find_one({"table_id": request.table_id})
                if not file_doc:
                    raise HTTPException(status_code=404, detail="Table not found.")
                storage_path = file_doc["storage_path"]
                source_sql = f"'{storage_path}'"

            # Build query
            if request.chart_type == "heatmap":
                if not request.val_column:
                    raise HTTPException(status_code=400, detail="Matrix requires a value column.")
                agg_func = request.aggregation.upper() if (request.group_by and request.aggregation) else "SUM"
                if agg_func not in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
                    raise HTTPException(status_code=400, detail="Invalid aggregation function.")
                sql = f"PIVOT (SELECT {x_cast} as x, {y_cast} as \"{request.y_column}\", TRY_CAST(\"{request.val_column}\" AS DOUBLE) as val FROM {source_sql} {where_sql}) ON x USING COALESCE({agg_func}(val), 0) GROUP BY \"{request.y_column}\" LIMIT 2000"
            elif request.group_by and request.aggregation:
                agg_func = request.aggregation.upper()
                if agg_func not in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
                    raise HTTPException(status_code=400, detail="Invalid aggregation function.")
                
                selects = []
                group_bys = []
                
                # Handle X
                if request.group_axis == 'y' and request.chart_type != "heatmap":
                    safe_x = f"TRY_CAST({x_cast} AS DOUBLE)" if agg_func in ["SUM", "AVG"] and not request.x_cast_type else x_cast
                    selects.append(f"{agg_func}({safe_x}) as \"{request.x_column}\"")
                else:
                    selects.append(f"{x_cast} as \"{request.x_column}\"")
                    group_bys.append(x_cast)
                    
                # Handle Y
                if request.group_axis == 'y' or request.chart_type == "heatmap":
                    selects.append(f"{y_cast} as \"{request.y_column}\"")
                    group_bys.append(y_cast)
                else:
                    safe_y = f"TRY_CAST({y_cast} AS DOUBLE)" if agg_func in ["SUM", "AVG"] and not request.y_cast_type else y_cast
                    selects.append(f"{agg_func}({safe_y}) as \"{request.y_column}\"")
                    
                # Handle Extra Columns
                if request.color_column:
                    selects.append(f"\"{request.color_column}\"")
                    group_bys.append(f"\"{request.color_column}\"")
                if request.size_column:
                    selects.append(f"{agg_func}(TRY_CAST(\"{request.size_column}\" AS DOUBLE)) as \"{request.size_column}\"")
                if request.val_column:
                    val_agg = f"{agg_func}(TRY_CAST(\"{request.val_column}\" AS DOUBLE))"
                    selects.append(f"{val_agg} as \"{request.val_column}\"")
                    
                group_clause = f" GROUP BY {', '.join(group_bys)}" if group_bys else ""
                order_clause = f" ORDER BY {group_bys[0]} ASC" if group_bys else ""
                
                limit_val = 5000 if request.chart_type == "scatter" else 2000
                sql = f"SELECT {', '.join(selects)} FROM {source_sql} {where_sql}{group_clause}{order_clause} LIMIT {limit_val}"
            else:
                selects = [f"{x_cast} as \"{request.x_column}\"", f"{y_cast} as \"{request.y_column}\""]
                if request.color_column: selects.append(f"\"{request.color_column}\"")
                if request.size_column: selects.append(f"\"{request.size_column}\"")
                if request.val_column: selects.append(f"\"{request.val_column}\"")
                
                limit_val = 5000 if request.chart_type == "scatter" else 2000
                sql = f"SELECT {', '.join(selects)} FROM {source_sql} {where_sql} LIMIT {limit_val}"
            
        df = duckdb.query(sql).df()
        
        if request.chart_type == "map":
            map_html = generate_folium_map(df, request.lat_column, request.lon_column, request.val_column, request.map_type)
            return [{"map_html": map_html}]
            
        elif request.chart_type in ["table", "heatmap"]:
            if df.empty:
                return []
            return df.replace({np.nan: None}).to_dict(orient="records")
            
        else:
            if df.empty:
                return []
            if request.x_column and request.y_column:
                df = df.dropna(subset=[request.x_column, request.y_column])
            return df.replace({np.nan: None}).to_dict(orient="records")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Observation query failed: {str(e)}")

@router.post("/saved_models", response_model=SavedModelMetadata)
async def save_model(request: SaveModelRequest, current_user = Depends(get_current_user)):
    model_id = str(uuid.uuid4())
    
    # Store just the dict representation
    model_doc = {
        "model_id": model_id,
        "name": request.model_name,
        "columns": [c.model_dump() for c in request.columns],
        "joins": [j.model_dump() for j in (request.joins or [])],
        "created_at": datetime.utcnow(),
        "created_by": str(current_user["_id"])
    }
    
    result = await db.saved_models.insert_one(model_doc)
    model_doc["_id"] = str(result.inserted_id)
    model_doc["id"] = model_doc["_id"]
    return model_doc

@router.put("/saved_models/{model_id}", response_model=SavedModelMetadata)
async def update_saved_model(model_id: str, request: QueryRequest, current_user = Depends(get_current_user)):
    # Check if model exists and belongs to user
    model = await db.saved_models.find_one({"model_id": model_id, "created_by": str(current_user["_id"])})
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
        
    update_data = {
        "columns": [c.model_dump() for c in request.columns],
        "joins": [j.model_dump() for j in (request.joins or [])],
        "updated_at": datetime.utcnow()
    }
    
    await db.saved_models.update_one(
        {"model_id": model_id},
        {"$set": update_data}
    )
    
    updated_model = await db.saved_models.find_one({"model_id": model_id})
    updated_model["id"] = str(updated_model["_id"])
    return updated_model
def generate_folium_map(df, lat_col, lon_col, val_col, map_type):
    import folium
    import math
    import pandas as pd
    
    # Drop rows with missing lat/lon
    df = df.dropna(subset=[lat_col, lon_col])
    
    if df.empty:
        m = folium.Map(location=[30.3753, 69.3451], zoom_start=4, tiles="CartoDB Positron")
        return m._repr_html_()
        
    avg_lat = df[lat_col].mean()
    avg_lon = df[lon_col].mean()
    
    m = folium.Map(location=[avg_lat, avg_lon], zoom_start=4, tiles="CartoDB Positron")
    
    if map_type == 'heat':
        from folium.plugins import HeatMap
        if '_is_forecast' not in df.columns:
            heat_data = df[[lat_col, lon_col, val_col]].values.tolist()
        else:
            heat_data = df[~df['_is_forecast']][[lat_col, lon_col, val_col]].values.tolist()
            
        if heat_data:
            HeatMap(heat_data, radius=15).add_to(m)

    max_val = df[val_col].max()
    min_val = df[val_col].min()
    
    for idx, row in df.iterrows():
        val = row[val_col]
        is_forecast = row.get('_is_forecast', False)
        
        if math.isnan(val) or val is None:
            continue
            
        # If it's a heat map, only draw CircleMarkers for forecast points
        if map_type == 'heat' and not is_forecast:
            continue
            
        if max_val == min_val:
            radius = 10
        else:
            radius = 5 + ((val - min_val) / (max_val - min_val)) * 15
            
        lbl = row.get('label')
        if 'label' in df.columns and pd.notna(lbl) and str(lbl).strip() != '':
            tooltip = str(lbl)
        else:
            tooltip = f"Value: {val}"
            
        if is_forecast:
            color = '#f59e0b'
            tooltip = "[PREDICTION] " + tooltip
        else:
            color = '#16a34a'
            
        folium.CircleMarker(
            location=[row[lat_col], row[lon_col]],
            radius=radius,
            color=color,
            fill=not is_forecast,
            fill_color=color if not is_forecast else None,
            fill_opacity=0.6 if not is_forecast else 0.0,
            dash_array='5, 5' if is_forecast else None,
            tooltip=tooltip
        ).add_to(m)
            
    return m._repr_html_()

@router.post("/predict")
async def generate_prediction(request: PredictionQueryRequest, current_user = Depends(get_current_user)):
    try:
        from prophet import Prophet
        import pandas as pd
        import numpy as np
        from sklearn.linear_model import LinearRegression



        x_cast = f"\"{request.x_column}\""
        val_cast = f"\"{request.value_column}\""

        def get_duckdb_type(t):
            if t == "Integer": return "BIGINT"
            if t == "Float": return "DOUBLE"
            if t == "String": return "VARCHAR"
            if t == "Date": return "TIMESTAMP"
            return None

        # Ensure X casting
        x_duck = get_duckdb_type(request.x_cast_type) if request.x_cast_type else None
        
        is_numeric = False
        if x_duck in ("BIGINT", "DOUBLE"):
            is_numeric = True
        
        if x_duck:
            if x_duck == "BIGINT":
                x_cast = f"TRY_CAST(TRY_CAST({x_cast} AS DOUBLE) AS BIGINT)"
            else:
                x_cast = f"TRY_CAST({x_cast} AS {x_duck})"

        # Ensure Value casting
        v_duck = get_duckdb_type(request.value_cast_type) if request.value_cast_type else None
        if v_duck:
            if v_duck == "BIGINT":
                val_cast = f"TRY_CAST(TRY_CAST({val_cast} AS DOUBLE) AS BIGINT)"
            else:
                val_cast = f"TRY_CAST({val_cast} AS {v_duck})"

        where_sql = f"WHERE {x_cast} IS NOT NULL AND {val_cast} IS NOT NULL"

        select_cols = []
        if request.prediction_mode == "snapshot" and request.grouping_columns:
            for g in request.grouping_columns:
                select_cols.append(f'"{g}"')
        select_cols.append(f"{x_cast} as ds")
        select_cols.append(f"SUM(TRY_CAST({val_cast} AS DOUBLE)) as y")
        select_clause = ", ".join(select_cols)

        group_by_cols = []
        if request.prediction_mode == "snapshot" and request.grouping_columns:
            for g in request.grouping_columns:
                group_by_cols.append(f'"{g}"')
        group_by_cols.append("ds")
        group_by_clause = ", ".join(group_by_cols)

        if request.dataset_type == "model":
            model_doc = await db.saved_models.find_one({"model_id": request.table_id})
            if not model_doc:
                raise HTTPException(status_code=404, detail="Model not found.")
            from models.query import QueryColumn, JoinCondition
            q_cols = [QueryColumn(**c) for c in model_doc["columns"]]
            q_joins = [JoinCondition(**j) for j in model_doc["joins"]]
            base_request = QueryRequest(columns=q_cols, joins=q_joins)
            base_sql = await build_duckdb_query(base_request, current_user)
            
            sql = f"SELECT {select_clause} FROM ({base_sql}) {where_sql} GROUP BY {group_by_clause} ORDER BY ds ASC"
        else:
            file_doc = await db.table_metadata.find_one({"table_id": request.table_id})
            if not file_doc:
                raise HTTPException(status_code=404, detail="Table not found.")
            storage_path = file_doc["storage_path"]
            
            sql = f"SELECT {select_clause} FROM '{storage_path}' {where_sql} GROUP BY {group_by_clause} ORDER BY ds ASC"

        df = duckdb.query(sql).df()

        if len(df) < 2:
            raise HTTPException(status_code=400, detail="Not enough historical data points to generate a forecast.")
            
        if request.prediction_mode == "snapshot":
            # SNAPSHOT MODE: Train a model per group and predict future state
            try:
                df['ds'] = pd.to_numeric(df['ds'])
            except:
                raise HTTPException(status_code=400, detail="For snapshot forecasts, the timeline column must be numeric.")

            records = []
            grouping_cols = request.grouping_columns or []
            
            y_true_all = []
            y_pred_all = []
            
            if grouping_cols:
                grouped = df.groupby(grouping_cols)
            else:
                grouped = [((), df)]
                
            for name, group in grouped:
                group = group.sort_values(by='ds').reset_index(drop=True)
                if len(group) < 2:
                    continue
                
                X = group[['ds']].values
                y_vals = group['y'].values
                
                model = LinearRegression()
                model.fit(X, y_vals)
                
                y_true_all.extend(y_vals)
                y_pred_all.extend(model.predict(X))
                
                step = 1
                if len(group) > 1:
                    step = (group['ds'].max() - group['ds'].min()) / (len(group) - 1)
                    if step == 0: step = 1
                
                last_x = group['ds'].max()
                future_x = last_x + (request.periods * step)
                yhat_future = model.predict(np.array([[future_x]]))[0]
                
                record = {}
                if grouping_cols:
                    if isinstance(name, tuple):
                        for i, col in enumerate(grouping_cols):
                            record[col] = name[i]
                    else:
                        record[grouping_cols[0]] = name
                        
                record[request.value_column] = float(yhat_future)
                record[request.x_column] = float(future_x)
                records.append(record)
                
            if request.chart_type == "map":
                df_future = pd.DataFrame(records)
                if not df_future.empty:
                    df_future['_is_forecast'] = True
                    
                df_historical = df.copy()
                df_historical['_is_forecast'] = False
                df_historical = df_historical.rename(columns={'y': request.value_column})
                
                if df_future.empty:
                    combined = df_historical
                else:
                    combined = pd.concat([df_historical, df_future], ignore_index=True)
                
                lat_col = request.grouping_columns[0] if request.grouping_columns else None
                lon_col = request.grouping_columns[1] if request.grouping_columns and len(request.grouping_columns) > 1 else None
                
                map_html = generate_folium_map(combined, lat_col, lon_col, request.value_column, request.map_type)
                
                from sklearn.metrics import r2_score
                if len(y_true_all) > 1:
                    r2 = r2_score(y_true_all, y_pred_all)
                    accuracy = max(0.0, r2 * 100.0)
                else:
                    accuracy = 0.0
                    
                return {"records": [{"map_html": map_html}], "metrics": {"confidence_score": accuracy, "type": "R2"}}
                
            from sklearn.metrics import r2_score
            if len(y_true_all) > 1:
                r2 = r2_score(y_true_all, y_pred_all)
                accuracy = max(0.0, r2 * 100.0)
            else:
                accuracy = 0.0
                
            return {"records": records, "metrics": {"confidence_score": accuracy, "type": "R2"}}

        # Detect numeric if not already passed in x_cast_type
        if not is_numeric:
            if pd.api.types.is_numeric_dtype(df['ds']):
                is_numeric = True
            elif pd.api.types.is_datetime64_any_dtype(df['ds']):
                is_numeric = False
            else:
                try:
                    pd.to_datetime(df['ds'])
                    is_numeric = False
                except:
                    try:
                        df['ds'] = pd.to_numeric(df['ds'])
                        is_numeric = True
                    except:
                        raise HTTPException(status_code=400, detail="X-axis must be numeric or datetime.")

        if not is_numeric:
            # TIME SERIES (Prophet)
            df['ds'] = pd.to_datetime(df['ds'])
            m = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False)
            m.fit(df)
            
            safe_freq = request.freq
            if safe_freq == 'M': safe_freq = 'ME'
            if safe_freq == 'Y': safe_freq = 'YE'
            
            future = m.make_future_dataframe(periods=request.periods, freq=safe_freq)
            forecast = m.predict(future)
            
            if not request.allow_negatives:
                forecast['yhat'] = np.maximum(0, forecast['yhat'])
                forecast['yhat_lower'] = np.maximum(0, forecast['yhat_lower'])
                forecast['yhat_upper'] = np.maximum(0, forecast['yhat_upper'])
            
            combined = forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].copy()
            combined['ds'] = combined['ds'].astype(str)
            df['ds'] = df['ds'].astype(str)
            combined = combined.merge(df[['ds', 'y']], on='ds', how='left')
            combined = combined.replace({np.nan: None})
            
            historical = combined.dropna(subset=['y'])
            if not historical.empty:
                actual = historical['y'].values
                pred = historical['yhat'].values
                mask = actual != 0
                if np.any(mask):
                    mape = np.mean(np.abs((actual[mask] - pred[mask]) / actual[mask]))
                    accuracy = max(0.0, (1.0 - mape) * 100.0)
                else:
                    accuracy = 0.0
            else:
                accuracy = 0.0
                
            return {"records": combined.to_dict(orient="records"), "metrics": {"confidence_score": accuracy, "type": "MAPE"}}
            
        else:
            # NUMERIC (Linear Regression)
            df['ds'] = pd.to_numeric(df['ds'])
            df = df.sort_values(by='ds').reset_index(drop=True)
            
            X = df[['ds']].values
            y = df['y'].values
            
            model = LinearRegression()
            model.fit(X, y)
            
            # Predict historical
            yhat_historical = model.predict(X)
            
            # Generate future X
            step = 1
            if len(df) > 1:
                step = (df['ds'].max() - df['ds'].min()) / (len(df) - 1)
                if step == 0: step = 1
            
            last_x = df['ds'].max()
            future_x = [last_x + (i * step) for i in range(1, request.periods + 1)]
            X_future = np.array(future_x).reshape(-1, 1)
            yhat_future = model.predict(X_future)
            
            # Calculate Standard Error of the Estimate for confidence interval
            residuals = y - yhat_historical
            sse = np.sum(residuals**2)
            n = len(df)
            se = np.sqrt(sse / (n - 2)) if n > 2 else 0
            
            # Combine
            records = []
            for i in range(len(df)):
                yh = float(yhat_historical[i])
                yh_l = float(yhat_historical[i] - 1.96 * se)
                yh_u = float(yhat_historical[i] + 1.96 * se)
                if not request.allow_negatives:
                    yh = max(0.0, yh)
                    yh_l = max(0.0, yh_l)
                    yh_u = max(0.0, yh_u)
                
                records.append({
                    "ds": float(df['ds'].iloc[i]),
                    "y": float(df['y'].iloc[i]),
                    "yhat": yh,
                    "yhat_lower": yh_l,
                    "yhat_upper": yh_u
                })
            for i in range(len(future_x)):
                yh = float(yhat_future[i])
                yh_l = float(yhat_future[i] - 1.96 * se)
                yh_u = float(yhat_future[i] + 1.96 * se)
                if not request.allow_negatives:
                    yh = max(0.0, yh)
                    yh_l = max(0.0, yh_l)
                    yh_u = max(0.0, yh_u)
                    
                records.append({
                    "ds": float(future_x[i]),
                    "y": None,
                    "yhat": yh,
                    "yhat_lower": yh_l,
                    "yhat_upper": yh_u
                })
                
            from sklearn.metrics import r2_score
            if len(y) > 1:
                r2 = r2_score(y, yhat_historical)
                accuracy = max(0.0, r2 * 100.0)
            else:
                accuracy = 0.0
                
            return {"records": records, "metrics": {"confidence_score": accuracy, "type": "R2"}}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Forecast failed: {str(e)}")

@router.get("/saved_models", response_model=list[SavedModelMetadata])
async def get_saved_models(current_user = Depends(get_current_user)):
    cursor = db.saved_models.find({"created_by": str(current_user["_id"])}).sort("created_at", -1)
    models = await cursor.to_list(length=100)
    for m in models:
        m["id"] = str(m["_id"])
    return models
