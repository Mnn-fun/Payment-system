from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Numeric,
    ForeignKey
)
from sqlalchemy.sql import func

from app.database import Base


class FxLot(Base):
    __tablename__ = "fx_lots"

    id = Column(Integer, primary_key=True, index=True)

    # Current owner (wallet account)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)

    # Settlement currency (always USD)
    settlement_currency = Column(String(3), nullable=False, default="USD")

    # Total USD created in this lot
    settlement_amount_total = Column(Numeric(18, 6), nullable=False)

    # Remaining USD available
    settlement_amount_remaining = Column(Numeric(18, 6), nullable=False)

    # Origin fiat details
    origin_currency = Column(String(3), nullable=False)
    origin_amount_total = Column(Numeric(18, 6), nullable=False)

    # FX rate used at conversion time
    fx_rate_used = Column(Numeric(18, 6), nullable=False)

    # FX provider identifier (e.g. RBI_REF, WISE, MOCK)
    fx_provider = Column(String(50), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    consumed_at = Column(DateTime(timezone=True), nullable=True)
