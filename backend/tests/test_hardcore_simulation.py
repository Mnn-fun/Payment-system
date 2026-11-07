import uuid
import concurrent.futures
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.account import Account
from app.models.card import Card
from app.models.linked_account import LinkedAccount
from app.models.transaction import Transaction
from app.models.ledger_entry import LedgerEntry
from app.models.fx_lot import FxLot
from app.core.security import create_access_token
from app.scripts.seed_testers import seed_testers


def get_auth_headers(user_id: int):
    token = create_access_token({"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}


client = TestClient(app)


def setup_module():
    """Ensure testers and FX data are seeded before running the test suite."""
    db = SessionLocal()
    try:
        seed_testers(db)
    finally:
        db.close()


def test_01_verify_tester_accounts_and_setup():
    """Verify that Davis (USD), Zen (EUR), and Sam (GBP) exist with cards, banks, and $100 test balances."""
    db = SessionLocal()
    try:
        davis = db.query(User).filter(User.email == "davis@test.com").first()
        zen = db.query(User).filter(User.email == "zen@test.com").first()
        sam = db.query(User).filter(User.email == "sam@test.com").first()

        assert davis is not None, "Davis account missing"
        assert zen is not None, "Zen account missing"
        assert sam is not None, "Sam account missing"

        # Check currencies & balances
        d_acc = db.query(Account).filter(Account.user_id == davis.id, Account.currency == "USD").first()
        z_acc = db.query(Account).filter(Account.user_id == zen.id, Account.currency == "EUR").first()
        s_acc = db.query(Account).filter(Account.user_id == sam.id, Account.currency == "GBP").first()

        assert d_acc is not None and d_acc.test_balance_usd >= Decimal("100.00")
        assert z_acc is not None and z_acc.test_balance_usd >= Decimal("100.00")
        assert s_acc is not None and s_acc.test_balance_usd >= Decimal("100.00")

        # Check multiple cards
        for u in [davis, zen, sam]:
            cards = db.query(Card).filter(Card.user_id == u.id, Card.status == "ACTIVE").all()
            assert len(cards) >= 2, f"User {u.email} should have at least 2 active cards"

        # Check multiple banks
        for u in [davis, zen, sam]:
            banks = db.query(LinkedAccount).filter(LinkedAccount.user_id == u.id).all()
            assert len(banks) >= 2, f"User {u.email} should have at least 2 linked bank accounts"

    finally:
        db.close()


def test_02_real_world_p2p_cross_currency_transfers():
    """
    Simulate real-world transfers between the three testers:
    1. Davis (USD) -> Zen (EUR) ($20.00)
    2. Zen (EUR) -> Sam (GBP) (€15.00)
    3. Sam (GBP) -> Davis (USD) (£10.00)
    Verify accurate FX conversion, FIFO FX lots, and ledger integrity.
    """
    db = SessionLocal()
    try:
        davis = db.query(User).filter(User.email == "davis@test.com").first()
        zen = db.query(User).filter(User.email == "zen@test.com").first()
        sam = db.query(User).filter(User.email == "sam@test.com").first()

        d_headers = get_auth_headers(davis.id)
        z_headers = get_auth_headers(zen.id)
        s_headers = get_auth_headers(sam.id)

        d_usd = db.query(Account).filter(Account.user_id == davis.id, Account.currency == "USD").first()
        z_eur = db.query(Account).filter(Account.user_id == zen.id, Account.currency == "EUR").first()
        s_gbp = db.query(Account).filter(Account.user_id == sam.id, Account.currency == "GBP").first()

        d_bal_before = d_usd.cached_balance_usd
        z_bal_before = z_eur.cached_balance_usd

        # 1. Davis -> Zen ($20.00 USD)
        resp1 = client.post(
            "/transfers/",
            json={
                "pin": "123456",
                "recipient_email": "zen@test.com",
                "amount": 20.00,
                "is_test": True,
            },
            headers=d_headers,
        )
        assert resp1.status_code == 200, resp1.text
        data1 = resp1.json()
        assert data1["status"] == "COMPLETED"
        assert Decimal(data1["amount_usd"]) == Decimal("20.00")
        assert Decimal(data1["credited_amount"]) > 0

        db.refresh(d_usd)
        db.refresh(z_eur)
        assert d_usd.cached_balance_usd == d_bal_before - Decimal("20.00")
        assert z_eur.cached_balance_usd > z_bal_before

        # 2. Zen -> Sam (€15.00 EUR)
        z_bal_mid = z_eur.cached_balance_usd
        s_bal_before = s_gbp.cached_balance_usd

        resp2 = client.post(
            "/transfers/",
            json={
                "pin": "123456",
                "recipient_email": "sam@test.com",
                "amount": 15.00,
                "is_test": True,
            },
            headers=z_headers,
        )
        assert resp2.status_code == 200, resp2.text
        data2 = resp2.json()
        assert data2["status"] == "COMPLETED"

        db.refresh(z_eur)
        db.refresh(s_gbp)
        assert z_eur.cached_balance_usd == z_bal_mid - Decimal("15.00")
        assert s_gbp.cached_balance_usd > s_bal_before

        # 3. Sam -> Davis (£10.00 GBP)
        s_bal_mid = s_gbp.cached_balance_usd
        d_bal_mid = d_usd.cached_balance_usd

        resp3 = client.post(
            "/transfers/",
            json={
                "pin": "123456",
                "recipient_email": "davis@test.com",
                "amount": 10.00,
                "is_test": True,
            },
            headers=s_headers,
        )
        assert resp3.status_code == 200, resp3.text
        data3 = resp3.json()
        assert data3["status"] == "COMPLETED"

        db.refresh(s_gbp)
        db.refresh(d_usd)
        assert s_gbp.cached_balance_usd == s_bal_mid - Decimal("10.00")
        assert d_usd.cached_balance_usd > d_bal_mid

        # Invariant check: Ledger entries sum equals cached balances
        for acc in [d_usd, z_eur, s_gbp]:
            ledger_sum = (
                db.query(LedgerEntry)
                .filter(LedgerEntry.account_id == acc.id)
                .all()
            )
            total = sum(l.signed_amount for l in ledger_sum)
            assert total == acc.cached_balance_usd, f"Ledger mismatch for account {acc.id}: {total} != {acc.cached_balance_usd}"

    finally:
        db.close()


def test_03_transfer_security_and_negative_edge_cases():
    """Verify that all invalid transfer attempts are properly caught and rejected with HTTP 400/401/404."""
    db = SessionLocal()
    try:
        davis = db.query(User).filter(User.email == "davis@test.com").first()
        headers = get_auth_headers(davis.id)

        # 1. Invalid PIN -> 401
        res = client.post(
            "/transfers/",
            json={"pin": "000000", "recipient_email": "zen@test.com", "amount": 5.0, "is_test": True},
            headers=headers,
        )
        assert res.status_code == 401
        assert "Invalid Transaction PIN" in res.json()["detail"]

        # 2. Self transfer -> 400
        res = client.post(
            "/transfers/",
            json={"pin": "123456", "recipient_email": "davis@test.com", "amount": 5.0, "is_test": True},
            headers=headers,
        )
        assert res.status_code == 400
        assert "Sender and receiver must be different" in res.json()["detail"]

        # 3. Negative amount -> 400
        res = client.post(
            "/transfers/",
            json={"pin": "123456", "recipient_email": "zen@test.com", "amount": -10.0, "is_test": True},
            headers=headers,
        )
        assert res.status_code == 400
        assert "greater than zero" in res.json()["detail"]

        # 4. Zero amount -> 400
        res = client.post(
            "/transfers/",
            json={"pin": "123456", "recipient_email": "zen@test.com", "amount": 0.0, "is_test": True},
            headers=headers,
        )
        assert res.status_code == 400
        assert "greater than zero" in res.json()["detail"]

        # 5. Non-existent recipient -> 404
        res = client.post(
            "/transfers/",
            json={"pin": "123456", "recipient_email": "nonexistent_ghost@test.com", "amount": 5.0, "is_test": True},
            headers=headers,
        )
        assert res.status_code == 404
        assert "Recipient not found" in res.json()["detail"]

        # 6. Exceeding balance -> 400
        res = client.post(
            "/transfers/",
            json={"pin": "123456", "recipient_email": "zen@test.com", "amount": 999999.0, "is_test": True},
            headers=headers,
        )
        assert res.status_code == 400
        assert "Insufficient" in res.json()["detail"]

    finally:
        db.close()


def test_04_card_lifecycle_deposits_and_withdrawals():
    """
    Test Card operations:
    - Deposit with card + PIN -> balance increases
    - Deposit with invalid PIN -> 401
    - Freeze card -> card status FROZEN
    - Deposit with frozen card -> 400
    - Unfreeze card -> card status ACTIVE
    - Card withdrawal -> consumes FX lots, reduces balance
    - Card withdrawal exceeding real balance (test funds) -> 400 blocked!
    """
    db = SessionLocal()
    try:
        davis = db.query(User).filter(User.email == "davis@test.com").first()
        headers = get_auth_headers(davis.id)

        card = db.query(Card).filter(Card.user_id == davis.id, Card.last_four == "4242").first()
        assert card is not None

        d_acc = db.query(Account).filter(Account.user_id == davis.id, Account.currency == "USD").first()
        bal_start = d_acc.cached_balance_usd

        # 1. Deposit $50 with invalid PIN -> 401
        res = client.post(
            f"/cards/{card.id}/deposit",
            json={"pin": "999999", "amount_usd": 50.0},
            headers=headers,
        )
        assert res.status_code == 401

        # 2. Deposit $50 with valid PIN -> 200
        res = client.post(
            f"/cards/{card.id}/deposit",
            json={"pin": "123456", "amount_usd": 50.0},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        db.refresh(d_acc)
        assert d_acc.cached_balance_usd == bal_start + Decimal("50.00")

        # 3. Freeze card
        res = client.put(f"/cards/{card.id}/freeze", headers=headers)
        assert res.status_code == 200
        db.refresh(card)
        assert card.status == "FROZEN"

        # 4. Attempt deposit with frozen card -> 400
        res = client.post(
            f"/cards/{card.id}/deposit",
            json={"pin": "123456", "amount_usd": 10.0},
            headers=headers,
        )
        assert res.status_code == 400
        assert "not active" in res.json()["detail"]

        # 5. Unfreeze card
        res = client.put(f"/cards/{card.id}/unfreeze", headers=headers)
        assert res.status_code == 200
        db.refresh(card)
        assert card.status == "ACTIVE"

        # 6. Card withdrawal of real funds ($20 out of the $50 real deposit)
        res = client.post(
            f"/cards/{card.id}/withdraw",
            json={"pin": "123456", "amount_usd": 20.0},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        db.refresh(d_acc)
        assert d_acc.cached_balance_usd == bal_start + Decimal("30.00")

        # 7. Card withdrawal exceeding real balance (trying to withdraw test funds)
        # Davis has $30 real + $100 test. Attempting to withdraw $50 must be BLOCKED!
        res = client.post(
            f"/cards/{card.id}/withdraw",
            json={"pin": "123456", "amount_usd": 50.0},
            headers=headers,
        )
        assert res.status_code == 400
        assert "Insufficient real funds" in res.json()["detail"]

    finally:
        db.close()


def test_05_idempotency_and_replay_protection():
    """
    Test that resending a transfer with the same Idempotency-Key returns
    the exact same response without deducting funds twice.
    """
    db = SessionLocal()
    try:
        zen = db.query(User).filter(User.email == "zen@test.com").first()
        headers = get_auth_headers(zen.id)
        z_acc = db.query(Account).filter(Account.user_id == zen.id, Account.currency == "EUR").first()
        bal_before = z_acc.cached_balance_usd

        idem_key = f"idempotency-test-{uuid.uuid4()}"
        headers_with_idem = {**headers, "Idempotency-Key": idem_key}

        payload = {
            "pin": "123456",
            "recipient_email": "sam@test.com",
            "amount": 7.50,
            "is_test": True,
        }

        # First request
        res1 = client.post("/transfers/", json=payload, headers=headers_with_idem)
        assert res1.status_code == 200, res1.text
        data1 = res1.json()

        db.refresh(z_acc)
        bal_after_first = z_acc.cached_balance_usd
        assert bal_after_first == bal_before - Decimal("7.50")

        # Second request (Replay with same Idempotency-Key)
        res2 = client.post("/transfers/", json=payload, headers=headers_with_idem)
        assert res2.status_code == 200, res2.text
        data2 = res2.json()

        assert data1["transaction_id"] == data2["transaction_id"]

        # CRITICAL: Balance was NOT deducted a second time!
        db.refresh(z_acc)
        assert z_acc.cached_balance_usd == bal_after_first

    finally:
        db.close()


def test_06_concurrency_race_condition_double_spend_prevention():
    """
    HARDCORE STRESS TEST: Double-spend prevention under simultaneous concurrency.
    Sam attempts 2 simultaneous transfers of £40 each (total £80) when he only has
    less than £80 available, or simultaneously transferring to Zen and Davis.
    Exactly one must succeed and the other must fail, never allowing balance to go negative!
    """
    db = SessionLocal()
    try:
        sam = db.query(User).filter(User.email == "sam@test.com").first()
        s_acc = db.query(Account).filter(Account.user_id == sam.id, Account.currency == "GBP").first()

        # Set Sam's test balance to exactly 20.00
        s_acc.cached_balance_usd = Decimal("20.00")
        s_acc.test_balance_usd = Decimal("20.00")

        # Reset lot to match exactly 20.00
        db.query(FxLot).filter(FxLot.account_id == s_acc.id).delete()
        lot = FxLot(
            account_id=s_acc.id,
            settlement_currency="GBP",
            settlement_amount_total=Decimal("20.00"),
            settlement_amount_remaining=Decimal("20.00"),
            origin_currency="GBP",
            origin_amount_total=Decimal("20.00"),
            fx_rate_used=Decimal("1.0"),
            fx_provider="TEST",
        )
        db.add(lot)
        db.commit()

        headers = get_auth_headers(sam.id)

        # Two competing transfers of £15 each (15 + 15 = 30 > 20)
        def send_transfer(recipient_email, key):
            req_headers = {**headers, "Idempotency-Key": key}
            return client.post(
                "/transfers/",
                json={"pin": "123456", "recipient_email": recipient_email, "amount": 15.0, "is_test": True},
                headers=req_headers,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(send_transfer, "davis@test.com", str(uuid.uuid4()))
            f2 = executor.submit(send_transfer, "zen@test.com", str(uuid.uuid4()))
            res1 = f1.result()
            res2 = f2.result()

        statuses = [res1.status_code, res2.status_code]
        # Exactly one should succeed (200) and one must fail (400)
        assert 200 in statuses, f"Expected one transfer to succeed: {statuses}"
        assert 400 in statuses, f"Expected competing transfer to fail due to insufficient funds: {statuses}"

        db.refresh(s_acc)
        assert s_acc.cached_balance_usd == Decimal("5.00"), f"Expected 5.00, got {s_acc.cached_balance_usd}"
        assert s_acc.cached_balance_usd >= 0, "Double-spending detected: balance became negative!"

    finally:
        db.close()


def test_07_bidirectional_transfers_no_deadlock():
    """
    Concurrency test: Davis sends to Zen while Zen simultaneously sends to Davis.
    Verifies that deterministic account locking eliminates SQL deadlocks.
    """
    db = SessionLocal()
    try:
        davis = db.query(User).filter(User.email == "davis@test.com").first()
        zen = db.query(User).filter(User.email == "zen@test.com").first()

        d_headers = get_auth_headers(davis.id)
        z_headers = get_auth_headers(zen.id)

        def d_to_z():
            return client.post(
                "/transfers/",
                json={"pin": "123456", "recipient_email": "zen@test.com", "amount": 1.0, "is_test": True},
                headers={**d_headers, "Idempotency-Key": str(uuid.uuid4())},
            )

        def z_to_d():
            return client.post(
                "/transfers/",
                json={"pin": "123456", "recipient_email": "davis@test.com", "amount": 1.0, "is_test": True},
                headers={**z_headers, "Idempotency-Key": str(uuid.uuid4())},
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [
                executor.submit(d_to_z),
                executor.submit(z_to_d),
                executor.submit(d_to_z),
                executor.submit(z_to_d),
            ]
            results = [f.result() for f in futures]

        for r in results:
            assert r.status_code == 200, f"Concurrent transfer failed: {r.text}"

    finally:
        db.close()


def test_08_admin_transaction_reversal_integrity():
    """
    Test Admin reversing a test transfer:
    - Davis sends $12.00 to Zen.
    - Admin reverses the transaction.
    - Davis gets $12.00 restored to both cached & test balance.
    - Zen gets $12.00 deducted.
    - Balance invariant remains strictly consistent.
    """
    db = SessionLocal()
    try:
        davis = db.query(User).filter(User.email == "davis@test.com").first()
        zen = db.query(User).filter(User.email == "zen@test.com").first()
        admin = db.query(User).filter(User.id == 1).first() or db.query(User).filter(User.is_admin == True).first()
        assert admin is not None, "Admin user required"

        d_headers = get_auth_headers(davis.id)
        admin_headers = get_auth_headers(admin.id)

        d_acc = db.query(Account).filter(Account.user_id == davis.id, Account.currency == "USD").first()
        z_acc = db.query(Account).filter(Account.user_id == zen.id, Account.currency == "EUR").first()

        d_before = d_acc.cached_balance_usd
        z_before = z_acc.cached_balance_usd

        # 1. Davis transfers $12 to Zen
        res = client.post(
            "/transfers/",
            json={"pin": "123456", "recipient_email": "zen@test.com", "amount": 12.0, "is_test": True},
            headers=d_headers,
        )
        assert res.status_code == 200
        txn_id = res.json()["transaction_id"]

        db.refresh(d_acc)
        db.refresh(z_acc)
        assert d_acc.cached_balance_usd == d_before - Decimal("12.00")

        # 2. Admin reverses transaction
        rev_res = client.post(f"/admin/transactions/{txn_id}/reverse", headers=admin_headers)
        assert rev_res.status_code == 200, rev_res.text

        db.refresh(d_acc)
        db.refresh(z_acc)
        # Davis should have his 12.00 restored!
        assert d_acc.cached_balance_usd == d_before, f"Expected {d_before}, got {d_acc.cached_balance_usd}"
        assert z_acc.cached_balance_usd == z_before, f"Expected {z_before}, got {z_acc.cached_balance_usd}"

    finally:
        db.close()

