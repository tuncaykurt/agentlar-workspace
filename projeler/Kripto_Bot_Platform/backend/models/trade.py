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
    outcome = Column(String, nullable=True)                # tp_hit, sl_hit, open, expired
    outcome_price = Column(Float, nullable=True)           # sonuç fiyatı
    outcome_pnl_pct = Column(Float, nullable=True)         # kâr/zarar yüzdesi
    outcome_at = Column(DateTime(timezone=True), nullable=True)  # sonuç zamanı
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
