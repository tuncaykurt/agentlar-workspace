from sqlalchemy import Column, String, Float, Boolean, DateTime, Integer, Enum
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
