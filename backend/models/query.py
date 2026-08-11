from pydantic import BaseModel
from typing import List

class QueryColumn(BaseModel):
    file_id: str
    column: str

class QueryJoin(BaseModel):
    source_file_id: str
    source_col: str
    target_file_id: str
    target_col: str

class QueryRequest(BaseModel):
    columns: List[QueryColumn]
    joins: List[QueryJoin]

class GenerateRequest(QueryRequest):
    table_name: str
