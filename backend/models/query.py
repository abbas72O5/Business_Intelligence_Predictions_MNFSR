from pydantic import BaseModel
from typing import List, Optional

class QueryColumn(BaseModel):
    table_id: str
    column: str
    alias: Optional[str] = None

class QueryRequest(BaseModel):
    columns: List[QueryColumn]

class GenerateRequest(QueryRequest):
    table_name: str
