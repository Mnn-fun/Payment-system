from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, Numeric
from sqlalchemy.sql import func

from app.database import Base



class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Settlement currency (locked to USD by design)
    currency = Column(String(3), nullable=False, default="USD")

    status = Column(String(20), nullable=False, default="ACTIVE")

     # Cached balance (performance only, NOT source of truth)
    cached_balance_usd = Column(Numeric(18, 6), nullable=False, default=0)

    # Sandbox/test balance (subset of cached_balance included for demo purposes, NOT withdrawable)
    test_balance_usd = Column(Numeric(18, 6), nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "currency", name="uq_user_currency"),
    )
