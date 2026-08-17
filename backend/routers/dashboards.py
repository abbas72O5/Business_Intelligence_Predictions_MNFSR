from fastapi import APIRouter, HTTPException, Depends
import uuid
from typing import List, Dict, Any
from datetime import datetime

from database import db
from models.metadata import DashboardMetadata
from routers.auth import get_current_user

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

@router.post("/", response_model=DashboardMetadata)
async def save_dashboard(payload: Dict[str, Any], current_user = Depends(get_current_user)):
    name = payload.get("name")
    charts = payload.get("charts", [])
    
    if not name:
        raise HTTPException(status_code=400, detail="Dashboard name is required")
        
    dashboard_id = str(uuid.uuid4())
    
    doc = {
        "dashboard_id": dashboard_id,
        "name": name,
        "charts": charts,
        "created_at": datetime.utcnow(),
        "created_by": str(current_user["_id"])
    }
    
    await db.dashboards.insert_one(doc.copy())
    
    doc["_id"] = str(doc["_id"])
    return DashboardMetadata(**doc)

@router.get("/", response_model=List[DashboardMetadata])
async def get_dashboards(current_user = Depends(get_current_user)):
    cursor = db.dashboards.find({"created_by": str(current_user["_id"])}).sort("created_at", -1)
    dashboards = await cursor.to_list(length=1000)
    
    return [DashboardMetadata(**d) for d in dashboards]

@router.get("/{dashboard_id}", response_model=DashboardMetadata)
async def get_dashboard(dashboard_id: str, current_user = Depends(get_current_user)):
    dashboard = await db.dashboards.find_one({"dashboard_id": dashboard_id, "created_by": str(current_user["_id"])})
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
        
    return DashboardMetadata(**dashboard)
