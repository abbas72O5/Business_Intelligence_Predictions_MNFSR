from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
import pandas as pd
import uuid
import os
from datetime import datetime

from database import db
from models.file import FileMetadata, ColumnMetadata
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

@router.post("/upload", response_model=list[FileMetadata])
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
            
        file_id = str(uuid.uuid4())
        
        if sheet_name:
            base, ext = os.path.splitext(file.filename)
            formatted_filename = f"{base}_{sheet_name}{ext}"
        else:
            formatted_filename = file.filename
            
        parquet_path = os.path.join(STORAGE_DIR, f"{file_id}.parquet")
        
        # Ensure column names are strings for Parquet serialization
        df.columns = df.columns.astype(str)
        
        df.to_parquet(parquet_path, engine="pyarrow")
        
        columns_meta = []
        for col, dtype in df.dtypes.items():
            columns_meta.append(ColumnMetadata(name=str(col), type=map_dtype_to_string(dtype)).model_dump())
            
        file_doc = {
            "file_id": file_id,
            "filename": formatted_filename,
            "storage_path": parquet_path,
            "columns": columns_meta,
            "department": current_user.get("department") or "Global",
            "visibility": "private",
            "uploaded_at": datetime.utcnow(),
            "uploaded_by": str(current_user["_id"])
        }
        
        result = await db.files.insert_one(file_doc)
        
        uploaded_files.append(
            FileMetadata(
                id=str(result.inserted_id),
                file_id=file_id,
                filename=formatted_filename,
                storage_path=parquet_path,
                columns=columns_meta,
                department=file_doc["department"],
                visibility=file_doc["visibility"],
                uploaded_at=file_doc["uploaded_at"],
                uploaded_by=file_doc["uploaded_by"]
            )
        )
        
    if not uploaded_files:
        raise HTTPException(status_code=400, detail="File did not contain any valid data.")
        
    return uploaded_files

@router.get("/", response_model=list[FileMetadata])
async def get_files(current_user = Depends(get_current_user)):
    department = current_user.get("department")
    query = {"department": department} if department else {}
    cursor = db.files.find(query).sort("uploaded_at", -1)
    files = await cursor.to_list(length=100)
    
    return [
        FileMetadata(
            id=str(f["_id"]),
            file_id=f["file_id"],
            filename=f["filename"],
            storage_path=f["storage_path"],
            columns=f["columns"],
            department=f["department"],
            visibility=f.get("visibility", "private"),
            uploaded_at=f["uploaded_at"],
            uploaded_by=f["uploaded_by"]
        ) for f in files
    ]

@router.get("/{file_id}/preview")
async def preview_file(file_id: str, current_user = Depends(get_current_user)):
    file_doc = await db.files.find_one({"file_id": file_id})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        df = pd.read_parquet(file_doc["storage_path"])
        preview_data = df.head(5).fillna("").to_dict(orient="records")
        return preview_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading preview: {str(e)}")
