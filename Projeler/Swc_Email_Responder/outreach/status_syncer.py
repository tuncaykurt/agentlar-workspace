"""
Status Syncer — Google Sheet statü güncelleyici
=================================================
"In EN, Roblox" sekmesinde "email sent" statülü kişilerin
Gmail thread'lerini kontrol eder ve statüleri günceller.

İş akışı:
1. Sheet'ten "email sent" statülü kişileri çek
2. Her kişi için Gmail'de thread ara
3. Thread durumuna göre statüyü güncelle:
   - Yanıt geldiyse + biz cevap verdiyse → "Replied - [intent]"
   - Yanıt geldiyse + draft yazıldıysa → "Replied - Draft Ready"
   - Yanıt yoksa → "email sent" kalır
"""

import sys
import os
import logging
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.sheets_client import (
    authenticate_sheets,
    get_email_sent_contacts,
    update_contact_status,
    update_contact_notes,
)


def _search_thread_by_email(gmail_service, email_address):
    """
    Gmail'de belirli bir e-posta adresine gönderilmiş thread'leri bul.
    Sadece bizim başlattığımız (from:me to:email) thread'leri arar.
    
    Returns: list of thread dicts
    """
    try:
        query = f"from:me to:{email_address}"
        results = gmail_service.users().threads().list(
            userId='me', q=query, maxResults=5
        ).execute()
        return results.get('threads', [])
    except Exception as e:
        logging.error(f"  ⚠️ Thread arama hatası ({email_address}): {e}", exc_info=True)
        return []


def _analyze_thread_status(gmail_service, thread_id, contact_email):
    """
    Thread'in son durumunu analiz et.
    
    Returns: dict {
        "has_reply": bool,       # Onlar yanıt verdi mi?
        "we_responded": bool,    # Biz cevap verdik mi (sent)?
        "has_draft": bool,       # Draft var mı?
        "reply_snippet": str,    # Son yanıtın kısa özeti
        "status_suggestion": str # Önerilen statü
    }
    """
    try:
        thread = gmail_service.users().threads().get(
            userId='me', id=thread_id,
            format='metadata',
            metadataHeaders=['From', 'Subject']
        ).execute()
        
        messages = thread.get('messages', [])
        if len(messages) <= 1:
            return {
                "has_reply": False,
                "we_responded": False,
                "has_draft": False,
                "reply_snippet": "",
                "status_suggestion": "email sent"
            }
        
        has_reply = False
        we_responded_after_reply = False
        reply_snippet = ""
        
        found_initial_outreach = False
        
        for msg in messages:
            sender = ""
            for h in msg['payload']['headers']:
                if h['name'] == 'From':
                    sender = h['value'].lower()
                    break
            
            is_from_us = 'sweatco.in' in sender
            is_from_them = contact_email.lower() in sender
            
            if is_from_us and not found_initial_outreach:
                found_initial_outreach = True
                continue
            
            if is_from_them:
                has_reply = True
                reply_snippet = msg.get('snippet', '')[:100]
            
            if has_reply and is_from_us:
                we_responded_after_reply = True
        
        # Draft kontrolü
        has_draft = False
        try:
            drafts = gmail_service.users().drafts().list(userId='me').execute()
            for draft in drafts.get('drafts', []):
                draft_detail = gmail_service.users().drafts().get(
                    userId='me', id=draft['id']
                ).execute()
                if draft_detail.get('message', {}).get('threadId') == thread_id:
                    has_draft = True
                    break
        except Exception:
            logging.warning("Draft kontrolü opsiyonel adımında hata oluştu.", exc_info=True)
            pass  # Draft kontrolü opsiyonel
        
        # Statü önerisi
        if has_reply and we_responded_after_reply:
            status_suggestion = "Replied - Responded"
        elif has_reply and has_draft:
            status_suggestion = "Replied - Draft Ready"
        elif has_reply:
            status_suggestion = "Replied - Awaiting Response"
        else:
            status_suggestion = "email sent"
        
        return {
            "has_reply": has_reply,
            "we_responded": we_responded_after_reply,
            "has_draft": has_draft,
            "reply_snippet": reply_snippet,
            "status_suggestion": status_suggestion,
        }
    
    except Exception as e:
        logging.error(f"  ⚠️ Thread analiz hatası: {e}", exc_info=True)
        return {
            "has_reply": False,
            "we_responded": False,
            "has_draft": False,
            "reply_snippet": "",
            "status_suggestion": "email sent"
        }


def run(tab_name="In EN, Roblox", dry_run=False):
    """
    Ana statü senkronizasyon fonksiyonu.
    
    Args:
        tab_name: İşlenecek sekme adı
        dry_run: True ise Sheet güncellemez, sadece raporlar
    """
    print("=" * 60)
    print("🔄 Outreach Status Syncer")
    print(f"   📋 Sekme: {tab_name}")
    print(f"   🔧 Mod: {'DRY RUN (sheet güncellenmeyecek)' if dry_run else 'CANLI'}")
    print("=" * 60)
    
    # Auth
    sheets_service, gmail_service = authenticate_sheets()
    
    # "email sent" statülü kişileri çek
    sent_contacts = get_email_sent_contacts(sheets_service, tab_name)
    
    if not sent_contacts:
        print("\n📭 Takip edilecek 'email sent' statülü kişi yok.")
        return {"updated": 0, "unchanged": 0, "errors": 0}
    
    print(f"\n🔍 {len(sent_contacts)} kişinin thread durumu kontrol edilecek.\n")
    
    stats = {"updated": 0, "unchanged": 0, "errors": 0, "details": []}
    
    for i, contact in enumerate(sent_contacts, start=1):
        email = contact["email"]
        
        print(f"{'─' * 50}")
        print(f"[{i}/{len(sent_contacts)}] 🔍 {contact['channel_name']} ({email})")
        
        # Thread ara
        threads = _search_thread_by_email(gmail_service, email)
        
        if not threads:
            print(f"  📭 Thread bulunamadı — statü kalıyor: 'email sent'")
            stats["unchanged"] += 1
            continue
        
        # İlk (en son) thread'i analiz et
        thread_status = _analyze_thread_status(gmail_service, threads[0]['id'], email)
        
        if thread_status["status_suggestion"] == "email sent":
            print(f"  📭 Henüz yanıt yok — statü kalıyor: 'email sent'")
            stats["unchanged"] += 1
            continue
        
        new_status = thread_status["status_suggestion"]
        snippet = thread_status["reply_snippet"]
        
        print(f"  📬 Statü değişikliği: 'email sent' → '{new_status}'")
        if snippet:
            print(f"  💬 Snippet: {snippet[:80]}...")
        
        if dry_run:
            print(f"  📝 [DRY RUN] Güncelleme atlanıyor.")
            if snippet:
                print(f"  📝 [DRY RUN] Notes yazılacaktı: {snippet[:80]}...")
            stats["updated"] += 1
            stats["details"].append({
                "channel_name": contact["channel_name"],
                "email": email,
                "new_status": new_status,
                "snippet": snippet[:100] if snippet else "",
            })
            continue
        
        try:
            update_contact_status(
                sheets_service, tab_name, contact["row"],
                status=new_status
            )
            # Snippet varsa Notes sütununa yaz
            if snippet:
                update_contact_notes(
                    sheets_service, tab_name, contact["row"],
                    notes_text=snippet
                )
            stats["updated"] += 1
            stats["details"].append({
                "channel_name": contact["channel_name"],
                "email": email,
                "new_status": new_status,
                "snippet": snippet[:100] if snippet else "",
            })
        except Exception as e:
            logging.error(f"  ❌ Güncelleme hatası: {e}", exc_info=True)
            stats["errors"] += 1
    
    # Sonuç özeti
    print(f"\n{'=' * 60}")
    print("📊 STATUS SYNC ÖZETİ")
    print(f"{'=' * 60}")
    print(f"   🔄 Güncellenen:    {stats['updated']}")
    print(f"   ➡️  Değişmeyen:    {stats['unchanged']}")
    print(f"   ❌ Hata:          {stats['errors']}")
    print(f"   📬 Toplam:        {stats['updated'] + stats['unchanged'] + stats['errors']}")
    print(f"{'=' * 60}")
    
    return stats


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Outreach Status Syncer")
    parser.add_argument("--dry-run", action="store_true", help="Sheet güncellemeden simüle et")
    parser.add_argument("--tab", default="In EN, Roblox", help="İşlenecek sekme adı")
    args = parser.parse_args()
    
    run(tab_name=args.tab, dry_run=args.dry_run)
