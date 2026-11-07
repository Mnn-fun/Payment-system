from sqlalchemy.orm import Session
from decimal import Decimal, ROUND_HALF_UP
from decimal import Decimal as D
from fastapi import HTTPException
import json
from datetime import datetime, timezone
from typing import Optional

from app.models.account import Account
from app.models.ledger_entry import LedgerEntry
from app.models.transaction import Transaction
from app.models.fx_lot import FxLot
from app.models.fx_rate import FxRate
from app.models.fx_quote import FxQuote
from app.models.card import Card
from app.models.user import User
from app.services.fx_quote_service import FxQuoteService


class DepositService:
    def __init__(self, db: Session):
        self.db = db

    def deposit(
        self,
        user_id: int,
        source_currency: str,
        source_amount: Decimal,
        bank_reference: str,
        quote_id: Optional[int] = None,
        payment_method: str = "CARD",
        deposit_proof: Optional[str] = None,
    ):
        if source_amount <= Decimal("0"):
            raise HTTPException(status_code=400, detail="Deposit amount must be greater than zero")

        source_currency = source_currency.upper()

        # 1️⃣ Get account (prefer USD, or fallback to user's account)
        account = (
            self.db.query(Account)
            .filter(Account.user_id == user_id)
            .filter(Account.currency == "USD")
            .with_for_update()
            .first()
        )
        if not account:
            account = (
                self.db.query(Account)
                .filter(Account.user_id == user_id)
                .with_for_update()
                .first()
            )

        if not account:
            raise HTTPException(status_code=400, detail="User account not found")

        # 1.5️⃣ Check if user has at least one card
        if payment_method == "CARD":
            has_card = self.db.query(Card).filter(Card.user_id == user_id).first()
            if not has_card:
                raise HTTPException(status_code=400, detail="Cannot deposit without a saved card")

        if account.cached_balance_usd is None:
            account.cached_balance_usd = Decimal("0")

        # 2️⃣ Determine FX rate and settlement amount
        fx_revenue_to_record = D("0")
        
        if source_currency == "USD":
            fx_rate = D("1.0")
            settlement_amount = D(str(source_amount))
        else:
            if quote_id:
                quote = self.db.query(FxQuote).filter(FxQuote.id == quote_id).first()
                if not quote:
                    raise HTTPException(status_code=400, detail="Quote not found")
                if quote.user_id != user_id or quote.base_currency != source_currency or quote.target_currency != "USD":
                    raise HTTPException(status_code=400, detail="Quote mismatch")
                if quote.is_used:
                    raise HTTPException(status_code=400, detail="Quote already used")
                
                # Expiry check
                now = datetime.now(timezone.utc)
                if quote.expires_at.tzinfo is None:
                    q_expire = quote.expires_at.replace(tzinfo=timezone.utc)
                else:
                    q_expire = quote.expires_at
                    
                if now > q_expire:
                    raise HTTPException(status_code=400, detail="FX_RATE_EXPIRED")
                
                fx_rate = D(str(quote.interpay_rate))
                settlement_amount = D(str(quote.converted_amount))
                fx_revenue_to_record = D(str(quote.spread_revenue))
                quote.is_used = True
            else:
                # Fallback: compute on the fly if no quote provided (older clients)
                fx_service = FxQuoteService(self.db)
                quote_data = fx_service.create_quote(user_id, source_currency, "USD", source_amount)
                
                fx_rate = D(str(quote_data["interpay_rate"]))
                settlement_amount = D(str(quote_data["converted_amount"]))
                
                # Fetch quote object to mark used and get revenue
                q = self.db.query(FxQuote).filter(FxQuote.id == quote_data["quote_id"]).first()
                fx_revenue_to_record = D(str(q.spread_revenue))
                q.is_used = True

        # 3️⃣ Create transaction
        is_pending = payment_method in ["UPI", "SWIFT"]
        
        txn = Transaction(
            user_id=user_id,
            type="DEPOSIT",
            status="PENDING_APPROVAL" if is_pending else "COMPLETED",
            reference=bank_reference,
            payment_method=payment_method,
            deposit_proof=deposit_proof,
            user_payment_details=json.dumps({
                "source_amount": str(source_amount),
                "source_currency": source_currency,
                "usd_amount": str(settlement_amount),
                "fx_rate": str(fx_rate),
                "fx_revenue": str(fx_revenue_to_record),
                "user_id": user_id,
                "account_id": account.id
            })
        )

        self.db.add(txn)
        self.db.flush()
        
        if txn.status == "PENDING_APPROVAL":
            self.db.commit()
            return {
                "message": "Deposit initiated and pending admin approval",
                "source_currency": source_currency,
                "source_amount": float(source_amount),
                "fx_rate": float(fx_rate),
                "usd_credited": 0.0,
                "new_balance": float(account.cached_balance_usd),
                "status": "PENDING_APPROVAL",
            }

        # 4️⃣ Create FX lot representing the settlement of this deposit (USD)
        fx_lot = FxLot(
            account_id=account.id,
            settlement_currency="USD",
            settlement_amount_total=settlement_amount,
            settlement_amount_remaining=settlement_amount,
            origin_currency=source_currency,
            origin_amount_total=D(str(source_amount)),
            fx_rate_used=fx_rate,
            fx_provider="LIVE_FX",
        )

        self.db.add(fx_lot)
        self.db.flush()

        # 5️⃣ Create ledger entry (signed_amount is + for credits)
        ledger = LedgerEntry(
            account_id=account.id,
            currency="USD",
            signed_amount=settlement_amount,
            fx_lot_id=fx_lot.id,
            transaction_id=txn.id,
            entry_type="CREDIT",
        )

        self.db.add(ledger)
        
        # 5.5️⃣ Record FX Revenue if applicable
        if fx_revenue_to_record > 0:
            admin = self.db.query(User).filter(User.is_admin == True).first()
            if admin:
                rev_account = self.db.query(Account).filter(Account.user_id == admin.id, Account.currency == "USD").first()
                if rev_account:
                    rev_ledger = LedgerEntry(
                        account_id=rev_account.id,
                        currency="USD",
                        signed_amount=fx_revenue_to_record,
                        fx_lot_id=fx_lot.id,
                        transaction_id=txn.id,
                        entry_type="SYSTEM_REVENUE",
                    )
                    self.db.add(rev_ledger)
                    if rev_account.cached_balance_usd is None: rev_account.cached_balance_usd = D("0")
                    rev_account.cached_balance_usd += fx_revenue_to_record

        # 6️⃣ Update balance
        account.cached_balance_usd = D(account.cached_balance_usd) + settlement_amount

        self.db.commit()

        return {
            "message": "Deposit successful",
            "source_currency": source_currency,
            "source_amount": float(source_amount),
            "fx_rate": float(fx_rate),
            "usd_credited": float(settlement_amount),
            "new_balance": float(account.cached_balance_usd),
            "status": "COMPLETED",
        }
