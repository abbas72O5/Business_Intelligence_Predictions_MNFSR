from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class ActivityCreate(BaseModel):
    action: str
    details: Optional[Dict[str, Any]] = Field(default_factory=dict)

class ActivityResponse(BaseModel):
    id: str
    user_id: str
    user_email: str
    department: Optional[str] = None
    action: str
    details: Dict[str, Any]
    timestamp: datetime
