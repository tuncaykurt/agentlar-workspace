from sqlalchemy import Column, String, Float, Boolean, DateTime, Integer, Enum, BigInteger, UniqueConstraint, Index, Text
from sqlalchemy.sql import func
from core.database import Base
import enum


class TradeStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class BotStatus(str, enum.Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


class Bot(Base):
    __tablename__ = "bots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    symbol = Column(String, nullable=False)          # BTCUSDT
    strategy = Column(String, nullable=False)         # ema_cross, grid, funding
    exchange = Column(String, default="bybit")
    status = Column(Enum(BotStatus), default=BotStatus.STOPPED)
    paper_mode = Column(Boolean, default=True)        # True = paper trading
    leverage = Column(Integer, default=3)
    risk_per_trade = Column(Float, default=0.01)      # %1
    max_daily_loss = Column(Float, default=0.05)      # %5
    initial_balance = Column(Float, default=1000.0)
    params = Column(Text, nullable=True)              # JSON string — strateji parametreleri
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, nullable=False)
    symbol = Column(String, nullable=False)
    side = Column(String, nullable=False)             # buy / sell
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    quantity = Column(Float, nullable=False)
    pnl = Column(Float, nullable=True)
    pnl_pct = Column(Float, nullable=True)
    status = Column(Enum(TradeStatus), default=TradeStatus.OPEN)
    paper = Column(Boolean, default=True)
    exchange_order_id = Column(String, nullable=True)
    opened_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)
    # Zengin metadata — akıllı filtreler için
    exchange = Column(String, nullable=True)
    session_type = Column(String, nullable=True)      # asia, europe, america
    exit_reason = Column(String, nullable=True)       # tp, sl, trailing, manual, liquidation, signal
    volatility_1h = Column(Float, nullable=True)      # ATR bazlı volatilite
    volume_ratio = Column(Float, nullable=True)       # ortalamaya göre hacim oranı
    funding_rate = Column(Float, nullable=True)       # giriş anındaki funding
    rsi_at_entry = Column(Float, nullable=True)       # girişteki RSI
    ema200_trend = Column(String, nullable=True)      # bull, bear, sideways
    leverage_used = Column(Integer, nullable=True)    # kullanılan kaldıraç
    duration_minutes = Column(Integer, nullable=True) # işlem süresi dakika


class EconomicEvent(Base):
    """Ekonomik takvim olayları — FED, CPI, PPI, NFP vb."""
    __tablename__ = "economic_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    country = Column(String, nullable=True)           # US, EU, CN, CRYPTO
    category = Column(String, nullable=True)          # interest_rate, inflation, employment, crypto
    impact = Column(String, nullable=False)            # high, medium, low
    event_time = Column(DateTime(timezone=True), nullable=False)
    actual = Column(String, nullable=True)
    forecast = Column(String, nullable=True)
    previous = Column(String, nullable=True)
    source = Column(String, default="finnhub")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_event_time", "event_time"),
        Index("ix_event_impact", "impact", "event_time"),
    )


class BotFilter(Base):
    """Bot bazlı akıllı filtre ayarları"""
    __tablename__ = "bot_filters"

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, nullable=False, unique=True)
    # Toggle'lar
    smart_hours_enabled = Column(Boolean, default=False)       # Akıllı saat filtresi
    news_protection_enabled = Column(Boolean, default=False)   # Haber koruması
    self_learning_enabled = Column(Boolean, default=False)     # Öz-öğrenme
    trend_filter_enabled = Column(Boolean, default=False)      # EMA200 trend filtresi
    volatility_filter_enabled = Column(Boolean, default=False) # Volatilite limiti
    # Parametreler
    news_blackout_minutes = Column(Integer, default=30)        # Haberden ±X dk işlem yasağı
    min_win_rate_threshold = Column(Float, default=0.4)        # Öz-öğrenme: min %40 başarı
    max_volatility_atr = Column(Float, nullable=True)          # Maks ATR değeri
    blocked_hours = Column(Text, nullable=True)                # JSON: [3,4,5] yasaklı saatler (UTC)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SignalLog(Base):
    """Gelen tüm sinyaller — işleme girsin girmesin hepsi kaydedilir"""
    __tablename__ = "signal_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    bot_id = Column(Integer, nullable=False)
    symbol = Column(String, nullable=False)
    signal_type = Column(String, nullable=False)          # buy, sell
    source = Column(String, nullable=True)                 # tradingview, custom, strategy_name
    price = Column(Float, nullable=True)
    reason = Column(Text, nullable=True)                   # sinyal açıklaması
    action = Column(String, nullable=False, default="received")  # received, executed, rejected, filtered
    reject_reason = Column(Text, nullable=True)            # neden reddedildi
    confidence = Column(Float, nullable=True)              # AI güven skoru
    tp_price = Column(Float, nullable=True)
    sl_price = Column(Float, nullable=True)
    raw_payload = Column(Text, nullable=True)              # ham sinyal JSON
    
    # Teknik analiz göstergeleri (Sinyal geldiği andaki durum)
    rsi_14 = Column(Float, nullable=True)                  # Sinyal anındaki 14 periyotluk RSI
    volatility_atr = Column(Float, nullable=True)          # Sinyal anındaki ATR (Volatilite)
    volume_ratio = Column(Float, nullable=True)            # Hacim artış oranı
    ema200_dist = Column(Float, nullable=True)             # EMA200'e olan uzaklık %
    
    # Sinyal zaman dilimi (TradingView {{interval}} → 1m, 5m, 15m, 1h, 4h, 1d)
    timeframe = Column(String, nullable=True)

    # Performans takibi — bot kapalıyken bile sinyal sonucu izlenir
    outcome = Column(String, nullable=True)                # tp_hit, sl_hit, next_signal, open, expired
    outcome_price = Column(Float, nullable=True)           # sonuç fiyatı (kapanış)
    outcome_pnl_pct = Column(Float, nullable=True)         # kâr/zarar yüzdesi
    outcome_at = Column(DateTime(timezone=True), nullable=True)  # sonuç zamanı

    # Sinyal-arası fiyat aralığı analizi (bu sinyal → bir sonraki sinyal arası)
    max_price_in_range = Column(Float, nullable=True)      # aralıktaki en yüksek fiyat (long için favori)
    min_price_in_range = Column(Float, nullable=True)      # aralıktaki en düşük fiyat (short için favori)
    # max_favorable_pct: long → (max_high - entry) / entry; short → (entry - min_low) / entry
    max_favorable_pct = Column(Float, nullable=True)       # en iyi potansiyel kazanç %
    max_adverse_pct = Column(Float, nullable=True)         # en kötü potansiyel kayıp %
    tp_was_reachable = Column(Boolean, nullable=True)      # TP fiyatına ulaşıldı mı (ama biz kapamadan önce)?
    sl_was_hit = Column(Boolean, nullable=True)            # SL fiyatına ulaşıldı mı?

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_signal_bot_time", "bot_id", "created_at"),
        Index("ix_signal_action", "action", "created_at"),
    )


class WebhookProfile(Base):
    """
    Token bazlı webhook profili.
    Her token için TP/SL yüzdeleri saklanır.
    Bot kapalıyken bile gelen sinyaller bu ayarlarla değerlendirilir.
    """
    __tablename__ = "webhook_profiles"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, default="default")  # kullanıcıya özel
    token = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=True)                   # profil adı (opsiyonel)
    tp_pct = Column(Float, nullable=False, default=2.0)    # Take Profit %
    sl_pct = Column(Float, nullable=False, default=1.0)    # Stop Loss %
    leverage = Column(Integer, nullable=False, default=20)  # kaldıraç
    enabled = Column(Boolean, default=True)                 # aktif mi
    use_ai_validation = Column(Boolean, default=False)      # AI Doğrulama aktif mi?
    ai_mode = Column(String, default="balanced")            # strict, balanced, relaxed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class OHLCV(Base):
    """
    Geçmiş mum verileri.
    Her symbol + exchange + timeframe + timestamp kombinasyonu benzersiz.
    """
    __tablename__ = "ohlcv"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    exchange = Column(String, nullable=False)              # bitget, mexc, binance
    symbol = Column(String, nullable=False)                # BTC/USDT:USDT
    timeframe = Column(String, nullable=False)             # 1m, 5m, 15m, 1h, 4h, 1d
    timestamp = Column(BigInteger, nullable=False)         # Unix ms (borsadan gelen)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("exchange", "symbol", "timeframe", "timestamp", name="uq_ohlcv"),
        Index("ix_ohlcv_lookup", "exchange", "symbol", "timeframe", "timestamp"),
    )


class AiPrompt(Base):
    """AI filtre promptları — admin panelinden düzenlenebilir"""
    __tablename__ = "ai_prompts"

    key = Column(String, primary_key=True)              # news_analysis, self_learning, trend_volatility
    prompt_text = Column(Text, nullable=False)
    model = Column(String, nullable=True)               # deepseek/deepseek-chat, perplexity/sonar-pro
    description = Column(String, nullable=True)          # Türkçe açıklama
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CoinSnapshot(Base):
    """
    Coin anlık gösterge verileri — arka plan worker tarafından güncellenir.
    Zero-fee coinler öncelikli, tüm USDT-M futures çiftleri desteklenir.
    """
    __tablename__ = "coin_snapshots"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    exchange = Column(String, nullable=False, default="mexc")
    symbol = Column(String, nullable=False)               # BTC/USDT:USDT
    base = Column(String, nullable=False)                  # BTC
    timeframe = Column(String, nullable=False, default="1h")

    # Fiyat
    price = Column(Float, nullable=True)
    price_change_1h = Column(Float, nullable=True)         # son 1 saatlik değişim %
    price_change_24h = Column(Float, nullable=True)        # 24 saatlik değişim %

    # Göstergeler
    rsi_14 = Column(Float, nullable=True)
    atr = Column(Float, nullable=True)
    atr_pct = Column(Float, nullable=True)                 # ATR / fiyat * 100
    ema200 = Column(Float, nullable=True)
    ema200_dist = Column(Float, nullable=True)             # fiyat - EMA200 arası %
    macd_hist = Column(Float, nullable=True)
    supertrend_dir = Column(Integer, nullable=True)        # 1=bullish, -1=bearish
    adx = Column(Float, nullable=True)
    volume_ratio = Column(Float, nullable=True)            # güncel hacim / 20 periyot ort.
    bb_upper = Column(Float, nullable=True)
    bb_lower = Column(Float, nullable=True)

    # Ek piyasa verileri
    funding_rate = Column(Float, nullable=True)              # funding rate (%)
    open_interest = Column(Float, nullable=True)             # açık pozisyon (USDT)
    fear_greed = Column(Integer, nullable=True)              # korku/açgözlülük endeksi (0-100)
    long_short_ratio = Column(Float, nullable=True)          # long/short oranı

    # Meta
    zero_fee = Column(Boolean, default=False)
    taker_fee = Column(Float, nullable=True)
    maker_fee = Column(Float, nullable=True)
    max_leverage = Column(Integer, nullable=True)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("exchange", "symbol", "timeframe", name="uq_coin_snapshot"),
        Index("ix_coin_snapshot_lookup", "exchange", "symbol"),
        Index("ix_coin_snapshot_zero_fee", "zero_fee", "exchange"),
    )


class SimStatus(str, enum.Enum):
    OPEN = "open"
    WIN = "win"
    LOSS = "loss"
    EXPIRED = "expired"


class ScannerSimulation(Base):
    """
    Smart Scanner simülasyon kayıtları.
    Bot açmadan AI/Manuel seçimlerini kaydeder ve sonucunu takip eder.
    """
    __tablename__ = "scanner_simulations"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # Seçim bilgileri
    coin = Column(String, nullable=False)                    # BTC
    symbol = Column(String, nullable=False)                  # BTC/USDT:USDT
    direction = Column(String, nullable=False)               # long / short
    selection_mode = Column(String, nullable=False)           # ai / manual
    confidence = Column(Integer, nullable=True)              # AI güven skoru
    reason = Column(Text, nullable=True)                     # Seçim nedeni

    # Fiyat bilgileri
    entry_price = Column(Float, nullable=False)
    tp_price = Column(Float, nullable=True)
    sl_price = Column(Float, nullable=True)
    tp_pct = Column(Float, nullable=True)
    sl_pct = Column(Float, nullable=True)
    leverage = Column(Integer, default=50)

    # Göstergeler (seçim anında)
    rsi_14 = Column(Float, nullable=True)
    adx = Column(Float, nullable=True)
    volume_ratio = Column(Float, nullable=True)
    funding_rate = Column(Float, nullable=True)
    fear_greed = Column(Integer, nullable=True)
    atr_pct = Column(Float, nullable=True)
    supertrend_dir = Column(Integer, nullable=True)

    # Sonuç
    status = Column(String, default="open")                  # open, win, loss, expired
    exit_price = Column(Float, nullable=True)
    pnl_pct = Column(Float, nullable=True)                   # % kâr/zarar
    pnl_usdt = Column(Float, nullable=True)                  # simüle USDT kâr/zarar
    max_favorable_pct = Column(Float, nullable=True)         # en yüksek lehte hareket %
    max_adverse_pct = Column(Float, nullable=True)           # en yüksek aleyhte hareket %
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # AI öğrenme
    ai_review = Column(Text, nullable=True)                  # AI kendi işlemini yorumlar

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_sim_status", "status"),
        Index("ix_sim_created", "created_at"),
        Index("ix_sim_coin", "coin", "status"),
    )


class Liquidation(Base):
    """
    Gerçek zamanlı likidasyon emirleri.
    Binance WS forceOrders stream'den toplanır.
    Coinglass eklenirse oradan da doldurulabilir.
    """
    __tablename__ = "liquidations"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    exchange = Column(String, nullable=False, default="binance")
    symbol = Column(String, nullable=False)                # BTCUSDT
    side = Column(String, nullable=False)                  # buy = short liq, sell = long liq
    price = Column(Float, nullable=False)                  # likidasyon fiyatı
    quantity = Column(Float, nullable=False)                # miktar
    usd_value = Column(Float, nullable=False)              # USD değeri (price * quantity)
    timestamp = Column(BigInteger, nullable=False)         # Unix ms
    source = Column(String, nullable=False, default="binance_ws")  # binance_ws, coinglass

    __table_args__ = (
        Index("ix_liq_symbol_ts", "symbol", "timestamp"),
        Index("ix_liq_price", "symbol", "price"),
    )


class CryptoNews(Base):
    """
    CryptoPanic webhook veya RSS üzerinden toplanan kripto haberleri.
    """
    __tablename__ = "crypto_news"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=True)
    source = Column(String, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    sentiment = Column(String, default="neutral")       # bullish, bearish, neutral
    currencies = Column(String, nullable=True)          # Virgülle ayrılmış semboller: "BTC,ETH"
    positive_votes = Column(Integer, default=0)
    negative_votes = Column(Integer, default=0)
    important_votes = Column(Integer, default=0)
    summary_tr = Column(Text, nullable=True)            # Türkçe özet
    sentiment_tr = Column(String, nullable=True)        # Türkçe sentiment
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_news_published", "published_at"),
        Index("ix_news_sentiment", "sentiment"),
    )

