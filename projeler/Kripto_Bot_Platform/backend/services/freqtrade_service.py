import httpx
import os
import json
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class FreqtradeService:
    def __init__(self):
        self.base_url = os.getenv("FREQTRADE_API_URL", "http://freqtrade:8080/api/v1")
        self.username = os.getenv("FREQTRADE_USER", "freqtrader")
        self.password = os.getenv("FREQTRADE_PASS", "super-secret-password")
        self.timeout = 10.0

    async def _get_auth(self):
        return httpx.BasicAuth(self.username, self.password)

    async def get_status(self) -> Dict[str, Any]:
        """Bot durumunu döner (running, stopped, vb.)"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                auth = await self._get_auth()
                response = await client.get(f"{self.base_url}/status", auth=auth)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Freqtrade status error: {e}")
            return {"status": "error", "message": str(e)}

    async def get_trades(self) -> List[Dict[str, Any]]:
        """Aktif işlemleri döner."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                auth = await self._get_auth()
                response = await client.get(f"{self.base_url}/trades", auth=auth)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Freqtrade trades error: {e}")
            return []

    async def get_balance(self) -> Dict[str, Any]:
        """Cüzdan bakiyesini döner."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                auth = await self._get_auth()
                response = await client.get(f"{self.base_url}/balance", auth=auth)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Freqtrade balance error: {e}")
            return {}

    async def force_entry(self, symbol: str, side: str = "buy") -> Dict[str, Any]:
        """Belirli bir sembol için işlem açar (Sinyal Köprüsü için)."""
        try:
            # Freqtrade'e göre sembol formatı (örn: BTC/USDT)
            # Bizim platformdan gelen: BTC/USDT:USDT -> BTC/USDT
            clean_symbol = symbol.split(":")[0]
            
            payload = {
                "pair": clean_symbol,
                "ordertype": "market",
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                auth = await self._get_auth()
                # Freqtrade APIv1'de forcebuy/forcesell
                endpoint = "/forcebuy" if side == "buy" else "/forcesell"
                response = await client.post(f"{self.base_url}{endpoint}", auth=auth, json=payload)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Freqtrade force_entry error: {e}")
            return {"status": "error", "message": str(e)}

    async def reload_config(self) -> bool:
        """Strateji veya konfigürasyon değişikliğini yansıtmak için botu yeniler."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                auth = await self._get_auth()
                response = await client.post(f"{self.base_url}/reload_config", auth=auth)
                return response.status_code == 200
        except Exception:
            return False

# Singleton instance
freqtrade_service = FreqtradeService()
