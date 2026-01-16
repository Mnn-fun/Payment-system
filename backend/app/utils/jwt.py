from jose import jwt
from datetime import datetime, timedelta
import os

SECRET = os.getenv("JWT_SECRET")
ALGO = os.getenv("JWT_ALGORITHM")

def create_token(data: dict):
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=1)
    return jwt.encode(payload, SECRET, algorithm=ALGO)
