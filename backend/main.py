from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth, files, query, relationships, dashboards, departments, activities, mill
from database import db
from datetime import datetime

app = FastAPI(title="Ministry BI & Analytics API")

# Setup CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(files.router)
app.include_router(query.router)
app.include_router(relationships.router)
app.include_router(dashboards.router)
app.include_router(departments.router)
app.include_router(activities.router)
app.include_router(mill.router)

@app.on_event("startup")
async def seed_departments():
    count = await db.departments.count_documents({})
    if count == 0:
        default_depts = [
            {"name": "Infrastructure", "is_active": True, "created_at": datetime.utcnow()},
            {"name": "Finance", "is_active": True, "created_at": datetime.utcnow()},
            {"name": "Healthcare", "is_active": True, "created_at": datetime.utcnow()},
            {"name": "Education", "is_active": True, "created_at": datetime.utcnow()}
        ]
        await db.departments.insert_many(default_depts)
        print("Seeded default departments.")

@app.get("/")
async def root():
    return {"message": "Welcome to the Ministry BI & Analytics API"}
