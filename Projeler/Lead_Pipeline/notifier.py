"""
Lead Pipeline — Bildirim Modülü (Birleşik)
Lead Notifier Bot'tan taşındı. Telegram + Gmail API ile bildirim gönderir.
"""
import os
import sys
import json
import logging
import base64
import time
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

from config import Config

logger = logging.getLogger(__name__)

_TELEGRAM_TIMEOUT = 15
_MAX_NOTIFY_RETRIES = 2


# ── GMAIL API ────────────────────────────────────────────────

def _get_gmail_service():
    """Gmail API service objesi döndür."""
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
                raise RuntimeError("Gmail token geçersiz ve yenilenemiyor")
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


# ── MESAJ OLUŞTURMA ──────────────────────────────────────────

def build_message_text(lead_data: dict) -> str:
    """Lead sözlüğünü Telegram-uyumlu metin formatına çevirir."""
    lines = ["🚀 Yeni Lead Düştü!\n"]

    data_lower_keys = {k.lower().strip(): v for k, v in lead_data.items()}

    full_name = data_lower_keys.get("full_name", "-")
    company_name = data_lower_keys.get("company_name", "-")
    email = data_lower_keys.get("email", "-")
    phone = data_lower_keys.get("phone", data_lower_keys.get("phone_number", "-"))

    lines.append(f"👤 İsim: {full_name}")
    lines.append(f"🏢 Şirket: {company_name}")
    lines.append(f"📧 E-posta: {email}")
    lines.append(f"📞 Telefon: {phone}")

    return "\n".join(lines)


def build_html_email(lead_data: dict) -> str:
    """Lead bilgilerini HTML formatında e-posta gövdesi olarak oluşturur."""
    data_lower_keys = {k.lower().strip(): v for k, v in lead_data.items()}

    full_name = data_lower_keys.get("full_name", "-")
    company_name = data_lower_keys.get("company_name", "-")
    email = data_lower_keys.get("email", "-")
    phone = data_lower_keys.get("phone", data_lower_keys.get("phone_number", "-"))
    source = lead_data.get("_source_tab", "Bilinmeyen")
    now = datetime.now().strftime("%d.%m.%Y %H:%M")

    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif; max-width:600px; margin:0 auto; padding:20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:24px 30px; border-radius:12px 12px 0 0;">
            <h1 style="color:white; margin:0; font-size:22px;">🚀 Yeni Lead Düştü!</h1>
            <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">Kaynak: {source}</p>
        </div>

        <div style="background:#fff; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 12px 12px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding:12px 16px; font-weight:bold; color:#555; width:120px;">👤 İsim</td>
                    <td style="padding:12px 16px; color:#1a1a2e; font-weight:600;">{full_name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding:12px 16px; font-weight:bold; color:#555;">🏢 Şirket</td>
                    <td style="padding:12px 16px;">{company_name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding:12px 16px; font-weight:bold; color:#555;">📧 E-posta</td>
                    <td style="padding:12px 16px;">{email}</td>
                </tr>
                <tr>
                    <td style="padding:12px 16px; font-weight:bold; color:#555;">📞 Telefon</td>
                    <td style="padding:12px 16px;">{phone}</td>
                </tr>
            </table>
        </div>

        <p style="color:#999; font-size:11px; margin-top:16px; text-align:center;">
            Bu bildirim {now} tarihinde Lead Pipeline tarafından otomatik gönderilmiştir.
            <br>Gönderen: {Config.SENDER_EMAIL}
        </p>
    </div>
    """


# ── TELEGRAM ─────────────────────────────────────────────────

def send_telegram_notification(msg_text: str) -> bool:
    """Telegram API üzerinden mesaj gönderir."""
    if not Config.TELEGRAM_BOT_TOKEN or not Config.TELEGRAM_CHAT_ID:
        logger.warning("⚠️ Telegram bildirimleri kapalı (Token veya Chat ID eksik).")
        return False

    url = f"https://api.telegram.org/bot{Config.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": Config.TELEGRAM_CHAT_ID, "text": msg_text}

    for attempt in range(_MAX_NOTIFY_RETRIES):
        try:
            response = requests.post(url, json=payload, timeout=_TELEGRAM_TIMEOUT)
            if response.status_code == 429:
                retry_after = response.json().get("parameters", {}).get("retry_after", 5)
                logger.warning(f"⚠️ Telegram rate limit, {retry_after}s bekleniyor...")
                time.sleep(retry_after)
                continue
            response.raise_for_status()
            logger.info("✅ Telegram bildirimi gönderildi.")
            return True
        except requests.exceptions.Timeout:
            logger.warning(f"⚠️ Telegram timeout (deneme {attempt + 1}/{_MAX_NOTIFY_RETRIES})")
            continue
        except Exception as e:
            logger.error(f"❌ Telegram bildirimi hatası: {e}")
            if attempt < _MAX_NOTIFY_RETRIES - 1:
                time.sleep(2)
                continue
            return False

    return False


# ── E-POSTA (Gmail API) ─────────────────────────────────────

def send_email_notification(lead_data: dict, plain_text: str) -> bool:
    """Gmail API ile e-posta bildirimi gönderir."""
    if not Config.NOTIFY_EMAIL:
        logger.warning("⚠️ E-Posta bildirimleri kapalı (NOTIFY_EMAIL tanımlı değil).")
        return False

    try:
        service = _get_gmail_service()
    except Exception as e:
        logger.error(f"❌ Gmail API bağlantısı kurulamadı: {e}")
        return False

    html_body = build_html_email(lead_data)

    message = MIMEMultipart("alternative")
    message["From"] = f"Lead Pipeline <{Config.SENDER_EMAIL}>"
    message["To"] = Config.NOTIFY_EMAIL
    message["Subject"] = "🚀 Yeni Lead Bildirimi!"

    message.attach(MIMEText(plain_text, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    for attempt in range(_MAX_NOTIFY_RETRIES):
        try:
            raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
            result = service.users().messages().send(
                userId="me", body={"raw": raw}
            ).execute()
            logger.info(f"✅ E-Posta gönderildi → {Config.NOTIFY_EMAIL} | ID: {result.get('id', '?')}")
            return True
        except Exception as e:
            logger.error(f"❌ E-Posta gönderilemedi (deneme {attempt + 1}/{_MAX_NOTIFY_RETRIES}): {e}")
            if attempt < _MAX_NOTIFY_RETRIES - 1:
                time.sleep(3)
                continue
            return False

    return False


# ── ANA ORCHESTRATOR ─────────────────────────────────────────

def process_and_notify(lead_data: dict) -> dict:
    """Her yeni lead için hem Telegram hem E-posta üzerinden bildirim yollar."""
    msg_text = build_message_text(lead_data)

    telegram_ok = send_telegram_notification(msg_text)
    email_ok = send_email_notification(lead_data, msg_text)

    if not telegram_ok and not email_ok:
        logger.error("❌ Hiçbir bildirim gönderilemedi!")
    elif not telegram_ok:
        logger.warning("⚠️ Telegram gitmedi ama E-posta gönderildi")
    elif not email_ok:
        logger.warning("⚠️ Telegram gönderildi ama E-posta gönderilemedi")
    else:
        logger.info("✅ Hem Telegram hem E-posta başarıyla gönderildi!")

    return {"telegram": telegram_ok, "email": email_ok}
