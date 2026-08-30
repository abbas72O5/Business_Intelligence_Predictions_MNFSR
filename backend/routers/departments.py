from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime
from bson import ObjectId

from database import db
from models.department import DepartmentCreate, DepartmentResponse
from models.user import UserResponse
from routers.auth import get_current_user

router = APIRouter(
    prefix="/departments",
    tags=["departments"]
)

def format_department(dept) -> DepartmentResponse:
    return DepartmentResponse(
        id=str(dept["_id"]),
        name=dept["name"],
        is_active=dept.get("is_active", True),
        created_at=dept.get("created_at", datetime.utcnow())
    )

@router.get("", response_model=List[DepartmentResponse])
async def get_departments():
    cursor = db.departments.find({})
    departments = await cursor.to_list(length=100)
    return [format_department(d) for d in departments]

@router.post("", response_model=DepartmentResponse)
async def create_department(dept: DepartmentCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can create departments"
        )
    
    existing = await db.departments.find_one({"name": {"$regex": f"^{dept.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department already exists"
        )
    
    new_dept = {
        "name": dept.name,
        "is_active": True,
        "created_at": datetime.utcnow()
    }
    
    result = await db.departments.insert_one(new_dept)
    created_dept = await db.departments.find_one({"_id": result.inserted_id})
    return format_department(created_dept)

@router.put("/{department_id}/status")
async def toggle_department_status(
    department_id: str, 
    status_update: dict, # expecting {"is_active": bool}
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can modify department status"
        )
        
    is_active = status_update.get("is_active")
    if is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_active field is required"
        )
        
    department = await db.departments.find_one({"_id": ObjectId(department_id)})
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )
        
    # Update the department status
    await db.departments.update_one(
        {"_id": ObjectId(department_id)},
        {"$set": {"is_active": is_active}}
    )
    
    # Cascade logic: update all users and admins in this department
    await db.users.update_many(
        {"department": department["name"]},
        {"$set": {"is_active": is_active}}
    )
    
    return {"message": "Department status and associated users updated successfully"}
