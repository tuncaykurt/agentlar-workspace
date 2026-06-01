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
        
        from core.redis_client import get_redis
        import json
        redis = get_redis()
        
        from exchange.exchange_factory import SUPPORTED_EXCHANGES
        
        user_list = []
        for u in users:
            user_key = "default" if u.role == "admin" else str(u.id)
            has_api_key = False
            balance = 0.0
            
            for exchange in SUPPORTED_EXCHANGES.keys():
                raw = await redis.get(f"exchange_keys:{user_key}:{exchange}")
                if raw:
                    has_api_key = True
                    try:
                        keys = json.loads(raw)
                        bal_data = await fetch_balance_for(exchange, keys["api_key"], keys["secret"], keys.get("passphrase", ""))
                        balance += bal_data.get("total", 0.0)
                    except Exception as e:
                        print(f"Bakiye cekilemedi User {u.id} ({exchange}): {e}")
                    
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
                "has_api_key": has_api_key
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
            
        was_inactive = not user.is_active
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

        # Kullanıcı onaylandıysa bildirim gönder
        if was_inactive and data.is_active:
            try:
                import asyncio
                from services.push_notification import send_push
                asyncio.create_task(send_push(
                    "✅ Hesabınız Onaylandı!",
                    "Artık KriptoBot platformuna giriş yapabilirsiniz.",
                    data={"url": "/login"},
                    tag="account-approved",
                    user_id=str(user_id),
                ))
            except Exception:
                pass

        return {"status": "ok", "message": "Kullanıcı başarıyla güncellendi"}


@router.get("/system-alerts")
async def get_system_alerts(admin: User = Depends(get_current_admin)):
    """Süper admin için sistem uyarıları (OpenRouter kredi vb.)"""
    from core.redis_client import get_redis
    import json
    redis = get_redis()

    alerts = []

    # OpenRouter kredi uyarısı
    raw = await redis.get("system:alerts:openrouter_credit")
    if raw:
        try:
            alert = json.loads(raw)
            alerts.append(alert)
        except (json.JSONDecodeError, TypeError):
            pass

    return {"alerts": alerts}


@router.delete("/system-alerts/{alert_type}")
async def dismiss_system_alert(alert_type: str, admin: User = Depends(get_current_admin)):
    """Süper admin bir sistem uyarısını kapatır."""
    from core.redis_client import get_redis
    redis = get_redis()
    await redis.delete(f"system:alerts:{alert_type}")
    return {"status": "ok"}
