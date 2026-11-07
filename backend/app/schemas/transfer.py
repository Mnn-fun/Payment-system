from pydantic import BaseModel, EmailStr
from decimal import Decimal
from typing import Optional


class TransferCreate(BaseModel):
    pin: str
    recipient_email: Optional[str] = None
    to_user_id: Optional[int] = None
    amount: Decimal
    description: Optional[str] = None
    is_test: bool = False
    from_currency: Optional[str] = None
    to_currency: Optional[str] = None
    # Note: idempotency is handled by the server. The UI/docs will not
    # prompt for an idempotency key — the route will read an optional
    # Idempotency-Key header if present, otherwise generate one.