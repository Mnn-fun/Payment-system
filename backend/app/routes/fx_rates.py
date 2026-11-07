from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from decimal import Decimal

from app.database import get_db
from app.models.fx_rate import FxRate
from app.core.dependencies import get_current_user
from app.models.user import User
from app.services.fx_quote_service import FxQuoteService, get_all_live_rates
from app.services.fx_quote_service import _usd_rates_fetched_at, _usd_rates_cache

router = APIRouter(prefix="/fx", tags=["FX Rates"])


@router.get("/rates")
def get_all_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all live FX rates (USD-based) from the shared in-memory cache."""
    import time
    import app.services.fx_quote_service as svc
    rates = get_all_live_rates()
    
    # Calculate cache age
    age_seconds = int(time.time() - svc._usd_rates_fetched_at) if svc._usd_rates_fetched_at else None
    source = "live" if age_seconds is not None else "fallback"
    
    return {
        "base": "USD",
        "rates": rates,
        "cache_age_seconds": age_seconds,
        "source": source,
    }


@router.get("/rates/{currency}")
def get_rate(
    currency: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get FX rate for a specific currency pair (USD → currency) from live cache."""
    currency = currency.upper()
    if currency == "USD":
        return {"base": "USD", "target": "USD", "rate": 1.0}

    rates = get_all_live_rates()
    rate = rates.get(currency)
    if not rate:
        raise HTTPException(status_code=404, detail=f"Rate not found for {currency}")

    return {"base": "USD", "target": currency, "rate": rate}

@router.post("/rates/refresh")
def refresh_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Force refresh the live FX rate cache from open.er-api.com."""
    import app.services.fx_quote_service as svc
    # Clear the cached timestamp to force a re-fetch
    svc._usd_rates_fetched_at = 0.0
    svc._usd_rates_cache = {}
    rates = get_all_live_rates()   # triggers a fresh API call
    return {
        "message": "Rates refreshed successfully",
        "base": "USD",
        "rates": rates,
    }

@router.get("/quote")
def get_fx_quote(
    base: str = Query(..., description="Base Currency", example="USD"),
    target: str = Query(..., description="Target Currency", example="INR"),
    amount: Decimal = Query(..., description="Amount in Base Currency", example="100.00"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a live FX quote with a guaranteed interpay rate that expires in 30 seconds.
    """
    base = base.upper()
    target = target.upper()

    service = FxQuoteService(db)
    quote_data = service.create_quote(current_user.id, base, target, amount)
    
    return quote_data
