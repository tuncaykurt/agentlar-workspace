"""
Gmail API Client — Ortak Gmail işlemleri
==========================================
Authenticate, email okuma, draft oluşturma, okundu işaretleme.
Tüm agentlar bu client'ı kullanır.

Auth: Merkezi google_auth modülü kullanılır.
      Token'lar _knowledge/credentials/oauth/ içindedir.
"""

import os
import sys
import base64
from email.mime.text import MIMEText

# google_auth'u import et (aynı dizindeki shared/google_auth.py)
try:
    from shared.google_auth import get_gmail_service
except ImportError:
    # Doğrudan shared/ içinden çalıştırılıyorsa
    from google_auth import get_gmail_service


def authenticate(account: str = "swc"):
    """Gmail API bağlantısı kur — Merkezi token sistemi."""
    return get_gmail_service(account)


def extract_body(payload):
    """Mesaj payload'ından text body çıkar."""
    body = ""
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                data = part['body'].get('data')
                if data:
                    body += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            elif part['mimeType'] in ['multipart/alternative', 'multipart/mixed', 'multipart/related']:
                body += extract_body(part)
    elif payload.get('mimeType') == 'text/plain':
        data = payload['body'].get('data')
        if data:
            body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
    return body


def mark_as_read(service, msg_id):
    """Mesajı okundu olarak işaretle."""
    service.users().messages().modify(userId='me', id=msg_id, body={'removeLabelIds': ['UNREAD']}).execute()
    print(f"  ✅ Marked {msg_id} as read.")


def create_draft(service, thread_id, to_address, subject, in_reply_to, body_text):
    """Gmail draft oluştur."""
    message = MIMEText(body_text)
    message['to'] = to_address
    message['subject'] = subject
    if in_reply_to:
        message['In-Reply-To'] = in_reply_to
        message['References'] = in_reply_to

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
    try:
        draft = service.users().drafts().create(userId='me', body={'message': {'raw': raw, 'threadId': thread_id}}).execute()
        print(f"  📝 Created DRAFT to {to_address} (Thread: {thread_id})")
        return draft
    except Exception as e:
        print(f"  ❌ Error creating draft for {to_address}: {e}")
        return None


# forward_email() fonksiyonu 2026-03-16'da kaldırıldı.
# Sebep: Yanlış forward riski — keyword-based filtre iş ortağı mailini
# ödeme şikâyeti olarak sınıflandırıp [İŞ_ARKADAŞI]'na otomatik göndermişti.
# Artık LLM tabanlı classify_email_relevance() kullanılıyor (sadece mark as read).



def get_thread_first_message(service, thread_id):
    """Thread'in ilk mesajını full format olarak çek."""
    try:
        thread = service.users().threads().get(
            userId='me', id=thread_id,
            format='full'
        ).execute()
        if thread.get('messages'):
            return thread['messages'][0]
    except Exception as e:
        print(f"  ⚠️ Thread çekme hatası: {e}")
    return None


def get_unread_messages(service):
    """Okunmamış mesajları listele."""
    results = service.users().messages().list(userId='me', q="is:unread").execute()
    return results.get('messages', [])


def get_message(service, msg_id):
    """Tek bir mesajı full format olarak çek."""
    return service.users().messages().get(userId='me', id=msg_id, format='full').execute()
