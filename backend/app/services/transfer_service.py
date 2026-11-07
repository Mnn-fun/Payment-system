import json
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.ledger_entry import LedgerEntry
from app.models.idempotency_key import IdempotencyKey
from app.models.fx_lot import FxLot
from app.services.fx_quote_service import FxQuoteService


class TransferService:
    def __init__(self, db: Session):
        self.db = db

    def transfer(
        self,
        *,
        from_user_id: int,
        to_user_id: int,
        amount_usd: Decimal,
        idempotency_key: str,
        is_test: bool = False,
        from_currency: str = None,
        to_currency: str = None,
    ):
        if amount_usd <= 0:
            raise ValueError("Transfer amount must be greater than zero")

        if from_user_id == to_user_id:
            raise ValueError("Sender and receiver must be different")

        # ---------------------------------------------------------
        # STEP 1 — Idempotency (FIRST)
        # ---------------------------------------------------------
        existing = (
            self.db.query(IdempotencyKey)
            .filter(IdempotencyKey.key == idempotency_key)
            .with_for_update()
            .one_or_none()
        )

        if existing:
            if existing.transaction_id is None:
                raise ValueError("Request already in progress, retry later")

            # If we have a stored response, return it exactly
            if existing.response_body is not None and existing.response_status is not None:
                try:
                    body = json.loads(existing.response_body)
                except Exception:
                    body = {"message": "Idempotent replay"}
                return body

            txn = self.db.get(Transaction, existing.transaction_id)
            return {
                "transaction_id": txn.id if txn else None,
                "status": txn.status if txn else "COMPLETED",
                "message": "Idempotent replay",
                "idempotency_key": existing.key,
            }

        idem = IdempotencyKey(key=idempotency_key)
        self.db.add(idem)
        self.db.flush()

        # ---------------------------------------------------------
        # STEP 2 — Resolve Accounts (Multi-currency aware)
        # ---------------------------------------------------------
        # 1. Sender account
        sender_query = self.db.query(Account).filter(Account.user_id == from_user_id)
        if from_currency:
            sender = sender_query.filter(Account.currency == from_currency.upper()).first()
        else:
            # Default to primary account (first created)
            sender = sender_query.order_by(Account.id.asc()).first()

        if not sender:
            raise ValueError(f"Sender account not found for user {from_user_id}")

        # 2. Receiver account
        receiver_query = self.db.query(Account).filter(Account.user_id == to_user_id)
        if to_currency:
            receiver = receiver_query.filter(Account.currency == to_currency.upper()).first()
        else:
            # Default to receiver's primary account
            receiver = receiver_query.order_by(Account.id.asc()).first()

        if not receiver:
            raise ValueError(f"Receiver account not found for user {to_user_id}")

        # 3. Deterministic order locking by primary key to prevent deadlocks
        ordered_ids = sorted([sender.id, receiver.id])
        locked_accounts = (
            self.db.query(Account)
            .filter(Account.id.in_(ordered_ids))
            .order_by(Account.id.asc())
            .with_for_update()
            .all()
        )

        sender = next(a for a in locked_accounts if a.id == sender.id)
        receiver = next(a for a in locked_accounts if a.id == receiver.id)

        if sender.cached_balance_usd is None:
            sender.cached_balance_usd = Decimal("0")
        if receiver.cached_balance_usd is None:
            receiver.cached_balance_usd = Decimal("0")

        if sender.cached_balance_usd < amount_usd:
            raise ValueError("Insufficient balance")

        sender_test_bal = sender.test_balance_usd or Decimal("0")
        if is_test:
            if sender_test_bal < amount_usd:
                raise ValueError("Insufficient test balance for a test transfer")
        else:
            sender_real_bal = sender.cached_balance_usd - sender_test_bal
            if sender_real_bal < amount_usd:
                raise ValueError("Insufficient real balance for transfer")

        # ---------------------------------------------------------
        # STEP 3 — FX Rate determination (if cross-currency)
        # ---------------------------------------------------------
        if sender.currency == receiver.currency:
            fx_rate = Decimal("1.0")
            credit_amount = amount_usd
        else:
            fx_service = FxQuoteService(self.db)
            fx_rate = fx_service.fetch_live_rate(sender.currency, receiver.currency)
            credit_amount = (amount_usd * fx_rate).quantize(Decimal("0.000001"))

        # ---------------------------------------------------------
        # STEP 4 — Create transaction (PENDING)
        # ---------------------------------------------------------
        txn = Transaction(
            user_id=from_user_id,
            type="TRANSFER",
            status="PENDING",
            is_test=is_test,
        )
        self.db.add(txn)
        self.db.flush()

        idem.transaction_id = txn.id

        try:
            # -----------------------------------------------------
            # STEP 5 — Consume sender FxLots (FIFO) and create receiver FxLots
            # -----------------------------------------------------
            remaining = amount_usd

            fx_lots = (
                self.db.query(FxLot)
                .filter(FxLot.account_id == sender.id, FxLot.settlement_amount_remaining > 0)
                .order_by(FxLot.created_at.asc())
                .with_for_update()
                .all()
            )

            total_available = sum([lot.settlement_amount_remaining for lot in fx_lots])
            if total_available < amount_usd:
                # Auto-heal: If user has cached_balance >= amount_usd, synthesize a lot
                # for the unbacked remainder so valid balances don't get stuck.
                shortfall = amount_usd - total_available
                synthetic_lot = FxLot(
                    account_id=sender.id,
                    settlement_currency=sender.currency,
                    settlement_amount_total=shortfall,
                    settlement_amount_remaining=shortfall,
                    origin_currency=sender.currency,
                    origin_amount_total=shortfall,
                    fx_rate_used=Decimal("1.0"),
                    fx_provider="SYSTEM",
                )
                self.db.add(synthetic_lot)
                self.db.flush()
                fx_lots.append(synthetic_lot)

            for lot in fx_lots:
                if remaining <= 0:
                    break

                consume = min(lot.settlement_amount_remaining, remaining)
                lot.settlement_amount_remaining -= consume
                remaining -= consume

                # compute proportional origin amount
                try:
                    origin_amount = (lot.origin_amount_total * (consume / lot.settlement_amount_total))
                except Exception:
                    origin_amount = consume

                receiver_lot_amount = (consume * fx_rate).quantize(Decimal("0.000001"))

                new_lot = FxLot(
                    account_id=receiver.id,
                    settlement_currency=receiver.currency,
                    settlement_amount_total=receiver_lot_amount,
                    settlement_amount_remaining=receiver_lot_amount,
                    origin_currency=lot.origin_currency,
                    origin_amount_total=origin_amount,
                    fx_rate_used=lot.fx_rate_used if sender.currency == receiver.currency else fx_rate,
                    fx_provider=lot.fx_provider or "TRANSFER",
                )
                self.db.add(new_lot)
                self.db.flush()

                # ledger entries
                sender_entry = LedgerEntry(
                    account_id=sender.id,
                    currency=sender.currency,
                    signed_amount=-consume,
                    fx_lot_id=lot.id,
                    transaction_id=txn.id,
                    entry_type="DEBIT",
                )

                receiver_entry = LedgerEntry(
                    account_id=receiver.id,
                    currency=receiver.currency,
                    signed_amount=receiver_lot_amount,
                    fx_lot_id=new_lot.id,
                    transaction_id=txn.id,
                    entry_type="CREDIT",
                )
                self.db.add_all([sender_entry, receiver_entry])

            # -----------------------------------------------------
            # STEP 6 — Update cached & test balances
            # -----------------------------------------------------
            if is_test:
                if sender.test_balance_usd is None: sender.test_balance_usd = Decimal("0")
                if receiver.test_balance_usd is None: receiver.test_balance_usd = Decimal("0")
                sender.test_balance_usd -= amount_usd
                receiver.test_balance_usd += credit_amount

            sender.cached_balance_usd -= amount_usd
            receiver.cached_balance_usd += credit_amount

            if sender.cached_balance_usd < 0:
                raise ValueError("Sender balance became negative — rolling back")

            # -----------------------------------------------------
            # STEP 7 — Finalize transaction
            # -----------------------------------------------------
            txn.status = "COMPLETED"

            response = {
                "transaction_id": txn.id,
                "from_user_id": from_user_id,
                "to_user_id": to_user_id,
                "amount_usd": str(amount_usd),
                "credited_amount": str(credit_amount),
                "sender_currency": sender.currency,
                "receiver_currency": receiver.currency,
                "fx_rate": str(fx_rate),
                "status": "COMPLETED",
                "idempotency_key": idempotency_key,
                "is_test": is_test,
            }

            try:
                idem.response_body = json.dumps(response)
                idem.response_status = 200
            except Exception:
                pass

            self.db.commit()
            return response

        except Exception:
            self.db.rollback()
            raise
