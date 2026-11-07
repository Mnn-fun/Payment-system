from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.deposit_service import DepositService
from app.schemas.deposit import DepositCreate
from app.core.dependencies import get_current_user
from app.models.user import User


router = APIRouter(prefix="/deposits", tags=["Deposits"])


@router.post("/")
def create_deposit(
    data: DepositCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from fastapi import HTTPException
    from app.core.security import verify_password
    
    if not current_user.hashed_pin or not verify_password(data.pin, current_user.hashed_pin):
        raise HTTPException(status_code=401, detail="Invalid Transaction PIN")
        
    service = DepositService(db)

    return service.deposit(
        user_id=current_user.id,
        source_currency=data.source_currency,
        source_amount=data.source_amount,
        bank_reference=data.bank_reference,
        quote_id=data.quote_id,
        payment_method=data.payment_method,
        deposit_proof=data.deposit_proof
    )
