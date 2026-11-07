"""
Seed script: creates 3 tester accounts (Davis, Zen, Sam) with:
- Different currencies (Davis: USD, Zen: EUR, Sam: GBP)
- $100 test balance each (with backing FxLots, LedgerEntries, and Transactions)
- Multiple verified payment cards each (Visa, Mastercard, Amex, etc.)
- Multiple linked bank accounts each (Checking, Savings with IBAN/Account numbers)
- Transaction PIN '123456' set and verified
- Password 'TestPassword123!' set and hashed

Run:
    python -m app.scripts.seed_testers
"""

import sys
import os
from decimal import Decimal
from datetime import datetime, timezone, timedelta

# Ensure the backend root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.database import SessionLocal, engine, Base
from app.core.security import hash_password
from app.models.user import User
from app.models.user_settings import UserSettings
from app.models.account import Account
from app.models.card import Card
from app.models.card_otp import CardOTP
from app.models.linked_account import LinkedAccount
from app.models.transaction import Transaction
from app.models.ledger_entry import LedgerEntry
from app.models.fx_lot import FxLot
from app.models.contact import Contact


TESTERS = [
    {
        "name": "Davis",
        "full_name": "Davis Miller",
        "username": "davis",
        "email": "davis@test.com",
        "phone": "+12025550101",
        "currency": "USD",
        "cards": [
            {
                "cardholder_name": "Davis Miller",
                "last_four": "4242",
                "card_network": "VISA",
                "expiry_month": "12",
                "expiry_year": "2028",
                "status": "ACTIVE",
            },
            {
                "cardholder_name": "Davis Miller",
                "last_four": "5555",
                "card_network": "MASTERCARD",
                "expiry_month": "08",
                "expiry_year": "2029",
                "status": "ACTIVE",
            },
        ],
        "banks": [
            {
                "name": "Chase Bank",
                "account_type": "Checking",
                "account_number": "US9827364510",
            },
            {
                "name": "Wells Fargo",
                "account_type": "Savings",
                "account_number": "US1928374650",
            },
        ],
    },
    {
        "name": "Zen",
        "full_name": "Zen Tanaka",
        "username": "zen",
        "email": "zen@test.com",
        "phone": "+4915123456789",
        "currency": "EUR",
        "cards": [
            {
                "cardholder_name": "Zen Tanaka",
                "last_four": "4000",
                "card_network": "VISA",
                "expiry_month": "06",
                "expiry_year": "2027",
                "status": "ACTIVE",
            },
            {
                "cardholder_name": "Zen Tanaka",
                "last_four": "3782",
                "card_network": "AMEX",
                "expiry_month": "11",
                "expiry_year": "2030",
                "status": "ACTIVE",
            },
        ],
        "banks": [
            {
                "name": "Deutsche Bank",
                "account_type": "Checking",
                "account_number": "DE89370400440532013000",
            },
            {
                "name": "BNP Paribas",
                "account_type": "Savings",
                "account_number": "FR7630006000011234567890189",
            },
        ],
    },
    {
        "name": "Sam",
        "full_name": "Sam Wilson",
        "username": "sam",
        "email": "sam@test.com",
        "phone": "+447911123456",
        "currency": "GBP",
        "cards": [
            {
                "cardholder_name": "Sam Wilson",
                "last_four": "5105",
                "card_network": "MASTERCARD",
                "expiry_month": "04",
                "expiry_year": "2028",
                "status": "ACTIVE",
            },
            {
                "cardholder_name": "Sam Wilson",
                "last_four": "6011",
                "card_network": "DISCOVER",
                "expiry_month": "09",
                "expiry_year": "2029",
                "status": "ACTIVE",
            },
        ],
        "banks": [
            {
                "name": "Barclays Current Account",
                "account_type": "Checking",
                "account_number": "GB29BARC20041530234567",
            },
            {
                "name": "HSBC Premier Savings",
                "account_type": "Savings",
                "account_number": "GB09MIDL40051512345678",
            },
        ],
    },
]


def seed_testers(db=None):
    close_when_done = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        close_when_done = True

    try:
        common_password_hash = hash_password("TestPassword123!")
        common_pin_hash = hash_password("123456")

        created_users = {}

        for t in TESTERS:
            # Check or update existing user
            user = db.query(User).filter(User.email == t["email"]).first()
            if not user:
                user = User(
                    email=t["email"],
                    hashed_password=common_password_hash,
                    full_name=t["full_name"],
                    username=t["username"],
                    phone_number=t["phone"],
                    hashed_pin=common_pin_hash,
                )
                db.add(user)
                db.flush()
                print(f"Created user {t['name']} ({t['email']}) [ID: {user.id}]")
            else:
                user.full_name = t["full_name"]
                user.username = t["username"]
                user.phone_number = t["phone"]
                user.hashed_password = common_password_hash
                user.hashed_pin = common_pin_hash
                db.flush()
                print(f"Updated user {t['name']} ({t['email']}) [ID: {user.id}]")

            created_users[t["name"]] = user

            # UserSettings
            settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
            if not settings:
                settings = UserSettings(user_id=user.id, notify_security=True, notify_transactions=True)
                db.add(settings)
                db.flush()

            # Primary Currency Account
            account = db.query(Account).filter(Account.user_id == user.id, Account.currency == t["currency"]).first()
            if not account:
                account = Account(
                    user_id=user.id,
                    currency=t["currency"],
                    status="ACTIVE",
                    cached_balance_usd=Decimal("100.00"),
                    test_balance_usd=Decimal("100.00"),
                )
                db.add(account)
                db.flush()
                print(f"  Created {t['currency']} account [ID: {account.id}] with $100 test balance")
            else:
                account.cached_balance_usd = Decimal("100.00")
                account.test_balance_usd = Decimal("100.00")
                account.status = "ACTIVE"
                db.flush()
                print(f"  Reset {t['currency']} account [ID: {account.id}] to $100 test balance")

            # Also create USD account if primary is not USD (for seamless multi-currency support)
            if t["currency"] != "USD":
                usd_account = db.query(Account).filter(Account.user_id == user.id, Account.currency == "USD").first()
                if not usd_account:
                    usd_account = Account(
                        user_id=user.id,
                        currency="USD",
                        status="ACTIVE",
                        cached_balance_usd=Decimal("100.00"),
                        test_balance_usd=Decimal("100.00"),
                    )
                    db.add(usd_account)
                    db.flush()
                    print(f"  Created USD secondary account [ID: {usd_account.id}] with $100 test balance")
                else:
                    usd_account.cached_balance_usd = Decimal("100.00")
                    usd_account.test_balance_usd = Decimal("100.00")
                    db.flush()

            # Clean old ledger entries and lots for fresh state
            db.query(LedgerEntry).filter(LedgerEntry.account_id == account.id).delete()
            db.query(FxLot).filter(FxLot.account_id == account.id).delete()
            db.flush()

            init_txn = (
                db.query(Transaction)
                .filter(Transaction.user_id == user.id, Transaction.type == "TEST_BALANCE_GRANT")
                .first()
            )
            if not init_txn:
                init_txn = Transaction(
                    user_id=user.id,
                    type="TEST_BALANCE_GRANT",
                    status="COMPLETED",
                    reference="TEST-INIT-GRANT-100",
                    payment_method="SYSTEM",
                    is_test=True,
                )
                db.add(init_txn)
                db.flush()

            fx_lot = FxLot(
                account_id=account.id,
                settlement_currency=account.currency,
                settlement_amount_total=Decimal("100.00"),
                settlement_amount_remaining=Decimal("100.00"),
                origin_currency=account.currency,
                origin_amount_total=Decimal("100.00"),
                fx_rate_used=Decimal("1.0"),
                fx_provider="SANDBOX",
            )
            db.add(fx_lot)
            db.flush()

            ledger = LedgerEntry(
                account_id=account.id,
                currency=account.currency,
                signed_amount=Decimal("100.00"),
                fx_lot_id=fx_lot.id,
                transaction_id=init_txn.id,
                entry_type="CREDIT",
            )
            db.add(ledger)
            db.flush()

            # Seed Cards
            for c in t["cards"]:
                card = (
                    db.query(Card)
                    .filter(
                        Card.user_id == user.id,
                        Card.last_four == c["last_four"],
                        Card.card_network == c["card_network"],
                    )
                    .first()
                )
                if not card:
                    card = Card(
                        user_id=user.id,
                        cardholder_name=c["cardholder_name"],
                        last_four=c["last_four"],
                        card_network=c["card_network"],
                        expiry_month=c["expiry_month"],
                        expiry_year=c["expiry_year"],
                        hashed_cvv=common_password_hash,
                        phone_number=t["phone"],
                        status=c["status"],
                    )
                    db.add(card)
                    db.flush()
                    print(f"  Added {c['card_network']} Card ending in {c['last_four']} ({c['status']})")

            # Seed Linked Bank Accounts
            for b in t["banks"]:
                bank = (
                    db.query(LinkedAccount)
                    .filter(
                        LinkedAccount.user_id == user.id,
                        LinkedAccount.account_number == b["account_number"],
                    )
                    .first()
                )
                if not bank:
                    bank = LinkedAccount(
                        user_id=user.id,
                        name=b["name"],
                        account_type=b["account_type"],
                        account_number=b["account_number"],
                    )
                    db.add(bank)
                    db.flush()
                    print(f"  Linked Bank: {b['name']} ({b['account_type']} #{b['account_number']})")

        # Save each other as mutual contacts / saved recipients
        user_list = list(created_users.values())
        for u1 in user_list:
            for u2 in user_list:
                if u1.id != u2.id:
                    existing_contact = db.query(Contact).filter(Contact.user_id == u1.id, Contact.contact_user_id == u2.id).first()
                    if not existing_contact:
                        db.add(Contact(user_id=u1.id, contact_user_id=u2.id))

        db.commit()
        print("\n✅ All 3 tester accounts successfully seeded & configured!")
        return created_users
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding testers: {e}")
        raise
    finally:
        if close_when_done:
            db.close()


if __name__ == "__main__":
    seed_testers()
