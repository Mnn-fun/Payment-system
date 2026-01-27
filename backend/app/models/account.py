# account.py

from decimal import Decimal
from datetime import datetime
from uuid import uuid4


class InsufficientBalanceError(Exception):
    """Raised when account balance is insufficient for a transaction"""
    pass


class Account:
    def __init__(
        self,
        owner_id: str,
        currency: str = "INR",
        opening_balance: Decimal = Decimal("0.00")
    ):
        self.account_id = str(uuid4())
        self.owner_id = owner_id
        self.currency = currency
        self.balance = opening_balance
        self.created_at = datetime.utcnow()
        self.updated_at = self.created_at

    def deposit(self, amount: Decimal) -> None:
        if amount <= 0:
            raise ValueError("Deposit amount must be positive")

        self.balance += amount
        self.updated_at = datetime.utcnow()

    def withdraw(self, amount: Decimal) -> None:
        if amount <= 0:
            raise ValueError("Withdrawal amount must be positive")

        if self.balance < amount:
            raise InsufficientBalanceError("Not enough balance")

        self.balance -= amount
        self.updated_at = datetime.utcnow()

    def can_withdraw(self, amount: Decimal) -> bool:
        return self.balance >= amount

    def snapshot(self) -> dict:
        """
        Returns current state of account
        Useful for APIs, logs, debugging
        """
        return {
            "account_id": self.account_id,
            "owner_id": self.owner_id,
            "balance": str(self.balance),
            "currency": self.currency,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
