from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    cardholder_name = Column(String(100), nullable=False)
    last_four = Column(String(4), nullable=False)          # only last 4 digits
    card_network = Column(String(20), nullable=False)      # VISA / MASTERCARD / AMEX / DISCOVER
    expiry_month = Column(String(2), nullable=False)       # "MM"
    expiry_year = Column(String(4), nullable=False)        # "YYYY"
    hashed_cvv = Column(String(200), nullable=False)       # bcrypt hash
    phone_number = Column(String(20), nullable=False)      # for OTP verification

    # PENDING_VERIFICATION → ACTIVE → FROZEN
    status = Column(String(30), nullable=False, default="PENDING_VERIFICATION")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
