import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)


def _send_email_smtp(to_email: str, subject: str, html_body: str, otp_code: str = ""):
    """
    Helper to send email via Gmail SMTP (SSL on port 465 or TLS on port 587).
    In DEBUG mode, if SMTP fails or is not configured, the OTP is printed to
    the console so development and local testing are not blocked.
    """
    debug_mode = os.getenv("DEBUG", "false").lower() in ("true", "1", "t")
    smtp_user = os.getenv("GMAIL_USER")
    smtp_pass = os.getenv("GMAIL_APP_PASSWORD")

    # In development mode, always print OTP prominently to console
    if otp_code:
        print(f"\n{'='*64}\n[InterPay Auth] Generated OTP for {to_email}: {otp_code}\n{'='*64}\n")

    if not smtp_user or not smtp_pass:
        if debug_mode:
            print("[InterPay Warning] Gmail credentials not configured. OTP printed to console above.")
            return
        raise RuntimeError(
            "Gmail credentials not configured. "
            "Set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file."
        )

    clean_pass = smtp_pass.replace(" ", "").strip()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    sent = False
    last_err = None

    # Try port 465 (SSL), then fallback to port 587 (TLS)
    for port, use_ssl in [(465, True), (587, False)]:
        try:
            if use_ssl:
                with smtplib.SMTP_SSL("smtp.gmail.com", port, timeout=10) as server:
                    server.login(smtp_user, clean_pass)
                    server.sendmail(smtp_user, to_email, msg.as_string())
            else:
                with smtplib.SMTP("smtp.gmail.com", port, timeout=10) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(smtp_user, clean_pass)
                    server.sendmail(smtp_user, to_email, msg.as_string())
            sent = True
            break
        except Exception as e:
            last_err = e

    if not sent:
        err_str = str(last_err)
        if any(term in err_str for term in ["BadCredentials", "Username and Password not accepted", "Connection unexpectedly closed"]):
            hint = (
                "Gmail authentication failed (BadCredentials / Connection closed). "
                "Please verify that GMAIL_USER and a valid 16-character App Password are set in backend/.env, "
                "and that 2-Step Verification is enabled on your Google account."
            )
        else:
            hint = f"Failed to send email via SMTP: {err_str}"

        if debug_mode:
            print(f"\n[InterPay Warning] {hint}")
            print(f">>> [DEV MODE] Use OTP '{otp_code}' from above to complete your request. <<<\n")
            return

        raise RuntimeError(hint)


def send_signup_otp_email(to_email: str, otp_code: str):
    """
    Send a sign up OTP verification to the given email address via Gmail SMTP.
    Requires GMAIL_USER and GMAIL_APP_PASSWORD in .env
    """
    subject = "InterPay — Verify Your Email"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f4f6f9; padding: 40px;">
      <div style="max-width: 480px; margin: auto; background: white; border-radius: 12px;
                  padding: 36px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display:inline-block; background:#2563EB; color:white;
                      font-weight:bold; font-size:20px; border-radius:8px;
                      padding: 10px 18px; margin-bottom:12px;">InterPay</div>
          <h2 style="color:#1e293b; margin:0;">Email Verification</h2>
        </div>

        <p style="color:#475569; font-size:15px;">
          Welcome to InterPay! We received a request to create an account with this email.
          Use the verification code below to activate your account. It expires in <strong>10 minutes</strong>.
        </p>

        <div style="background:#EFF6FF; border-radius:10px; padding:24px;
                    text-align:center; margin: 24px 0;">
          <p style="margin:0 0 6px 0; color:#64748b; font-size:13px; text-transform:uppercase;
                    letter-spacing:1px;">Your Verification Code</p>
          <span style="font-size:40px; font-weight:bold; letter-spacing:10px;
                       color:#2563EB;">{otp_code}</span>
        </div>

        <p style="color:#94a3b8; font-size:13px; text-align:center;">
          If you didn't request this, you can safely ignore this email.
        </p>

        <hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;">
        <p style="color:#94a3b8; font-size:12px; text-align:center; margin:0;">
          InterPay International Payment System
        </p>
      </div>
    </body>
    </html>
    """

    _send_email_smtp(to_email, subject, html_body, otp_code=otp_code)


def send_otp_email(to_email: str, otp_code: str):
    """
    Send a password reset OTP to the given email address via Gmail SMTP.
    Requires GMAIL_USER and GMAIL_APP_PASSWORD in .env
    """
    subject = "InterPay — Your Password Reset OTP"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f4f6f9; padding: 40px;">
      <div style="max-width: 480px; margin: auto; background: white; border-radius: 12px;
                  padding: 36px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display:inline-block; background:#2563EB; color:white;
                      font-weight:bold; font-size:20px; border-radius:8px;
                      padding: 10px 18px; margin-bottom:12px;">InterPay</div>
          <h2 style="color:#1e293b; margin:0;">Password Reset Request</h2>
        </div>

        <p style="color:#475569; font-size:15px;">
          We received a request to reset your InterPay password.
          Use the OTP code below to continue. It expires in <strong>10 minutes</strong>.
        </p>

        <div style="background:#EFF6FF; border-radius:10px; padding:24px;
                    text-align:center; margin: 24px 0;">
          <p style="margin:0 0 6px 0; color:#64748b; font-size:13px; text-transform:uppercase;
                    letter-spacing:1px;">Your OTP Code</p>
          <span style="font-size:40px; font-weight:bold; letter-spacing:10px;
                       color:#2563EB;">{otp_code}</span>
        </div>

        <p style="color:#94a3b8; font-size:13px; text-align:center;">
          If you didn't request this, you can safely ignore this email.
          Your password will not change.
        </p>

        <hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;">
        <p style="color:#94a3b8; font-size:12px; text-align:center; margin:0;">
          InterPay International Payment System
        </p>
      </div>
    </body>
    </html>
    """

    _send_email_smtp(to_email, subject, html_body, otp_code=otp_code)


def send_two_factor_otp_email(to_email: str, otp_code: str):
    """
    Send a 2FA OTP verification code to the given email address via Gmail SMTP.
    Requires GMAIL_USER and GMAIL_APP_PASSWORD in .env
    """
    subject = "InterPay — Security Verification Code"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f4f6f9; padding: 40px;">
      <div style="max-width: 480px; margin: auto; background: white; border-radius: 12px;
                  padding: 36px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display:inline-block; background:#2563EB; color:white;
                      font-weight:bold; font-size:20px; border-radius:8px;
                      padding: 10px 18px; margin-bottom:12px;">InterPay</div>
          <h2 style="color:#1e293b; margin:0;">Two-Factor Authentication</h2>
        </div>

        <p style="color:#475569; font-size:15px;">
          Welcome back! We noticed a new login attempt to your InterPay account.
          Please use the verification code below to securely sign in. It expires in <strong>10 minutes</strong>.
        </p>

        <div style="background:#EFF6FF; border-radius:10px; padding:24px;
                    text-align:center; margin: 24px 0;">
          <p style="margin:0 0 6px 0; color:#64748b; font-size:13px; text-transform:uppercase;
                    letter-spacing:1px;">Your Login Code</p>
          <span style="font-size:40px; font-weight:bold; letter-spacing:10px;
                       color:#2563EB;">{otp_code}</span>
        </div>

        <p style="color:#94a3b8; font-size:13px; text-align:center;">
          If you didn't attempt to sign in, please secure your account by resetting your password immediately.
        </p>

        <hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;">
        <p style="color:#94a3b8; font-size:12px; text-align:center; margin:0;">
          InterPay International Payment System
        </p>
      </div>
    </body>
    </html>
    """

    _send_email_smtp(to_email, subject, html_body, otp_code=otp_code)
