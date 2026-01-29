# transaction.py

from decimal import Decimal
from datetime import datetime
from enum import Enum
from uuid import uuid4


class TransactionStatus(Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class Transaction:
    def __init__(self, amount: Decimal, currency: str, sender_account_id: str, receiver_account_id: str, description: str = ""):
        if amount <= 0:
            raise ValueError("Transaction amount must be positive")

        # validate sender/receiver provided and not the same
        if sender_account_id == receiver_account_id:
            raise ValueError("Sender and receiver cannot be the same")

        self.transaction_id = str(uuid4())
        self.sender_account_id = sender_account_id
        self.receiver_account_id = receiver_account_id
        self.amount = amount
        self.currency = currency
        self.description = description
        self.created_at = datetime.utcnow()
        # initialize status and completion time
        self.status = TransactionStatus.PENDING
        self.completed_at = None

    def mark_success(self) -> None:
        self.status = TransactionStatus.SUCCESS
        self.completed_at = datetime.utcnow()

    def mark_failed(self) -> None:
        self.status = TransactionStatus.FAILED
        self.completed_at = datetime.utcnow()

    def snapshot(self) -> dict:
        return {
            "transaction_id": self.transaction_id,
            "sender_account_id": self.sender_account_id,
            "receiver_account_id": self.receiver_account_id,
            "amount": str(self.amount),
            "currency": self.currency,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "completed_at": (
                self.completed_at.isoformat()
                if self.completed_at
                else None
            ),
        }
