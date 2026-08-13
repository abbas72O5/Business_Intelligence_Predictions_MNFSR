from fastapi import APIRouter, HTTPException, Depends
import duckdb
import os
import uuid
from datetime import datetime

from database import db
from models.metadata import SavedModelMetadata
from models.query import QueryRequest, GenerateRequest, ObservationQueryRequest, SaveModelRequest
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

        columns_meta = []
        for col, dtype in df.dtypes.items():
            columns_meta.append({"name": str(col), "type": map_dtype_to_string(dtype)})
            
        table_doc = {
            "table_id": table_id,
            "filename": f"{request.table_name}.parquet",
            "storage_path": parquet_path,
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
        if x_duck:
            if x_duck == "BIGINT":
                x_cast = f"CAST(CAST({x_cast} AS DOUBLE) AS BIGINT)"
            else:
                x_cast = f"CAST({x_cast} AS {x_duck})"
        
        y_duck = get_duckdb_type(request.y_cast_type) if request.y_cast_type else None
        if y_duck:
            if y_duck == "BIGINT":
                y_cast = f"CAST(CAST({y_cast} AS DOUBLE) AS BIGINT)"
            else:
                y_cast = f"CAST({y_cast} AS {y_duck})"
                
        where_clauses = []
        if x_duck == "BIGINT":
            where_clauses.append(f"TRY_CAST(\"{request.x_column}\" AS DOUBLE) = CAST(TRY_CAST(\"{request.x_column}\" AS DOUBLE) AS BIGINT)")
        if y_duck == "BIGINT":
            where_clauses.append(f"TRY_CAST(\"{request.y_column}\" AS DOUBLE) = CAST(TRY_CAST(\"{request.y_column}\" AS DOUBLE) AS BIGINT)")
            
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        if request.dataset_type == "model":
            # Fetch the logical model
            model_doc = await db.saved_models.find_one({"model_id": request.table_id})
            if not model_doc:
                raise HTTPException(status_code=404, detail="Model not found.")
                
            # Construct a base QueryRequest to reuse build_duckdb_query
            # The columns and joins are stored as dicts, so we instantiate the models
            from models.query import QueryColumn, JoinCondition
            
            q_cols = [QueryColumn(**c) for c in model_doc["columns"]]
            q_joins = [JoinCondition(**j) for j in model_doc["joins"]]
            
            base_request = QueryRequest(columns=q_cols, joins=q_joins)
            base_sql = await build_duckdb_query(base_request, current_user)
            
            if request.group_by and request.aggregation:
                agg_func = request.aggregation.upper()
                if agg_func not in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
                    raise HTTPException(status_code=400, detail="Invalid aggregation function.")
                sql = f"SELECT {x_cast}, {agg_func}({y_cast}) as \"{request.y_column}\" FROM ({base_sql}) {where_sql} GROUP BY {x_cast} ORDER BY {x_cast} ASC LIMIT 1000"
            else:
                sql = f"SELECT {x_cast}, {y_cast} FROM ({base_sql}) {where_sql} LIMIT 1000"
                
        else:
            # Physical table logic
            file_doc = await db.table_metadata.find_one({"table_id": request.table_id})
            if not file_doc:
                raise HTTPException(status_code=404, detail="Table not found.")
                
            storage_path = file_doc["storage_path"]
            
            if request.group_by and request.aggregation:
                agg_func = request.aggregation.upper()
                if agg_func not in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
                    raise HTTPException(status_code=400, detail="Invalid aggregation function.")
                    
                sql = f"SELECT {x_cast}, {agg_func}({y_cast}) as \"{request.y_column}\" FROM '{storage_path}' {where_sql} GROUP BY {x_cast} ORDER BY {x_cast} ASC LIMIT 1000"
            else:
                sql = f"SELECT {x_cast}, {y_cast} FROM '{storage_path}' {where_sql} LIMIT 1000"
            
        df = duckdb.query(sql).df()
        
        # Convert any date/time columns to string for JSON serialization
        for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
            df[col] = df[col].astype(str)
            
        return df.fillna("").to_dict(orient="records")
        
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

@router.get("/saved_models", response_model=list[SavedModelMetadata])
async def get_saved_models(current_user = Depends(get_current_user)):
    cursor = db.saved_models.find({"created_by": str(current_user["_id"])})
    models = await cursor.to_list(length=1000)
    for m in models:
        m["id"] = str(m["_id"])
    return models
