from pydantic import BaseModel
from typing import List, Optional

class QueryColumn(BaseModel):
    table_id: str
    column: str
    alias: Optional[str] = None

class JoinCondition(BaseModel):
    source_table_id: str
    target_table_id: str
    source_column: str
    target_column: str
    join_type: str = "INNER"

class QueryRequest(BaseModel):
    columns: List[QueryColumn]
    joins: Optional[List[JoinCondition]] = []

class GenerateRequest(QueryRequest):
    table_name: str

class ObservationQueryRequest(BaseModel):
    table_id: str
    dataset_type: str = "table" # "table" or "model"
    chart_type: str = "bar" # "bar", "line", "pie", "scatter", "table", "map"
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    lat_column: Optional[str] = None
    lon_column: Optional[str] = None
    val_column: Optional[str] = None
    label_column: Optional[str] = None
    table_columns: Optional[List[str]] = None
    group_by: bool = False
    aggregation: Optional[str] = None
    x_cast_type: Optional[str] = None
    y_cast_type: Optional[str] = None

class SaveModelRequest(QueryRequest):
    model_name: str
