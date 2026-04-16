import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from api.routes import bots, market, ai_analysis, chart, signals, auth, exchanges
from api.websocket import market_ws, bot_status_ws
from exchange.bitget_client import bitget


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Uygulama başlarken: Bitget WebSocket'i arka planda başlat
    # API key yoksa veya bağlantı kurulamazsa uygulama yine de ayağa kalkar
    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT"]
    tasks = []
    try:
        if settings.BITGET_API_KEY:
            for sym in symbols:
                tasks.append(asyncio.create_task(bitget.subscribe_kline(sym, "1m")))
                tasks.append(asyncio.create_task(bitget.subscribe_ticker(sym)))
            print(f"[Main] {len(symbols)} sembol için veri akışı başlatıldı.")
        else:
            print("[Main] BITGET_API_KEY tanımlı değil — WebSocket başlatılmadı.")
    except Exception as e:
        print(f"[Main] WebSocket başlatma hatası (devam ediliyor): {e}")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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


# WebSocket routes
@app.websocket("/ws/market")
async def ws_market(websocket: WebSocket, symbol: str = "BTC/USDT:USDT"):
    await market_ws(websocket, symbol)


@app.websocket("/ws/bot/{bot_id}")
async def ws_bot(websocket: WebSocket, bot_id: int):
    await bot_status_ws(websocket, bot_id)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
