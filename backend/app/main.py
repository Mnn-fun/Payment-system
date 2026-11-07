from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

from app.core.rate_limit import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.database import Base, engine
from app.models.user import User
from app.models.account import Account
from app.models.fx_lot import FxLot
from app.models.transaction import Transaction
from app.models.ledger_entry import LedgerEntry
from app.models.fx_liquidity import FxLiquidity
from app.models.idempotency_key import IdempotencyKey
from app.models.user_settings import UserSettings
from app.models.fx_rate import FxRate
from app.models.card import Card
from app.models.card_otp import CardOTP
from app.models.linked_account import LinkedAccount
from app.models.contact import Contact
from app.models.signup_otp import SignupOTP
from app.models.two_factor_otp import TwoFactorOTP
from app.models.backup_code import BackupCode
from app.models.fx_quote import FxQuote
from app.models.audit_log import AuditLog
from app.routes.deposit import router as deposit_router
from app.routes.transfer import router as transfer_router
from app.routes.account import router as account_router
from app.routes.withdraw import router as withdraw_router
from app.routes import auth
from app.routes.settings import router as settings_router
from app.routes.fx_rates import router as fx_router
from app.routes.cards import router as cards_router
from app.routes.linked_accounts import router as linked_accounts_router

# Disable API docs in production — enable by setting DEBUG=true in .env
_debug = os.getenv("DEBUG", "false").lower() == "true"
app = FastAPI(
    title="International Payment System",
    docs_url="/docs" if _debug else None,
    redoc_url="/redoc" if _debug else None,
    openapi_url="/openapi.json" if _debug else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS
# In production, set ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

Base.metadata.create_all(bind=engine)

app.include_router(deposit_router)
app.include_router(transfer_router)
app.include_router(account_router)
app.include_router(withdraw_router)
app.include_router(auth.router)
app.include_router(settings_router)
app.include_router(fx_router)
app.include_router(cards_router)
app.include_router(linked_accounts_router)
from app.routes.admin import router as admin_router
from app.routes.cashfree import router as cashfree_router

app.include_router(admin_router)
app.include_router(cashfree_router)

@app.get("/")
def root():
    return {
        "service": "InterPay Multi-Currency Banking API",
        "status": "online",
        "version": "1.0.0",
        "message": "Welcome to InterPay API. Connect via the frontend web application."
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}

