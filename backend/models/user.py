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
    mill_name: Optional[str] = None  # Temporary during creation, converted to mill_id
    owner_name: Optional[str] = None # Temporary during creation

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Privileges(BaseModel):
    can_manage_users: bool = True
    can_view_activities: bool = True

class AdminCreate(BaseModel):
    email: EmailStr
    password: str
    department: str
    privileges: Privileges

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    role: RoleEnum
    department: Optional[str] = None
    mill_id: Optional[str] = None
    is_verified: bool
    is_active: bool = True
    privileges: Optional[Privileges] = None
    created_at: datetime
