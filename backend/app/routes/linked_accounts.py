from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.user import User
from app.models.linked_account import LinkedAccount
from app.schemas.linked_account import LinkedAccountCreate, LinkedAccountResponse
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/linked_accounts", tags=["Linked Accounts"])

@router.get("/", response_model=List[LinkedAccountResponse])
def get_linked_accounts(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get all linked bank accounts for the current user.
    """
    accounts = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.user_id == current_user.id)
        .all()
    )
    return accounts

@router.post("/", response_model=LinkedAccountResponse)
def add_linked_account(
    account: LinkedAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Add a new linked bank account for the current user.
    """
    new_account = LinkedAccount(
        user_id=current_user.id,
        name=account.name,
        account_type=account.account_type,
        account_number=account.account_number,
    )
    db.add(new_account)
    db.commit()
    db.refresh(new_account)
    return new_account

@router.delete("/{account_id}")
def remove_linked_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove a linked bank account.
    """
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == current_user.id)
        .first()
    )
    
    if not account:
        raise HTTPException(status_code=404, detail="Linked account not found")
        
    db.delete(account)
    db.commit()
    
    return {"message": "Linked account removed successfully"}
