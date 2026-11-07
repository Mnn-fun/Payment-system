from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class FxQuote(Base):
    __tablename__ = "fx_quotes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    base_currency = Column(String(3), nullable=False)
    target_currency = Column(String(3), nullable=False)
    
    amount = Column(Numeric(18, 6), nullable=False)
    mid_market_rate = Column(Numeric(18, 6), nullable=False)
    interpay_rate = Column(Numeric(18, 6), nullable=False)
    converted_amount = Column(Numeric(18, 6), nullable=False)
    
    spread_percent = Column(Numeric(5, 4), nullable=False)
    spread_revenue = Column(Numeric(18, 6), nullable=False)
    
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
