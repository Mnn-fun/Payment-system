from app.database import engine, Base

import app.models.user
import app.models.account
import app.models.fx_lot
import app.models.transaction
import app.models.ledger_entry
import app.models.fx_liquidity
import app.models.idempotency_key
import app.models.user_settings
import app.models.fx_rate
import app.models.card
import app.models.card_otp
import app.models.linked_account
import app.models.contact
import app.models.signup_otp
import app.models.two_factor_otp
import app.models.backup_code
import app.models.fx_quote

print("Dropping all tables...")
Base.metadata.drop_all(bind=engine)
print("Creating all tables...")
Base.metadata.create_all(bind=engine)
print("Database has been completely reset.")
