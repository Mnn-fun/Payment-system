from sqlalchemy import Column, Integer, Boolean, ForeignKey, String
from app.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)

    # Notification preferences
    notify_security = Column(Boolean, default=True, nullable=False)
    notify_transactions = Column(Boolean, default=True, nullable=False)
    notify_marketing = Column(Boolean, default=False, nullable=False)
    notify_weekly = Column(Boolean, default=True, nullable=False)

    # Security
    two_factor_enabled = Column(Boolean, default=False, nullable=False)
    totp_secret = Column(String, nullable=True)  # Secret key for Google Authenticator
