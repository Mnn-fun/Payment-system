from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import verify_password, hash_password
from app.models.user import User
from app.models.user_settings import UserSettings
from app.models.backup_code import BackupCode
import secrets
import string
import pyotp

router = APIRouter(prefix="/settings", tags=["Settings"])


# ===============================
# Schemas
# ===============================

class ProfileResponse(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: str
    bio: Optional[str] = None
    phone_number: Optional[str] = None
    is_admin: bool = False


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    bio: Optional[str] = None
    phone_number: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class NotificationsResponse(BaseModel):
    notify_security: bool = True
    notify_transactions: bool = True
    notify_marketing: bool = False
    notify_weekly: bool = True
    two_factor_enabled: bool = False


class NotificationsUpdateRequest(BaseModel):
    notify_security: Optional[bool] = None
    notify_transactions: Optional[bool] = None
    notify_marketing: Optional[bool] = None
    notify_weekly: Optional[bool] = None
    # two_factor_enabled MUST be set via /settings/2fa/enable or disabled explicitly

class VerifyTOTPRequest(BaseModel):
    code: str


# ===============================
# Helper: get or create settings
# ===============================

def get_or_create_settings(user_id: int, db: Session) -> UserSettings:
    settings = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


# ===============================
# Profile
# ===============================

@router.get("/profile")
def get_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile"""
    # User ID 1 is always treated as admin (matches admin route logic)
    effective_admin = current_user.is_admin or current_user.id == 1

    return {
        "full_name": current_user.full_name or "",
        "username": current_user.username or "",
        "email": current_user.email,
        "bio": current_user.bio or "",
        "phone_number": current_user.phone_number or "",
        "is_admin": effective_admin,
    }


@router.put("/profile")
def update_profile(
    data: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update current user's profile"""
    # Check username uniqueness if changing
    if data.username and data.username != current_user.username:
        existing = db.query(User).filter(
            User.username == data.username,
            User.id != current_user.id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")

    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.username is not None:
        current_user.username = data.username
    if data.bio is not None:
        current_user.bio = data.bio
    if data.phone_number is not None:
        current_user.phone_number = data.phone_number

    db.commit()
    db.refresh(current_user)

    # User ID 1 is always treated as admin (matches admin route logic)
    effective_admin = current_user.is_admin or current_user.id == 1

    return {
        "full_name": current_user.full_name or "",
        "username": current_user.username or "",
        "email": current_user.email,
        "bio": current_user.bio or "",
        "phone_number": current_user.phone_number or "",
        "is_admin": effective_admin,
    }


# ===============================
# Password
# ===============================

@router.put("/password")
def change_password(
    data: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change user's password"""
    # OAuth-only users can't change password (they don't have one)
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="Password change is not available for Google OAuth accounts",
        )

    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")

    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters"
        )

    current_user.hashed_password = hash_password(data.new_password)
    db.commit()

    return {"message": "Password updated successfully"}


# ===============================
# Notifications
# ===============================

@router.get("/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get notification preferences"""
    settings = get_or_create_settings(current_user.id, db)
    return {
        "notify_security": settings.notify_security,
        "notify_transactions": settings.notify_transactions,
        "notify_marketing": settings.notify_marketing,
        "notify_weekly": settings.notify_weekly,
        "two_factor_enabled": settings.two_factor_enabled,
    }


@router.put("/notifications")
def update_notifications(
    data: NotificationsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update notification preferences"""
    settings = get_or_create_settings(current_user.id, db)

    if data.notify_security is not None:
        settings.notify_security = data.notify_security
    if data.notify_transactions is not None:
        settings.notify_transactions = data.notify_transactions
    if data.notify_marketing is not None:
        settings.notify_marketing = data.notify_marketing
    if data.notify_weekly is not None:
        settings.notify_weekly = data.notify_weekly

    db.commit()
    db.refresh(settings)

    return {
        "notify_security": settings.notify_security,
        "notify_transactions": settings.notify_transactions,
        "notify_marketing": settings.notify_marketing,
        "notify_weekly": settings.notify_weekly,
        "two_factor_enabled": settings.two_factor_enabled,
    }


# ===============================
# 2FA (TOTP)
# ===============================

@router.post("/2fa/generate")
def generate_2fa(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a new TOTP secret for the user"""
    settings = get_or_create_settings(current_user.id, db)
    
    # Always generate a new one if requested for setup
    new_secret = pyotp.random_base32()
    settings.totp_secret = new_secret
    settings.two_factor_enabled = False # Must be explicitly verified to be enabled
    db.commit()

    otpauth_url = pyotp.totp.TOTP(new_secret).provisioning_uri(
        name=current_user.email,
        issuer_name="InterPay"
    )

    return {
        "secret": new_secret,
        "otpauth_url": otpauth_url
    }

@router.post("/2fa/enable")
def enable_2fa(
    data: VerifyTOTPRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify the code and enable 2FA"""
    settings = get_or_create_settings(current_user.id, db)
    if not settings.totp_secret:
        raise HTTPException(status_code=400, detail="2FA setup not initiated.")

    totp = pyotp.TOTP(settings.totp_secret)
    if totp.verify(data.code):
        settings.two_factor_enabled = True
        db.commit()
        return {"message": "2FA successfully enabled."}
    
    raise HTTPException(status_code=400, detail="Invalid 2FA code.")

@router.post("/2fa/disable")
def disable_2fa(
    data: VerifyTOTPRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify the code and disable 2FA"""
    settings = get_or_create_settings(current_user.id, db)
    if not settings.two_factor_enabled or not settings.totp_secret:
        raise HTTPException(status_code=400, detail="2FA is not enabled.")

    totp = pyotp.TOTP(settings.totp_secret)
    if totp.verify(data.code):
        settings.two_factor_enabled = False
        settings.totp_secret = None
        db.commit()
        return {"message": "2FA successfully disabled."}
        
    raise HTTPException(status_code=400, detail="Invalid 2FA code.")

# ===============================
# Delete Account
# ===============================

@router.delete("/account")
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete user account"""
    # Delete settings first
    db.query(UserSettings).filter(UserSettings.user_id == current_user.id).delete()
    # Delete the user
    db.delete(current_user)
    db.commit()

    return {"message": "Account deleted successfully"}


# ===============================
# Backup Codes
# ===============================

@router.get("/backup-codes")
def get_backup_codes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the user's active backup codes"""
    codes = (
        db.query(BackupCode)
        .filter(
            BackupCode.user_id == current_user.id,
            BackupCode.is_used == False
        )
        .all()
    )
    return {"backup_codes": [c.code for c in codes]}


@router.post("/backup-codes/generate")
def generate_backup_codes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invalidate all existing unused codes and generate 10 new ones"""
    # Invalidate existing
    db.query(BackupCode).filter(
        BackupCode.user_id == current_user.id,
        BackupCode.is_used == False
    ).update({"is_used": True})
    db.flush()

    # Generate 10 new 8-character codes
    alphabet = string.ascii_lowercase + string.digits
    new_codes = []
    
    for _ in range(10):
        code_str = "".join(secrets.choice(alphabet) for _ in range(8))
        new_code = BackupCode(
            user_id=current_user.id,
            code=code_str,
            is_used=False
        )
        db.add(new_code)
        new_codes.append(code_str)

    db.commit()

    return {"backup_codes": new_codes}
