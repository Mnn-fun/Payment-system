from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import SessionLocal
from fastapi import HTTPException, status
from app.services.auth_service import register_user, login_user

router = APIRouter(prefix="/auth")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/register")
def register(email: str, password: str, db: Session = Depends(get_db)):
    return register_user(db, email, password)


@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    token = login_user(db, email, password)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    return {"access_token": token}
