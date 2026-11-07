import re

with open('app/routes/auth.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Inject pyotp
if 'import pyotp' not in content:
    content = content.replace('import requests', 'import requests\nimport pyotp')

# 2. Login Logic
login_replacement = """    # Check for 2FA
    settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if settings and settings.two_factor_enabled:
        if settings.totp_secret:
            return {
                "requires_2fa": True,
                "method": "totp",
                "email": user.email,
                "message": "Authenticator code required."
            }
        
        # Generate 2FA OTP"""
content = re.sub(r'    # Check for 2FA\s+settings = db\.query\(UserSettings\)\.filter\(UserSettings\.user_id == user\.id\)\.first\(\)\s+if settings and settings\.two_factor_enabled:\s+# Generate 2FA OTP', login_replacement, content)

# 3. Verify Logic
verify_replacement = """    settings = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()

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
            db.commit()"""

content = re.sub(r'    if len\(data\.code\) == 6:\s+# Standard email OTP check.*?otp\.is_used = True\s+db\.commit\(\)', verify_replacement, content, flags=re.DOTALL)

with open('app/routes/auth.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated auth.py")
