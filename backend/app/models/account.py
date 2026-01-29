# account.py

from decimal import Decimal
from datetime import datetime
from uuid import uuid4
from models.ledger import LedgerEntry, LedgerEntryType


class InsufficientBalanceError(Exception):
    """Raised when account balance is insufficient for a transaction"""
    pass
class Account:
    def __init__(self, owner_name: str, currency: str):
        self.account_id = str(uuid4())
        self.owner_name = owner_name
        self.currency = currency
        self.ledger_entries: list[LedgerEntry] = []

    def add_ledger_entry(self, entry: LedgerEntry):
        if entry.account_id != self.account_id:
            raise ValueError("Ledger entry does not belong to this account")
        self.ledger_entries.append(entry)

    def calculate_balance(self) -> Decimal:
        balance = Decimal("0")

        for entry in self.ledger_entries:
            if entry.entry_type == LedgerEntryType.CREDIT:
                balance += entry.amount
            else:
                balance -= entry.amount

        return balance