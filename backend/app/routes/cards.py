from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from decimal import Decimal
import random
import string
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.models.card import Card
from app.models.card_otp import CardOTP
from app.models.account import Account
from app.models.ledger_entry import LedgerEntry
from app.models.transaction import Transaction
from app.models.fx_lot import FxLot
from app.services.sms_service import send_card_otp

router = APIRouter(prefix="/cards", tags=["Cards"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def detect_network(number: str) -> str:
    """Detect card network from first digit(s)."""
    n = number.replace(" ", "")
    if n.startswith("4"):
        return "VISA"
    elif n.startswith(("51", "52", "53", "54", "55")) or (
        len(n) >= 6 and 222100 <= int(n[:6]) <= 272099
    ):
        return "MASTERCARD"
    elif n.startswith(("34", "37")):
        return "AMEX"
    elif n.startswith(("60", "65", "81", "82", "508")):
        return "RUPAY"
    elif n.startswith("6"):
        return "DISCOVER"
    return "UNKNOWN"


def luhn_check(card_number: str) -> bool:
    """Validate card number using the Luhn Algorithm (Mod 10)."""
    digits = [int(c) for c in reversed(card_number) if c.isdigit()]
    if not digits:
        return False
    
    # Double every second digit (starting from index 1 because the list is reversed)
    for i in range(1, len(digits), 2):
        digits[i] *= 2
        # If doubling results in a number > 9, subtract 9 (which is the same as sum of its digits)
        if digits[i] > 9:
            digits[i] -= 9
            
    return sum(digits) % 10 == 0


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _card_to_dict(card: Card) -> dict:
    return {
        "id": card.id,
        "cardholder_name": card.cardholder_name,
        "last_four": card.last_four,
        "card_network": card.card_network,
        "expiry_month": card.expiry_month,
        "expiry_year": card.expiry_year,
        "phone_number": card.phone_number,
        "status": card.status,
        "created_at": card.created_at.isoformat() if card.created_at else None,
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class AddCardRequest(BaseModel):
    cardholder_name: str
    card_number: str       # full number (not stored — only last 4 kept)
    expiry_month: str      # "MM"
    expiry_year: str       # "YYYY"
    cvv: str
    phone_number: str      # for OTP verification SMS


class VerifyCardRequest(BaseModel):
    otp_code: str


class CardTransactionRequest(BaseModel):
    pin: str
    amount_usd: float


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/")
def add_card(
    data: AddCardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new card. Sends OTP to the phone number provided."""
    # Clean and validate
    raw_number = data.card_number.replace(" ", "").replace("-", "")
    if len(raw_number) < 13 or len(raw_number) > 19:
        raise HTTPException(status_code=400, detail="Invalid card number length.")
    if not raw_number.isdigit():
        raise HTTPException(status_code=400, detail="Card number must contain digits only.")
    if not luhn_check(raw_number):
        raise HTTPException(status_code=400, detail="Invalid card number. Please check the digits.")

    expiry_m = data.expiry_month.zfill(2)
    expiry_y = data.expiry_year.zfill(4) if len(data.expiry_year) == 4 else f"20{data.expiry_year.zfill(2)}"

    # Validate expiry
    try:
        exp = datetime(int(expiry_y), int(expiry_m), 1)
        if exp < datetime.now().replace(day=1):
            raise HTTPException(status_code=400, detail="Card has expired.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid expiry date.")

    # Limit: each user can add max 5 cards
    count = db.query(Card).filter(Card.user_id == current_user.id).count()
    if count >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 cards allowed per account.")

    last_four = raw_number[-4:]
    network = detect_network(raw_number)

    # Duplicate check
    existing = db.query(Card).filter(
        Card.user_id == current_user.id,
        Card.last_four == last_four,
        Card.card_network == network
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This card has already been added to your account.")

    hashed_cvv = hash_password(data.cvv)   # bcrypt hash — CVV never stored plaintext

    card = Card(
        user_id=current_user.id,
        cardholder_name=data.cardholder_name.strip(),
        last_four=last_four,
        card_network=network,
        expiry_month=expiry_m,
        expiry_year=expiry_y,
        hashed_cvv=hashed_cvv,
        phone_number=data.phone_number.strip(),
        status="PENDING_VERIFICATION",
    )
    db.add(card)
    db.flush()

    # Generate and send OTP
    otp_code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    otp = CardOTP(card_id=card.id, otp_code=otp_code, is_used=False, expires_at=expires_at)
    db.add(otp)
    db.commit()

    try:
        send_card_otp(user_email=current_user.email, otp_code=otp_code, last_four=last_four)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Card saved but email failed: {str(e)}")

    return {
        "message": f"Card added. A verification OTP has been sent to your registered email. Check your inbox.",
        "card_id": card.id,
    }


@router.post("/{card_id}/verify")
def verify_card(
    card_id: int,
    data: VerifyCardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify phone OTP and activate the card."""
    card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    if card.status == "ACTIVE":
        raise HTTPException(status_code=400, detail="Card is already verified.")

    otp = (
        db.query(CardOTP)
        .filter(
            CardOTP.card_id == card_id,
            CardOTP.otp_code == data.otp_code,
            CardOTP.is_used == False,
        )
        .first()
    )
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")

    now = datetime.now(timezone.utc)
    otp_exp = otp.expires_at if otp.expires_at.tzinfo else otp.expires_at.replace(tzinfo=timezone.utc)
    if now > otp_exp:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    otp.is_used = True
    card.status = "ACTIVE"
    db.commit()

    return {"message": "Card verified and activated successfully.", "card": _card_to_dict(card)}


@router.post("/{card_id}/resend-otp")
def resend_otp(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resend OTP for a pending card."""
    card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    if card.status != "PENDING_VERIFICATION":
        raise HTTPException(status_code=400, detail="Card is already verified or frozen.")

    # Invalidate old OTPs
    db.query(CardOTP).filter(CardOTP.card_id == card_id, CardOTP.is_used == False).delete()
    db.flush()

    otp_code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    otp = CardOTP(card_id=card.id, otp_code=otp_code, is_used=False, expires_at=expires_at)
    db.add(otp)
    db.commit()

    try:
        send_card_otp(user_email=current_user.email, otp_code=otp_code, last_four=card.last_four)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP: {str(e)}")

    return {"message": "New OTP sent to your registered email."}


@router.get("/")
def list_cards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all cards for the current user."""
    cards = (
        db.query(Card)
        .filter(Card.user_id == current_user.id)
        .order_by(Card.created_at.desc())
        .all()
    )
    return [_card_to_dict(c) for c in cards]


@router.put("/{card_id}/freeze")
def freeze_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    if card.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Only active cards can be frozen.")
    card.status = "FROZEN"
    db.commit()
    return {"message": "Card frozen.", "card": _card_to_dict(card)}


@router.put("/{card_id}/unfreeze")
def unfreeze_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    if card.status != "FROZEN":
        raise HTTPException(status_code=400, detail="Card is not frozen.")
    card.status = "ACTIVE"
    db.commit()
    return {"message": "Card unfrozen.", "card": _card_to_dict(card)}


@router.delete("/{card_id}")
def remove_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    db.query(CardOTP).filter(CardOTP.card_id == card_id).delete()
    db.delete(card)
    db.commit()
    return {"message": "Card removed successfully."}


# ── Card Deposit ──────────────────────────────────────────────────────────────

@router.post("/{card_id}/deposit")
def card_deposit(
    card_id: int,
    data: CardTransactionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deposit money from a card into the user's wallet."""
    from app.core.security import verify_password
    if not current_user.hashed_pin or not verify_password(data.pin, current_user.hashed_pin):
        raise HTTPException(status_code=401, detail="Invalid Transaction PIN")

    card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    if card.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Card is not active. Only active cards can be used.")
    if data.amount_usd <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero.")
    if data.amount_usd > 10000:
        raise HTTPException(status_code=400, detail="Maximum single deposit is $10,000.")

    amount = Decimal(str(data.amount_usd))

    account = (
        db.query(Account)
        .filter(Account.user_id == current_user.id, Account.currency == "USD")
        .with_for_update()
        .first()
    )
    if not account:
        account = db.query(Account).filter(Account.user_id == current_user.id).with_for_update().first()
    if not account:
        raise HTTPException(status_code=400, detail="Account not found.")

    # Create transaction
    txn = Transaction(
        user_id=current_user.id,
        type="CARD_DEPOSIT",
        status="COMPLETED",
        reference=f"CARD-{card.last_four}",
    )
    db.add(txn)
    db.flush()

    # Create FX lot
    fx_lot = FxLot(
        account_id=account.id,
        settlement_currency=account.currency,
        settlement_amount_total=amount,
        settlement_amount_remaining=amount,
        origin_currency=account.currency,
        origin_amount_total=amount,
        fx_rate_used=Decimal("1.0"),
        fx_provider="CARD",
    )
    db.add(fx_lot)
    db.flush()

    # Ledger CREDIT
    ledger = LedgerEntry(
        account_id=account.id,
        currency=account.currency,
        signed_amount=amount,
        fx_lot_id=fx_lot.id,
        transaction_id=txn.id,
        entry_type="CREDIT",
    )
    db.add(ledger)

    if account.cached_balance_usd is None:
        account.cached_balance_usd = Decimal("0")
    account.cached_balance_usd = Decimal(str(account.cached_balance_usd)) + amount

    db.commit()

    return {
        "message": f"${data.amount_usd:.2f} deposited from card ending {card.last_four}.",
        "new_balance": float(account.cached_balance_usd),
        "transaction_id": txn.id,
    }


# ── Card Withdraw ─────────────────────────────────────────────────────────────

@router.post("/{card_id}/withdraw")
def card_withdraw(
    card_id: int,
    data: CardTransactionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Withdraw money from the user's wallet to a card."""
    from app.core.security import verify_password
    if not current_user.hashed_pin or not verify_password(data.pin, current_user.hashed_pin):
        raise HTTPException(status_code=401, detail="Invalid Transaction PIN")
        
    card = db.query(Card).filter(Card.id == card_id, Card.user_id == current_user.id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found.")
    if card.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Card is not active.")
    if data.amount_usd <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero.")

    amount = Decimal(str(data.amount_usd))

    account = (
        db.query(Account)
        .filter(Account.user_id == current_user.id, Account.currency == "USD")
        .with_for_update()
        .first()
    )
    if not account:
        account = db.query(Account).filter(Account.user_id == current_user.id).with_for_update().first()
    if not account:
        raise HTTPException(status_code=400, detail="Account not found.")

    current_balance = Decimal(str(account.cached_balance_usd or "0"))
    if current_balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance.")

    # Block withdrawals of test/sandbox funds
    test_bal = Decimal(str(account.test_balance_usd or "0"))
    real_balance = current_balance - test_bal
    if amount > real_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient real funds. Withdrawable balance: ${real_balance:.2f}. "
                   f"${test_bal:.2f} is from test deposits and cannot be withdrawn."
        )

    # Consume FX lots (FIFO)
    remaining = amount
    fx_lots = (
        db.query(FxLot)
        .filter(
            FxLot.account_id == account.id,
            FxLot.settlement_amount_remaining > 0,
        )
        .order_by(FxLot.created_at.asc())
        .with_for_update()
        .all()
    )

    total_available = sum([l.settlement_amount_remaining for l in fx_lots])
    if total_available < amount:
        raise HTTPException(status_code=400, detail="FX lot inconsistency detected: insufficient lot funds")

    # Create transaction
    txn = Transaction(
        user_id=current_user.id,
        type="CARD_WITHDRAW",
        status="COMPLETED",
        reference=f"CARD-{card.last_four}",
    )
    db.add(txn)
    db.flush()

    for lot in fx_lots:
        if remaining <= 0:
            break
        consume = min(lot.settlement_amount_remaining, remaining)
        lot.settlement_amount_remaining -= consume
        remaining -= consume

        # Ledger DEBIT per lot consumed
        ledger = LedgerEntry(
            account_id=account.id,
            currency=account.currency,
            signed_amount=-consume,
            fx_lot_id=lot.id,
            transaction_id=txn.id,
            entry_type="DEBIT",
        )
        db.add(ledger)

    account.cached_balance_usd = current_balance - amount
    db.commit()

    return {
        "message": f"${data.amount_usd:.2f} withdrawn to card ending {card.last_four}.",
        "new_balance": float(account.cached_balance_usd),
        "transaction_id": txn.id,
    }
