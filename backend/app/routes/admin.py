from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal
import json

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.transaction import Transaction
from app.models.account import Account
from app.models.ledger_entry import LedgerEntry
from app.models.fx_lot import FxLot
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/admin", tags=["Admin"])

def get_admin_user(current_user: User = Depends(get_current_user)):
    if getattr(current_user, 'is_admin', False) or current_user.id == 1:
        return current_user
    raise HTTPException(status_code=403, detail="Admin access required")

def get_finance_admin(admin: User = Depends(get_admin_user)):
    role = getattr(admin, 'admin_role', '')
    if admin.id == 1 or role in ['finance', 'superadmin']:
        return admin
    raise HTTPException(status_code=403, detail="Finance role required for this action")

@router.get("/pending-deposits")
def get_pending_deposits(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    txns = db.query(Transaction).filter(
        Transaction.type == "DEPOSIT",
        Transaction.status == "PENDING_APPROVAL"
    ).all()
    
    results = []
    for t in txns:
        details = json.loads(t.user_payment_details or "{}")
        user = db.query(User).filter(User.id == details.get("user_id")).first()
        results.append({
            "id": t.id,
            "user_email": getattr(user, "email", "Unknown"),
            "amount_usd": float(details.get("usd_amount", 0)),
            "source_currency": details.get("source_currency", ""),
            "source_amount": float(details.get("source_amount", 0)),
            "method": getattr(t, "payment_method", "CARD"),
            "deposit_proof": getattr(t, "deposit_proof", ""),
            "created_at": str(t.created_at)
        })
    return results

@router.get("/pending-withdrawals")
def get_pending_withdrawals(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)
):
    txns = db.query(Transaction).filter(
        Transaction.type == "WITHDRAW",
        Transaction.status == "PENDING_APPROVAL"
    ).all()
    
    results = []
    for t in txns:
        ledger = db.query(LedgerEntry).filter(LedgerEntry.transaction_id == t.id).first()
        user_email = "Unknown"
        amount_usd = 0
        if ledger:
            amount_usd = abs(float(ledger.signed_amount))
            account = db.query(Account).filter(Account.id == ledger.account_id).first()
            if account:
                user = db.query(User).filter(User.id == account.user_id).first()
                if user:
                    user_email = user.email

        results.append({
            "id": t.id,
            "user_email": user_email,
            "amount_usd": amount_usd,
            "method": getattr(t, "payment_method", ""),
            "user_payment_details": getattr(t, "user_payment_details", ""),
            "created_at": str(t.created_at)
        })
    return results

@router.post("/deposits/{txn_id}/approve")
def approve_deposit(
    txn_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_finance_admin)
):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn or txn.type != "DEPOSIT" or txn.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=400, detail="Invalid transaction")
        
    details = json.loads(txn.user_payment_details or "{}")
    account = db.query(Account).filter(Account.id == details.get("account_id")).first()
    if not account:
        raise HTTPException(status_code=400, detail="Account not found")

    settlement_amount = Decimal(details.get("usd_amount", "0"))
    source_amount = Decimal(details.get("source_amount", "0"))
    fx_rate = Decimal(details.get("fx_rate", "1"))
    fx_revenue = Decimal(details.get("fx_revenue", "0"))

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
        admin_user = db.query(User).filter(User.is_admin == True).first()
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
    
    txn.status = "COMPLETED"
    
    # Audit Log
    db.add(AuditLog(admin_id=admin.id, action="APPROVE_DEPOSIT", target=f"Transaction {txn.id}", details={"user_id": details.get("user_id"), "amount": float(settlement_amount)}))
    
    db.commit()
    return {"message": "Deposit approved"}

@router.post("/deposits/{txn_id}/reject")
def reject_deposit(
    txn_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_finance_admin)
):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn or txn.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=400, detail="Invalid transaction")
    
    txn.status = "REJECTED"

    # Audit Log
    db.add(AuditLog(admin_id=admin.id, action="REJECT_DEPOSIT", target=f"Transaction {txn.id}"))

    db.commit()
    return {"message": "Deposit rejected"}

import json
from decimal import Decimal

@router.post("/withdrawals/{txn_id}/approve")
def approve_withdrawal(
    txn_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_finance_admin)
):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn or txn.type != "WITHDRAW" or txn.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=400, detail="Invalid transaction")
    
    # Process deferred commission if it exists
    if txn.user_payment_details:
        try:
            details = json.loads(txn.user_payment_details)
            deferred_rev_str = details.get("deferred_fx_revenue")
            if deferred_rev_str:
                fx_revenue = Decimal(deferred_rev_str)
                if fx_revenue > 0:
                    rev_account = db.query(Account).filter(
                        Account.user_id == db.query(User).filter(User.is_admin == True).first().id,
                        Account.currency == "USD"
                    ).first()
                    if rev_account:
                        rev_ledger = LedgerEntry(
                            account_id=rev_account.id,
                            currency="USD",
                            signed_amount=fx_revenue,
                            fx_lot_id=details.get("deferred_fx_lot_id"),
                            transaction_id=txn.id,
                            entry_type="SYSTEM_REVENUE",
                        )
                        db.add(rev_ledger)
                        if rev_account.cached_balance_usd is None: rev_account.cached_balance_usd = Decimal("0")
                        rev_account.cached_balance_usd += fx_revenue
        except json.JSONDecodeError:
            pass

    txn.status = "COMPLETED"
    
    # Audit Log
    db.add(AuditLog(admin_id=admin.id, action="APPROVE_WITHDRAWAL", target=f"Transaction {txn.id}"))
    
    db.commit()
    return {"message": "Withdrawal approved"}

@router.post("/withdrawals/{txn_id}/reject")
def reject_withdrawal(
    txn_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_finance_admin)
):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn or txn.type != "WITHDRAW" or txn.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=400, detail="Invalid transaction")
        
    ledger = db.query(LedgerEntry).filter(
        LedgerEntry.transaction_id == txn.id,
        LedgerEntry.entry_type == "DEBIT"
    ).first()
    if ledger:
        account = db.query(Account).filter(Account.id == ledger.account_id).first()
        if account:
            refund_amount = abs(ledger.signed_amount)
            refund_entry = LedgerEntry(
                account_id=account.id,
                currency="USD",
                signed_amount=refund_amount,
                fx_lot_id=None,
                transaction_id=txn.id,
                entry_type="REFUND",
            )
            db.add(refund_entry)
            account.cached_balance_usd += refund_amount

            # Restore consumed FX lots so lot tracking stays accurate
            from app.models.fx_lot import FxLot
            consumed_entries = db.query(LedgerEntry).filter(
                LedgerEntry.transaction_id == txn.id,
                LedgerEntry.entry_type == "DEBIT"
            ).all()
            for entry in consumed_entries:
                if entry.fx_lot_id:
                    lot = db.query(FxLot).filter(FxLot.id == entry.fx_lot_id).first()
                    if lot:
                        lot.settlement_amount_remaining += abs(entry.signed_amount)

    txn.status = "REJECTED"
    
    # Audit Log
    db.add(AuditLog(admin_id=admin.id, action="REJECT_WITHDRAWAL", target=f"Transaction {txn.id}"))
    
    db.commit()
    return {"message": "Withdrawal rejected and refunded"}

@router.post("/transactions/{txn_id}/reverse")
def reverse_transaction(
    txn_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_finance_admin) # Only finance/superadmin can reverse
):
    """
    Reverse a completed transaction (deposit, withdrawal, or transfer).
    This creates opposite ledger entries and sets status to REVERSED.
    """
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    if txn.status in ["REVERSED", "REJECTED", "FAILED"]:
        raise HTTPException(status_code=400, detail="Transaction is already reversed or failed")
        
    # Get all ledger entries for this transaction
    ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.transaction_id == txn.id).all()
    if not ledger_entries:
        raise HTTPException(status_code=400, detail="Cannot reverse transaction with no ledger impact")
        
    for entry in ledger_entries:
        # Create compensatory entry
        account = db.query(Account).filter(Account.id == entry.account_id).first()
        if account:
            reversed_amount = -entry.signed_amount
            comp_entry = LedgerEntry(
                account_id=account.id,
                currency=entry.currency,
                signed_amount=reversed_amount,
                fx_lot_id=entry.fx_lot_id,
                transaction_id=txn.id,
                entry_type="REVERSAL"
            )
            db.add(comp_entry)
            
            # Update cache
            if account.cached_balance_usd is None:
                account.cached_balance_usd = Decimal("0")
            account.cached_balance_usd += reversed_amount

            # If it was a test transaction, restore/reverse test balance as well
            if getattr(txn, "is_test", False):
                if account.test_balance_usd is None:
                    account.test_balance_usd = Decimal("0")
                account.test_balance_usd += reversed_amount
            
    previous_status = txn.status
    txn.status = "REVERSED"
    
    # Complete Audit Log
    db.add(AuditLog(
        admin_id=admin.id,
        action="REVERSE_TRANSACTION",
        target=f"Transaction {txn.id}",
        details={"type": txn.type, "previous_status": previous_status}
    ))
    
    db.commit()
    return {"message": "Transaction successfully reversed."}
