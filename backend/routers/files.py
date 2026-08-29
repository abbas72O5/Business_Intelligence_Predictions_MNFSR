from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import pandas as pd
import uuid
import os
from datetime import datetime

from database import db
from models.metadata import TableMetadata, ColumnMetadata
from routers.auth import get_current_user

router = APIRouter(prefix="/files", tags=["files"])
STORAGE_DIR = "data/storage"

# Ensure storage dir exists
os.makedirs(STORAGE_DIR, exist_ok=True)

def map_dtype_to_string(dtype):
    dtype_str = str(dtype).lower()
    if 'int' in dtype_str:
        return 'Integer'
    elif 'float' in dtype_str:
        return 'Float'
    elif 'datetime' in dtype_str or 'date' in dtype_str:
        return 'Date'
    elif 'bool' in dtype_str:
        return 'Boolean'
    else:
        return 'String'

@router.post("/upload", response_model=list[TableMetadata])
async def upload_file(file: UploadFile = File(...), current_user = Depends(get_current_user)):
    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(status_code=400, detail="Invalid file type. Only .csv and .xlsx are allowed.")
    
    try:
        dfs_to_process = []
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file.file)
            dfs_to_process.append((None, df))
        else:
            # sheet_name=None returns a dict of {sheet_name: df}
            sheets = pd.read_excel(file.file, sheet_name=None)
            for i, (sheet_name, df) in enumerate(sheets.items()):
                name = sheet_name if sheet_name else f"sheet{i+1}"
                dfs_to_process.append((name, df))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
        
    if not dfs_to_process:
        raise HTTPException(status_code=400, detail="File is empty or could not be parsed.")
    
    uploaded_files = []
    
    for sheet_name, df in dfs_to_process:
        if df.empty:
            continue
            
        table_id = str(uuid.uuid4())
        
        if sheet_name:
            base, ext = os.path.splitext(file.filename)
            formatted_filename = f"{base}_{sheet_name}{ext}"
        else:
            formatted_filename = file.filename
            
        parquet_path = os.path.join(STORAGE_DIR, f"{table_id}.parquet")
        
        # Ensure column names are strings for Parquet serialization
        df.columns = df.columns.astype(str)
        
        # PyArrow strictly requires uniform types per column. Pandas 'object' dtype 
        # often contains mixed types (e.g. ints and strings). We cast these to string to prevent ArrowTypeError.
        for col in df.select_dtypes(include=['object']).columns:
            df[col] = df[col].astype(str)
            
        df.to_parquet(parquet_path, engine="pyarrow")
        
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

            columns_meta.append(ColumnMetadata(
                name=str(col), 
                type=map_dtype_to_string(dtype),
                unique_count=int(unique_count),
                min_val=min_val,
                max_val=max_val
            ).model_dump())
            
        table_doc = {
            "table_id": table_id,
            "filename": formatted_filename,
            "storage_path": parquet_path,
            "row_count": row_count,
            "columns": columns_meta,
            "department": current_user.get("department") or "Global",
            "visibility": "private",
            "uploaded_at": datetime.utcnow(),
            "uploaded_by": str(current_user["_id"])
        }
        
        result = await db.table_metadata.insert_one(table_doc)
        
        uploaded_files.append(
            TableMetadata(
                id=str(result.inserted_id),
                table_id=table_id,
                filename=formatted_filename,

                storage_path=parquet_path,
                row_count=row_count,
                columns=columns_meta,
                department=table_doc["department"],
                visibility=table_doc["visibility"],
                uploaded_at=table_doc["uploaded_at"],
                uploaded_by=table_doc["uploaded_by"]
            )
        )
        
    if not uploaded_files:
        raise HTTPException(status_code=400, detail="File did not contain any valid data.")
        
    return uploaded_files

@router.get("/", response_model=list[TableMetadata])
async def get_files(current_user = Depends(get_current_user)):
    query = {"uploaded_by": str(current_user["_id"])}
    cursor = db.table_metadata.find(query).sort("uploaded_at", -1)
    files = await cursor.to_list(length=100)
    
    return [
        TableMetadata(
            id=str(f["_id"]),
            table_id=f["table_id"],
            filename=f["filename"],
            storage_path=f["storage_path"],
            columns=f["columns"],
            department=f["department"],
            visibility=f.get("visibility", "private"),
            uploaded_at=f["uploaded_at"],
            uploaded_by=f["uploaded_by"]
        ) for f in files
    ]

@router.get("/{table_id}/preview")
async def preview_file(table_id: str, limit: int = 50, current_user = Depends(get_current_user)):
    file_doc = await db.table_metadata.find_one({"table_id": table_id})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        df = pd.read_parquet(file_doc["storage_path"])
        preview_data = df.head(limit).fillna("").to_dict(orient="records")
        return preview_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading preview: {str(e)}")

@router.put("/{table_id}/columns/{column_name}/type")
async def update_column_type(table_id: str, column_name: str, payload: dict, current_user = Depends(get_current_user)):
    new_type = payload.get("new_type")
    if not new_type:
        raise HTTPException(status_code=400, detail="new_type is required")
        
    result = await db.table_metadata.update_one(
        {"table_id": table_id, "columns.name": column_name},
        {"$set": {"columns.$.type": new_type}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Table or column not found")
        
    return {"status": "success", "new_type": new_type}

@router.delete("/{table_id}")
async def delete_file(table_id: str, current_user = Depends(get_current_user)):
    file_record = await db.table_metadata.find_one({"table_id": table_id})
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
        
    if current_user["role"] == "user" and file_record["uploaded_by"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Not authorized to delete this file")
        
    try:
        if os.path.exists(file_record["storage_path"]):
            os.remove(file_record["storage_path"])
    except Exception as e:
        print(f"Failed to delete file {file_record['storage_path']}: {e}")
        
    await db.table_metadata.delete_one({"table_id": table_id})
    
    # Also delete associated relationships
    await db.relationships.delete_many({"$or": [{"source_table_id": table_id}, {"target_table_id": table_id}]})
    
    return {"status": "success", "message": "File and its relationships deleted"}
