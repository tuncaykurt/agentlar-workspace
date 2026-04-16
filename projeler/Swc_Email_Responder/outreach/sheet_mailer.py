"""
Sheet Mailer — Google Sheet'ten email gönderici
=================================================
"In EN, Roblox" sekmesinden statüsü boş olan kişilere
"Email Copies" sekmesindeki template ile email gönderir.

İş akışı:
1. Sheet'ten pending kontakları çek (Status sütunu boş + Email dolu)
2. "Email Copies" sekmesinden template'i al
3. Her kişi için template'i kişiselleştir ve gönder
4. Sheet'te Status sütununu "email sent" olarak güncelle
"""

import sys
import os
import time
import base64
from email.mime.text import MIMEText
from datetime import datetime

# Proje kök dizinini path'e ekle
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.sheets_client import (
    authenticate_sheets,
    get_pending_contacts,
    get_email_template,
    update_contact_status,
    update_contact_notes,
    update_reached_out_date,
    get_fetched_yesterday_contacts,
)


def _extract_first_name(channel_name):
    """
    Kanal adından ilk ismi çıkar.
    "John Smith" → "John"
    "GameMaster2000" → "GameMaster2000" (değiştirme)
    """
    if not channel_name:
        return "there"
    
    parts = channel_name.strip().split()
    if parts:
        return parts[0]
    return channel_name


def _personalize_template(template_body, template_subject, contact):
    """
    Template'teki VARIABLE'ları kişiselleştir.
    
    Desteklenen değişkenler (Email Copies sheet'teki gerçek format):
    - [username] / [Username] → Channel Name (ana değişken)
    - {name} / [name] / [Name] → İlk isim
    - {channel_name} / {Channel Name} → Tam kanal adı
    - {channel_url} → Kanal URL'si  
    - {subscribers} → Abone sayısı
    """
    channel_name = contact.get("channel_name", "")
    name = _extract_first_name(channel_name)
    channel_url = contact.get("channel_url", "")
    subscribers = contact.get("subscribers", "")
    email = contact.get("email", "")
    
    body = template_body
    subject = template_subject
    
    # Email Copies sheet'teki asıl değişken: [username]
    # + alternatif formatlar
    replacements = {
        "[username]": channel_name,
        "[Username]": channel_name,
        "[name]": name,
        "[Name]": name,
        "{name}": name,
        "{Name}": name,
        "{channel_name}": channel_name,
        "{Channel Name}": channel_name,
        "{channel_url}": channel_url,
        "{Channel URL}": channel_url,
        "{subscribers}": subscribers,
        "{email}": email,
    }
    
    for placeholder, value in replacements.items():
        body = body.replace(placeholder, value)
        subject = subject.replace(placeholder, value)
    
    return subject, body


def _send_email(gmail_service, to_address, subject, body_text):
    """
    Gmail API ile e-posta gönder (yeni thread).
    
    Returns: sent message dict veya None
    """
    message = MIMEText(body_text)
    message['to'] = to_address
    message['subject'] = subject
    message['from'] = '[İŞ_EMAIL_ADRESI]'
    
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
    try:
        sent_msg = gmail_service.users().messages().send(
            userId='me',
            body={'raw': raw}
        ).execute()
        return sent_msg
    except Exception as e:
        print(f"  ❌ Error sending email to {to_address}: {e}")
        return None


def run(tab_name="In EN, Roblox", dry_run=False, limit=None, fetched_only=False):
    """
    Ana outreach email gönderim fonksiyonu.
    
    Args:
        tab_name: İşlenecek sekme adı
        dry_run: True ise email göndermez ve sheet güncellemez
        limit: Gönderilecek max email sayısı (None = hepsi)
        fetched_only: True ise sadece dünkü fetch edilen verilere outreach yap
    """
    print("=" * 60)
    print("📨 Outreach Sheet Mailer")
    print(f"   📋 Sekme: {tab_name}")
    print(f"   🔧 Mod: {'DRY RUN (email gönderilmeyecek)' if dry_run else 'CANLI'}")
    if limit:
        print(f"   🔢 Limit: {limit} email")
    print("=" * 60)
    
    # Auth
    sheets_service, gmail_service = authenticate_sheets()
    
    # Pending kontakları çek
    if fetched_only:
        # Sadece dün fetch edilmiş veriler
        from datetime import datetime, timezone, timedelta
        TR_OFFSET = timedelta(hours=3)
        now = datetime.now(timezone.utc) + TR_OFFSET
        yesterday = now - timedelta(days=1)
        yesterday_str = yesterday.strftime("%d/%m/%Y")
        today_str = now.strftime("%d/%m/%Y")
        print(f"   📅 Fetched Only: Dünkü veri ({yesterday_str})")
        pending = get_fetched_yesterday_contacts(sheets_service, tab_name, yesterday_str)
    else:
        pending = get_pending_contacts(sheets_service, tab_name)
        today_str = None
    
    if not pending:
        print("\n📭 Gönderilecek email yok — tüm kontaklarda statü mevcut.")
        return {"sent": 0, "skipped": 0, "errors": 0}
    
    # Limit uygula
    if limit:
        pending = pending[:limit]
    
    print(f"\n📬 {len(pending)} kişiye email gönderilecek.\n")
    
    # Template'i al
    try:
        template = get_email_template(sheets_service)
    except Exception as e:
        print(f"❌ Template yüklenemedi: {e}")
        return {"sent": 0, "skipped": 0, "errors": len(pending)}
    
    stats = {"sent": 0, "skipped": 0, "errors": 0}
    
    for i, contact in enumerate(pending, start=1):
        email = contact["email"]
        name = _extract_first_name(contact["channel_name"])
        
        print(f"{'─' * 50}")
        print(f"[{i}/{len(pending)}] 📧 {contact['channel_name']} ({email})")
        
        # Email adresi geçerli mi?
        if not email or "@" not in email:
            print(f"  ⚠️ Geçersiz email adresi: '{email}' → Atlanıyor.")
            if not dry_run:
                update_contact_status(sheets_service, tab_name, contact["row"], status="no email")
            stats["skipped"] += 1
            continue
        
        # Template kişiselleştir
        subject, body = _personalize_template(
            template["body"], template["subject"], contact
        )
        
        if dry_run:
            print(f"  📝 [DRY RUN] Gönderilecek:")
            print(f"     To: {email}")
            print(f"     Subject: {subject}")
            print(f"     Body (ilk 100 karakter): {body[:100]}...")
            stats["sent"] += 1  # Dry run'da da say
            continue
        
        # Email gönder
        result = _send_email(gmail_service, email, subject, body)
        
        if result:
            print(f"  ✅ Email gönderildi!")

            # Sheet'te statü güncelle
            update_contact_status(
                sheets_service, tab_name, contact["row"],
                status="Email Sent"
            )
            
            # Reached Out tarihini yaz (fetched_only modunda)
            if fetched_only and today_str:
                update_reached_out_date(
                    sheets_service, tab_name, contact["row"],
                    date_str=today_str
                )
                # Notes'a outreach notu ekle
                update_contact_notes(
                    sheets_service, tab_name, contact["row"],
                    notes_text=f"Outreach email sent on {today_str} via Sweatcoin automation"
                )
            
            stats["sent"] += 1

            # Rate limiting — Gmail API rate limit koruması
            if i < len(pending):
                time.sleep(2)
        else:
            print(f"  ❌ Email gönderilemedi!")
            if not dry_run:
                update_contact_status(sheets_service, tab_name, contact["row"], status="no email")
            stats["errors"] += 1
            time.sleep(3)
    
    # Sonuç özeti
    print(f"\n{'=' * 60}")
    print("📊 OUTREACH ÖZETİ")
    print(f"{'=' * 60}")
    print(f"   ✅ Gönderilen:    {stats['sent']}")
    print(f"   ⏭️  Atlanan:      {stats['skipped']}")
    print(f"   ❌ Hata:         {stats['errors']}")
    print(f"   📬 Toplam:       {sum(stats.values())}")
    print(f"{'=' * 60}")
    
    return stats


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Outreach Sheet Mailer")
    parser.add_argument("--dry-run", action="store_true", help="Email göndermeden simüle et")
    parser.add_argument("--tab", default="In EN, Roblox", help="İşlenecek sekme adı")
    parser.add_argument("--limit", type=int, default=None, help="Max email sayısı")
    args = parser.parse_args()
    
    run(tab_name=args.tab, dry_run=args.dry_run, limit=args.limit)
