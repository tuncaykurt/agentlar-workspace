import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import select
from core.config import settings
from core.database import async_session
from core.database import engine, Base
from api.routes import bots, market, ai_analysis, chart, signals, auth, exchanges, data, backtest
from api.websocket import market_ws, bot_status_ws
from exchange.bitget_client import bitget
from services.data_fetcher import DataFetcher
from services.liquidation_collector import start_liquidation_collector


async def _init_db():
    """Uygulama başlarken tabloları oluştur (OHLCV dahil). Hata olursa uygulama yine başlar."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[Main] Veritabanı tabloları hazır.")
    except Exception as e:
        print(f"[Main] DB bağlantı hatası (uygulama devam ediyor): {e}")


async def _start_data_sync(fetcher: DataFetcher, symbols: list[str]):
    """
    Arka planda periyodik veri senkronizasyonu.
    Her 5 dakikada eksik mumları doldurur.
    """
    timeframes = ["1h", "4h", "1d"]
    # İlk çalışmada son 7 günü doldur (hızlı başlangıç)
    try:
        await fetcher.sync_all(symbols, timeframes)
        print(f"[DataSync] İlk senkronizasyon tamamlandı.")
    except Exception as e:
        print(f"[DataSync] İlk senkronizasyon hatası: {e}")

    # Sonra 5 dakikada bir senkronize et
    while True:
        await asyncio.sleep(300)
        try:
            count = await fetcher.sync_all(symbols, timeframes)
            if count > 0:
                print(f"[DataSync] {count} yeni mum eklendi.")
        except Exception as e:
            print(f"[DataSync] Senkronizasyon hatası: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Veritabanı tablolarını oluştur (hata olursa devam et)
    await _init_db()

    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT"]
    tasks = []

    try:
        if settings.BITGET_API_KEY:
            # 2. WebSocket akışlarını başlat
            for sym in symbols:
                tasks.append(asyncio.create_task(bitget.subscribe_kline(sym, "1m")))
                tasks.append(asyncio.create_task(bitget.subscribe_ticker(sym)))
            print(f"[Main] {len(symbols)} sembol için veri akışı başlatıldı.")

            # 3. Arka plan veri senkronizasyonu başlat (DB erişilebilirse)
            try:
                fetcher = DataFetcher(bitget)
                tasks.append(asyncio.create_task(_start_data_sync(fetcher, symbols)))
                print("[Main] Arka plan veri senkronizasyonu başlatıldı.")
            except Exception as e:
                print(f"[Main] DataSync başlatılamadı (devam ediliyor): {e}")
        else:
            print("[Main] BITGET_API_KEY tanımlı değil — WebSocket başlatılmadı.")

        # 4. Likidasyon collector başlat (Binance WS — her zaman, Coinglass — key varsa)
        try:
            liq_tasks = await start_liquidation_collector()
            tasks.extend(liq_tasks)
        except Exception as e:
            print(f"[Main] LiqCollector başlatılamadı (devam ediliyor): {e}")
    except Exception as e:
        print(f"[Main] Başlatma hatası (devam ediliyor): {e}")

    yield

    # Kapatma
    for t in tasks:
        t.cancel()
    try:
        await bitget.close()
    except Exception:
        pass


app = FastAPI(
    title="Kripto Bot Platform API",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def fix_double_api_prefix(request: Request, call_next):
    """Frontend proxy /api/api/... üretirse /api/... olarak düzelt."""
    path = request.scope.get("path", "")
    if path.startswith("/api/api/"):
        new_path = path[4:]  # /api/api/market → /api/market
        request.scope["path"] = new_path
        request.scope["raw_path"] = new_path.encode()
    return await call_next(request)


# CORS Ayarları
origins = [
    settings.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if settings.ENVIRONMENT == "production" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routes
app.include_router(auth.router, prefix="/api")
app.include_router(exchanges.router, prefix="/api")
app.include_router(bots.router, prefix="/api")
app.include_router(market.router, prefix="/api")
app.include_router(ai_analysis.router, prefix="/api")
app.include_router(chart.router, prefix="/api")
app.include_router(signals.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(backtest.router, prefix="/api")


# WebSocket routes
@app.websocket("/ws/market")
async def ws_market(websocket: WebSocket, symbol: str = "BTC/USDT:USDT"):
    await market_ws(websocket, symbol)


@app.websocket("/ws/bot/{bot_id}")
async def ws_bot(websocket: WebSocket, bot_id: int):
    await bot_status_ws(websocket, bot_id)


@app.get("/api/health")
async def health():
    db_status = "unknown"
    try:
        async with engine.connect() as conn:
            await conn.execute(select(1))
            db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
        
    return {
        "status": "ok",
        "version": "1.0.0",
        "database": db_status,
        "environment": settings.ENVIRONMENT
    }
