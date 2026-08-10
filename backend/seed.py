import asyncio
from datetime import datetime
from database import db
from core.security import get_password_hash
from models.user import RoleEnum

async def seed_users():
    # 1. Super Admin
    superadmin = await db.users.find_one({"email": "superadmin@ministry.gov"})
    if not superadmin:
        await db.users.insert_one({
            "email": "superadmin@ministry.gov",
            "hashed_password": get_password_hash("password123"),
            "role": RoleEnum.superadmin.value,
            "department": None,
            "is_verified": True,
            "created_at": datetime.utcnow()
        })
        print("Super Admin seeded.")

    # 2. Infrastructure Admin
    infra_admin = await db.users.find_one({"email": "admin.infra@ministry.gov"})
    if not infra_admin:
        await db.users.insert_one({
            "email": "admin.infra@ministry.gov",
            "hashed_password": get_password_hash("password123"),
            "role": RoleEnum.admin.value,
            "department": "Infrastructure",
            "is_verified": True,
            "created_at": datetime.utcnow()
        })
        print("Infrastructure Admin seeded.")
        
    # 3. Infrastructure User (Pending Verification)
    infra_user = await db.users.find_one({"email": "user.infra@ministry.gov"})
    if not infra_user:
        await db.users.insert_one({
            "email": "user.infra@ministry.gov",
            "hashed_password": get_password_hash("password123"),
            "role": RoleEnum.user.value,
            "department": "Infrastructure",
            "is_verified": False,
            "created_at": datetime.utcnow()
        })
        print("Infrastructure User seeded (unverified).")
        
    print("Database seeding completed!")

if __name__ == "__main__":
    asyncio.run(seed_users())
