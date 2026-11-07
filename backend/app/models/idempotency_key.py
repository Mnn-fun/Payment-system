from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base

class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)
    transaction_id = Column(Integer, nullable=True)
    # Persist the server response so replays can return identical payload/status
    response_body = Column(Text, nullable=True)
    response_status = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
