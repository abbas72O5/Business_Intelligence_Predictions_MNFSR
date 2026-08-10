from pydantic import BaseModel
from typing import List
from datetime import datetime

class ColumnMetadata(BaseModel):
    name: str
    type: str

class FileMetadata(BaseModel):
    id: str
    file_id: str
    filename: str
    storage_path: str
    columns: List[ColumnMetadata]
    department: str
    visibility: str = "private"
    uploaded_at: datetime
    uploaded_by: str
