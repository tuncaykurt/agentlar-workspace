#!/usr/bin/env python3
"""
Response Checker — Outreach thread'lerinde gelen cevapları tespit eder.

- Gönderilen outreach email'lerine gelen yanıtları kontrol eder
- Cevap gelenleri CSV'de outreach_status = "Replied" olarak işaretler
- Follow-up modülünün cevap verenlere mail atmasını engeller
- Bounce olan mailleri tespit eder ve "Bounced" olarak işaretler

Çalışma zamanı: Haftalık Pipeline'dan önce (Pazartesi 06:30 UTC)
                ve Follow-up'tan önce (Perşembe 06:30 UTC)
"""

import csv
import os
import time
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKALAR_CSV = os.path.join(BASE_DIR, "data", "markalar.csv")

TR_TZ = timezone(timedelta(hours=3))

# Bounce gönderici adresleri
BOUNCE_SENDERS = [
    "mailer-daemon@",
    "postmaster@",
    "mail-daemon@",
    "noreply@google.com",
    "delivery-notification",
]

# Bounce konu satırı kalıpları
BOUNCE_SUBJECTS = [
    "delivery status notification",
    "failure notice",
    "returned mail",
    "undeliverable",
    "undelivered mail",
    "mail delivery failed",
    "delivery has failed",
]


def check_responses(dry_run=False):
    """
    Tüm outreach thread'lerini tarar, gelen yanıt veya bounce varsa CSV'yi günceller.

    Returns:
        dict: {replied: int, bounced: int, checked: int}
    """
    from src.gmail_sender import get_service, SENDER_EMAIL
    from src.outreach import CSV_FIELDNAMES, ensure_csv_exists

    # CSV yoksa otomatik oluştur (Railway deploy sonrası)
    ensure_csv_exists()

    if not os.path.exists(MARKALAR_CSV):
        print("[RESPONSE] markalar.csv bulunamadı!")
        return {"replied": 0, "bounced": 0, "checked": 0}

    # Kontrol edilecek satırları oku
    rows = []
    check_indices = []  # (index, thread_id)

    with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            rows.append(row)
            status = row.get("outreach_status", "")
            thread_id = row.get("outreach_thread_id", "")
            # Sadece Sent veya FollowedUp durumundakileri kontrol et
            if status in ("Sent", "FollowedUp") and thread_id:
                check_indices.append((i, thread_id))

    if not check_indices:
        print("[RESPONSE] Kontrol edilecek thread yok.")
        return {"replied": 0, "bounced": 0, "checked": 0}

    print(f"\n{'='*60}")
    print(f"🔍 {len(check_indices)} outreach thread'i kontrol ediliyor...")
    print(f"{'='*60}")

    if dry_run:
        for idx, tid in check_indices:
            print(f"  [DRY-RUN] {rows[idx].get('marka_adi', '')} → Thread: {tid}")
        return {"replied": 0, "bounced": 0, "checked": len(check_indices)}

    service = get_service()
    stats = {"replied": 0, "bounced": 0, "checked": 0}
    now = datetime.now(TR_TZ).strftime("%Y-%m-%d %H:%M")
    updated = False

    for idx, thread_id in check_indices:
        row = rows[idx]
        brand_name = row.get("marka_adi", "Bilinmeyen")

        try:
            thread = service.users().threads().get(
                userId="me", id=thread_id, format="metadata",
                metadataHeaders=["From", "Subject"]
            ).execute()
            messages = thread.get("messages", [])

            for msg in messages:
                headers = msg.get("payload", {}).get("headers", [])
                sender = ""
                subject = ""
                for h in headers:
                    if h["name"].lower() == "from":
                        sender = h["value"].lower()
                    if h["name"].lower() == "subject":
                        subject = h["value"].lower()

                # Kendi mesajımız mı kontrol et
                if SENDER_EMAIL.lower() in sender:
                    continue
                if "EMAIL_ADRESI_BURAYA" in sender:
                    continue

                # Bounce kontrolü
                is_bounce = False
                for bp in BOUNCE_SENDERS:
                    if bp in sender:
                        is_bounce = True
                        break
                if not is_bounce:
                    for bs in BOUNCE_SUBJECTS:
                        if bs in subject:
                            is_bounce = True
                            break

                if is_bounce:
                    print(f"  📛 BOUNCE: {brand_name} → {row.get('email', '')}")
                    rows[idx]["outreach_status"] = "Bounced"
                    rows[idx]["email_status"] = "bounced"
                    rows[idx]["notlar"] = f"{row.get('notlar', '')} | Bounce detected {now}".strip(" |")
                    stats["bounced"] += 1
                    updated = True
                    break  # Thread'deki diğer mesajlara bakmaya gerek yok
                else:
                    # Gerçek yanıt!
                    print(f"  💬 REPLY: {brand_name} → Yanıt gelmiş! (from: {sender[:50]})")
                    rows[idx]["outreach_status"] = "Replied"
                    rows[idx]["notlar"] = f"{row.get('notlar', '')} | Reply detected {now}".strip(" |")
                    stats["replied"] += 1
                    updated = True
                    break  # İlk yanıt yeterli

        except Exception as e:
            print(f"  ⚠️ {brand_name}: Thread kontrol hatası — {e}")

        stats["checked"] += 1
        time.sleep(0.5)  # Gmail API rate limit

    # CSV'yi güncelle
    if updated:
        with open(MARKALAR_CSV, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        print(f"\n  ✅ CSV güncellendi.")

    print(f"\n{'='*60}")
    print(f"📊 RESPONSE CHECK: {stats['checked']} kontrol, {stats['replied']} yanıt, {stats['bounced']} bounce")
    print(f"{'='*60}")
    return stats


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    check_responses(dry_run=dry)
