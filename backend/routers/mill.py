from fastapi import APIRouter, Depends, HTTPException
from typing import List
from bson import ObjectId
from database import db
from routers.auth import get_current_user
from models.user import RoleEnum
from models.mill import MillProfile, MillProfileUpdate, MillMonthlyReport

from datetime import datetime

router = APIRouter(prefix="/mills", tags=["Mills"])

async def get_or_create_mill(current_user: dict) -> dict:
    mill_id = current_user.get("mill_id")
    if mill_id:
        mill = await db.mills.find_one({"_id": ObjectId(mill_id)})
        if mill:
            return mill
            
    # Auto-provision if missing
    owner_name = current_user.get("owner_name", "Unknown Owner")
    mill_name = current_user.get("mill_name", "New Mill")
    
    mill_profile = {
        "name": mill_name,
        "owner_name": owner_name,
        "location": "",
        "installed_spindles": 0,
        "installed_rotors": 0,
        "created_at": datetime.utcnow()
    }
    result = await db.mills.insert_one(mill_profile)
    new_mill_id = str(result.inserted_id)
    
    # Link it back to the user
    await db.users.update_one({"_id": current_user["_id"]}, {"$set": {"mill_id": new_mill_id}})
    
    mill_profile["_id"] = result.inserted_id
    return mill_profile

@router.get("/me", response_model=dict)
async def get_my_mill_profile(current_user = Depends(get_current_user)):
    mill = await get_or_create_mill(current_user)
    mill["id"] = str(mill.pop("_id"))
    return mill

@router.put("/me", response_model=dict)
async def update_my_mill_profile(profile_update: MillProfileUpdate, current_user = Depends(get_current_user)):
    mill = await get_or_create_mill(current_user)
    mill_id = str(mill["_id"])
        
    update_data = {k: v for k, v in profile_update.model_dump().items() if v is not None}
    
    if update_data:
        await db.mills.update_one(
            {"_id": ObjectId(mill_id)},
            {"$set": update_data}
        )
        
    return {"message": "Mill profile updated successfully"}

@router.post("/me/reports")
async def submit_monthly_report(report: MillMonthlyReport, current_user = Depends(get_current_user)):
    mill = await get_or_create_mill(current_user)
    mill_id = str(mill["_id"])
        
    # Validate Raw Material Position constraint: closing == opening + procurement - consumption
    for raw_material_key in ["raw_material_domestic", "raw_material_imported", "raw_material_synthetic"]:
        rm = getattr(report, raw_material_key, None)
        if rm:
            expected_closing = rm.opening + rm.procurement - rm.consumption
            if abs(rm.closing - expected_closing) > 0.01: # allow minor floating point differences
                raise HTTPException(
                    status_code=400, 
                    detail=f"{raw_material_key} closing balance ({rm.closing}) does not equal opening + procurement - consumption ({expected_closing})"
                )
    
    report_dict = report.model_dump()
    report_dict["mill_id"] = mill_id
    report_dict["user_id"] = str(current_user["_id"])
    
    await db.mill_reports.insert_one(report_dict)
    
    return {"message": "Monthly report submitted successfully"}

@router.get("/me/reports")
async def get_my_monthly_reports(current_user = Depends(get_current_user)):
    mill = await get_or_create_mill(current_user)
    mill_id = str(mill["_id"])
        
    cursor = db.mill_reports.find({"mill_id": mill_id}).sort("created_at", -1)
    reports = await cursor.to_list(length=100)
    
    for r in reports:
        r["id"] = str(r.pop("_id"))
        
    return reports
