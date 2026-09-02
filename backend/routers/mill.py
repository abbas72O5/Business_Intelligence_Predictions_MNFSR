from fastapi import APIRouter, Depends, HTTPException
from typing import List
from bson import ObjectId
from database import db
from routers.auth import get_current_user
from models.user import RoleEnum
from models.mill import MillProfile, MillProfileUpdate, MillMonthlyReport
from fastapi.responses import StreamingResponse
from utils.excel_exporter import generate_reports_excel, flatten_report
import pandas as pd
import uuid
import os
from routers.files import STORAGE_DIR, map_dtype_to_string
from models.metadata import TableMetadata, ColumnMetadata
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

@router.get("/user/{target_user_id}/reports")
async def get_user_monthly_reports(target_user_id: str, current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Only admins can view other users' reports")

    target_user = await db.users.find_one({"_id": ObjectId(target_user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    if current_user["role"] == RoleEnum.admin.value:
        if target_user.get("department") != current_user.get("department"):
            raise HTTPException(status_code=403, detail="Cannot view reports from a different zone")

    mill_id = target_user.get("mill_id")
    if not mill_id:
        return []

    cursor = db.mill_reports.find({"mill_id": mill_id}).sort("created_at", -1)
    reports = await cursor.to_list(length=100)

    for r in reports:
        r["id"] = str(r.pop("_id"))

    return reports

@router.post("/user/{target_user_id}/reports/import")
async def import_user_reports_as_dataset(target_user_id: str, current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Only admins can import reports")

    target_user = await db.users.find_one({"_id": ObjectId(target_user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    mill_id = target_user.get("mill_id")
    if not mill_id:
        raise HTTPException(status_code=404, detail="No mill profile associated with this user")
        
    mill = await db.mills.find_one({"_id": ObjectId(mill_id)})
    if not mill:
        raise HTTPException(status_code=404, detail="Mill profile not found")

    cursor = db.mill_reports.find({"mill_id": mill_id}).sort("created_at", -1)
    reports = await cursor.to_list(length=100)
    
    if not reports:
        raise HTTPException(status_code=404, detail="No reports found for this user")

    flat_data = [flatten_report(r, mill, target_user) for r in reports]
    df = pd.DataFrame(flat_data)
    
    table_id = str(uuid.uuid4())
    filename = f"Imported_Reports_{target_user.get('email', 'User')}.parquet"
    parquet_path = os.path.join(STORAGE_DIR, f"{table_id}.parquet")
    
    df.columns = df.columns.astype(str)
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].astype(str)
        
    df.to_parquet(parquet_path, engine="pyarrow")
    
    columns_meta = []
    for col, dtype in df.dtypes.items():
        unique_count = df[col].nunique(dropna=True)
        try:
            min_val = df[col].min() if not df[col].isnull().all() else None
            max_val = df[col].max() if not df[col].isnull().all() else None
            
            # Convert numpy types to standard python types
            if hasattr(min_val, 'item'): min_val = min_val.item()
            if hasattr(max_val, 'item'): max_val = max_val.item()
        except:
            min_val = None
            max_val = None

        columns_meta.append(ColumnMetadata(
            name=str(col), 
            type=map_dtype_to_string(dtype),
            unique_count=int(unique_count),
            min_val=min_val,
            max_val=max_val
        ).model_dump())
        
    table_doc = {
        "table_id": table_id,
        "filename": filename,
        "storage_path": parquet_path,
        "row_count": len(df),
        "columns": columns_meta,
        "department": current_user.get("department") or "Global",
        "visibility": "private",
        "uploaded_at": datetime.utcnow(),
        "uploaded_by": str(current_user["_id"]),
        "imported_by": [str(current_user["_id"])],
        "uploader_email": target_user.get("email"),
        "uploader_name": target_user.get("owner_name"),
        "uploader_department": target_user.get("department")
    }
    
    await db.table_metadata.insert_one(table_doc)
    return {"status": "success", "table_id": table_id}

@router.get("/me/reports/export")
async def export_my_reports(current_user = Depends(get_current_user)):
    mill = await get_or_create_mill(current_user)
    mill_id = str(mill["_id"])
        
    cursor = db.mill_reports.find({"mill_id": mill_id}).sort("created_at", -1)
    reports = await cursor.to_list(length=100)
    
    excel_file = generate_reports_excel(reports, mill, current_user)
    
    headers = {
        'Content-Disposition': f'attachment; filename="Monthly_Returns_{current_user["email"]}.xlsx"'
    }
    return StreamingResponse(
        iter([excel_file.getvalue()]), 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers=headers
    )

@router.get("/user/{target_user_id}/reports/export")
async def export_user_reports(target_user_id: str, current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Only admins can export other users' reports")

    target_user = await db.users.find_one({"_id": ObjectId(target_user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    if current_user["role"] == RoleEnum.admin.value:
        if target_user.get("department") != current_user.get("department"):
            raise HTTPException(status_code=403, detail="Cannot export reports from a different zone")

    mill_id = target_user.get("mill_id")
    if not mill_id:
        raise HTTPException(status_code=404, detail="No mill profile associated with this user")
        
    mill = await db.mills.find_one({"_id": ObjectId(mill_id)})
    if not mill:
        raise HTTPException(status_code=404, detail="Mill profile not found")

    cursor = db.mill_reports.find({"mill_id": mill_id}).sort("created_at", -1)
    reports = await cursor.to_list(length=100)
    
    excel_file = generate_reports_excel(reports, mill, target_user)
    
    headers = {
        'Content-Disposition': f'attachment; filename="Monthly_Returns_{target_user["email"]}.xlsx"'
    }
    return StreamingResponse(
        iter([excel_file.getvalue()]), 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers=headers
    )
