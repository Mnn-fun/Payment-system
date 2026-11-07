from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.services.withdraw_service import WithdrawService
from app.models.fx_rate import FxRate
from app.core.dependencies import get_current_user
from app.models.user import User
from typing import Optional


router = APIRouter(prefix="/withdrawals", tags=["Withdrawals"])


class WithdrawRequest(BaseModel):
    pin: str
    amount_usd: float
    destination_currency: str
    bank_reference: str = ""
    quote_id: Optional[int] = None
    payment_method: Optional[str] = "CARD"
    user_payment_details: Optional[str] = None


@router.post("/")
def withdraw(
    data: WithdrawRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    destination_currency = data.destination_currency.upper()

    from app.core.security import verify_password
    if not current_user.hashed_pin or not verify_password(data.pin, current_user.hashed_pin):
        raise HTTPException(status_code=401, detail="Invalid Transaction PIN")

    # Auto-generate idempotency key
    idempotency_key = str(uuid.uuid4())

    service = WithdrawService(db)
    try:
        result = service.withdraw(
            user_id=current_user.id,
            amount_usd=Decimal(str(data.amount_usd)),
            destination_currency=destination_currency,
            idempotency_key=idempotency_key,
            bank_reference=data.bank_reference,
            quote_id=data.quote_id,
            payment_method=data.payment_method,
            user_payment_details=data.user_payment_details,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
