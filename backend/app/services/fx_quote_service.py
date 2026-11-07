import os
import requests
import time
import threading
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.fx_quote import FxQuote

# ─── Shared rate cache (serves all quote & rate requests) ───────────────────
# One fetch from open.er-api.com gives ALL currency rates {INR: 92.2, ...}
# Cached for 1 hour to balance accuracy and API limits.
_usd_rates_fetched_at: float = 0.0
CACHE_TTL_SECONDS = 3600            # 1 hour

# Fallback static rates updated to more recent market levels
_FALLBACK_USD_RATES = {
    "EUR": 0.9250, "GBP": 0.7850, "JPY": 159.20,
    "INR": 92.88,  "AUD": 1.5100, "CAD": 1.3800,
    "CHF": 0.8900, "CNY": 7.2600, "SGD": 1.3500,
}

# Pre-seed with fallback so first request NEVER blocks
_usd_rates_cache: dict = dict(_FALLBACK_USD_RATES)


def _fetch_and_cache_usd_rates() -> dict:
    """Fetch all USD-based rates from open.er-api.com. Cached globally for 1 hour."""
    global _usd_rates_cache, _usd_rates_fetched_at
    now = time.time()

    # Return cached rates if still fresh (never blocks)
    if _usd_rates_fetched_at and (now - _usd_rates_fetched_at) < CACHE_TTL_SECONDS:
        return _usd_rates_cache

    try:
        # Increase timeout to 5 seconds and add User-Agent to avoid blocks
        headers = {"User-Agent": "Interpay/1.0.0 (Financial App; Coding Exercise)"}
        resp = requests.get("https://open.er-api.com/v6/latest/USD", timeout=5, headers=headers)
        data = resp.json()
        if data.get("result") == "success":
            rates = {k: float(v) for k, v in data.get("rates", {}).items() if k != "USD"}
            _usd_rates_cache = rates
            _usd_rates_fetched_at = now
            print(f"[FX_SERVICE] Successfully fetched fresh USD rates at {datetime.now()}")
            return rates
        else:
            print(f"[FX_SERVICE] API returned error result: {data.get('result')}")
    except Exception as e:
        print(f"[FX_SERVICE] Failed to fetch live rates: {str(e)}. Using cache/fallback.")
        pass

    # Keep serving stale cache or fallback — never block the caller
    return _usd_rates_cache  # already pre-seeded with fallback at startup


def _warm_cache_in_background():
    """Called once at startup to prime the cache from the live API without blocking."""
    def _fetch():
        time.sleep(1)  # Let the app finish starting up first
        _fetch_and_cache_usd_rates()
    threading.Thread(target=_fetch, daemon=True).start()

# Kick off the cache warm immediately when this module is imported
_warm_cache_in_background()


def get_all_live_rates() -> dict:
    """Returns the full live USD-based rates dict. Used by /fx/rates endpoint."""
    return _fetch_and_cache_usd_rates()


class FxQuoteService:
    def __init__(self, db: Session):
        self.db = db
        self.spread_percent = Decimal("0.012")  # 1.2% spread

    def fetch_live_rate(self, base: str, target: str) -> Decimal:
        """
        Fetches rate using the shared 12-hour cache. No redundant API calls.
        """
        if base == target:
            return Decimal("1.0")

        rates = _fetch_and_cache_usd_rates()  # cached, no new API call if recent

        if base == "USD" and target in rates:
            return Decimal(str(rates[target]))

        elif target == "USD" and base in rates:
            return Decimal("1.0") / Decimal(str(rates[base]))

        elif base in rates and target in rates:
            # Cross rate: e.g. INR -> JPY = (USD->JPY) / (USD->INR)
            return Decimal(str(rates[target])) / Decimal(str(rates[base]))

        # Last resort fallback
        fallback = _FALLBACK_USD_RATES
        if base == "USD" and target in fallback:
            return Decimal(str(fallback[target]))
        elif target == "USD" and base in fallback:
            return Decimal("1.0") / Decimal(str(fallback[base]))
        return Decimal("1.0")

    def create_quote(self, user_id: int, base: str, target: str, amount: Decimal) -> dict:
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be positive")

        # 1. Fetch live mid-market rate (from shared cache)
        mid_market_rate = self.fetch_live_rate(base, target)

        # 2. Apply 1.2% spread: user receives slightly less target currency
        interpay_rate = mid_market_rate * (Decimal("1.0") - self.spread_percent)
        converted_amount = (amount * interpay_rate).quantize(Decimal("0.000001"))

        # 3. Compute spread revenue in USD
        true_converted = amount * mid_market_rate
        spread_revenue_target = (true_converted - converted_amount).quantize(Decimal("0.000001"))

        if target == "USD":
            spread_revenue_usd = spread_revenue_target
        elif base == "USD":
            spread_revenue_usd = (spread_revenue_target / mid_market_rate).quantize(Decimal("0.000001"))
        else:
            usd_rate = self.fetch_live_rate(target, "USD")
            spread_revenue_usd = (spread_revenue_target * usd_rate).quantize(Decimal("0.000001"))

        # 4. Persist the quote with 5-minute expiry
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=300)

        quote = FxQuote(
            user_id=user_id,
            base_currency=base,
            target_currency=target,
            amount=amount,
            mid_market_rate=mid_market_rate,
            interpay_rate=interpay_rate,
            converted_amount=converted_amount,
            spread_percent=self.spread_percent * 100,  # store as 0.6
            spread_revenue=spread_revenue_usd,
            expires_at=expires_at,
            is_used=False,
        )

        self.db.add(quote)
        self.db.commit()
        self.db.refresh(quote)

        return {
            "quote_id": quote.id,
            "base_currency": base,
            "target_currency": target,
            "amount": float(amount),
            "mid_market_rate": float(mid_market_rate),
            "interpay_rate": float(interpay_rate),
            "converted_amount": float(converted_amount),
            "spread_percent": float(quote.spread_percent),
            "expires_in_seconds": 300,
            "expires_at": expires_at.isoformat(),
        }
