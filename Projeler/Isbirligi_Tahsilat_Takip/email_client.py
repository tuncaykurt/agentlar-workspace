"""
İşbirliği Tahsilat Takip — E-posta Gönderim Modülü (Gmail API)
===============================================================
Railway'de SMTP portları bloklandığı için Gmail API (OAuth2) kullanılır.

Auth:
  Railway (prod): GOOGLE_OUTREACH_TOKEN_JSON env variable
  Lokal (dev): Merkezi google_auth modülü
"""
import os
import sys
import json
import base64
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)


def _get_gmail_service():
    """Gmail API service objesi döndür (EMAIL_ADRESI_BURAYA hesabı).

    Öncelik:
      1. Railway (prod): GOOGLE_OUTREACH_TOKEN_JSON env variable
      2. Lokal (dev): Merkezi google_auth modülü
    """
    env_token = os.environ.get("GOOGLE_OUTREACH_TOKEN_JSON", "")
    if env_token:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        token_data = json.loads(env_token)
        scopes = [
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify',
        ]
        creds = Credentials.from_authorized_user_info(token_data, scopes)
        if not creds.valid:
            if creds.expired and creds.refresh_token:
                creds.refresh(Request())
                logger.info("🔄 Gmail OAuth token yenilendi (Railway)")
            else:
                raise RuntimeError("Gmail token geçersiz ve yenilenemiyor (Railway)")
        return build('gmail', 'v1', credentials=creds)

    # Lokal: Merkezi google_auth kullan
    _antigravity_root = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )
    sys.path.insert(0, os.path.join(
        _antigravity_root, "_knowledge", "credentials", "oauth"
    ))
    from google_auth import get_gmail_service
    return get_gmail_service("outreach")


def send_email_notification(subject: str, html_body: str):
    """Gmail API ile e-posta bildirimi gönderir — SMTP yerine OAuth2.
    
    Args:
        subject: E-posta konusu
        html_body: HTML formatında e-posta gövdesi
    
    Returns:
        True: başarılı, False: başarısız
    """
    to_email = "EMAIL_ADRESI_BURAYA"
    sender_email = "EMAIL_ADRESI_BURAYA"

    try:
        service = _get_gmail_service()
    except Exception as e:
        print(f"❌ Gmail API bağlantısı kurulamadı: {e}")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Tahsilat Takip <{sender_email}>"
    msg["To"] = to_email

    # Plain text fallback
    import html as html_module
    plain_text = html_module.unescape(
        html_body.replace("<br>", "\n").replace("</p>", "\n").replace("</div>", "\n")
    )
    # Basit tag temizliği
    import re
    plain_text = re.sub(r'<[^>]+>', '', plain_text)
    
    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        result = service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute()
        print(f"✅ E-posta başarıyla gönderildi → {to_email} | Message ID: {result.get('id', '?')}")
        return True
    except Exception as e:
        print(f"❌ E-posta gönderim hatası (Gmail API): {e}")
        return False
