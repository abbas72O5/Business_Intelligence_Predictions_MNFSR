from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime
from bson import ObjectId

from database import db
from models.user import UserCreate, UserLogin, UserResponse, RoleEnum
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
        is_verified=user.get("is_verified", False),
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
         
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"is_verified": True}})
    return {"message": "User verified successfully"}
