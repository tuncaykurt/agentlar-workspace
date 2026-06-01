"""
Bollinger Grid Service — BB bantlarından dinamik grid sınırları hesaplar.

Akış:
1. MEXC'ten OHLCV mum datası çek (fetch_ohlcv)
2. BB + ATR + RSI hesapla (indicators.calculate_bb_for_grid)
3. Redis'e cache'le (bb_grid:{symbol}:{timeframe})
4. Grid engine her 60s'de bu değerleri okur ve grid sınırlarını günceller

Squeeze: bb_width < 0.005 → bantlar çok dar, breakout bekleniyor
Midline: close > bb_mid → uptrend (grid için uygun)
"""
import asyncio
import json
import time

from core.redis_client import get_redis
from ai.indicators import calculate_bb_for_grid


# BB squeeze eşiği — bantlar bu oranın altına düşerse duraklama/min_spread
BB_SQUEEZE_THRESHOLD = 0.005  # %0.5


class BollingerGridService:
    def __init__(self):
        self._exchange = None
        self._running = False
        self._recalc_task: asyncio.Task | None = None

    async def _get_exchange(self):
        if not self._exchange:
            from exchange.mexc_client import MEXCClient
            self._exchange = MEXCClient(public_only=True)
        return self._exchange

    async def fetch_bb_data(
        self,
        ccxt_symbol: str,
        timeframe: str = "5m",
        bb_period: int = 20,
        bb_std: float = 2.0,
        limit: int = 100,
    ) -> dict:
        """MEXC'ten OHLCV çek → BB/ATR/RSI hesapla → döndür."""
        try:
            ex = await self._get_exchange()
            ohlcv = await ex.get_ohlcv(ccxt_symbol, timeframe, limit=limit)
            if not ohlcv or len(ohlcv) < bb_period + 5:
                print(f"[BB-Service] Yetersiz mum datası: {len(ohlcv) if ohlcv else 0} < {bb_period + 5}")
                return {}

            bb_data = calculate_bb_for_grid(ohlcv, period=bb_period, std_dev=bb_std)
            if not bb_data:
                print("[BB-Service] BB hesaplama başarısız (yetersiz veri)")
                return {}

            # Squeeze tespiti
            bb_data["is_squeeze"] = bb_data.get("bb_width", 1) < BB_SQUEEZE_THRESHOLD
            # Orta çizgi yönü
            bb_data["above_midline"] = bb_data.get("close", 0) > bb_data.get("bb_mid", 0)
            # Trend gücü
            bb_data["strong_trend"] = bb_data.get("adx", 0) > 40
            
            # Dinamik Üçlü Zaman Dilimi (MTF) Onayı
            mtf_map = {
                "1m": ["5m", "15m"],
                "3m": ["15m", "1h"],
                "5m": ["15m", "1h"],
                "15m": ["1h", "4h"],
                "30m": ["2h", "4h"],
                "1h": ["4h", "1d"],
                "4h": ["1d", "1w"],
            }
            
            mtf_trend = "neutral"
            if timeframe in mtf_map:
                tf1, tf2 = mtf_map[timeframe]
                try:
                    ohlcv1 = await ex.get_ohlcv(ccxt_symbol, tf1, limit=50)
                    ohlcv2 = await ex.get_ohlcv(ccxt_symbol, tf2, limit=50)
                    
                    if ohlcv1 and len(ohlcv1) >= 25 and ohlcv2 and len(ohlcv2) >= 25:
                        bb1 = calculate_bb_for_grid(ohlcv1, period=20, std_dev=2.0)
                        bb2 = calculate_bb_for_grid(ohlcv2, period=20, std_dev=2.0)
                        
                        if bb1 and bb2:
                            tf1_up = bb1.get("close", 0) > bb1.get("bb_mid", 0)
                            tf2_up = bb2.get("close", 0) > bb2.get("bb_mid", 0)
                            
                            if tf1_up and tf2_up:
                                mtf_trend = "long"
                            elif not tf1_up and not tf2_up:
                                mtf_trend = "short"
                except Exception as e:
                    print(f"[BB-Service] MTF hesaplama hatası ({timeframe}): {e}")
            
            bb_data["mtf_trend"] = mtf_trend
            bb_data["timeframe"] = timeframe
            bb_data["fetched_at"] = int(time.time())

            return bb_data

        except Exception as e:
            print(f"[BB-Service] OHLCV/BB hesaplama hatası: {type(e).__name__}: {e}")
            return {}

    async def compute_grid_bounds(
        self,
        ccxt_symbol: str,
        timeframe: str = "5m",
        bb_period: int = 20,
        bb_std: float = 2.0,
        min_spread_pct: float = 0.3,
        current_price: float = 0,
        grid_count: int = 15,
    ) -> dict:
        """BB bantlarından grid sınırlarını hesapla + Redis'e cache'le."""
        redis = get_redis()
        cache_key = f"bb_grid:{ccxt_symbol}:{timeframe}"

        # Önce cache'e bak (30s TTL)
        cached = await redis.get(cache_key)
        if cached:
            try:
                data = json.loads(cached)
                # Cache 30s'den yeni ise kullan
                if time.time() - data.get("fetched_at", 0) < 30:
                    return data
            except (json.JSONDecodeError, TypeError):
                pass

        # Cache yok veya eski → yeniden hesapla
        bb_data = await self.fetch_bb_data(ccxt_symbol, timeframe, bb_period, bb_std)
        if not bb_data:
            return {}

        # Min spread floor kontrolü
        bb_upper = bb_data["bb_upper"]
        bb_lower = bb_data["bb_lower"]
        bb_mid = bb_data["bb_mid"]

        if bb_mid > 0:
            actual_spread_pct = (bb_upper - bb_lower) / bb_mid * 100
        else:
            actual_spread_pct = 0

        # Kullanıcının "Min Spread %" ayarı, "Kademe Aralığı" (Grid Step) içindir.
        required_spread_pct = min_spread_pct * grid_count
        if actual_spread_pct < required_spread_pct and current_price > 0:
            half = required_spread_pct / 200  # /100 çünkü ±, /2 çünkü iki taraf
            bb_data["bb_upper"] = round(current_price * (1 + half), 8)
            bb_data["bb_lower"] = round(current_price * (1 - half), 8)
            bb_data["min_spread_applied"] = True
            actual_spread_pct = required_spread_pct
        else:
            bb_data["min_spread_applied"] = False

        bb_data["actual_spread_pct"] = round(actual_spread_pct, 4)

        # Redis'e cache'le
        await redis.set(cache_key, json.dumps(bb_data), ex=30)

        return bb_data

    async def start_recalc_loop(
        self,
        ccxt_symbol: str,
        user_id: str,
        timeframe: str = "5m",
        bb_period: int = 20,
        bb_std: float = 2.0,
        min_spread_pct: float = 0.3,
        bot_id: str = "default",
    ):
        """Arka plan loop: her 60s BB yeniden hesapla → grid engine'e bildir."""
        self._running = True
        redis = get_redis()
        last_candle_ts = 0
        recalc_count = 0

        print(f"[BB-Service] Recalc loop başlatıldı: {ccxt_symbol} / {timeframe} / "
              f"period={bb_period} / std={bb_std} / bot={bot_id}")

        while self._running:
            try:
                # Grid hâlâ çalışıyor mu? (multi-bot format)
                running = await redis.get(f"grid_live:running:{user_id}:{bot_id}")
                if not running:
                    print(f"[BB-Service] Grid durmuş (bot={bot_id}), recalc loop sonlandırılıyor")
                    break

                # Mevcut fiyatı al (min_spread_pct floor için)
                state_raw = await redis.get(f"grid_live:state:{user_id}:{bot_id}")
                current_price = 0
                if state_raw:
                    state = json.loads(state_raw)
                    current_price = state.get("current_price", 0)

                # BB hesapla
                bb_data = await self.compute_grid_bounds(
                    ccxt_symbol, timeframe, bb_period, bb_std,
                    min_spread_pct, current_price
                )

                if bb_data and bb_data.get("candle_ts", 0) != last_candle_ts:
                    last_candle_ts = bb_data.get("candle_ts", 0)
                    recalc_count += 1

                    # BB meta'yı state'e yaz (grid engine okuyacak)
                    await redis.set(f"bb_grid:meta:{user_id}:{bot_id}:{ccxt_symbol}", json.dumps({
                        "bb_upper": bb_data.get("bb_upper", 0),
                        "bb_lower": bb_data.get("bb_lower", 0),
                        "bb_mid": bb_data.get("bb_mid", 0),
                        "bb_width": bb_data.get("bb_width", 0),
                        "rsi": bb_data.get("rsi", 50),
                        "atr": bb_data.get("atr", 0),
                        "adx": bb_data.get("adx", 0),
                        "is_squeeze": bb_data.get("is_squeeze", False),
                        "above_midline": bb_data.get("above_midline", True),
                        "strong_trend": bb_data.get("strong_trend", False),
                        "mtf_trend": bb_data.get("mtf_trend", "neutral"),
                        "actual_spread_pct": bb_data.get("actual_spread_pct", 0),
                        "min_spread_applied": bb_data.get("min_spread_applied", False),
                        "updated_at": int(time.time()),
                    }), ex=120)

                    if recalc_count == 1:
                        print(f"[BB-Service] İlk BB hesabı: upper={bb_data.get('bb_upper'):.2f} "
                              f"lower={bb_data.get('bb_lower'):.2f} mid={bb_data.get('bb_mid'):.2f} "
                              f"width={bb_data.get('bb_width'):.4f} rsi={bb_data.get('rsi'):.1f} "
                              f"adx={bb_data.get('adx'):.1f}")
                    elif recalc_count % 10 == 0:
                        print(f"[BB-Service] Recalc #{recalc_count}: "
                              f"BB={bb_data.get('bb_lower'):.2f}-{bb_data.get('bb_upper'):.2f} "
                              f"width={bb_data.get('bb_width'):.4f} rsi={bb_data.get('rsi'):.1f}")

            except Exception as e:
                print(f"[BB-Service] Recalc loop hatası: {e}")

            await asyncio.sleep(60)

        self._running = False
        print("[BB-Service] Recalc loop sonlandı")

    def stop(self):
        """Recalc loop'u durdur."""
        self._running = False
        if self._recalc_task and not self._recalc_task.done():
            self._recalc_task.cancel()
            print("[BB-Service] Recalc task iptal edildi")
