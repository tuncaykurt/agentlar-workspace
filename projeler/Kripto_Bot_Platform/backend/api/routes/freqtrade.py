from fastapi import APIRouter, HTTPException
from services.freqtrade_service import freqtrade_service
from typing import Dict, Any, List

router = APIRouter(prefix="/freqtrade", tags=["freqtrade"])

@router.get("/status")
async def get_freqtrade_status():
    """Freqtrade bot durumunu döner."""
    return await freqtrade_service.get_status()

@router.get("/trades")
async def get_freqtrade_trades():
    """Aktif Freqtrade işlemlerini döner."""
    return await freqtrade_service.get_trades()

@router.get("/balance")
async def get_freqtrade_balance():
    """Freqtrade cüzdan bakiyesini döner."""
    return await freqtrade_service.get_balance()

@router.post("/reload")
async def reload_freqtrade():
    """Freqtrade konfigürasyonunu yeniler."""
    success = await freqtrade_service.reload_config()
    if not success:
        raise HTTPException(status_code=500, detail="Freqtrade reload failed")
    return {"status": "ok"}
