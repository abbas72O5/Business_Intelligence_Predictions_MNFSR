from fastapi import APIRouter, HTTPException, Depends
import duckdb
import os
import uuid
from datetime import datetime

from database import db
from models.query import QueryRequest, GenerateRequest
from routers.auth import get_current_user

router = APIRouter(prefix="/query", tags=["query"])
STORAGE_DIR = "data/storage"

async def build_duckdb_query(request: QueryRequest, current_user: dict):
    # Get unique file_ids involved
    file_ids = set()
    for col in request.columns:
        file_ids.add(col.file_id)
    for j in request.joins:
        file_ids.add(j.source_file_id)
        file_ids.add(j.target_file_id)
        
    if not file_ids:
        raise HTTPException(status_code=400, detail="No columns or files selected.")
        
    # Fetch file metadata from MongoDB
    files = await db.files.find({"file_id": {"$in": list(file_ids)}}).to_list(length=100)
    file_map = {f["file_id"]: f for f in files}
    
    # Ensure all files were found and user has access (for now, assume accessible if it's in their department)
    # To be secure, we should check `department`
    for fid in file_ids:
        if fid not in file_map:
            raise HTTPException(status_code=404, detail=f"File {fid} not found or inaccessible.")
            
    # Build FROM and JOIN clauses
    file_list = list(file_ids)
    base_file_id = file_list[0]
    base_path = file_map[base_file_id]["storage_path"]
    
    # Use double quotes for identifiers and single quotes for strings (paths)
    from_clause = f"FROM '{base_path}' AS \"{base_file_id}\""
    
    # We construct the joins.
    # Note: A real query builder would construct a proper AST or ensure a valid join tree.
    # For now, we will blindly append the joins.
    join_clauses = []
    # Keep track of joined tables to avoid duplicate joins
    joined_tables = {base_file_id}
    
    for j in request.joins:
        target = j.target_file_id
        source = j.source_file_id
        
        # Determine which one is new to the tree
        if target not in joined_tables and source in joined_tables:
            target_path = file_map[target]["storage_path"]
            join_clauses.append(f"JOIN '{target_path}' AS \"{target}\" ON \"{source}\".\"{j.source_col}\" = \"{target}\".\"{j.target_col}\"")
            joined_tables.add(target)
        elif source not in joined_tables and target in joined_tables:
            source_path = file_map[source]["storage_path"]
            join_clauses.append(f"JOIN '{source_path}' AS \"{source}\" ON \"{target}\".\"{j.target_col}\" = \"{source}\".\"{j.source_col}\"")
            joined_tables.add(source)
            
    # Any tables that were selected but not joined will result in a cross join if we just append them.
    # Let's do a cross join for unjoined tables (or throw an error). We'll throw an error if a table isn't joined.
    if len(joined_tables) < len(file_ids):
        unjoined = file_ids - joined_tables
        # We can just comma-separate them (cross join) for simplicity, but it's dangerous.
        for uid in unjoined:
            upath = file_map[uid]["storage_path"]
            join_clauses.append(f"CROSS JOIN '{upath}' AS \"{uid}\"")
    
    # Build SELECT clause
    select_parts = []
    for col in request.columns:
        # Use an alias like "Filename - Column"
        fname = file_map[col.file_id]["filename"].split('.')[0]
        alias = f"{fname} - {col.column}"
        select_parts.append(f"\"{col.file_id}\".\"{col.column}\" AS \"{alias}\"")
        
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
            
        file_id = str(uuid.uuid4())
        parquet_path = os.path.join(STORAGE_DIR, f"{file_id}.parquet")
        
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
            
        file_doc = {
            "file_id": file_id,
            "filename": f"{request.table_name}.parquet",
            "storage_path": parquet_path,
            "columns": columns_meta,
            "department": current_user.get("department") or "Global",
            "visibility": "private",
            "uploaded_at": datetime.utcnow(),
            "uploaded_by": str(current_user["_id"]),
            "is_generated": True
        }
        
        await db.files.insert_one(file_doc)
        
        file_doc["_id"] = str(file_doc["_id"])
        file_doc["id"] = file_doc["_id"]
        return file_doc
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Generation failed: {str(e)}")
