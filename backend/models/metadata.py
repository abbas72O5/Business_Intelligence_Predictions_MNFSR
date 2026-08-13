from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

class ColumnMetadata(BaseModel):
    name: str
    type: str

class TableMetadata(BaseModel):
    id: str
    table_id: str
    filename: str
    storage_path: str
    columns: List[ColumnMetadata]
    department: str
    visibility: str = "private"
    uploaded_at: datetime
    uploaded_by: str

class Relationship(BaseModel):
    relationship_id: str
    source_table_id: str
    target_table_id: str
    source_column: str
    target_column: str
    cardinality: str = "1:1"
    join_type: str = "INNER"
    is_active: bool = True
    created_by: str

class Observation(BaseModel):
    observation_id: str
    name: str
    source_table_ids: List[str]
    chart_settings: dict
    created_by: str

class SavedModelMetadata(BaseModel):
    id: str
    model_id: str
    name: str
    columns: List[Any]  # Will store QueryColumn dicts
    joins: List[Any]    # Will store JoinCondition dicts
    created_at: datetime
    created_by: str
