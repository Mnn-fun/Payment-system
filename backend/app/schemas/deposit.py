from pydantic import BaseModel
from decimal import Decimal
from typing import Optional


class DepositCreate(BaseModel):
    pin: str
    source_currency: str
    source_amount: Decimal
    bank_reference: str
    quote_id: Optional[int] = None
    payment_method: Optional[str] = "CARD"
    deposit_proof: Optional[str] = None
