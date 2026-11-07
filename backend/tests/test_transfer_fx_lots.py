import uuid
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.user import User
from app.models.account import Account
from app.models.fx_lot import FxLot
from app.models.ledger_entry import LedgerEntry
from app.services.transfer_service import TransferService


def make_session():
    # isolated in-memory DB for tests
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_transfer_single_lot_moves_fx_lot():
    db = make_session()

    # create users and accounts
    alice = User(email="alice@test", hashed_password="x")
    bob = User(email="bob@test", hashed_password="x")
    db.add_all([alice, bob])
    db.commit()
    db.refresh(alice)
    db.refresh(bob)

    acct_a = Account(user_id=alice.id, currency="USD", status="ACTIVE", cached_balance_usd=Decimal("100"))
    acct_b = Account(user_id=bob.id, currency="USD", status="ACTIVE", cached_balance_usd=Decimal("0"))
    db.add_all([acct_a, acct_b])
    db.commit()
    db.refresh(acct_a)
    db.refresh(acct_b)

    # create a single fx lot for alice
    lot = FxLot(
        account_id=acct_a.id,
        settlement_currency="USD",
        settlement_amount_total=Decimal("100"),
        settlement_amount_remaining=Decimal("100"),
        origin_currency="USD",
        origin_amount_total=Decimal("100"),
        fx_rate_used=Decimal("1.0"),
        fx_provider="TEST",
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)

    svc = TransferService(db)
    idem = str(uuid.uuid4())
    res = svc.transfer(from_user_id=alice.id, to_user_id=bob.id, amount_usd=Decimal("25.50"), idempotency_key=idem)

    # assertions
    assert res["status"] in ("COMPLETED", "SUCCESS")
    # sender lot remaining should be reduced
    l = db.query(FxLot).filter(FxLot.id == lot.id).one()
    assert l.settlement_amount_remaining == Decimal("74.5")

    # receiver should have a new lot of 25.5
    new_lots = db.query(FxLot).filter(FxLot.account_id == acct_b.id).all()
    assert len(new_lots) == 1
    assert new_lots[0].settlement_amount_total == Decimal("25.5")
    assert new_lots[0].settlement_amount_remaining == Decimal("25.5")

    # ledger entries: there should be 2 entries for the transaction
    entries = db.query(LedgerEntry).filter(LedgerEntry.transaction_id == res["transaction_id"]).all()
    assert len(entries) >= 2

    # balances updated
    a = db.query(Account).get(acct_a.id)
    b = db.query(Account).get(acct_b.id)
    assert a.cached_balance_usd == Decimal("74.5")
    assert b.cached_balance_usd == Decimal("25.5")


def test_transfer_spans_multiple_lots():
    db = make_session()

    # create users and accounts
    alice = User(email="alice2@test", hashed_password="x")
    bob = User(email="bob2@test", hashed_password="x")
    db.add_all([alice, bob])
    db.commit()
    db.refresh(alice)
    db.refresh(bob)

    acct_a = Account(user_id=alice.id, currency="USD", status="ACTIVE", cached_balance_usd=Decimal("30"))
    acct_b = Account(user_id=bob.id, currency="USD", status="ACTIVE", cached_balance_usd=Decimal("0"))
    db.add_all([acct_a, acct_b])
    db.commit()
    db.refresh(acct_a)
    db.refresh(acct_b)

    # create two lots for alice: 10 and 20
    lot1 = FxLot(
        account_id=acct_a.id,
        settlement_currency="USD",
        settlement_amount_total=Decimal("10"),
        settlement_amount_remaining=Decimal("10"),
        origin_currency="USD",
        origin_amount_total=Decimal("10"),
        fx_rate_used=Decimal("1.0"),
        fx_provider="TEST",
    )
    lot2 = FxLot(
        account_id=acct_a.id,
        settlement_currency="USD",
        settlement_amount_total=Decimal("20"),
        settlement_amount_remaining=Decimal("20"),
        origin_currency="USD",
        origin_amount_total=Decimal("20"),
        fx_rate_used=Decimal("1.0"),
        fx_provider="TEST",
    )
    db.add_all([lot1, lot2])
    db.commit()
    db.refresh(lot1)
    db.refresh(lot2)

    svc = TransferService(db)
    idem = str(uuid.uuid4())
    res = svc.transfer(from_user_id=alice.id, to_user_id=bob.id, amount_usd=Decimal("25"), idempotency_key=idem)

    assert res["status"] in ("COMPLETED", "SUCCESS")

    # lots should be updated: lot1 remaining 0, lot2 remaining 5
    l1 = db.query(FxLot).get(lot1.id)
    l2 = db.query(FxLot).get(lot2.id)
    assert l1.settlement_amount_remaining == Decimal("0")
    assert l2.settlement_amount_remaining == Decimal("5")

    # receiver should have created lots summing to 25
    new_lots = db.query(FxLot).filter(FxLot.account_id == acct_b.id).all()
    total = sum([n.settlement_amount_total for n in new_lots])
    assert total == Decimal("25")

    a = db.query(Account).get(acct_a.id)
    b = db.query(Account).get(acct_b.id)
    assert a.cached_balance_usd == Decimal("5")
    assert b.cached_balance_usd == Decimal("25")
