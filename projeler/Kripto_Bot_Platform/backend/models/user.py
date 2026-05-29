from sqlalchemy import Column, String, Float, Boolean, DateTime, Integer, JSON, ForeignKey
from sqlalchemy.sql import func
from core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")  # "admin" or "user"
    
    # Financials & Permissions
    is_active = Column(Boolean, default=True)
    fee_type = Column(String, default="fixed")  # "fixed" (sabit) or "percentage" (yuzdelik)
    fee_amount = Column(Float, default=0.0)     # type=fixed ise miktar ($), type=percentage ise oran (%)
    fee_active = Column(Boolean, default=True) # Ucret zorunlulugu aktif mi?
    allowed_pages = Column(JSON, default=list)  # Hangi sayfalari gorebilir
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class UserExchangeKey(Base):
    """Encrypted Exchange Keys stored safely in Postgres"""
    __tablename__ = "user_exchange_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exchange = Column(String, nullable=False)  # "mexc", "binance", vb.
    api_key = Column(String, nullable=False)   # Public ID
    encrypted_secret = Column(String, nullable=False) # AES-256 Sifreli
    encrypted_passphrase = Column(String, nullable=True) # AES-256 Sifreli (Opsiyonel)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
