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


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id = Column(Integer, primary_key=True, index=True)

    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)

    # Always USD in our design
    currency = Column(String(3), nullable=False, default="USD")

    # Signed amount: +credit / -debit
    signed_amount = Column(Numeric(18, 6), nullable=False)

    # FX provenance
    # FX lot reference. For some operations (internal transfers) there may be
    # no FX provenance, so make this nullable.
    fx_lot_id = Column(Integer, ForeignKey("fx_lots.id"), nullable=True)

    # Narrative / atomic grouping
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)

    entry_type = Column(String(10), nullable=False)  # CREDIT / DEBIT

    created_at = Column(DateTime(timezone=True), server_default=func.now())
