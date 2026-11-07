from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    contact_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Prevent saving the same contact multiple times for a single user
    __table_args__ = (
        UniqueConstraint('user_id', 'contact_user_id', name='uq_user_contact'),
    )

    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="saved_contacts")
    contact_user = relationship("User", foreign_keys=[contact_user_id])
