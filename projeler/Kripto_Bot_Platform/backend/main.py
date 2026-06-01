import asyncio
import time as _time_mod
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import select, text
from core.config import settings
from core.database import async_session
from core.database import engine, Base
from models.user import User, UserExchangeKey
from api.routes import bots, market, ai_analysis, chart, signals, auth, admin, exchanges, data, backtest, calendar, analytics, freqtrade, trades, ai_chat, coins
from api.websocket import market_ws, bot_status_ws
from exchange.bitget_client import bitget
from services.data_fetcher import DataFetcher
from services.liquidation_collector import start_liquidation_collector
from services.economic_calendar import start_calendar_sync
from services.signal_tracker import start_signal_tracker
from services.coin_collector import start_coin_collector
from services.scanner_simulator import start_scanner_simulator
from services.mexc_ws_feeder import start_mexc_ws_feeder
from services.hft_engine import run_hft_engine


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
        ("users", "fee_type", "VARCHAR DEFAULT 'percentage'"),
        ("users", "fee_amount", "FLOAT DEFAULT 20.0"),
        ("users", "fee_active", "BOOLEAN DEFAULT TRUE"),
        ("users", "allowed_pages", "JSON"),
        ("bots", "initial_balance", "FLOAT DEFAULT 1000.0"),
        ("bots", "params", "TEXT"),
        ("bots", "risk_per_trade", "FLOAT DEFAULT 0.01"),
        ("bots", "max_daily_loss", "FLOAT DEFAULT 0.05"),
        ("bots", "user_id", "INTEGER DEFAULT 1"),
        ("trades", "exchange", "VARCHAR"),
        ("trades", "session_type", "VARCHAR"),
        ("trades", "exit_reason", "VARCHAR"),
        ("trades", "user_id", "INTEGER DEFAULT 1"),
        ("trades", "volatility_1h", "FLOAT"),
        ("trades", "volume_ratio", "FLOAT"),
        ("trades", "funding_rate", "FLOAT"),
        ("trades", "rsi_at_entry", "FLOAT"),
        ("trades", "ema200_trend", "VARCHAR"),
        ("trades", "leverage_used", "INTEGER"),
        ("trades", "duration_minutes", "INTEGER"),
        ("bot_filters", "volatility_filter_enabled", "BOOLEAN DEFAULT FALSE"),
        ("bot_filters", "user_id", "INTEGER DEFAULT 1"),
        ("signal_logs", "raw_payload", "TEXT"),
        ("signal_logs", "outcome", "VARCHAR"),
        ("signal_logs", "user_id", "INTEGER DEFAULT 1"),
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
        ("webhook_profiles", "user_id", "INTEGER DEFAULT 1"),
        ("signal_logs", "max_price_in_range", "FLOAT"),
        ("signal_logs", "min_price_in_range", "FLOAT"),
        ("signal_logs", "max_favorable_pct", "FLOAT"),
        ("signal_logs", "tp_was_reachable", "BOOLEAN"),
        ("signal_logs", "sl_was_hit", "BOOLEAN"),
        ("signal_logs", "max_adverse_pct", "FLOAT"),
        # Smart Scanner ek piyasa verileri
        ("coin_snapshots", "funding_rate", "FLOAT"),
        ("coin_snapshots", "open_interest", "FLOAT"),
        ("coin_snapshots", "fear_greed", "INTEGER"),
        ("coin_snapshots", "long_short_ratio", "FLOAT"),
    ]

    # scanner_simulations tablosu (CREATE IF NOT EXISTS)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS scanner_simulations (
                    id BIGSERIAL PRIMARY KEY,
                    coin VARCHAR NOT NULL,
                    symbol VARCHAR NOT NULL,
                    direction VARCHAR NOT NULL,
                    selection_mode VARCHAR NOT NULL,
                    confidence INTEGER,
                    reason TEXT,
                    entry_price FLOAT NOT NULL,
                    tp_price FLOAT, sl_price FLOAT,
                    tp_pct FLOAT, sl_pct FLOAT,
                    leverage INTEGER DEFAULT 50,
                    rsi_14 FLOAT, adx FLOAT, volume_ratio FLOAT,
                    funding_rate FLOAT, fear_greed INTEGER,
                    atr_pct FLOAT, supertrend_dir INTEGER,
                    status VARCHAR DEFAULT 'open',
                    exit_price FLOAT, pnl_pct FLOAT, pnl_usdt FLOAT,
                    max_favorable_pct FLOAT, max_adverse_pct FLOAT,
                    closed_at TIMESTAMPTZ,
                    ai_review TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sim_status ON scanner_simulations (status)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sim_created ON scanner_simulations (created_at)"))
        # Yeni kolonlar ekle
            for col_def in [
                "ai_log TEXT",
                "exit_reason VARCHAR",           # TP, SL, TRAILING, EXPIRED
                "duration_minutes INTEGER",       # İşlem süresi (dk)
                "first_move VARCHAR",             # İlk hareket yönü: favorable / adverse
                "first_move_pct FLOAT",           # İlk hareket yüzdesi
                "is_hedge BOOLEAN DEFAULT FALSE", # Hedge işlemi mi
                "hedge_pair_id BIGINT",           # Eşleşen hedge işleminin ID'si
                "margin_usdt FLOAT",              # İşlem için kullanılan margin
                "user_id INTEGER DEFAULT 1",      # Multi-tenant: kullanıcıya ait
            ]:
                col_name = col_def.split()[0]
                await conn.execute(text(
                    f"ALTER TABLE scanner_simulations ADD COLUMN IF NOT EXISTS {col_def}"
                ))
        # Mevcut NULL status kayıtları düzelt
            await conn.execute(text("""
                UPDATE scanner_simulations SET status = 'open'
                WHERE status IS NULL AND exit_price IS NULL
            """))
        # Kapalı işlemlerde duration_minutes retroaktif hesapla
            await conn.execute(text("""
                UPDATE scanner_simulations
                SET duration_minutes = EXTRACT(EPOCH FROM (closed_at - created_at)) / 60
                WHERE status IN ('win','loss','expired')
                  AND duration_minutes IS NULL
                  AND closed_at IS NOT NULL AND created_at IS NOT NULL
            """))
        # Açık işlemlerde NULL olan max_favorable/adverse değerlerini 0 yap
            await conn.execute(text("""
                UPDATE scanner_simulations
                SET max_favorable_pct = COALESCE(max_favorable_pct, 0),
                    max_adverse_pct = COALESCE(max_adverse_pct, 0)
                WHERE status = 'open'
                  AND (max_favorable_pct IS NULL OR max_adverse_pct IS NULL)
            """))
        print("[Migration] scanner_simulations tablosu hazır.")
    except Exception as e:
        print(f"[Migration] scanner_simulations hatası (devam): {e}")
    try:
        async with engine.begin() as conn:
            for table, column, col_type in _migrations:
                await conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}"
                ))
        print(f"[Migration] {len(_migrations)} kolon kontrolü tamamlandı (tek transaction).")
    except Exception as e:
        print(f"[Migration] Toplu migration hatası (devam ediliyor): {e}")

    # --- SÜPER ADMİN OLUŞTUR ---
    try:
        from core.security import hash_password
        async with async_session() as session:
            admin_email = "dvtkurt@gmail.com"
            result = await session.execute(select(User).where(User.email == admin_email))
            admin = result.scalar_one_or_none()
            if not admin:
                new_admin = User(
                    email=admin_email,
                    password_hash=hash_password("Yacnut5061710"),
                    role="admin",
                    is_active=True,
                    fee_type="fixed",
                    fee_amount=0.0,
                    fee_active=False,
                    allowed_pages=["dashboard", "grid_bots", "smart_scanner", "backtest", "admin", "calculator", "settings"]
                )
                session.add(new_admin)
                await session.commit()
                print(f"[Main] Süper Admin oluşturuldu: {admin_email}")
            else:
                # Sifreyi ve yetkileri her acilista garanti et
                admin.password_hash = hash_password("Yacnut5061710")
                admin.role = "admin"
                admin.fee_active = False
                admin.allowed_pages = ["dashboard", "grid_bots", "smart_scanner", "backtest", "admin", "calculator", "settings"]
                await session.commit()
                print(f"[Main] Süper Admin güncellendi: {admin_email}")
    except Exception as e:
        print(f"[Main] Süper Admin oluşturma hatası: {e}")


async def _start_data_sync(fetcher: DataFetcher, symbols: list[str]):
    """
    Arka planda periyodik veri senkronizasyonu.
    Her 5 dakikada tüm coinlerin eksik mumlarını doldurur.
    Dinamik: coin_collector'ın bulduğu coinler de dahil.
    """
    timeframes = ["1h", "4h"]

    # İlk çalışmada öncelikli coinleri sync et
    try:
        await fetcher.sync_all(symbols, timeframes)
        print(f"[DataSync] İlk senkronizasyon tamamlandı ({len(symbols)} coin).")
    except Exception as e:
        print(f"[DataSync] İlk senkronizasyon hatası: {e}")

    # Sonra 5 dakikada bir — scanner coinlerini de dahil et
    while True:
        await asyncio.sleep(300)
        try:
            # Dinamik coin listesi: öncelikli + scanner coinleri
            all_symbols = list(symbols)
            try:
                from core.redis_client import get_redis
                import json
                redis = get_redis()
                cached = await redis.get("coin_collector:zero_fee_symbols")
                if cached:
                    scanner_coins = json.loads(cached)
                    for c in scanner_coins:
                        if c["symbol"] not in all_symbols:
                            all_symbols.append(c["symbol"])
            except Exception:
                pass

            count = await fetcher.sync_all(all_symbols, timeframes)
            if count > 0:
                print(f"[DataSync] {count} yeni mum eklendi ({len(all_symbols)} coin).")
        except Exception as e:
            print(f"[DataSync] Senkronizasyon hatası: {e}")


async def _exchange_balance_cache():
    """Borsa bakiyesini 60 saniyede bir Redis'e cache'le (İPTAL - Multi-tenant mimari)"""
    pass


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

        # 0. Redis bağlantı testi
        try:
            from core.redis_client import get_redis
            redis = get_redis()
            await asyncio.wait_for(redis.ping(), timeout=5)
            print(f"[Main] Redis bağlantısı başarılı: {settings.REDIS_URL}")
        except Exception as e:
            print(f"[Main] ⚠️ Redis bağlantı HATASI: {type(e).__name__}: {e}")
            print(f"[Main] REDIS_URL: {settings.REDIS_URL}")
            print(f"[Main] Redis olmadan devam ediliyor — bazı özellikler çalışmayabilir.")

        # 1. Veritabanı tabloları + migration
        try:
            await asyncio.wait_for(_init_db(), timeout=30)
        except asyncio.TimeoutError:
            print("[Main] DB init timeout (30s) — devam ediliyor.")
        except Exception as e:
            print(f"[Main] DB init hatası (devam ediliyor): {e}")

        # 2. Veri akışları (Bitget WS opsiyonel + MEXC data sync)
        try:
            if settings.BITGET_API_KEY:
                for sym in symbols:
                    tasks.append(asyncio.create_task(bitget.subscribe_kline(sym, "1m")))
                    tasks.append(asyncio.create_task(bitget.subscribe_ticker(sym)))
                print(f"[Main] {len(symbols)} sembol için Bitget WS akışı başlatıldı.")
            else:
                print("[Main] BITGET_API_KEY tanımlı değil — Bitget WebSocket başlatılmadı.")
        except Exception as e:
            print(f"[Main] Bitget WS hatası (devam ediliyor): {e}")

        # Data sync — her zaman MEXC üzerinden (ana borsa)
        try:
            from exchange.exchange_factory import get_public_client as _get_pub
            mexc_sync = DataFetcher(_get_pub("mexc"), exchange_name="mexc")
            tasks.append(asyncio.create_task(_start_data_sync(mexc_sync, symbols)))
        except Exception as e:
            print(f"[Main] DataSync başlatılamadı: {e}")

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

        # 6. Coin veri toplayıcı (zero-fee coinler) + MEXC WebSocket
        try:
            tasks.append(asyncio.create_task(start_coin_collector()))
            tasks.append(asyncio.create_task(start_scanner_simulator()))
            tasks.append(asyncio.create_task(start_mexc_ws_feeder()))
            # tasks.append(asyncio.create_task(_exchange_balance_cache()))
            tasks.append(asyncio.create_task(run_hft_engine()))
            print("[Main] Coin veri toplayıcı + MEXC WS + HFT Engine + bakiye cache başlatıldı.")
        except Exception as e:
            print(f"[Main] CoinCollector hatası (devam ediliyor): {e}")

        # 7. Bot auto-start
        try:
            await asyncio.wait_for(_auto_start_bots(tasks), timeout=30)
        except asyncio.TimeoutError:
            print("[Main] Bot auto-start timeout (30s).")
        except Exception as e:
            print(f"[Main] Bot auto-start hatası: {e}")

        # 8. Geçmiş veri otomatik doldurma (arka plan — bloklamaz)
        try:
            tasks.append(asyncio.create_task(_auto_fill_historical()))
        except Exception as e:
            print(f"[Main] Historical data fill hatası (devam ediliyor): {e}")

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


async def _auto_fill_historical():
    """
    Startup'ta geçmiş veriyi otomatik doldur.
    1. Öncelikli coinler (BTC, ETH, SOL): Tüm timeframe'lerde derin geçmiş
    2. Scanner'ın bulduğu tüm zero-fee coinler: 1h ve 4h geçmişi
    """
    await asyncio.sleep(15)  # Diğer servislerin başlamasını bekle

    # Faz 1: Öncelikli coinler — derin geçmiş
    priority_symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
    priority_timeframes = ["5m", "1h", "4h", "1d"]
    priority_days = {"5m": 30, "1h": 180, "4h": 365, "1d": 365}

    try:
        from exchange.exchange_factory import get_public_client
        mexc_public = get_public_client("mexc")
        fetcher = DataFetcher(mexc_public, exchange_name="mexc")
        stats = await fetcher.get_stats()

        existing = {}
        for s in stats:
            key = f"{s['symbol']}:{s['timeframe']}"
            existing[key] = s["candle_count"]

        hours_per_candle = {"5m": 5/60, "15m": 0.25, "1h": 1, "4h": 4, "1d": 24}

        # --- Faz 1: Öncelikli coinler ---
        for symbol in priority_symbols:
            for tf in priority_timeframes:
                await _fill_symbol(fetcher, symbol, tf, priority_days.get(tf, 90), existing, hours_per_candle)
                await asyncio.sleep(1)

        print("[HistFill] ✓ Faz 1 tamamlandı (öncelikli coinler).")

        # --- Faz 2: Scanner coinleri — Redis'ten oku ---
        await asyncio.sleep(5)
        try:
            from core.redis_client import get_redis
            redis = get_redis()
            cached = await redis.get("coin_collector:zero_fee_symbols")
            if cached:
                import json
                scanner_coins = json.loads(cached)
                scanner_symbols = [c["symbol"] for c in scanner_coins
                                   if c["symbol"] not in priority_symbols]
                print(f"[HistFill] Faz 2: {len(scanner_symbols)} scanner coini için veri çekiliyor...")

                scanner_timeframes = ["1h", "4h"]
                scanner_days = {"1h": 30, "4h": 90}

                for i, symbol in enumerate(scanner_symbols):
                    for tf in scanner_timeframes:
                        await _fill_symbol(fetcher, symbol, tf, scanner_days.get(tf, 30), existing, hours_per_candle)
                        await asyncio.sleep(0.5)  # Rate limit
                    if (i + 1) % 20 == 0:
                        print(f"[HistFill] Faz 2 ilerleme: {i+1}/{len(scanner_symbols)} coin tamamlandı")

                print(f"[HistFill] ✓ Faz 2 tamamlandı ({len(scanner_symbols)} scanner coini).")
            else:
                print("[HistFill] Scanner coinleri henüz yok (coin_collector beklenecek).")
        except Exception as e:
            print(f"[HistFill] Faz 2 hatası (devam ediliyor): {type(e).__name__}: {e}")

        print("[HistFill] ✓ Geçmiş veri doldurma tamamlandı.")
    except Exception as e:
        print(f"[HistFill] Geçmiş veri doldurma hatası: {type(e).__name__}: {e}")


async def _fill_symbol(fetcher, symbol, tf, target_days, existing, hours_per_candle):
    """Tek sembol + timeframe için veri doldur veya sync yap."""
    key = f"{symbol}:{tf}"
    current_count = existing.get(key, 0)
    hpc = hours_per_candle.get(tf, 1)
    target_count = int((target_days * 24) / hpc)

    try:
        if current_count >= target_count * 0.8:
            new = await fetcher.sync_latest(symbol, tf)
            if new > 0:
                print(f"[HistFill] {symbol} {tf}: +{new} mum")
        else:
            count = await fetcher.fetch_historical(symbol, tf, target_days)
            if count > 0:
                print(f"[HistFill] {symbol} {tf}: {count} mum yazıldı ({target_days}g)")
    except Exception as e:
        print(f"[HistFill] {symbol} {tf} hatası: {e}")


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


class TimeoutMiddleware:
    """ASGI middleware — her isteğe 25 saniye global timeout."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            await asyncio.wait_for(self.app(scope, receive, send), timeout=25)
        except asyncio.TimeoutError:
            response = JSONResponse(
                status_code=504,
                content={"detail": "İstek zaman aşımına uğradı (25s). Lütfen tekrar deneyin."}
            )
            await response(scope, receive, send)


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
app.add_middleware(TimeoutMiddleware)  # ASGI raw middleware — 25s global timeout

# REST routes — /api ve /api/api prefix'leri (frontend double-prefix workaround)
for _prefix in ["/api", "/api/api"]:
    app.include_router(auth.router, prefix=_prefix)
    app.include_router(admin.router, prefix=_prefix)
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
    app.include_router(trades.router, prefix=_prefix)
    app.include_router(ai_chat.router, prefix=_prefix)
    app.include_router(coins.router, prefix=_prefix)

    from api.routes import simulations
    app.include_router(simulations.router, prefix=_prefix)


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
    redis_status = "unknown"
    try:
        async with engine.connect() as conn:
            await conn.execute(select(1))
            db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    try:
        from core.redis_client import get_redis
        r = get_redis()
        await r.ping()
        redis_status = "connected"
    except Exception as e:
        redis_status = f"error: {type(e).__name__}: {str(e)}"

    return {
        "status": "ok",
        "version": "1.1.0",
        "database": db_status,
        "redis": redis_status,
        "redis_url": settings.REDIS_URL.split("@")[-1] if "@" in settings.REDIS_URL else settings.REDIS_URL,
        "environment": settings.ENVIRONMENT
    }
