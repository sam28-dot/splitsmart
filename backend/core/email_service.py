"""
Email Service — Gmail SMTP
--------------------------
100% free. Uses Gmail App Password (not OAuth, not paid APIs).

Setup (one-time, 2 minutes):
  1. Go to myaccount.google.com → Security → 2-Step Verification (enable it)
  2. Go to myaccount.google.com → Security → App passwords
  3. Create app password → copy the 16-char password
  4. Set env vars:
       GMAIL_USER=you@gmail.com
       GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

If env vars are not set, OTP is printed to console (dev mode).
"""

import smtplib, os, random, string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
import bcrypt

GMAIL_USER     = os.environ.get("GMAIL_USER", "")
GMAIL_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
DEV_MODE       = not (GMAIL_USER and GMAIL_PASSWORD)

OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS   = 5


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def hash_otp(otp: str) -> str:
    return bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()


def verify_otp_hash(otp: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(otp.encode(), hashed.encode())
    except Exception:
        return False


def _send_email(to: str, subject: str, html: str):
    if DEV_MODE:
        # Dev fallback: print to console
        print(f"\n{'='*50}")
        print(f"[DEV EMAIL] To: {to}")
        print(f"[DEV EMAIL] Subject: {subject}")
        # Extract OTP from HTML for convenience
        import re
        codes = re.findall(r'<span[^>]*letter-spacing[^>]*>(\d{6})<', html)
        if codes:
            print(f"[DEV EMAIL] OTP CODE: {codes[0]}")
        print(f"{'='*50}\n")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"SplitSmart <{GMAIL_USER}>"
        msg["To"]      = to
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.sendmail(GMAIL_USER, to, msg.as_string())
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False


def _otp_html(otp: str, purpose: str, username: str = "") -> str:
    action_text = "verify your email" if purpose == "verify" else "sign in to your account"
    greeting = f"Hi {username}," if username else "Hi there,"
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,-apple-system,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
  <tr>
    <td style="background:linear-gradient(135deg,#052e16,#16a34a);padding:32px;text-align:center">
      <div style="display:inline-flex;align-items:center;gap:10px">
        <span style="font-size:24px">💰</span>
        <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.02em">SplitSmart</span>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:36px 40px">
      <p style="color:#0f172a;font-size:15px;margin:0 0 8px">{greeting}</p>
      <p style="color:#475569;font-size:14px;margin:0 0 28px">
        Use the code below to {action_text}. It expires in <strong>{OTP_EXPIRY_MINUTES} minutes</strong>.
      </p>
      <div style="text-align:center;margin:0 0 28px">
        <div style="display:inline-block;background:#f0fdf4;border:2px dashed #86efac;border-radius:14px;padding:20px 40px">
          <span style="font-size:38px;font-weight:800;letter-spacing:0.15em;color:#15803d;font-family:monospace">{otp}</span>
        </div>
      </div>
      <p style="color:#94a3b8;font-size:13px;margin:0;text-align:center">
        If you didn't request this, you can safely ignore this email.
      </p>
    </td>
  </tr>
  <tr>
    <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
      <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center">
        © 2025 SplitSmart · Made with ❤️ by Ahiwale, Bante & Bonde
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>
"""


def send_otp(to_email: str, purpose: str, username: str = "") -> tuple[str, str]:
    """
    Generate OTP, send email, return (otp_hash, expires_at_iso).
    The raw OTP is never stored — only bcrypt hash.
    """
    otp      = generate_otp()
    otp_hash = hash_otp(otp)
    expires  = (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")

    subject  = "Your SplitSmart verification code" if purpose == "verify" else "Your SplitSmart sign-in code"
    html     = _otp_html(otp, purpose, username)

    sent = _send_email(to_email, subject, html)
    if not sent and not DEV_MODE:
        raise RuntimeError("Failed to send OTP email")

    return otp_hash, expires
