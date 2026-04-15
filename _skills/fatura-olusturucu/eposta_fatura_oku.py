"""
E-posta Fatura Bilgisi Çıkarıcı
================================
Gmail API üzerinden belirli bir marka/kişi ile olan e-posta yazışmasını bulur,
fatura bilgilerini (şirket adı, adres, e-posta, tutar, para birimi) çıkarır
ve JSON formatında döndürür.

Kullanım:
    python eposta_fatura_oku.py --query "Seekoo" [--max-results 10]

Auth: Merkezi google_auth modülü kullanılır.
      Token'lar _knowledge/credentials/oauth/ içindedir.
"""

import os
import sys
import json
import re
import base64
import argparse
from datetime import datetime

# Merkezi Google Auth modülünü import et
_antigravity_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(_antigravity_root, "_knowledge", "credentials", "oauth"))
from google_auth import get_gmail_service


def get_gmail_service_local():
    """Gmail API bağlantısı kur — Merkezi token sistemi (EMAIL_ADRESI_BURAYA)."""
    return get_gmail_service("outreach")


def extract_body(payload) -> str:
    """Mesaj payload'ından text body çıkar (recursive)."""
    body = ""
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain':
                data = part.get('body', {}).get('data')
                if data:
                    body += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            elif part.get('mimeType', '').startswith('multipart/'):
                body += extract_body(part)
    elif payload.get('mimeType') == 'text/plain':
        data = payload.get('body', {}).get('data')
        if data:
            body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
    return body


def get_header(headers, name) -> str:
    """Mesaj header'larından belirli bir değeri çek."""
    for h in headers:
        if h.get('name', '').lower() == name.lower():
            return h.get('value', '')
    return ''


def search_threads(service, query: str, max_results: int = 10) -> list:
    """Gmail'de thread bazlı arama yap."""
    try:
        result = service.users().threads().list(
            userId='me',
            q=query,
            maxResults=max_results
        ).execute()
        return result.get('threads', [])
    except Exception as e:
        print(f"❌ Thread arama hatası: {e}", file=sys.stderr)
        return []


def get_thread_messages(service, thread_id: str) -> list:
    """Bir thread'in tüm mesajlarını çek."""
    try:
        thread = service.users().threads().get(
            userId='me',
            id=thread_id,
            format='full'
        ).execute()
        return thread.get('messages', [])
    except Exception as e:
        print(f"❌ Thread mesaj çekme hatası: {e}", file=sys.stderr)
        return []


def extract_thread_info(service, thread_id: str) -> dict:
    """
    Bir thread'den tüm mesajları çıkarır ve düzenli bilgi döndürür.
    """
    messages = get_thread_messages(service, thread_id)
    if not messages:
        return {}

    thread_data = {
        "thread_id": thread_id,
        "message_count": len(messages),
        "subject": "",
        "participants": set(),
        "messages": [],
        "full_conversation": ""
    }

    conversation_parts = []
    for msg in messages:
        headers = msg.get('payload', {}).get('headers', [])
        from_addr = get_header(headers, 'From')
        to_addr = get_header(headers, 'To')
        subject = get_header(headers, 'Subject')
        date = get_header(headers, 'Date')
        body = extract_body(msg.get('payload', {}))

        if not thread_data["subject"] and subject:
            thread_data["subject"] = subject

        if from_addr:
            thread_data["participants"].add(from_addr)
        if to_addr:
            for addr in to_addr.split(','):
                thread_data["participants"].add(addr.strip())

        msg_info = {
            "from": from_addr,
            "to": to_addr,
            "subject": subject,
            "date": date,
            "body": body.strip()[:2000]  # İlk 2000 karakter (token tasarrufu)
        }
        thread_data["messages"].append(msg_info)

        # Konuşma özeti
        conversation_parts.append(
            f"--- [{date}] From: {from_addr} ---\n{body.strip()[:1500]}"
        )

    thread_data["participants"] = list(thread_data["participants"])
    thread_data["full_conversation"] = "\n\n".join(conversation_parts)

    return thread_data


def main():
    parser = argparse.ArgumentParser(
        description="Gmail'den fatura bilgisi çıkarıcı — e-posta thread'lerini arar ve bilgileri JSON olarak döndürür."
    )
    parser.add_argument(
        "--query", required=True,
        help="Gmail arama sorgusu (örn: marka adı, şirket ismi, kişi adı)"
    )
    parser.add_argument(
        "--max-results", type=int, default=5,
        help="Maksimum döndürülecek thread sayısı (varsayılan: 5)"
    )
    parser.add_argument(
        "--thread-id",
        help="Belirli bir thread ID ile doğrudan o thread'i çek"
    )
    parser.add_argument(
        "--output", default="-",
        help="Çıktı dosyası (varsayılan: stdout)"
    )

    args = parser.parse_args()

    print(f"📧 Gmail'e bağlanılıyor...", file=sys.stderr)
    service = get_gmail_service_local()

    if args.thread_id:
        # Doğrudan belirli bir thread'i çek
        print(f"📬 Thread {args.thread_id} çekiliyor...", file=sys.stderr)
        thread_info = extract_thread_info(service, args.thread_id)
        result = {"threads": [thread_info]} if thread_info else {"threads": []}
    else:
        # Arama yap
        print(f"🔍 Aranıyor: \"{args.query}\" (max {args.max_results} thread)...", file=sys.stderr)
        threads = search_threads(service, args.query, args.max_results)

        if not threads:
            print(f"⚠️  \"{args.query}\" için e-posta bulunamadı.", file=sys.stderr)
            result = {"threads": [], "query": args.query}
        else:
            print(f"📬 {len(threads)} thread bulundu. Detaylar çekiliyor...", file=sys.stderr)
            result = {
                "query": args.query,
                "threads": []
            }
            for t in threads:
                thread_info = extract_thread_info(service, t['id'])
                if thread_info:
                    result["threads"].append(thread_info)

    # Çıktıyı yaz
    output_json = json.dumps(result, ensure_ascii=False, indent=2, default=str)

    if args.output == "-":
        print(output_json)
    else:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output_json)
        print(f"✅ Sonuçlar kaydedildi: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
