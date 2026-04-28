"""
Likidasyon Veri Toplayıcı
═════════════════════════
Kaynaklar:
  1. Binance WS forceOrders stream (ücretsiz, API key gerekmez)
  2. Coinglass API (opsiyonel, COINGLASS_API_KEY varsa aktif)

Her iki kaynak da aynı formatta DB'ye yazar.
Chart ve confluence sistemi kaynaktan bağımsız çalışır.
"""
import asyncio
import json
import time

import httpx
import websockets
from sqlalchemy import select, func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from core.config import settings
from core.database import AsyncSessionLocal
from models.trade import Liquidation


# ─── Binance WS Collector (ücretsiz) ────────────────────────────────────────

BINANCE_WS_URL = "wss://fstream.binance.com/ws/!forceOrder@arr"


async def _collect_binance_ws():
    """
    Binance Futures WS — tüm sembollerin anlık likidasyon emirlerini dinler.
    API key gerektirmez. Veriyi PostgreSQL'e yazar.
    """
    while True:
        try:
            async with websockets.connect(
                BINANCE_WS_URL,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5,
            ) as ws:
                print("[LiqCollector] Binance WS bağlandı — likidasyon dinleniyor")

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        order = msg.get("o", msg)

                        symbol = order.get("s", "")          # BTCUSDT
                        side = order.get("S", "").lower()     # BUY/SELL → buy/sell
                        price = float(order.get("p", 0))      # likidasyon fiyatı
                        qty = float(order.get("q", 0))         # miktar
                        ts = int(order.get("T", time.time() * 1000))  # timestamp ms

                        if not symbol or not price or not qty:
                            continue

                        usd_value = price * qty

                        # Küçük likidasyonları filtrele (< $1000)
                        if usd_value < 1000:
                            continue

                        row = {
                            "exchange": "binance",
                            "symbol": symbol,
                            "side": side,
                            "price": price,
                            "quantity": qty,
                            "usd_value": usd_value,
                            "timestamp": ts,
                            "source": "binance_ws",
                        }

                        await _insert_liquidation(row)

                    except (ValueError, KeyError):
                        continue

        except (websockets.ConnectionClosed, ConnectionError, OSError) as e:
            print(f"[LiqCollector] Binance WS koptu: {e} — 5s sonra tekrar")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"[LiqCollector] Binance WS hata: {e} — 10s sonra tekrar")
            await asyncio.sleep(10)


# ─── Coinglass Collector (opsiyonel) ─────────────────────────────────────────

async def _collect_coinglass():
    """
    Coinglass API — liquidation map verisi.
    COINGLASS_API_KEY yoksa sessizce çıkar.
    Varsa 5 dakikada bir veri çeker.
    """
    if not settings.COINGLASS_API_KEY:
        print("[LiqCollector] COINGLASS_API_KEY yok — Coinglass devre dışı")
        return

    symbols = ["BTCUSDT", "ETHUSDT"]

    while True:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                for symbol in symbols:
                    try:
                        r = await client.get(
                            "https://open-api-v4.coinglass.com/api/futures/liquidation/order",
                            params={
                                "exchange": "Binance",
                                "symbol": symbol.replace("USDT", ""),
                                "min_liquidation_amount": "10000",
                            },
                            headers={"CG-API-KEY": settings.COINGLASS_API_KEY},
                        )
                        data = r.json()

                        if data.get("code") != "0" and data.get("success") is not True:
                            continue

                        orders = data.get("data", [])
                        if not isinstance(orders, list):
                            continue

                        for order in orders:
                            row = {
                                "exchange": order.get("exchangeName", "binance").lower(),
                                "symbol": symbol,
                                "side": order.get("side", "").lower(),
                                "price": float(order.get("price", 0)),
                                "quantity": float(order.get("quantity", 0)),
                                "usd_value": float(order.get("usdAmount", 0)),
                                "timestamp": int(order.get("createTime", time.time() * 1000)),
                                "source": "coinglass",
                            }
                            if row["price"] and row["usd_value"] >= 1000:
                                await _insert_liquidation(row)

                    except Exception as e:
                        print(f"[LiqCollector] Coinglass {symbol} hatası: {e}")
                        continue

        except Exception as e:
            print(f"[LiqCollector] Coinglass genel hata: {e}")

        # 5 dakikada bir tekrar çek
        await asyncio.sleep(300)


# ─── DB Yardımcıları ─────────────────────────────────────────────────────────

async def _insert_liquidation(row: dict):
    """Tek bir likidasyon kaydını DB'ye yaz."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = pg_insert(Liquidation).values(row)
            # Duplicate kontrolü: aynı exchange+symbol+timestamp+price → atla
            stmt = stmt.on_conflict_do_nothing()
            await session.execute(stmt)
            await session.commit()
    except Exception:
        pass  # DB hatası olursa stream kesilmesin


async def get_liquidation_heatmap(symbol: str, hours: int = 24) -> dict:
    """
    DB'deki likidasyon verilerinden heatmap oluştur.
    Her fiyat seviyesindeki toplam likidasyon hacmini hesaplar.
    Chart ve confluence bu fonksiyonu kullanır.
    """
    since_ts = int((time.time() - hours * 3600) * 1000)
    # Binance formatı: BTCUSDT, bizim format: BTC/USDT:USDT
    db_symbol = symbol.split("/")[0].replace(":USDT", "") + "USDT" if "/" in symbol else symbol

    try:
        async with AsyncSessionLocal() as session:
            # Fiyat aralığını bul
            range_q = await session.execute(
                select(
                    func.min(Liquidation.price).label("min_price"),
                    func.max(Liquidation.price).label("max_price"),
                    func.count(Liquidation.id).label("total_count"),
                    func.sum(Liquidation.usd_value).label("total_usd"),
                ).where(
                    Liquidation.symbol == db_symbol,
                    Liquidation.timestamp >= since_ts,
                )
            )
            r = range_q.one()

            if not r.total_count or r.total_count == 0:
                return {"levels": [], "total_count": 0, "hours": hours}

            # Fiyat binleri oluştur (50 bin)
            price_range = r.max_price - r.min_price
            if price_range <= 0:
                return {"levels": [], "total_count": 0, "hours": hours}

            bin_size = price_range / 50
            bins = 50

            # SQL ile gruplama — her bin'deki toplam hacim
            result = await session.execute(
                text("""
                    SELECT
                        FLOOR(price / :bin_size) * :bin_size AS price_level,
                        SUM(CASE WHEN side = 'sell' THEN usd_value ELSE 0 END) AS long_liq,
                        SUM(CASE WHEN side = 'buy'  THEN usd_value ELSE 0 END) AS short_liq,
                        SUM(usd_value) AS total,
                        COUNT(*) AS count
                    FROM liquidations
                    WHERE symbol = :symbol AND timestamp >= :since_ts
                    GROUP BY price_level
                    ORDER BY total DESC
                    LIMIT 20
                """),
                {"bin_size": bin_size, "symbol": db_symbol, "since_ts": since_ts},
            )
            rows = result.fetchall()

            levels = [
                {
                    "price": round(float(row[0]) + bin_size / 2, 2),
                    "long_liq": round(float(row[1]), 0),
                    "short_liq": round(float(row[2]), 0),
                    "total": round(float(row[3]), 0),
                    "count": int(row[4]),
                }
                for row in rows
            ]

            return {
                "levels": levels,
                "total_count": int(r.total_count),
                "total_usd": round(float(r.total_usd), 0),
                "hours": hours,
                "source": "binance_ws" if not settings.COINGLASS_API_KEY else "binance_ws+coinglass",
            }

    except Exception as e:
        return {"levels": [], "total_count": 0, "hours": hours, "error": str(e)}


async def get_liquidation_stats(symbol: str) -> dict:
    """Son 24 saatteki likidasyon özeti."""
    since_ts = int((time.time() - 24 * 3600) * 1000)
    db_symbol = symbol.split("/")[0].replace(":USDT", "") + "USDT" if "/" in symbol else symbol

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(
                    func.count(Liquidation.id).label("count"),
                    func.sum(Liquidation.usd_value).label("total_usd"),
                    func.sum(
                        func.case(
                            (Liquidation.side == "sell", Liquidation.usd_value),
                            else_=0,
                        )
                    ).label("long_liq_usd"),
                    func.sum(
                        func.case(
                            (Liquidation.side == "buy", Liquidation.usd_value),
                            else_=0,
                        )
                    ).label("short_liq_usd"),
                ).where(
                    Liquidation.symbol == db_symbol,
                    Liquidation.timestamp >= since_ts,
                )
            )
            r = result.one()

            total = float(r.total_usd or 0)
            long_liq = float(r.long_liq_usd or 0)
            short_liq = float(r.short_liq_usd or 0)

            signal = "neutral"
            if long_liq > short_liq * 1.5:
                signal = "longs_liquidated"
            elif short_liq > long_liq * 1.5:
                signal = "shorts_liquidated"

            return {
                "count": int(r.count or 0),
                "total_usd": round(total, 0),
                "long_liq_usd": round(long_liq, 0),
                "short_liq_usd": round(short_liq, 0),
                "signal": signal,
            }

    except Exception as e:
        return {"count": 0, "total_usd": 0, "signal": "neutral", "error": str(e)}


# ─── Ana Başlatıcı ───────────────────────────────────────────────────────────

async def start_liquidation_collector():
    """
    Likidasyon collector'ları başlat.
    Binance WS her zaman çalışır, Coinglass key varsa ek olarak çalışır.
    """
    tasks = [
        asyncio.create_task(_collect_binance_ws()),
    ]

    # Coinglass key varsa onu da başlat
    if settings.COINGLASS_API_KEY:
        tasks.append(asyncio.create_task(_collect_coinglass()))
        print("[LiqCollector] Coinglass collector da başlatıldı")

    print("[LiqCollector] Binance WS likidasyon collector başlatıldı")
    return tasks
