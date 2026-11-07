import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from app.services.email_service import _send_email_smtp

logger = logging.getLogger(__name__)


def send_card_otp(user_email: str, otp_code: str, last_four: str):
    """
    Send card verification OTP to the user's registered email via Gmail SMTP.
    Uses GMAIL_USER and GMAIL_APP_PASSWORD from .env.
    Falls back to console print in dev mode if not configured or if SMTP fails.
    """
    subject = "InterPay — Card Verification OTP"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #f4f6f9; padding: 40px;">
      <div style="max-width: 480px; margin: auto; background: white; border-radius: 12px;
                  padding: 36px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display:inline-block; background:#2563EB; color:white;
                      font-weight:bold; font-size:20px; border-radius:8px;
                      padding: 10px 18px; margin-bottom:12px;">InterPay</div>
          <h2 style="color:#1e293b; margin:0;">Card Verification</h2>
        </div>
        <p style="color:#475569; font-size:15px;">
          You requested to add a card ending in <strong>···{last_four}</strong> to your InterPay account.
          Use the OTP below to verify you own this card.
          It expires in <strong>10 minutes</strong>.
        </p>
        <div style="background:#EFF6FF; border-radius:10px; padding:24px;
                    text-align:center; margin: 24px 0;">
          <p style="margin:0 0 6px 0; color:#64748b; font-size:13px;
                    text-transform:uppercase; letter-spacing:1px;">Verification Code</p>
          <span style="font-size:40px; font-weight:bold; letter-spacing:10px;
                       color:#2563EB;">{otp_code}</span>
        </div>
        <p style="color:#94a3b8; font-size:13px; text-align:center;">
          If you didn't request this, please ignore this email.
        </p>
        <hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;">
        <p style="color:#94a3b8; font-size:12px; text-align:center; margin:0;">
          InterPay International Payment System
        </p>
      </div>
    </body>
    </html>
    """

    _send_email_smtp(user_email, subject, html_body, otp_code=otp_code)
