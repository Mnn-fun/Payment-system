from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from app.database import Base


class BackupCode(Base):
    __tablename__ = "backup_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String(8), nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
