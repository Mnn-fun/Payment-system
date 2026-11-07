from sqlalchemy import Column, Integer, String, Numeric, DateTime
from sqlalchemy.sql import func

from app.database import Base


class FxLiquidity(Base):
    __tablename__ = "fx_liquidity"

    id = Column(Integer, primary_key=True)

    currency = Column(String(3), nullable=False, unique=True)

    available_amount = Column(Numeric(18, 6), nullable=False, default=0)
    reserved_amount = Column(Numeric(18, 6), nullable=False, default=0)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
