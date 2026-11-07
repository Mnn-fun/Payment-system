from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, EmailStr

from app.core.dependencies import get_current_user
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.models.account import Account
from app.models.ledger_entry import LedgerEntry
from app.models.transaction import Transaction
from app.models.contact import Contact
from app.database import get_db

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.get("/me")
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "username": current_user.username,
        "phone_number": current_user.phone_number,
        "has_pin": bool(current_user.hashed_pin),
        "profile_complete": bool(current_user.hashed_pin and current_user.full_name and current_user.phone_number)
    }

from pydantic import BaseModel
class SetPinRequest(BaseModel):
    new_pin: str

@router.post("/pin")
def set_transaction_pin(
    data: SetPinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    
    if len(data.new_pin) != 6 or not data.new_pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 6 digits.")
        
    if current_user.hashed_pin:
        raise HTTPException(status_code=400, detail="PIN already set. To reset, contact support.")
        
    current_user.hashed_pin = hash_password(data.new_pin)
    db.commit()
    
    return {"message": "Transaction PIN generated successfully."}

class ChangePinRequest(BaseModel):
    old_pin: str
    new_pin: str

@router.post("/pin/change")
def change_transaction_pin(
    data: ChangePinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.hashed_pin or not verify_password(data.old_pin, current_user.hashed_pin):
        raise HTTPException(status_code=401, detail="Incorrect current PIN.")
        
    if len(data.new_pin) != 6 or not data.new_pin.isdigit():
        raise HTTPException(status_code=400, detail="New PIN must be exactly 6 digits.")
        
    current_user.hashed_pin = hash_password(data.new_pin)
    db.commit()
    
    return {"message": "Transaction PIN changed successfully."}


@router.get("/")
def get_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all accounts/wallets for current user"""
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    
    result = []
    for account in accounts:
        # Calculate balance from ledger entries using SQLAlchemy func.sum
        balance_query = db.query(
            func.sum(LedgerEntry.signed_amount)
        ).filter(LedgerEntry.account_id == account.id).scalar()
        
        balance = balance_query or Decimal("0")
        
        result.append({
            "id": account.id,
            "currency": account.currency,
            "balance": float(balance),
            "status": account.status,
            "created_at": account.created_at.isoformat() if account.created_at else None
        })
    
    return result


class CreateAccountRequest(BaseModel):
    currency: str

@router.post("/")
def create_account(
    data: CreateAccountRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new currency wallet account for current user"""
    curr = data.currency.upper().strip()
    if len(curr) != 3:
        raise HTTPException(status_code=400, detail="Currency must be a 3-letter code.")
    existing = db.query(Account).filter(Account.user_id == current_user.id, Account.currency == curr).first()
    if existing:
        return {"message": f"{curr} account already exists", "account_id": existing.id, "currency": existing.currency}
    new_acc = Account(user_id=current_user.id, currency=curr, status="ACTIVE", cached_balance_usd=Decimal("0"), test_balance_usd=Decimal("0"))
    db.add(new_acc)
    db.commit()
    db.refresh(new_acc)
    return {"message": f"{curr} account created successfully", "account_id": new_acc.id, "currency": new_acc.currency}


@router.get("/balance")
def get_balance(
    currency: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current user's balance for a currency (defaults to user's primary or funded account)"""
    from app.services.faucet_service import check_and_replenish_test_balance
    faucet_status = check_and_replenish_test_balance(current_user.id, db)

    query = db.query(Account).filter(Account.user_id == current_user.id)
    if currency:
        account = query.filter(Account.currency == currency.upper()).first()
    else:
        # 1. Primary account (first created)
        account = query.order_by(Account.id.asc()).first()
        # 2. If primary account has 0 balance, check if another account has funds
        if account:
            primary_bal = db.query(func.sum(LedgerEntry.signed_amount)).filter(LedgerEntry.account_id == account.id).scalar() or Decimal("0")
            if primary_bal <= Decimal("0"):
                funded = (
                    db.query(Account)
                    .join(LedgerEntry, LedgerEntry.account_id == Account.id)
                    .filter(Account.user_id == current_user.id)
                    .group_by(Account.id)
                    .having(func.sum(LedgerEntry.signed_amount) > 0)
                    .first()
                )
                if funded:
                    account = funded

    if not account:
        return {
            "balance": 0.0,
            "currency": currency or "USD",
            "test_balance": 0.0,
            "withdrawable_balance": 0.0,
            "seconds_until_next_faucet": faucet_status.get("seconds_remaining", 0),
        }

    balance = (
        db.query(func.sum(LedgerEntry.signed_amount))
        .filter(LedgerEntry.account_id == account.id)
        .scalar()
    ) or Decimal("0")

    total_bal = float(balance)
    test_bal = float(min(account.test_balance_usd or Decimal("0"), balance)) if balance > 0 else 0.0

    return {
        "balance": total_bal,
        "currency": account.currency,
        "test_balance": test_bal,
        "withdrawable_balance": max(0.0, total_bal - test_bal),
        "seconds_until_next_faucet": faucet_status.get("seconds_remaining", 0),
    }


@router.post("/replenish-test-balance")
def replenish_test_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Claim +$100 test balance top-up (available every 12 hours)"""
    from app.services.faucet_service import check_and_replenish_test_balance
    result = check_and_replenish_test_balance(current_user.id, db)
    return result

@router.get("/transactions")
def get_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all transactions for current user"""
    # Get all accounts for this user
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    account_ids = [acc.id for acc in accounts]

    # Get all ledger entries for these accounts, oldest first to calculate running balances
    ledger_entries_asc = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.account_id.in_(account_ids))
        .order_by(LedgerEntry.created_at.asc(), LedgerEntry.id.asc())
        .all()
    )

    running_balances = {acc_id: Decimal("0") for acc_id in account_ids}
    entry_balances = {}
    for entry in ledger_entries_asc:
        running_balances[entry.account_id] += entry.signed_amount
        entry_balances[entry.id] = running_balances[entry.account_id]

    # Group entries by (transaction_id, account_id) so multi-lot transfers show as one
    groups = {}
    for entry in ledger_entries_asc:
        key = (entry.transaction_id, entry.account_id)
        if key not in groups:
            groups[key] = {
                "transaction_id": entry.transaction_id,
                "account_id": entry.account_id,
                "total_signed_amount": entry.signed_amount,
                "latest_entry_id": entry.id,
                "created_at": entry.created_at,
                "entry_type": entry.entry_type,
                "currency": entry.currency
            }
        else:
            groups[key]["total_signed_amount"] += entry.signed_amount
            groups[key]["latest_entry_id"] = entry.id
            # Use the latest created_at in the group
            if entry.created_at and (not groups[key]["created_at"] or entry.created_at > groups[key]["created_at"]):
                groups[key]["created_at"] = entry.created_at

    # Sort groups by created_at DESC (tie-break with latest_entry_id)
    sorted_groups = sorted(groups.values(), key=lambda x: (x["created_at"] or datetime.min, x["latest_entry_id"]), reverse=True)

    result = []
    for g in sorted_groups:
        txn = db.query(Transaction).filter(Transaction.id == g["transaction_id"]).first()

        # ── Resolve counterparty name ──────────────────────────────────────
        counterparty_name = None
        if txn and txn.type == "TRANSFER":
            other_entry = (
                db.query(LedgerEntry)
                .filter(
                    LedgerEntry.transaction_id == g["transaction_id"],
                    LedgerEntry.account_id.notin_(account_ids),   # not MY accounts
                )
                .first()
            )
            if other_entry:
                other_account = db.query(Account).filter(Account.id == other_entry.account_id).first()
                if other_account:
                    other_user = db.query(User).filter(User.id == other_account.user_id).first()
                    if other_user:
                        counterparty_name = (
                            other_user.full_name
                            or other_user.username
                            or other_user.email.split("@")[0]
                        )

        # Fallback for deposits / withdrawals / unknown counterparty
        if counterparty_name is None:
            if txn and txn.type in ("DEPOSIT", "WITHDRAW", "WALLET_DEPOSIT", "WALLET_WITHDRAW"):
                ref = txn.reference or ""
                counterparty_name = ref if ref else "External / Bank"
            elif txn and txn.type in ("CARD_DEPOSIT", "CARD_WITHDRAW"):
                ref = txn.reference or ""
                counterparty_name = f"Card {ref}" if ref else "Card Payment"
            else:
                counterparty_name = "—"

        type_str = txn.type if txn else "UNKNOWN"
        if g["entry_type"] == "SYSTEM_REVENUE":
            type_str = "FX_REVENUE"

        result.append({
            "id": g["latest_entry_id"], # Link to latest ledger ID
            "transaction_id": g["transaction_id"],
            "type": type_str,
            "amount": float(abs(g["total_signed_amount"])),
            "currency": g["currency"],
            "entry_type": g["entry_type"],   # CREDIT / DEBIT (taken from any entry in group)
            "running_balance": float(entry_balances[g["latest_entry_id"]]),
            "status": txn.status if txn else "UNKNOWN",
            "is_test": bool(getattr(txn, "is_test", False)),
            "created_at": g["created_at"].isoformat() if g["created_at"] else None,
            "counterparty": counterparty_name,
        })

    return result



@router.get("/ledger/{account_id}")
def get_account_ledger(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get ledger entries for a specific account"""
    # Verify account belongs to current user
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user.id
    ).first()
    
    if not account:
        return {"error": "Account not found"}
    
    ledger_entries = db.query(LedgerEntry).filter(
        LedgerEntry.account_id == account_id
    ).order_by(LedgerEntry.created_at.desc()).all()
    
    result = []
    for entry in ledger_entries:
        result.append({
            "id": entry.id,
            "amount": float(entry.signed_amount),
            "currency": entry.currency,
            "entry_type": entry.entry_type,
            "created_at": entry.created_at.isoformat() if entry.created_at else None
        })
    
    return result


@router.get("/search/email/{email}")
def search_user_by_email(
    email: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Search for user by email"""
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        return {"found": False}
    
    if user.id == current_user.id:
        return {"found": False, "error": "Cannot send to yourself"}
    
    return {
        "found": True,
        "id": user.id,
        "email": user.email
    }



class AddRecipientRequest(BaseModel):
    email: EmailStr

@router.get("/recipients")
def get_recipients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get explicitly saved contacts and implicitly saved past counterparties."""
    recipients_dict = {}

    # 1. Fetch explicitly saved contacts
    contacts = db.query(Contact).filter(Contact.user_id == current_user.id).all()
    for contact in contacts:
        contact_user = db.query(User).filter(User.id == contact.contact_user_id).first()
        if contact_user:
            recipients_dict[contact_user.email] = {
                "id": contact_user.id,
                "name": contact_user.full_name or contact_user.username or contact_user.email.split("@")[0],
                "email": contact_user.email,
                "type": "SAVED"
            }

    # 2. Fetch people user has sent money to
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    account_ids = [acc.id for acc in accounts]

    if account_ids:
        # Find all my ledger entries where I sent money (debits on my account)
        my_debits = (
            db.query(LedgerEntry)
            .filter(
                LedgerEntry.account_id.in_(account_ids),
                LedgerEntry.signed_amount < 0
            )
            .all()
        )
        
        transaction_ids = [entry.transaction_id for entry in my_debits]

        if transaction_ids:
            # Find the OTHER side of those transactions
            other_entries = (
                db.query(LedgerEntry)
                .filter(
                    LedgerEntry.transaction_id.in_(transaction_ids),
                    LedgerEntry.account_id.notin_(account_ids),
                    LedgerEntry.signed_amount > 0
                )
                .all()
            )

            for entry in other_entries:
                other_account = db.query(Account).filter(Account.id == entry.account_id).first()
                if other_account:
                    other_user = db.query(User).filter(User.id == other_account.user_id).first()
                    if other_user and other_user.email not in recipients_dict:
                        recipients_dict[other_user.email] = {
                            "id": other_user.id,
                            "name": other_user.full_name or other_user.username or other_user.email.split("@")[0],
                            "email": other_user.email,
                            "type": "PAST_TRANSFER"
                        }

    # Return as a list
    return list(recipients_dict.values())


@router.post("/recipients")
def add_recipient(
    request: AddRecipientRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a new contact by email."""
    if request.email == current_user.email:
        raise HTTPException(status_code=400, detail="Cannot add yourself as a recipient.")

    contact_user = db.query(User).filter(User.email == request.email).first()
    if not contact_user:
        raise HTTPException(status_code=404, detail="User with this email not found.")

    # Check if already a contact
    existing_contact = db.query(Contact).filter(
        Contact.user_id == current_user.id,
        Contact.contact_user_id == contact_user.id
    ).first()

    if existing_contact:
        raise HTTPException(status_code=400, detail="User is already in your saved recipients.")

    new_contact = Contact(
        user_id=current_user.id,
        contact_user_id=contact_user.id
    )
    db.add(new_contact)
    db.commit()

    return {"message": "Recipient added successfully."}
