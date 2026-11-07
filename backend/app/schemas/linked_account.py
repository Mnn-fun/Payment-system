from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LinkedAccountBase(BaseModel):
    name: str
    account_type: str
    account_number: str

class LinkedAccountCreate(LinkedAccountBase):
    pass

class LinkedAccountResponse(LinkedAccountBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True
