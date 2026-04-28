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
