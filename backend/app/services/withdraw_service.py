from decimal import Decimal
from sqlalchemy.orm import Session
import json
from typing import Optional
from datetime import datetime, timezone

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.ledger_entry import LedgerEntry
from app.models.fx_lot import FxLot
from app.models.fx_liquidity import FxLiquidity
from app.models.fx_quote import FxQuote
from app.models.idempotency_key import IdempotencyKey
from app.models.linked_account import LinkedAccount
from app.models.user import User
from app.services.fx_quote_service import FxQuoteService


class WithdrawService:
    def __init__(self, db: Session):
        self.db = db

    def withdraw(
        self,
        *,
        user_id: int,
        amount_usd: Decimal,
        destination_currency: str,
        idempotency_key: str,
        bank_reference: str = "",
        quote_id: Optional[int] = None,
        payment_method: str = "CARD",
        user_payment_details: Optional[str] = None,
    ):
        if amount_usd <= 0:
            raise ValueError("Withdrawal amount must be greater than zero")


        # STEP 1 — Idempotency (FIRST, ALWAYS)

        existing = (
            self.db.query(IdempotencyKey)
            .filter(IdempotencyKey.key == idempotency_key)
            .with_for_update()
            .one_or_none()
        )

        if existing:
            if existing.transaction_id is None:
                raise ValueError("Request already in progress, retry later")

            # Return stored response if available
            if existing.response_body is not None and existing.response_status is not None:
                try:
                    body = json.loads(existing.response_body)
                except Exception:
                    body = {"message": "Idempotent replay"}
                return body

            txn = self.db.get(Transaction, existing.transaction_id)
            return {
                "transaction_id": txn.id,
                "status": txn.status,
                "message": "Idempotent replay",
            }

        idem = IdempotencyKey(key=idempotency_key)
        self.db.add(idem)
        self.db.flush()


        # STEP 2 — Lock account BEFORE balance check

        account = (
            self.db.query(Account)
            .filter(Account.user_id == user_id, Account.currency == "USD")
            .with_for_update()
            .one_or_none()
        )
        if not account:
            raise ValueError("USD account not found")

        # Calculate real withdrawable balance (total minus test/sandbox deposits)
        test_bal = account.test_balance_usd or Decimal("0")
        real_balance = (account.cached_balance_usd or Decimal("0")) - test_bal

        if account.cached_balance_usd < amount_usd:
            raise ValueError("Insufficient balance")

        if amount_usd > real_balance:
            raise ValueError(
                f"Insufficient real funds. Your withdrawable balance is ${real_balance:.2f}. "
                f"${test_bal:.2f} is from test/sandbox deposits and cannot be withdrawn."
            )

        # STEP 2.5 — Check if user has at least one linked account
        if payment_method not in ["UPI", "SWIFT", "UPI/SWIFT"]:
            has_bank = self.db.query(LinkedAccount).filter(LinkedAccount.user_id == user_id).first()
            if not has_bank:
                raise ValueError("Cannot withdraw without a linked bank account")


        # STEP 3 — Create transaction (PENDING)
        is_pending = payment_method in ["UPI", "SWIFT", "UPI/SWIFT"]

        txn = Transaction(
            type="WITHDRAW",
            status="PENDING_APPROVAL" if is_pending else "PENDING",
            reference=bank_reference,
            payment_method=payment_method,
            user_payment_details=user_payment_details,
        )
        self.db.add(txn)
        self.db.flush()

        idem.transaction_id = txn.id

        try:
            # STEP 3.5 — Determine FX rate and payout amount
            fx_revenue_to_record = Decimal("0")
            
            if destination_currency == "USD":
                fx_rate = Decimal("1.0")
                payout_amount = amount_usd
            else:
                if quote_id:
                    quote = self.db.query(FxQuote).filter(FxQuote.id == quote_id).first()
                    if not quote:
                        raise ValueError("Quote not found")
                    if quote.user_id != user_id or quote.base_currency != "USD" or quote.target_currency != destination_currency:
                        raise ValueError("Quote mismatch")
                    if quote.is_used:
                        raise ValueError("Quote already used")
                        
                    now = datetime.now(timezone.utc)
                    if quote.expires_at.tzinfo is None:
                        q_expire = quote.expires_at.replace(tzinfo=timezone.utc)
                    else:
                        q_expire = quote.expires_at
                        
                    if now > q_expire:
                        raise ValueError("FX_RATE_EXPIRED")
                        
                    fx_rate = Decimal(str(quote.interpay_rate))
                    payout_amount = Decimal(str(quote.converted_amount))
                    fx_revenue_to_record = Decimal(str(quote.spread_revenue))
                    quote.is_used = True
                else:
                    # Fallback on the fly
                    fx_service = FxQuoteService(self.db)
                    quote_data = fx_service.create_quote(user_id, "USD", destination_currency, amount_usd)
                    fx_rate = Decimal(str(quote_data["interpay_rate"]))
                    payout_amount = Decimal(str(quote_data["converted_amount"]))
                    
                    q = self.db.query(FxQuote).filter(FxQuote.id == quote_data["quote_id"]).first()
                    fx_revenue_to_record = Decimal(str(q.spread_revenue))
                    q.is_used = True

            # STEP 4 — FX Liquidity check & reservation
            if not is_pending:
                liquidity = (
                    self.db.query(FxLiquidity)
                    .filter(FxLiquidity.currency == destination_currency)
                    .with_for_update()
                    .one_or_none()
                )
                if not liquidity:
                    raise ValueError("FX liquidity unavailable")

                if liquidity.available_amount - liquidity.reserved_amount < payout_amount:
                    raise ValueError("Insufficient system liquidity")

                # reserve liquidity (auto-rollback if failure)
                liquidity.reserved_amount += payout_amount
                if liquidity.reserved_amount > liquidity.available_amount:
                    raise ValueError("Liquidity reservation exceeded available amount")


            # STEP 5 — Consume FX lots (FIFO) & create ledger entries per lot
            remaining = amount_usd

            fx_lots = (
                self.db.query(FxLot)
                .filter(
                    FxLot.account_id == account.id,
                    FxLot.settlement_amount_remaining > 0,
                )
                .order_by(FxLot.created_at.asc())
                .with_for_update()
                .all()
            )

            total_available = sum([lot.settlement_amount_remaining for lot in fx_lots])
            if total_available < amount_usd:
                # Auto-heal: If user has sufficient cached_balance, synthesize lot for shortfall
                shortfall = amount_usd - total_available
                synthetic_lot = FxLot(
                    account_id=account.id,
                    settlement_currency=account.currency,
                    settlement_amount_total=shortfall,
                    settlement_amount_remaining=shortfall,
                    origin_currency=account.currency,
                    origin_amount_total=shortfall,
                    fx_rate_used=Decimal("1.0"),
                    fx_provider="SYSTEM",
                )
                self.db.add(synthetic_lot)
                self.db.flush()
                fx_lots.append(synthetic_lot)

            first_lot_id = fx_lots[0].id if fx_lots else None

            for lot in fx_lots:
                if remaining <= 0:
                    break

                consume = min(lot.settlement_amount_remaining, remaining)
                lot.settlement_amount_remaining -= consume
                remaining -= consume

                ledger_entry = LedgerEntry(
                    account_id=account.id,
                    currency=account.currency,
                    signed_amount=-consume,
                    fx_lot_id=lot.id,
                    transaction_id=txn.id,
                    entry_type="DEBIT",
                )
                self.db.add(ledger_entry)

            if remaining > 0:
                raise ValueError("FX lot inconsistency detected: insufficient lot funds")

            # STEP 6.5 — Record FX Revenue if applicable
            if fx_revenue_to_record > 0:
                if not is_pending:
                    admin = self.db.query(User).filter(User.is_admin == True).first()
                    if admin:
                        rev_account = self.db.query(Account).filter(Account.user_id == admin.id, Account.currency == "USD").first()
                        if rev_account:
                            rev_ledger = LedgerEntry(
                                account_id=rev_account.id,
                                currency="USD",
                                signed_amount=fx_revenue_to_record,
                                fx_lot_id=fx_lots[0].id if fx_lots else None,
                                transaction_id=txn.id,
                                entry_type="SYSTEM_REVENUE",
                            )
                            self.db.add(rev_ledger)
                            if rev_account.cached_balance_usd is None: rev_account.cached_balance_usd = Decimal("0")
                            rev_account.cached_balance_usd += fx_revenue_to_record
                else:
                    try:
                        details_obj = json.loads(txn.user_payment_details) if txn.user_payment_details else {}
                    except json.JSONDecodeError:
                        details_obj = {"raw": txn.user_payment_details} if txn.user_payment_details else {}
                    details_obj["deferred_fx_revenue"] = str(fx_revenue_to_record)
                    details_obj["deferred_fx_lot_id"] = fx_lots[0].id if fx_lots else None
                    txn.user_payment_details = json.dumps(details_obj)


            # STEP 7 — Update cached balance

            account.cached_balance_usd -= amount_usd
            if account.cached_balance_usd < 0:
                raise ValueError("Balance became negative after withdrawal — rolling back")


            # STEP 8 — Finalize liquidity
            if not is_pending:
                liquidity.reserved_amount -= payout_amount
                liquidity.available_amount -= payout_amount
                if liquidity.available_amount < 0:
                    raise ValueError("Liquidity available_amount became negative — rolling back")


            # STEP 9 — Finalize transaction
            txn.status = "PENDING_APPROVAL" if is_pending else "COMPLETED"
            # persist response for idempotency replay
            response = {
                "transaction_id": txn.id,
                "withdrawn_usd": str(amount_usd),
                "payout_amount": str(payout_amount),
                "currency": destination_currency,
                "status": txn.status,
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
