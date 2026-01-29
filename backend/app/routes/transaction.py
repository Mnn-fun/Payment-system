from fastapi import HTTPException
from app.utils.errors import BusinessError


from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session


from app.database import get_db
from app.services.transaction_service import TransactionService

router = APIRouter(prefix="/transactions", tags=["Transactions"])

@router.post("/")
def create_transaction(
    from_account_id: int,
    to_account_id: int,
    amount: float,
    db: Session = Depends(get_db)
):
    try:
        service = TransactionService(db)
        return service.create_transaction(
            from_account_id=from_account_id,
            to_account_id=to_account_id,
            amount=amount
        )
    except BusinessError as e:
        raise HTTPException(status_code=400, detail=str(e))

