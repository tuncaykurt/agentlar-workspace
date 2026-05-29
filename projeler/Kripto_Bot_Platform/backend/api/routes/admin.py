from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import select
from core.database import async_session
from models.user import User, UserExchangeKey
from api.routes.auth import get_current_admin
from core.security import decrypt_string
from exchange.exchange_factory import fetch_balance_for
import traceback

router = APIRouter(prefix="/admin", tags=["admin"])

class UserUpdateParams(BaseModel):
    is_active: Optional[bool] = None
    fee_type: Optional[str] = None
    fee_amount: Optional[float] = None
    fee_active: Optional[bool] = None
    allowed_pages: Optional[List[str]] = None

@router.get("/users")
async def list_users(admin: User = Depends(get_current_admin)):
    """Süper admin tüm kullanıcıları listeler"""
    async with async_session() as session:
        result = await session.execute(select(User).order_by(User.id.desc()))
        users = result.scalars().all()
        
        user_list = []
        for u in users:
            # Kullanıcının bakiyesini canlı çek (Eger API anahtari varsa)
            keys_res = await session.execute(
                select(UserExchangeKey).where(UserExchangeKey.user_id == u.id, UserExchangeKey.exchange == "mexc")
            )
            key_obj = keys_res.scalar_one_or_none()
            
            balance = 0.0
            if key_obj:
                try:
                    # Sifreyi coz ve borsadan bakiyeyi cek
                    secret = decrypt_string(key_obj.encrypted_secret)
                    passphrase = decrypt_string(key_obj.encrypted_passphrase) if key_obj.encrypted_passphrase else ""
                    bal_data = await fetch_balance_for("mexc", key_obj.api_key, secret, passphrase)
                    balance = bal_data.get("USDT", {}).get("total", 0.0)
                except Exception as e:
                    print(f"Bakiye cekilemedi User {u.id}: {e}")
                    
            user_list.append({
                "id": u.id,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "fee_type": u.fee_type,
                "fee_amount": u.fee_amount,
                "fee_active": u.fee_active,
                "allowed_pages": u.allowed_pages,
                "created_at": u.created_at,
                "balance": balance,
                "has_api_key": key_obj is not None
            })
            
        return user_list

@router.put("/users/{user_id}")
async def update_user(user_id: int, data: UserUpdateParams, admin: User = Depends(get_current_admin)):
    """Süper admin bir kullanıcının yetkilerini ve ücretini günceller"""
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(404, "Kullanıcı bulunamadı")
            
        if data.is_active is not None:
            user.is_active = data.is_active
        if data.fee_type is not None:
            user.fee_type = data.fee_type
        if data.fee_amount is not None:
            user.fee_amount = data.fee_amount
        if data.fee_active is not None:
            user.fee_active = data.fee_active
        if data.allowed_pages is not None:
            user.allowed_pages = data.allowed_pages
            
        await session.commit()
        return {"status": "ok", "message": "Kullanıcı başarıyla güncellendi"}
