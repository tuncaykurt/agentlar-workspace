from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from core.security import hash_password, verify_password, create_access_token, decode_token
from core.redis_client import get_redis
import json

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


class AuthRequest(BaseModel):
    username: str
    password: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    if not credentials:
        raise HTTPException(401, "Giriş yapmanız gerekiyor")
    payload = decode_token(credentials.credentials)
    username = payload.get("sub")
    if not username:
        raise HTTPException(401, "Geçersiz token")
    return username


@router.post("/register")
async def register(data: AuthRequest):
    if len(data.username) < 3:
        raise HTTPException(400, "Kullanıcı adı en az 3 karakter olmalı")
    if len(data.password) < 6:
        raise HTTPException(400, "Şifre en az 6 karakter olmalı")

    redis = get_redis()
    key = f"user:{data.username}"
    existing = await redis.get(key)
    if existing:
        raise HTTPException(400, "Bu kullanıcı adı zaten alınmış")

    user = {
        "username": data.username,
        "password_hash": hash_password(data.password),
    }
    await redis.set(key, json.dumps(user))

    token = create_access_token({"sub": data.username})
    return {"access_token": token, "token_type": "bearer", "username": data.username}


@router.post("/login")
async def login(data: AuthRequest):
    redis = get_redis()
    raw = await redis.get(f"user:{data.username}")
    if not raw:
        raise HTTPException(401, "Kullanıcı adı veya şifre hatalı")

    user = json.loads(raw)
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Kullanıcı adı veya şifre hatalı")

    token = create_access_token({"sub": data.username})
    return {"access_token": token, "token_type": "bearer", "username": data.username}


@router.get("/me")
async def me(username: str = Depends(get_current_user)):
    return {"username": username}
