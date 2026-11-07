from decimal import Decimal
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.transfer_service import TransferService
from app.schemas.transfer import TransferCreate
from app.core.dependencies import get_current_user
from app.models.user import User
from uuid import uuid4

router = APIRouter(prefix="/transfers", tags=["Transfers"])


@router.post("/")
def create_transfer(
    data: TransferCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security import verify_password
    if not current_user.hashed_pin or not verify_password(data.pin, current_user.hashed_pin):
        raise HTTPException(status_code=401, detail="Invalid Transaction PIN")
        
    service = TransferService(db)

    # Resolve recipient user_id from email or direct user_id
    to_user_id = data.to_user_id
    
    if data.recipient_email:
        recipient = db.query(User).filter(User.email == data.recipient_email).first()
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
        to_user_id = recipient.id
    
    if not to_user_id:
        raise HTTPException(status_code=400, detail="Either recipient_email or to_user_id required")

    if current_user.id == to_user_id:
        raise HTTPException(status_code=400, detail="Sender and receiver must be different")

    if data.amount is None or data.amount <= Decimal("0"):
        raise HTTPException(status_code=400, detail="Transfer amount must be greater than zero")

    # If client didn't provide an idempotency key, generate one server-side.
    idem = request.headers.get("Idempotency-Key") or str(uuid4())

    try:
        return service.transfer(
            from_user_id=current_user.id,
            to_user_id=to_user_id,
            amount_usd=data.amount,
            idempotency_key=idem,
            is_test=data.is_test,
            from_currency=data.from_currency,
            to_currency=data.to_currency,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
