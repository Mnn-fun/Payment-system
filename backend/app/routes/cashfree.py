import os
import json
import uuid
import requests
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.ledger_entry import LedgerEntry
from app.models.fx_lot import FxLot
from app.models.fx_quote import FxQuote

router = APIRouter(prefix="/cashfree", tags=["Cashfree"])

# We will fetch keys dynamically inside the function to ensure the latest .env is used
CASHFREE_URL = os.getenv("CASHFREE_BASE_URL", "https://sandbox.cashfree.com/pg")
APP_FRONTEND_URL = os.getenv("APP_FRONTEND_URL", "http://localhost:5173")

@router.post("/create-order")
def create_order(
    source_amount: float,
    source_currency: str,
    pin: str,
    quote_id: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.core.security import verify_password
    if not current_user.hashed_pin or not verify_password(pin, current_user.hashed_pin):
        raise HTTPException(status_code=401, detail="Invalid Transaction PIN")

    source_currency = source_currency.upper()
    
    # For USD deposits, no FX quote is needed
    if source_currency == "USD" or quote_id == 0:
        usd_amount = source_amount
        fx_rate = 1.0
        fx_revenue = 0.0
        actual_quote_id = None
    else:
        # Verify FX quote for non-USD deposits
        quote = db.query(FxQuote).filter(FxQuote.id == quote_id).first()
        if not quote or quote.user_id != current_user.id or quote.is_used:
            raise HTTPException(status_code=400, detail="Invalid or expired quote")

        now = datetime.now(timezone.utc)
        if quote.expires_at.tzinfo is None:
            q_expire = quote.expires_at.replace(tzinfo=timezone.utc)
        else:
            q_expire = quote.expires_at

        if now > q_expire:
            raise HTTPException(status_code=400, detail="Quote expired")

        usd_amount = float(quote.converted_amount)
        fx_rate = float(quote.interpay_rate)
        fx_revenue = float(quote.spread_revenue)
        actual_quote_id = quote_id

    # Generate unique Order ID
    order_id = f"CF_ORD_{uuid.uuid4().hex[:12].upper()}"

    app_id = os.getenv("CASHFREE_APP_ID")
    secret_key = os.getenv("CASHFREE_SECRET_KEY")

    headers = {
        "x-api-version": "2023-08-01",
        "x-client-id": app_id,
        "x-client-secret": secret_key,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    # Get user's phone: profile → saved card → fallback
    from app.models.card import Card
    if current_user.phone_number:
        customer_phone = current_user.phone_number
    else:
        user_card = db.query(Card).filter(Card.user_id == current_user.id, Card.status == "ACTIVE").first()
        customer_phone = user_card.phone_number if user_card else "9000000000"

    payload = {
        "order_id": order_id,
        "order_amount": source_amount,
        "order_currency": source_currency,
        "customer_details": {
            "customer_id": f"USER_{current_user.id}",
            "customer_email": current_user.email,
            "customer_phone": customer_phone
        },
        "order_meta": {
            "return_url": f"{APP_FRONTEND_URL}/wallet?order_id={order_id}"
        }
    }

    resp = requests.post(f"{CASHFREE_URL}/orders", json=payload, headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Cashfree Error: {resp.text}")

    data = resp.json()
    
    # Create PENDING transaction acting as an escrow log
    txn = Transaction(
        type="DEPOSIT",
        status="PENDING_CASHFREE",
        reference=order_id,
        payment_method="CASHFREE",
        user_payment_details=json.dumps({
            "quote_id": actual_quote_id,
            "source_amount": source_amount,
            "source_currency": source_currency,
            "usd_amount": usd_amount,
            "fx_rate": fx_rate,
            "fx_revenue": fx_revenue,
            "user_id": current_user.id
        })
    )
    db.add(txn)
    db.commit()

    return {
        "order_id": order_id,
        "payment_session_id": data.get("payment_session_id")
    }


@router.post("/verify-order/{order_id}")
def verify_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    txn = db.query(Transaction).filter(Transaction.reference == order_id, Transaction.status == "PENDING_CASHFREE").first()
    if not txn:
        raise HTTPException(status_code=404, detail="Order not found or already processed")

    details = json.loads(txn.user_payment_details or "{}")
    if details.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    app_id = os.getenv("CASHFREE_APP_ID")
    secret_key = os.getenv("CASHFREE_SECRET_KEY")

    headers = {
        "x-api-version": "2023-08-01",
        "x-client-id": app_id,
        "x-client-secret": secret_key,
        "Accept": "application/json"
    }

    resp = requests.get(f"{CASHFREE_URL}/orders/{order_id}", headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to verify with Cashfree")
    
    data = resp.json()
    if data.get("order_status") != "PAID":
        raise HTTPException(status_code=400, detail=f"Order status is {data.get('order_status')}")

    # The order was actually paid via gateway! Settle immediately.

    # Mark quote as used
    quote_id = details.get("quote_id")
    quote = db.query(FxQuote).filter(FxQuote.id == quote_id).first()
    if quote:
        quote.is_used = True

    # Process automated deposit Ledger logic
    account = db.query(Account).filter(Account.user_id == current_user.id, Account.currency == "USD").first()
    if not account:
        raise HTTPException(status_code=400, detail="USD account not found")

    settlement_amount = Decimal(str(details.get("usd_amount", 0)))
    source_amount = Decimal(str(details.get("source_amount", 0)))
    fx_rate = Decimal(str(details.get("fx_rate", 1)))
    fx_revenue = Decimal(str(details.get("fx_revenue", 0)))

    fx_lot = FxLot(
        account_id=account.id,
        settlement_currency="USD",
        settlement_amount_total=settlement_amount,
        settlement_amount_remaining=settlement_amount,
        origin_currency=details.get("source_currency", "USD"),
        origin_amount_total=source_amount,
        fx_rate_used=fx_rate,
        fx_provider="LIVE_FX",
    )
    db.add(fx_lot)
    db.flush()

    ledger = LedgerEntry(
        account_id=account.id,
        currency="USD",
        signed_amount=settlement_amount,
        fx_lot_id=fx_lot.id,
        transaction_id=txn.id,
        entry_type="CREDIT",
    )
    db.add(ledger)

    if fx_revenue > 0:
        admin_user = db.query(User).filter(User.id == 1).first()
        if admin_user:
            rev_account = db.query(Account).filter(Account.user_id == admin_user.id, Account.currency == "USD").first()
            if rev_account:
                rev_ledger = LedgerEntry(
                    account_id=rev_account.id,
                    currency="USD",
                    signed_amount=fx_revenue,
                    fx_lot_id=fx_lot.id,
                    transaction_id=txn.id,
                    entry_type="SYSTEM_REVENUE",
                )
                db.add(rev_ledger)
                if rev_account.cached_balance_usd is None: rev_account.cached_balance_usd = Decimal("0")
                rev_account.cached_balance_usd += fx_revenue

    if account.cached_balance_usd is None: account.cached_balance_usd = Decimal("0")
    account.cached_balance_usd += settlement_amount

    # Detect sandbox mode — mark deposit as test so it can't be withdrawn
    is_sandbox = "sandbox" in CASHFREE_URL.lower()
    if is_sandbox:
        txn.is_test = True
        if account.test_balance_usd is None: account.test_balance_usd = Decimal("0")
        account.test_balance_usd += settlement_amount

    txn.status = "COMPLETED"
    db.commit()

    return {
        "message": "Cashfree Deposit successful",
        "usd_credited": float(settlement_amount),
        "is_test": is_sandbox,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Saved Instruments (Cards saved through Cashfree checkout)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/saved-cards")
def get_saved_cards(
    current_user: User = Depends(get_current_user),
):
    """Fetch all card instruments saved through Cashfree checkout for this user."""
    app_id = os.getenv("CASHFREE_APP_ID")
    secret_key = os.getenv("CASHFREE_SECRET_KEY")
    customer_id = f"USER_{current_user.id}"

    headers = {
        "x-api-version": "2023-08-01",
        "x-client-id": app_id,
        "x-client-secret": secret_key,
        "Accept": "application/json",
    }

    try:
        resp = requests.get(
            f"{CASHFREE_URL}/customers/{customer_id}/instruments?instrument_type=card",
            headers=headers,
            timeout=5,
        )
        if resp.status_code == 200:
            instruments = resp.json()
            # Normalize the response for the frontend
            cards = []
            for inst in instruments if isinstance(instruments, list) else []:
                card_info = inst.get("card", {}) or {}
                cards.append({
                    "instrument_id": inst.get("customer_id", "") + "_" + inst.get("afa_reference", inst.get("instrument_id", "")),
                    "afa_reference": inst.get("afa_reference", ""),
                    "instrument_id_raw": inst.get("instrument_id", ""),
                    "card_network": card_info.get("card_network", inst.get("instrument_meta", {}).get("card_network", "UNKNOWN")).upper(),
                    "card_bank_name": card_info.get("card_bank_name", inst.get("instrument_meta", {}).get("card_bank_name", "")),
                    "last_four": card_info.get("card_number", "")[-4:] if card_info.get("card_number") else inst.get("instrument_meta", {}).get("card_display", "????")[-4:],
                    "card_type": card_info.get("card_type", inst.get("instrument_meta", {}).get("card_type", "")),
                    "card_display": card_info.get("card_display", inst.get("instrument_meta", {}).get("card_display", "")),
                    "instrument_status": inst.get("instrument_status", ""),
                })
            return cards
        elif resp.status_code == 404:
            return []  # No saved instruments for this customer
        else:
            return []  # Silently return empty on error
    except Exception:
        return []  # Network error — return empty


@router.delete("/saved-cards/{instrument_id}")
def delete_saved_card(
    instrument_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a saved card instrument from Cashfree."""
    app_id = os.getenv("CASHFREE_APP_ID")
    secret_key = os.getenv("CASHFREE_SECRET_KEY")
    customer_id = f"USER_{current_user.id}"

    headers = {
        "x-api-version": "2023-08-01",
        "x-client-id": app_id,
        "x-client-secret": secret_key,
        "Accept": "application/json",
    }

    resp = requests.delete(
        f"{CASHFREE_URL}/customers/{customer_id}/instruments/{instrument_id}",
        headers=headers,
        timeout=5,
    )

    if resp.status_code in (200, 204):
        return {"message": "Card removed from Cashfree successfully"}
    else:
        raise HTTPException(status_code=400, detail=f"Failed to remove card: {resp.text}")
