from fastapi import APIRouter, HTTPException, Depends
import uuid
from typing import List

from database import db
from models.metadata import Relationship
from routers.auth import get_current_user

router = APIRouter(prefix="/relationships", tags=["relationships"])

@router.post("/", response_model=Relationship)
async def create_relationship(relationship: Relationship, current_user = Depends(get_current_user)):
    # Generate ID if not provided, though the schema requires it
    if not relationship.relationship_id:
        relationship.relationship_id = str(uuid.uuid4())
        
    rel_doc = relationship.model_dump()
    
    # Insert or update
    await db.relationships.update_one(
        {"relationship_id": relationship.relationship_id},
        {"$set": rel_doc},
        upsert=True
    )
    
    return relationship

@router.get("/", response_model=List[Relationship])
async def get_relationships(current_user = Depends(get_current_user)):
    cursor = db.relationships.find({"created_by": str(current_user["_id"])})
    relationships = await cursor.to_list(length=1000)
    
    return [Relationship(**rel) for rel in relationships]

@router.delete("/{relationship_id}")
async def delete_relationship(relationship_id: str, current_user = Depends(get_current_user)):
    result = await db.relationships.delete_one({"relationship_id": relationship_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return {"status": "success", "message": "Relationship deleted"}
