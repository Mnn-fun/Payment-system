# services/transaction_service.py

from decimal import Decimal
from models.transaction import Transaction
from models.ledger import LedgerEntry, LedgerEntryType
from services.idempotency_store import IdempotencyStore


class TransactionService:

    def transfer(self, sender, receiver, amount: Decimal, currency: str, idempotency_key: str):
        if self.idempotency_store.exists(idempotency_key):
            return self.idempotency_store.get(idempotency_key) 
        
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

        
       
        try:
            debit = LedgerEntry(
                account_id=sender.account_id,
                amount=amount,
                entry_type=LedgerEntryType.DEBIT,
                transaction_id=txn.transaction_id
            )

            credit = LedgerEntry(
                account_id=receiver.account_id,
                amount=amount,
                entry_type=LedgerEntryType.CREDIT,
                transaction_id=txn.transaction_id
            )

            sender.add_ledger_entry(debit)
            receiver.add_ledger_entry(credit)

            txn.mark_success()
            self.idempotency_store.save(idempotency_key, txn)

            return txn

        except Exception:
            txn.mark_failed()
            raise


        return txn


