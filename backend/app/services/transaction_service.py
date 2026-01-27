# services/transaction_service.py

from decimal import Decimal
from models.transaction import Transaction
from models.ledger import LedgerEntry, LedgerEntryType


class TransactionService:

    def transfer(self, sender, receiver, amount: Decimal, currency: str):
        if sender.currency != receiver.currency:
            raise ValueError("Cross-currency transfer not allowed")

        if sender.calculate_balance() < amount:
            raise ValueError("Insufficient balance")

        txn = Transaction(
            amount=amount,
            currency=currency,
            sender_account_id=sender.account_id,
            receiver_account_id=receiver.account_id,
            description="P2P Transfer"
        )


        debit_entry = LedgerEntry(
            account_id=sender.account_id,
            amount=amount,
            entry_type=LedgerEntryType.DEBIT,
            transaction_id=txn.transaction_id
        )

        credit_entry = LedgerEntry(
            account_id=receiver.account_id,
            amount=amount,
            entry_type=LedgerEntryType.CREDIT,
            transaction_id=txn.transaction_id
        )

        sender.add_ledger_entry(debit_entry)
        receiver.add_ledger_entry(credit_entry)

        txn.mark_success()
        txn.mark_failed()
        raise


        return txn


