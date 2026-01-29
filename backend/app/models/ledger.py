# ledger.py

from decimal import Decimal
from datetime import datetime
from enum import Enum
from uuid import uuid4


class LedgerEntryType(str, Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class LedgerEntry:
    def __init__(
        self,
        account_id: str,
        amount: Decimal,
        entry_type: LedgerEntryType,
        transaction_id: str
    ):
        if amount <= 0:
            raise ValueError("Ledger entry amount must be positive")

        self.entry_id = str(uuid4())
        self.account_id = account_id
        self.amount = amount
        self.entry_type = entry_type
        self.transaction_id = transaction_id
        self.created_at = datetime.utcnow()

    def signed_amount(self) -> Decimal:
        """
        CREDIT increases balance
        DEBIT decreases balance
        """
        if self.entry_type == LedgerEntryType.CREDIT:
            return self.amount
        return -self.amount

    def snapshot(self) -> dict:
        return {
            "entry_id": self.entry_id,
            "account_id": self.account_id,
            "amount": str(self.amount),
            "entry_type": self.entry_type.value,
            "transaction_id": self.transaction_id,
            "created_at": self.created_at.isoformat(),
        }
