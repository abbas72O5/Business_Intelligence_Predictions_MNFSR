from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime
from bson import ObjectId

from database import db
from models.user import UserCreate, UserLogin, UserResponse, RoleEnum, AdminCreate
from core.security import get_password_hash, verify_password, create_access_token, SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise credentials_exception
    return user

def user_to_response(user) -> UserResponse:
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        role=user["role"],
        department=user.get("department"),
        mill_id=user.get("mill_id"),
        is_verified=user.get("is_verified", False),
        is_active=user.get("is_active", True),
        privileges=user.get("privileges", None),
        created_at=user["created_at"]
    )

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate):
    existing_user = await db.users.find_one({"email": user_in.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = user_in.model_dump()
    user_dict["hashed_password"] = get_password_hash(user_dict.pop("password"))
    user_dict["role"] = RoleEnum.user.value
    user_dict["is_verified"] = False
    user_dict["is_active"] = True
    user_dict["created_at"] = datetime.utcnow()
    
    result = await db.users.insert_one(user_dict)
    new_user = await db.users.find_one({"_id": result.inserted_id})
    return user_to_response(new_user)

@router.post("/login")
async def login(user_in: UserLogin):
    user = await db.users.find_one({"email": user_in.email})
    if not user or not verify_password(user_in.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if not user.get("is_verified", False) and user["role"] != RoleEnum.superadmin.value:
        raise HTTPException(status_code=403, detail="Account pending verification from department admin.")
        
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account has been deactivated. Please contact an administrator.")
        
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user["role"], "department": user.get("department")})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user = Depends(get_current_user)):
    return user_to_response(current_user)

@router.get("/pending", response_model=list[UserResponse])
async def get_pending_users(current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {"is_verified": False}
    if current_user["role"] == RoleEnum.admin.value:
        query["department"] = current_user.get("department")
        
    cursor = db.users.find(query)
    users = await cursor.to_list(length=100)
    return [user_to_response(u) for u in users]

@router.post("/verify/{user_id}")
async def verify_user(user_id: str, current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    user_to_verify = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_to_verify:
        raise HTTPException(status_code=404, detail="User not found")
        
    if current_user["role"] == RoleEnum.admin.value and user_to_verify.get("department") != current_user.get("department"):
         raise HTTPException(status_code=403, detail="Cannot verify user from another department")
         
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"is_verified": True, "is_active": True}})
    return {"message": "User verified successfully"}

@router.get("/users", response_model=list[UserResponse])
async def get_all_users(current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    query = {}
    if current_user["role"] == RoleEnum.admin.value:
        if not current_user.get("privileges", {}).get("can_manage_users", True):
            raise HTTPException(status_code=403, detail="Not authorized to manage users")
        query["department"] = current_user.get("department")
        # Admins shouldn't see superadmins
        query["role"] = {"$ne": RoleEnum.superadmin.value}
        
    cursor = db.users.find(query).sort("created_at", -1)
    users = await cursor.to_list(length=1000)
    return [user_to_response(u) for u in users]

@router.put("/users/{user_id}/status")
async def update_user_status(user_id: str, payload: dict, current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if current_user["role"] == RoleEnum.admin.value:
        if not current_user.get("privileges", {}).get("can_manage_users", True):
            raise HTTPException(status_code=403, detail="Not authorized to manage users")
        if target_user.get("department") != current_user.get("department"):
            raise HTTPException(status_code=403, detail="Cannot modify user from another department")
        if target_user["role"] == RoleEnum.superadmin.value:
            raise HTTPException(status_code=403, detail="Cannot modify superadmin")
            
    # Cannot deactivate yourself
    if str(target_user["_id"]) == str(current_user["_id"]):
         raise HTTPException(status_code=400, detail="Cannot modify your own status")
         
    is_active = payload.get("is_active", True)
    
    await db.users.update_one(
        {"_id": ObjectId(user_id)}, 
        {"$set": {"is_active": is_active}}
    )
    return {"message": f"User {'activated' if is_active else 'deactivated'} successfully"}

@router.get("/admins", response_model=list[UserResponse])
async def get_all_admins(current_user = Depends(get_current_user)):
    if current_user["role"] != RoleEnum.superadmin.value:
        raise HTTPException(status_code=403, detail="Only superadmin can view admins")
        
    cursor = db.users.find({"role": RoleEnum.admin.value}).sort("created_at", -1)
    admins = await cursor.to_list(length=100)
    return [user_to_response(u) for u in admins]

@router.post("/admins", response_model=UserResponse)
async def create_admin(admin_in: AdminCreate, current_user = Depends(get_current_user)):
    if current_user["role"] != RoleEnum.superadmin.value:
        raise HTTPException(status_code=403, detail="Only superadmin can create admins")
        
    existing_user = await db.users.find_one({"email": admin_in.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    admin_dict = admin_in.model_dump()
    admin_dict["hashed_password"] = get_password_hash(admin_dict.pop("password"))
    admin_dict["role"] = RoleEnum.admin.value
    admin_dict["is_verified"] = True
    admin_dict["is_active"] = True
    admin_dict["created_at"] = datetime.utcnow()
    
    result = await db.users.insert_one(admin_dict)
    new_admin = await db.users.find_one({"_id": result.inserted_id})
    return user_to_response(new_admin)

@router.put("/admins/{admin_id}/privileges")
async def update_admin_privileges(admin_id: str, payload: dict, current_user = Depends(get_current_user)):
    if current_user["role"] != RoleEnum.superadmin.value:
        raise HTTPException(status_code=403, detail="Only superadmin can modify admin privileges")
        
    target_admin = await db.users.find_one({"_id": ObjectId(admin_id)})
    if not target_admin or target_admin["role"] != RoleEnum.admin.value:
        raise HTTPException(status_code=404, detail="Admin not found")
        
    # Get the privileges object
    privileges = payload.get("privileges", {})
    
    await db.users.update_one(
        {"_id": ObjectId(admin_id)}, 
        {"$set": {"privileges": privileges}}
    )
    return {"message": "Admin privileges updated successfully"}
@router.post("/users", response_model=UserResponse)
async def create_user_by_admin(user_in: UserCreate, current_user = Depends(get_current_user)):
    if current_user["role"] not in [RoleEnum.admin.value, RoleEnum.superadmin.value]:
        raise HTTPException(status_code=403, detail="Only admins can create users directly")
    
    privileges = current_user.get("privileges", {})
    if current_user["role"] == RoleEnum.admin.value and not privileges.get("can_manage_users", True):
        raise HTTPException(status_code=403, detail="You do not have privilege to manage users")

    existing_user = await db.users.find_one({"email": user_in.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = user_in.model_dump()
    user_dict["hashed_password"] = get_password_hash(user_dict.pop("password"))
    user_dict["role"] = RoleEnum.user.value
    
    if current_user["role"] == RoleEnum.admin.value:
        user_dict["department"] = current_user.get("department")
    elif not user_dict.get("department"):
        user_dict["department"] = "Global"
        
    user_dict["is_verified"] = True
    user_dict["is_active"] = True
    user_dict["created_at"] = datetime.utcnow()
    
    owner_name = user_dict.pop("owner_name", "")
    mill_name = user_dict.pop("mill_name", "")
    
    # Create the mill profile
    mill_profile = {
        "name": mill_name or "New Mill",
        "owner_name": owner_name or "Unknown Owner",
        "location": "",
        "installed_spindles": 0,
        "installed_rotors": 0,
        "created_at": datetime.utcnow()
    }
    mill_result = await db.mills.insert_one(mill_profile)
    user_dict["mill_id"] = str(mill_result.inserted_id)
    
    result = await db.users.insert_one(user_dict)
    new_user = await db.users.find_one({"_id": result.inserted_id})
    return user_to_response(new_user)


