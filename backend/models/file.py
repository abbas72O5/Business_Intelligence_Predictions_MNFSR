from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

class ColumnMetadata(BaseModel):
    name: str
    type: str
    unique_count: Optional[int] = None
    min_val: Optional[Any] = None
    max_val: Optional[Any] = None

class FileMetadata(BaseModel):
    id: str
    file_id: str
    filename: str
    storage_path: str
    row_count: Optional[int] = None
    columns: List[ColumnMetadata]
    department: str
    visibility: str = "private"
    uploaded_at: datetime
    uploaded_by: str
