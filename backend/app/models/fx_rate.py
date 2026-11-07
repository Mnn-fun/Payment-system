from sqlalchemy import Column, Integer, String, Numeric, DateTime
from sqlalchemy.sql import func

from app.database import Base


class FxRate(Base):
    __tablename__ = "fx_rates"

    id = Column(Integer, primary_key=True, index=True)

    # Base currency (always USD)
    base_currency = Column(String(3), nullable=False, default="USD")

    # Target currency (e.g. EUR, GBP, JPY)
    target_currency = Column(String(3), nullable=False, unique=True, index=True)

    # How many units of target_currency per 1 USD
    # e.g. USD→EUR = 0.92 means 1 USD = 0.92 EUR
    rate = Column(Numeric(18, 6), nullable=False)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
