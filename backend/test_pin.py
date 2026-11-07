if __name__ == "__main__":
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.user import User

    engine = create_engine("sqlite:///payment.db")
    Session = sessionmaker(bind=engine)
    session = Session()

    user = session.query(User).first()
    if user:
        print(f"User: {user.email}")
        print(f"Hashed PIN: {user.hashed_pin}")
    else:
        print("No user")
