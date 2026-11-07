from fastapi import APIRouter, Depends, HTTPException, status, Request as FastAPIRequest, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator
import re
import os
import random
import string
from datetime import datetime, timedelta, timezone
from google.auth.transport.requests import Request
from google.oauth2 import id_token
import json
import requests
import pyotp

from app.database import get_db
from app.models.user import User
from app.models.account import Account
from app.models.password_reset_otp import PasswordResetOTP
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token
)
from app.services.email_service import send_otp_email, send_signup_otp_email, send_two_factor_otp_email
from app.models.signup_otp import SignupOTP
from app.models.user_settings import UserSettings
from app.models.two_factor_otp import TwoFactorOTP
from app.models.backup_code import BackupCode
from app.core.rate_limit import limiter

router = APIRouter(prefix="/auth", tags=["Auth"])


# ===============================
# Request Schemas
# ===============================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    phone_number: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one number")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ===============================
# Register
# ===============================

def set_auth_cookies(response: Response, user_id: int):
    access_token = create_access_token(data={"sub": str(user_id)})
    refresh_token = create_refresh_token(data={"sub": str(user_id)})
    
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True, 
        samesite="lax",
        max_age=15 * 60 # 15 minutes
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=7 * 24 * 60 * 60 # 7 days
    )

@router.post("/register")
@limiter.limit("5/minute")
def register(request: FastAPIRequest, data: RegisterRequest, db: Session = Depends(get_db)):

    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    # Invalidate old OTPs
    db.query(SignupOTP).filter(
        SignupOTP.email == data.email,
        SignupOTP.is_used == False,
    ).delete()
    db.flush()

    # Generate a 6-digit OTP
    otp_code = "".join(random.choices(string.digits, k=6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    otp = SignupOTP(
        email=data.email,
        hashed_password=hash_password(data.password),
        phone_number=data.phone_number,
        otp_code=otp_code,
        is_used=False,
        expires_at=expires_at,
    )
    db.add(otp)
    db.commit()

    # Send the email
    try:
        send_signup_otp_email(to_email=data.email, otp_code=otp_code)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send OTP email: {str(e)}"
        )

    return {"message": "OTP sent to your email."}


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp_code: str

@router.post("/verify-email")
def verify_email(data: VerifyEmailRequest, response: Response, db: Session = Depends(get_db)):
    otp = (
        db.query(SignupOTP)
        .filter(
            SignupOTP.email == data.email,
            SignupOTP.otp_code == data.otp_code,
            SignupOTP.is_used == False,
        )
        .first()
    )

    if not otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please try again.")

    # Check expiry
    now = datetime.now(timezone.utc)
    if otp.expires_at.tzinfo is None:
        otp_expires = otp.expires_at.replace(tzinfo=timezone.utc)
    else:
        otp_expires = otp.expires_at

    if now > otp_expires:
        raise HTTPException(status_code=400, detail="OTP has expired. Please sign up again.")

    # Create user
    user = User(
        email=otp.email,
        hashed_password=otp.hashed_password,
        phone_number=otp.phone_number,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create an account for the new user
    new_account = Account(
        user_id=user.id,
        currency="USD",
        status="ACTIVE"
    )
    db.add(new_account)
    
    otp.is_used = True
    db.commit()

    # Automatically grant initial $100 test funds
    try:
        from app.services.faucet_service import check_and_replenish_test_balance
        check_and_replenish_test_balance(user.id, db)
    except Exception as e:
        print(f"Faucet grant error on signup: {e}")

    set_auth_cookies(response, user.id)

    return {
        "message": "Email verified successfully"
    }

# ===============================
# Login
# ===============================

@router.post("/login")
@limiter.limit("10/minute")
def login(request: FastAPIRequest, data: LoginRequest, response: Response, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == data.email).first()

    if not user or not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # Check for 2FA
    settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if settings and settings.two_factor_enabled:
        if settings.totp_secret:
            return {
                "requires_2fa": True,
                "method": "totp",
                "email": user.email,
                "message": "Authenticator code required."
            }
        
        # Generate 2FA OTP
        # Invalidate old OTPs
        db.query(TwoFactorOTP).filter(
            TwoFactorOTP.user_id == user.id,
            TwoFactorOTP.is_used == False,
        ).delete()
        db.flush()

        otp_code = "".join(random.choices(string.digits, k=6))
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

        otp = TwoFactorOTP(
            user_id=user.id,
            otp_code=otp_code,
            is_used=False,
            expires_at=expires_at,
        )
        db.add(otp)
        db.commit()

        # Send the email
        try:
            send_two_factor_otp_email(to_email=user.email, otp_code=otp_code)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send 2FA OTP email: {str(e)}"
            )

        return {
            "requires_2fa": True,
            "email": user.email,
            "message": "Two-factor authentication required."
        }

    # Standard login
    set_auth_cookies(response, user.id)
    access_token = create_access_token(data={"sub": str(user.id)})

    return {
        "message": "Login successful",
        "email": user.email,
        "access_token": access_token
    }


# ===============================
# Verify 2FA
# ===============================

class Verify2FARequest(BaseModel):
    email: EmailStr
    code: str

@router.post("/verify-2fa")
def verify_2fa(data: Verify2FARequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email.")

    settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()

    if len(data.code) == 6:
        if settings and settings.totp_secret and settings.two_factor_enabled:
            totp = pyotp.TOTP(settings.totp_secret)
            if not totp.verify(data.code):
                raise HTTPException(status_code=400, detail="Invalid Authenticator code.")
        else:
            # Standard email OTP check
            otp = (
                db.query(TwoFactorOTP)
                .filter(
                    TwoFactorOTP.user_id == user.id,
                    TwoFactorOTP.otp_code == data.code,
                    TwoFactorOTP.is_used == False,
                )
                .first()
            )

            if not otp:
                raise HTTPException(status_code=400, detail="Invalid 2FA code.")

            # Check expiry
            now = datetime.now(timezone.utc)
            if otp.expires_at.tzinfo is None:
                otp_expires = otp.expires_at.replace(tzinfo=timezone.utc)
            else:
                otp_expires = otp.expires_at

            if now > otp_expires:
                raise HTTPException(status_code=400, detail="2FA code has expired.")

            otp.is_used = True
            db.commit()

    elif len(data.code) == 8:
        # Backup code check
        backup_code = (
            db.query(BackupCode)
            .filter(
                BackupCode.user_id == user.id,
                BackupCode.code == data.code,
                BackupCode.is_used == False,
            )
            .first()
        )

        if not backup_code:
            raise HTTPException(status_code=400, detail="Invalid Backup Code.")

        backup_code.is_used = True
        db.commit()

    else:
        raise HTTPException(status_code=400, detail="Invalid code format.")

    # Generate token
    set_auth_cookies(response, user.id)
    access_token = create_access_token(data={"sub": str(user.id)})

    return {
        "message": "2FA verified successfully",
        "access_token": access_token
    }


# ===============================
# Google OAuth
# ===============================

class GoogleCallbackRequest(BaseModel):
    code: str


@router.get("/google")
def google_auth_url():
    """Generate Google OAuth URL"""
    # Google OAuth configuration - these should be in environment variables
    client_id = os.getenv("GOOGLE_CLIENT_ID", "your-client-id.apps.googleusercontent.com")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/auth")
    
    auth_url = f"""https://accounts.google.com/o/oauth2/v2/auth?
        client_id={client_id}
        &redirect_uri={redirect_uri}
        &response_type=code
        &scope=openid%20email%20profile
        &access_type=offline
    """.replace("\n", "").replace(" ", "")
    
    return {"auth_url": auth_url}


@router.post("/google/callback")
def google_callback(data: GoogleCallbackRequest, response: Response, db: Session = Depends(get_db)):
    """Handle Google OAuth callback - receives code and exchanges for token"""
    try:
        # Exchange code for token
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/auth")
        
        if not client_id or not client_secret:
            raise HTTPException(
                status_code=500,
                detail="Google OAuth credentials not configured"
            )
        
        token_url = "https://oauth2.googleapis.com/token"
        token_request_data = {
            "code": data.code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }
        
        token_response = requests.post(token_url, data=token_request_data)
        token_data = token_response.json()
        
        if "error" in token_data:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to exchange code for token: {token_data.get('error_description', 'Unknown error')}"
            )
        
        id_token_str = token_data.get("id_token")
        
        if not id_token_str:
            raise HTTPException(
                status_code=400,
                detail="No ID token in response"
            )
        
        # Verify and decode the ID token
        try:
            decoded_token = id_token.verify_oauth2_token(
                id_token_str,
                Request(),
                client_id
            )
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to verify token: {str(e)}"
            )
        
        email = decoded_token.get("email")
        google_id = decoded_token.get("sub")
        
        if not email:
            raise HTTPException(
                status_code=400,
                detail="Could not retrieve email from Google"
            )
        
        # Check if user exists
        user = db.query(User).filter(
            (User.email == email) | (User.google_id == google_id)
        ).first()
        
        if not user:
            # Create a temporary token for profile completion
            from jose import jwt
            from app.core.security import SECRET_KEY, ALGORITHM
            temp_token = jwt.encode(
                {"sub": f"google_signup|{email}|{google_id}", "exp": datetime.utcnow() + timedelta(minutes=30)},
                SECRET_KEY,
                algorithm="HS256"
            )
            return {
                "requires_phone": True,
                "temp_token": temp_token,
                "email": email,
                "message": "Please complete your profile by providing your phone number."
            }
        else:
            # Update google_id if not already set
            if not user.google_id:
                user.google_id = google_id
                db.commit()
        
        # Generate access token
        set_auth_cookies(response, user.id)
        access_token = create_access_token(data={"sub": str(user.id)})
        
        return {
            "email": user.email,
            "message": "Login successful",
            "access_token": access_token
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Google authentication failed: {str(e)}"
        )


class GoogleCompleteRequest(BaseModel):
    temp_token: str
    phone_number: str

@router.post("/oauth-complete")
def google_complete(data: GoogleCompleteRequest, response: Response, db: Session = Depends(get_db)):
    from jose import jwt, JWTError
    from app.core.security import SECRET_KEY, ALGORITHM
    
    try:
        payload = jwt.decode(data.temp_token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if not sub or not sub.startswith("google_signup|"):
            raise HTTPException(status_code=400, detail="Invalid token")
            
        _, email, google_id = sub.split("|", 2)
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired session. Please sign in with Google again.")
        
    if len(data.phone_number) != 10 or not data.phone_number.isdigit():
        raise HTTPException(status_code=400, detail="Invalid phone number format")
        
    # Check if user already exists
    user = db.query(User).filter((User.email == email) | (User.google_id == google_id)).first()
    if user:
        raise HTTPException(status_code=400, detail="User already registered")
        
    # Create new user
    user = User(
        email=email,
        google_id=google_id,
        phone_number=data.phone_number,
        hashed_password=None
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Create an account for the new user
    new_account = Account(
        user_id=user.id,
        currency="USD",
        status="ACTIVE"
    )
    db.add(new_account)
    db.commit()

    # Automatically grant initial $100 test funds
    try:
        from app.services.faucet_service import check_and_replenish_test_balance
        check_and_replenish_test_balance(user.id, db)
    except Exception as e:
        print(f"Faucet grant error on google signup: {e}")
    
    set_auth_cookies(response, user.id)
    return {
        "email": user.email,
        "message": "Registration complete"
    }


# ===============================
# Forgot Password — Send OTP
# ===============================

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Generate a 6-digit OTP and email it to the user."""
    user = db.query(User).filter(User.email == data.email).first()

    # Always return success to avoid email enumeration
    if not user:
        return {"message": "If that email exists, an OTP has been sent."}

    # Invalidate any previous unused OTPs for this user
    db.query(PasswordResetOTP).filter(
        PasswordResetOTP.user_id == user.id,
        PasswordResetOTP.is_used == False,
    ).delete()
    db.flush()

    # Generate a 6-digit OTP
    otp_code = "".join(random.choices(string.digits, k=6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    otp = PasswordResetOTP(
        user_id=user.id,
        otp_code=otp_code,
        is_used=False,
        expires_at=expires_at,
    )
    db.add(otp)
    db.commit()

    # Send the email
    try:
        send_otp_email(to_email=data.email, otp_code=otp_code)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send OTP email: {str(e)}"
        )

    return {"message": "If that email exists, an OTP has been sent."}


# ===============================
# Reset Password — Verify OTP + Set New Password
# ===============================

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str
    new_password: str


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Verify OTP and update the user's password."""
    user = db.query(User).filter(User.email == data.email).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    otp = (
        db.query(PasswordResetOTP)
        .filter(
            PasswordResetOTP.user_id == user.id,
            PasswordResetOTP.otp_code == data.otp_code,
            PasswordResetOTP.is_used == False,
        )
        .first()
    )

    if not otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code. Please try again.")

    # Check expiry
    now = datetime.now(timezone.utc)
    if otp.expires_at.tzinfo is None:
        # Make naive datetime timezone-aware for comparison
        otp_expires = otp.expires_at.replace(tzinfo=timezone.utc)
    else:
        otp_expires = otp.expires_at

    if now > otp_expires:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")

    # Mark OTP as used and update password
    otp.is_used = True
    user.hashed_password = hash_password(data.new_password)
    db.commit()

    return {"message": "Password reset successfully. You can now log in."}

# ===============================
# Refresh & Logout
# ===============================

@router.post("/refresh")
def refresh_token(request: FastAPIRequest, response: Response, db: Session = Depends(get_db)):
    from app.core.security import decode_access_token
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token provided")
        
    payload = decode_access_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    set_auth_cookies(response, int(user_id))
    return {"message": "Token refreshed successfully"}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token", secure=True, httponly=True, samesite="lax")
    response.delete_cookie("refresh_token", secure=True, httponly=True, samesite="lax")
    return {"message": "Logged out successfully"}
