from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.transaction_service import TransactionService

router = APIRouter(prefix="/accounts", tags=["Accounts"])

@router.get("/{account_id}/balance")
def get_balance(account_id: int, db: Session = Depends(get_db)):
    service = TransactionService(db)
    return {
        "account_id": account_id,
        "balance": service.get_account_balance(account_id)
    }

@router.get("/{account_id}/ledger")
def get_ledger(account_id: int, db: Session = Depends(get_db)):
    service = TransactionService(db)
    return service.get_ledger_entries(account_id)

