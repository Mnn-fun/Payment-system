# app/services/transaction_service.py

from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.ledger import Ledger
from app.models.transaction import Transaction
from app.utils.errors import (
    InsufficientBalanceError,
    InvalidTransactionError
)


class TransactionService:
    def __init__(self, db: Session):
        self.db = db

    def get_account_balance(self, account_id: int) -> Decimal:
        credits = self.db.query(Ledger).filter(
            Ledger.account_id == account_id,
            Ledger.amount > 0
        ).all()

        debits = self.db.query(Ledger).filter(
            Ledger.account_id == account_id,
            Ledger.amount < 0
        ).all()

        return sum(l.amount for l in credits) + sum(l.amount for l in debits)

    def get_ledger_entries(self, account_id: int):
        return self.db.query(Ledger).filter(
            Ledger.account_id == account_id
        ).all()

    def create_transaction(self, from_account_id: int, to_account_id: int, amount: float):

        if amount <= 0:
            raise InvalidTransactionError("Amount must be greater than zero")

        if from_account_id == to_account_id:
            raise InvalidTransactionError("Cannot transfer to same account")

        sender = self.db.query(Account).get(from_account_id)
        receiver = self.db.query(Account).get(to_account_id)

        if not sender or not receiver:
            raise InvalidTransactionError("Account not found")

        balance = self.get_account_balance(from_account_id)

        if balance < amount:
            raise InsufficientBalanceError("Insufficient balance")

        try:
            txn = Transaction(
                sender_account_id=from_account_id,
                receiver_account_id=to_account_id,
                amount=amount,
                status="SUCCESS"
            )

            debit = Ledger(
                account_id=from_account_id,
                amount=-amount
            )

            credit = Ledger(
                account_id=to_account_id,
                amount=amount
            )

            self.db.add_all([txn, debit, credit])
            self.db.commit()

            return {
                "transaction_id": txn.id,
                "status": "SUCCESS"
            }

        except Exception:
            self.db.rollback()
            raise
