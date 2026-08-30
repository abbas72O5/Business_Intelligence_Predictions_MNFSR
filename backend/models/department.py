from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DepartmentCreate(BaseModel):
    name: str

class DepartmentResponse(BaseModel):
    id: str
    name: str
    is_active: bool
    created_at: datetime
