"""
Seed script: populate fx_rates and fx_liquidity tables with sample data.

Run from the backend directory:
    python -m app.scripts.seed_fx
"""

import sys
import os

# Ensure the backend root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.database import SessionLocal, engine, Base
from app.models.fx_rate import FxRate
from app.models.fx_liquidity import FxLiquidity

# Realistic USD-based rates: how many units of target per 1 USD
RATES = {
    "EUR": 0.9200,
    "GBP": 0.7900,
    "JPY": 149.5000,
    "INR": 83.1000,
    "AUD": 1.5300,
    "CAD": 1.3600,
    "CHF": 0.8800,
    "CNY": 7.2400,
    "SGD": 1.3400,
}

# Seed liquidity for withdrawals (generous amounts for testing)
LIQUIDITY = {
    "EUR": 1_000_000,
    "GBP": 1_000_000,
    "JPY": 100_000_000,
    "INR": 50_000_000,
    "AUD": 1_000_000,
    "CAD": 1_000_000,
    "CHF": 1_000_000,
    "CNY": 5_000_000,
    "SGD": 1_000_000,
}


def seed():
    # Make sure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # --- FX Rates ---
        for currency, rate in RATES.items():
            existing = db.query(FxRate).filter(FxRate.target_currency == currency).first()
            if existing:
                existing.rate = rate
                print(f"  Updated FX rate: USD → {currency} = {rate}")
            else:
                db.add(FxRate(base_currency="USD", target_currency=currency, rate=rate))
                print(f"  Created FX rate: USD → {currency} = {rate}")

        # --- FX Liquidity ---
        for currency, amount in LIQUIDITY.items():
            existing = db.query(FxLiquidity).filter(FxLiquidity.currency == currency).first()
            if existing:
                existing.available_amount = amount
                print(f"  Updated liquidity: {currency} = {amount:,}")
            else:
                db.add(FxLiquidity(currency=currency, available_amount=amount, reserved_amount=0))
                print(f"  Created liquidity: {currency} = {amount:,}")

        db.commit()
        print("\n✅ Seed complete!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
