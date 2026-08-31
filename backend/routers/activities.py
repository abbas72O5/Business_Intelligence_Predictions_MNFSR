from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime

from database import db
from models.activity import ActivityCreate, ActivityResponse
from routers.auth import get_current_user

router = APIRouter(
    prefix="/activities",
    tags=["activities"]
)

def format_activity(activity) -> ActivityResponse:
    return ActivityResponse(
        id=str(activity["_id"]),
        user_id=activity["user_id"],
        user_email=activity["user_email"],
        department=activity.get("department"),
        action=activity["action"],
        details=activity.get("details", {}),
        timestamp=activity.get("timestamp", datetime.utcnow())
    )

@router.post("", response_model=ActivityResponse)
async def log_activity(activity_in: ActivityCreate, current_user: dict = Depends(get_current_user)):
    new_activity = {
        "user_id": str(current_user["_id"]),
        "user_email": current_user["email"],
        "department": current_user.get("department"),
        "action": activity_in.action,
        "details": activity_in.details,
        "timestamp": datetime.utcnow()
    }
    
    result = await db.activities.insert_one(new_activity)
    created_activity = await db.activities.find_one({"_id": result.inserted_id})
    return format_activity(created_activity)

@router.get("", response_model=List[ActivityResponse])
async def get_activities(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    
    if role == "superadmin":
        # Superadmin sees all
        cursor = db.activities.find({}).sort("timestamp", -1)
    elif role == "admin":
        # Admin must have can_view_activities privilege
        privileges = current_user.get("privileges") or {}
        if not privileges.get("can_view_activities", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to view activities"
            )
        # Admin sees only their department
        department = current_user.get("department")
        if not department:
            return [] # No department, no activities to show
        cursor = db.activities.find({"department": department}).sort("timestamp", -1)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    activities = await cursor.to_list(length=1000)
    return [format_activity(a) for a in activities]
