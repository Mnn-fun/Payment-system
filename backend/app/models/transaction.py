from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Boolean,
    ForeignKey,
)
from sqlalchemy.sql import func

from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # Nullable for backward compatibility with existing rows

    type = Column(String(30), nullable=False)
    # examples: WALLET_DEPOSIT, WALLET_TRANSFER, WALLET_WITHDRAW

    status = Column(String(20), nullable=False, default="PENDING")
    # PENDING / SUCCESS / FAILED

    reference = Column(String(100), nullable=True)
    # external provider ref / gateway ref
    
    payment_method = Column(String(50), nullable=True)
    # UPI / SWIFT / CARD
    
    user_payment_details = Column(String, nullable=True)
    # JSON string or text info about where to send withdrawal money (e.g. UPI ID or SWIFT code)
    
    deposit_proof = Column(String(100), nullable=True)
    # the UTR number or transaction hash that the user provides when depositing

    is_test = Column(Boolean, nullable=False, default=False)
    # True for sandbox/test transactions (test cards) — funds are not withdrawable

    created_at = Column(DateTime(timezone=True), server_default=func.now())
