import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import select, text
from core.config import settings
from core.database import async_session
from core.database import engine, Base
from api.routes import bots, market, ai_analysis, chart, signals, auth, exchanges, data, backtest, calendar, analytics, freqtrade
from api.websocket import market_ws, bot_status_ws
from exchange.bitget_client import bitget
from services.data_fetcher import DataFetcher
from services.liquidation_collector import start_liquidation_collector
from services.economic_calendar import start_calendar_sync
from services.signal_tracker import start_signal_tracker


async def _init_db():
    """Uygulama başlarken tabloları oluştur (OHLCV dahil). Hata olursa uygulama yine başlar."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[Main] Veritabanı tabloları hazır.")
    except Exception as e:
        print(f"[Main] DB bağlantı hatası (uygulama devam ediyor): {e}")

    # Eksik kolonları ekle — TEK transaction, IF NOT EXISTS (PG 9.6+)
    # Bu sayede zaten varolan kolonlar ERROR üretmez, 25+ bağlantı yerine 1 bağlantı açılır.
    _migrations = [
        ("bots", "initial_balance", "FLOAT DEFAULT 1000.0"),
        ("bots", "params", "TEXT"),
        ("bots", "risk_per_trade", "FLOAT DEFAULT 0.01"),
        ("bots", "max_daily_loss", "FLOAT DEFAULT 0.05"),
        ("trades", "exchange", "VARCHAR"),
        ("trades", "session_type", "VARCHAR"),
        ("trades", "exit_reason", "VARCHAR"),
        ("trades", "volatility_1h", "FLOAT"),
        ("trades", "volume_ratio", "FLOAT"),
        ("trades", "funding_rate", "FLOAT"),
        ("trades", "rsi_at_entry", "FLOAT"),
        ("trades", "ema200_trend", "VARCHAR"),
        ("trades", "leverage_used", "INTEGER"),
        ("trades", "duration_minutes", "INTEGER"),
        ("bot_filters", "volatility_filter_enabled", "BOOLEAN DEFAULT FALSE"),
        ("signal_logs", "raw_payload", "TEXT"),
        ("signal_logs", "outcome", "VARCHAR"),
        ("signal_logs", "outcome_price", "FLOAT"),
        ("signal_logs", "outcome_pnl_pct", "FLOAT"),
        ("signal_logs", "outcome_at", "TIMESTAMPTZ"),
        ("signal_logs", "rsi_14", "FLOAT"),
        ("signal_logs", "volatility_atr", "FLOAT"),
        ("signal_logs", "volume_ratio", "FLOAT"),
        ("signal_logs", "ema200_dist", "FLOAT"),
        ("signal_logs", "timeframe", "VARCHAR"),
        ("webhook_profiles", "username", "VARCHAR DEFAULT 'default'"),
        ("webhook_profiles", "leverage", "INTEGER DEFAULT 20"),
        ("signal_logs", "max_price_in_range", "FLOAT"),
        ("signal_logs", "min_price_in_range", "FLOAT"),
        ("signal_logs", "max_favorable_pct", "FLOAT"),
        ("signal_logs", "tp_was_reachable", "BOOLEAN"),
        ("signal_logs", "sl_was_hit", "BOOLEAN"),
        ("signal_logs", "max_adverse_pct", "FLOAT"),
    ]
    try:
        async with engine.begin() as conn:
            for table, column, col_type in _migrations:
                await conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
                ))
        print(f"[Migration] {len(_migrations)} kolon kontrolü tamamlandı (tek transaction).")
    except Exception as e:
        print(f"[Migration] Toplu migration hatası (devam ediliyor): {e}")


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
    """
    Lifespan — HİÇBİR ŞEY BEKLEME.
    Tüm başlatma işlemleri arka plan task'ı olarak çalışır.
    Böylece reverse proxy (Caddy/Nginx) timeout'una düşmez.
    """
    print("[Main] Lifespan başlıyor (non-blocking)...")
    tasks: list[asyncio.Task] = []

    async def _background_init():
        """Tüm başlatma adımları tek bir background task içinde sırayla çalışır."""
        symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT"]

        # 1. Veritabanı tabloları + migration
        try:
            await asyncio.wait_for(_init_db(), timeout=30)
        except asyncio.TimeoutError:
            print("[Main] DB init timeout (30s) — devam ediliyor.")
        except Exception as e:
            print(f"[Main] DB init hatası (devam ediliyor): {e}")

        # 2. Bitget WebSocket akışları
        try:
            if settings.BITGET_API_KEY:
                for sym in symbols:
                    tasks.append(asyncio.create_task(bitget.subscribe_kline(sym, "1m")))
                    tasks.append(asyncio.create_task(bitget.subscribe_ticker(sym)))
                print(f"[Main] {len(symbols)} sembol için veri akışı başlatıldı.")
                try:
                    fetcher = DataFetcher(bitget)
                    tasks.append(asyncio.create_task(_start_data_sync(fetcher, symbols)))
                except Exception as e:
                    print(f"[Main] DataSync başlatılamadı: {e}")
            else:
                print("[Main] BITGET_API_KEY tanımlı değil — WebSocket başlatılmadı.")
        except Exception as e:
            print(f"[Main] Bitget WS hatası (devam ediliyor): {e}")

        # 3. Likidasyon collector
        try:
            liq_tasks = await asyncio.wait_for(start_liquidation_collector(), timeout=10)
            tasks.extend(liq_tasks)
        except asyncio.TimeoutError:
            print("[Main] LiqCollector timeout (10s) — devam ediliyor.")
        except Exception as e:
            print(f"[Main] LiqCollector hatası (devam ediliyor): {e}")

        # 4. Ekonomik takvim senkronizasyonu
        try:
            tasks.append(asyncio.create_task(start_calendar_sync()))
            print("[Main] Ekonomik takvim senkronizasyonu başlatıldı.")
        except Exception as e:
            print(f"[Main] EconCal hatası (devam ediliyor): {e}")

        # 5. Sinyal sonuç takipçisi
        try:
            tasks.append(asyncio.create_task(start_signal_tracker()))
        except Exception as e:
            print(f"[Main] SignalTracker hatası (devam ediliyor): {e}")

        # 6. Bot auto-start
        try:
            await asyncio.wait_for(_auto_start_bots(tasks), timeout=30)
        except asyncio.TimeoutError:
            print("[Main] Bot auto-start timeout (30s).")
        except Exception as e:
            print(f"[Main] Bot auto-start hatası: {e}")

        print("[Main] ✓ Arka plan başlatma tamamlandı.")

    # Tek bir background task — lifespan anında yield eder, hiçbir şey beklemez
    tasks.append(asyncio.create_task(_background_init()))
    print("[Main] ✓ Uygulama hazır (arka plan servisleri başlatılıyor).")
    yield

    # Kapatma
    for t in tasks:
        t.cancel()
    try:
        await bitget.close()
    except Exception:
        pass


async def _auto_start_bots(tasks: list):
    """DB'de status=running olan botları otomatik başlat."""
    from models.trade import Bot, BotStatus
    from bot.engine import BotEngine
    from api.routes.bots import _running_bots, _bot_tasks, _get_exchange_client
    import json as _json

    async with async_session() as session:
        result = await session.execute(
            select(Bot).where(Bot.status == BotStatus.RUNNING)
        )
        running_bots = result.scalars().all()

    if not running_bots:
        print("[Main] Otomatik başlatılacak bot yok.")
        return

    for bot in running_bots:
        try:
            _params = _json.loads(bot.params) if bot.params else {}
            _margin_type = _params.get("margin_type", "isolated")
            ex_client = await _get_exchange_client(bot.exchange or "bitget", margin_type=_margin_type)

            config = {
                "id": bot.id,
                "name": bot.name,
                "symbol": bot.symbol,
                "strategy": bot.strategy,
                "paper_mode": bot.paper_mode,
                "leverage": bot.leverage,
                "risk_per_trade": bot.risk_per_trade,
                "max_daily_loss": bot.max_daily_loss,
                "initial_balance": bot.initial_balance or 1000.0,
                "params": _json.loads(bot.params) if bot.params else {},
            }
            engine_inst = BotEngine(config, ex_client)
            _running_bots[bot.id] = engine_inst

            async def _safe_run(eng, bot_id):
                try:
                    await eng.run()
                except Exception as e:
                    print(f"[Main] Bot #{bot_id} çalışırken hata: {e}")

            task = asyncio.create_task(_safe_run(engine_inst, bot.id))
            _bot_tasks[bot.id] = task
            print(f"[Main] Bot #{bot.id} '{bot.name}' otomatik başlatıldı.")
        except Exception as e:
            print(f"[Main] Bot #{bot.id} başlatma hatası: {e}")

    print(f"[Main] {len(running_bots)} bot otomatik olarak yeniden başlatıldı.")


app = FastAPI(
    redirect_slashes=False,
    title="Kripto Bot Platform API",
    version="1.0.0",
    lifespan=lifespan,
)


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

# REST routes — /api ve /api/api prefix'leri (frontend double-prefix workaround)
for _prefix in ["/api", "/api/api"]:
    app.include_router(auth.router, prefix=_prefix)
    app.include_router(exchanges.router, prefix=_prefix)
    app.include_router(bots.router, prefix=_prefix)
    app.include_router(market.router, prefix=_prefix)
    app.include_router(ai_analysis.router, prefix=_prefix)
    app.include_router(chart.router, prefix=_prefix)
    app.include_router(signals.router, prefix=_prefix)
    app.include_router(data.router, prefix=_prefix)
    app.include_router(backtest.router, prefix=_prefix)
    app.include_router(calendar.router, prefix=_prefix)
    app.include_router(analytics.router, prefix=_prefix)
    app.include_router(freqtrade.router, prefix=_prefix)


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
        "version": "1.1.0",
        "database": db_status,
        "environment": settings.ENVIRONMENT
    }
