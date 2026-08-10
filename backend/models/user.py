from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum

class RoleEnum(str, Enum):
    user = "user"
    admin = "admin"
    superadmin = "superadmin"

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    department: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    role: RoleEnum
    department: Optional[str] = None
    is_verified: bool
    created_at: datetime
