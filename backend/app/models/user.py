from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.linked_account import LinkedAccount


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)  # Allow null for OAuth users
    google_id = Column(String, unique=True, nullable=True, index=True)  # Google OAuth ID
    is_admin = Column(Boolean, default=False)
    admin_role = Column(String, nullable=True) # e.g., 'superadmin', 'finance', 'support'

    # Profile fields
    full_name = Column(String, nullable=True)
    username = Column(String, unique=True, nullable=True, index=True)
    bio = Column(String, nullable=True)
    phone_number = Column(String(20), nullable=True)
    hashed_pin = Column(String, nullable=True)  # 6-digit transaction PIN

    # Relationships
    linked_accounts = relationship("LinkedAccount", back_populates="user", cascade="all, delete-orphan")
