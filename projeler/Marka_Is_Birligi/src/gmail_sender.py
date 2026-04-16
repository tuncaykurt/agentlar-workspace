#!/usr/bin/env python3
"""
Gmail Sender modülü — Gmail API ile email gönderimi ve reply chain desteği.

Hem ilk outreach hem de follow-up reply gönderimini destekler.
Railway'de env var, lokal'de token.json ile çalışır.
"""

import base64
import json
import os
import sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify"]
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "EMAIL_ADRESI_BURAYA")

# Credential dosya yolları
CREDENTIALS_FILE = os.path.join(BASE_DIR, "..", "..", "_knowledge", "credentials", "oauth", "gmail-[isim]-ai-credentials.json")
TOKEN_FILE = os.path.join(BASE_DIR, "..", "..", "_knowledge", "credentials", "oauth", "gmail-[isim]-ai-token.json")


def authenticate():
    """Gmail API OAuth2 kimlik doğrulaması."""
    creds = None

    # Railway'de env var'dan token oku
    token_json_str = os.environ.get("GOOGLE_OUTREACH_TOKEN_JSON")
    if token_json_str:
        try:
            # Base64 decode
            token_data = base64.b64decode(token_json_str).decode("utf-8")
            creds = Credentials.from_authorized_user_info(json.loads(token_data), SCOPES)
            print("[GMAIL] Token env var'dan yüklendi.")
        except Exception as e:
            print(f"[GMAIL] Env var token parse hatası: {e}")

    # Lokal token dosyasından oku
    if not creds and os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        print("[GMAIL] Token dosyadan yüklendi.")

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("[GMAIL] Token yenileniyor...")
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                raise FileNotFoundError(
                    f"Credentials dosyası bulunamadı: {CREDENTIALS_FILE}\n"
                    "Railway'de: GOOGLE_OUTREACH_TOKEN_JSON env var ayarlayın."
                )
            print("[GMAIL] Tarayıcıda Google hesabınızla giriş yapın...")
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=8080)

        # Token'ı dosyaya kaydet (lokal)
        if not os.environ.get("RAILWAY_ENVIRONMENT"):
            with open(TOKEN_FILE, "w") as f:
                f.write(creds.to_json())
            print("[GMAIL] ✅ Token kaydedildi.")

    return creds


def get_service():
    """Gmail API service nesnesi döndürür."""
    creds = authenticate()
    return build("gmail", "v1", credentials=creds)


def create_email(to, subject, body_html, body_text=None, plain_text_only=False):
    """
    MIME email oluşturur.
    
    Args:
        to: Alıcı email
        subject: Konu
        body_html: HTML gövde
        body_text: Plain text gövde (opsiyonel)
        plain_text_only: True ise sadece plain-text gönderir (spam riski düşer)
    
    Returns:
        dict: Gmail API ready message
    """
    if plain_text_only and body_text:
        # İlk outreach için plain-text öncelikli — deliverability artırır
        message = MIMEText(body_text, "plain", "utf-8")
        message["to"] = to
        message["subject"] = subject
        message["from"] = SENDER_EMAIL
    else:
        message = MIMEMultipart("alternative")
        message["to"] = to
        message["subject"] = subject
        message["from"] = SENDER_EMAIL

        if body_text:
            text_part = MIMEText(body_text, "plain", "utf-8")
            message.attach(text_part)

        html_part = MIMEText(body_html, "html", "utf-8")
        message.attach(html_part)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return {"raw": raw}


def create_reply(to, subject, body_html, thread_id, message_id, body_text=None):
    """
    Reply email oluşturur (aynı thread'de).
    
    Args:
        to: Alıcı email
        subject: Konu (Re: prefix otomatik)
        body_html: HTML gövde
        thread_id: Gmail thread ID
        message_id: Orijinal message ID (In-Reply-To header için)
        body_text: Plain text gövde (opsiyonel)
    
    Returns:
        dict: Gmail API ready reply message
    """
    message = MIMEMultipart("alternative")
    message["to"] = to
    message["from"] = SENDER_EMAIL
    
    # Reply subject
    if not subject.startswith("Re:"):
        subject = f"Re: {subject}"
    message["subject"] = subject
    
    # Reply headers — aynı thread'de görünmesi için
    message["In-Reply-To"] = message_id
    message["References"] = message_id

    if body_text:
        text_part = MIMEText(body_text, "plain", "utf-8")
        message.attach(text_part)

    html_part = MIMEText(body_html, "html", "utf-8")
    message.attach(html_part)

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return {"raw": raw, "threadId": thread_id}


def send_email(service, to, subject, body_html, body_text=None, plain_text_only=False):
    """
    Email gönderir.
    
    Args:
        plain_text_only: True ise sadece plain-text gönderir (ilk outreach için)
    
    Returns:
        dict: {message_id, thread_id} veya None (hata)
    """
    try:
        msg = create_email(to, subject, body_html, body_text, plain_text_only=plain_text_only)
        result = service.users().messages().send(userId="me", body=msg).execute()
        
        # Gerçek Message-ID header'ını al
        full_msg = service.users().messages().get(
            userId="me", id=result["id"], format="metadata",
            metadataHeaders=["Message-ID"]
        ).execute()
        
        real_message_id = None
        for header in full_msg.get("payload", {}).get("headers", []):
            if header["name"] == "Message-ID":
                real_message_id = header["value"]
                break
        
        return {
            "gmail_id": result["id"],
            "thread_id": result["threadId"],
            "message_id": real_message_id or result["id"],
        }
    except Exception as e:
        print(f"  ❌ Email gönderim hatası: {e}")
        return None


def send_reply(service, to, subject, body_html, thread_id, message_id, body_text=None):
    """
    Reply email gönderir (aynı thread'de).
    
    Returns:
        dict: {message_id, thread_id} veya None (hata)
    """
    try:
        msg = create_reply(to, subject, body_html, thread_id, message_id, body_text)
        result = service.users().messages().send(userId="me", body=msg).execute()
        return {
            "gmail_id": result["id"],
            "thread_id": result["threadId"],
            "message_id": result["id"],
        }
    except Exception as e:
        print(f"  ❌ Reply gönderim hatası: {e}")
        return None


if __name__ == "__main__":
    if "--auth-only" in sys.argv:
        authenticate()
        print("✅ Gmail API kimlik doğrulaması başarılı.")
    else:
        print("Kullanım: python gmail_sender.py --auth-only")
