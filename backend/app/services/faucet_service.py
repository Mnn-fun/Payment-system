from decimal import Decimal
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.ledger_entry import LedgerEntry
from app.models.fx_lot import FxLot
from app.models.user import User

REPLENISHMENT_INTERVAL_HOURS = 12
REPLENISHMENT_AMOUNT = Decimal("100.00")


def check_and_replenish_test_balance(user_id: int, db: Session, force: bool = False) -> dict:
    """
    Checks if 12 hours have passed since the user's last TEST_BALANCE_GRANT.
    If so (or if user never received a test grant), automatically grants +100.00 test funds
    with proper Transaction, FxLot, and LedgerEntry tracking.
    """
    # 1. Resolve user's primary account
    account = (
        db.query(Account)
        .filter(Account.user_id == user_id)
        .order_by(Account.id.asc())
        .first()
    )
    if not account:
        account = Account(
            user_id=user_id,
            currency="USD",
            status="ACTIVE",
            cached_balance_usd=Decimal("0"),
            test_balance_usd=Decimal("0"),
        )
        db.add(account)
        db.flush()

    # 2. Find latest TEST_BALANCE_GRANT
    latest_grant = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "TEST_BALANCE_GRANT",
            Transaction.status == "COMPLETED",
        )
        .order_by(Transaction.created_at.desc(), Transaction.id.desc())
        .first()
    )

    now = datetime.now(timezone.utc)
    should_replenish = False
    seconds_remaining = 0

    if latest_grant is None:
        # Never received initial test grant
        should_replenish = True
    else:
        grant_time = latest_grant.created_at
        if grant_time.tzinfo is None:
            grant_time = grant_time.replace(tzinfo=timezone.utc)
        elapsed = (now - grant_time).total_seconds()
        interval_seconds = REPLENISHMENT_INTERVAL_HOURS * 3600
        if elapsed >= interval_seconds or force:
            should_replenish = True
        else:
            seconds_remaining = max(0, int(interval_seconds - elapsed))

    if should_replenish:
        # Create Transaction
        txn = Transaction(
            user_id=user_id,
            type="TEST_BALANCE_GRANT",
            status="COMPLETED",
            reference=f"AUTO-FAUCET-100-{uuid4().hex[:8]}",
            payment_method="SYSTEM",
            is_test=True,
        )
        db.add(txn)
        db.flush()

        # Create FxLot
        fx_lot = FxLot(
            account_id=account.id,
            settlement_currency=account.currency,
            settlement_amount_total=REPLENISHMENT_AMOUNT,
            settlement_amount_remaining=REPLENISHMENT_AMOUNT,
            origin_currency=account.currency,
            origin_amount_total=REPLENISHMENT_AMOUNT,
            fx_rate_used=Decimal("1.0"),
            fx_provider="SANDBOX",
        )
        db.add(fx_lot)
        db.flush()

        # Create LedgerEntry
        ledger = LedgerEntry(
            account_id=account.id,
            currency=account.currency,
            signed_amount=REPLENISHMENT_AMOUNT,
            fx_lot_id=fx_lot.id,
            transaction_id=txn.id,
            entry_type="CREDIT",
        )
        db.add(ledger)
        db.flush()

        # Update Account balance caches
        if account.cached_balance_usd is None:
            account.cached_balance_usd = Decimal("0")
        if account.test_balance_usd is None:
            account.test_balance_usd = Decimal("0")
        account.cached_balance_usd += REPLENISHMENT_AMOUNT
        account.test_balance_usd += REPLENISHMENT_AMOUNT
        db.commit()

        seconds_remaining = REPLENISHMENT_INTERVAL_HOURS * 3600
        return {
            "replenished": True,
            "amount_granted": float(REPLENISHMENT_AMOUNT),
            "currency": account.currency,
            "seconds_remaining": seconds_remaining,
            "message": f"+${REPLENISHMENT_AMOUNT} test funds successfully credited to your {account.currency} account!",
        }

    return {
        "replenished": False,
        "amount_granted": 0.0,
        "currency": account.currency,
        "seconds_remaining": seconds_remaining,
        "message": f"Next test balance replenishment available in {seconds_remaining // 3600}h {(seconds_remaining % 3600) // 60}m.",
    }
