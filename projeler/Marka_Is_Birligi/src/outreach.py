#!/usr/bin/env python3
"""
Outreach modülü — Yeni markalar için ilk outreach email gönderimi.

Pipeline: scrape → analyze → find contacts → kişiselleştir → gönder
"""

import csv
import json
import os
import random
import time
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKALAR_CSV = os.path.join(BASE_DIR, "data", "markalar.csv")

# CSV sütunları
CSV_FIELDNAMES = [
    "lead_id", "marka_adi", "instagram_handle", "website", "email",
    "email_kaynagi", "email_status", "email_contact_name", "email_contact_title",
    "sirket_aciklamasi", "mention_sayisi", "is_collab",
    "kaynak_profiller", "outreach_status", "outreach_date",
    "outreach_message_id", "outreach_thread_id", "outreach_subject",
    "followup_status", "followup_date", "followup_message_id",
    "followup2_status", "followup2_date", "followup2_message_id",
    "notlar", "kesfedilme_tarihi",
]

DAILY_SEND_LIMIT = 20  # Günlük max email gönderim limiti

TR_TZ = timezone(timedelta(hours=3))


def ensure_csv_exists():
    """data/ klasörünü ve markalar.csv'yi otomatik oluşturur.
    
    Railway'de her deploy sonrası dosya sistemi sıfırlanır.
    Bu fonksiyon CSV yoksa boş header ile oluşturur,
    böylece pipeline graceful çalışmaya devam eder.
    """
    data_dir = os.path.dirname(MARKALAR_CSV)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)
        print(f"[OUTREACH] 📁 data/ klasörü oluşturuldu: {data_dir}")
    
    if not os.path.exists(MARKALAR_CSV):
        with open(MARKALAR_CSV, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            writer.writeheader()
        print(f"[OUTREACH] 📄 Boş markalar.csv oluşturuldu (header only)")


# Modül yüklendiğinde otomatik çalıştır
ensure_csv_exists()


def _next_lead_id():
    """Sıradaki lead ID'yi oluştur."""
    max_id = 0
    if os.path.exists(MARKALAR_CSV):
        with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                lid = row.get("lead_id", "")
                if lid.startswith("MIB-"):
                    try:
                        num = int(lid.replace("MIB-", ""))
                        max_id = max(max_id, num)
                    except ValueError:
                        pass
    return f"MIB-{max_id + 1:03d}"


def add_brands_to_csv(enriched_brands):
    """
    Zenginleştirilmiş markaları CSV'ye ekler.
    
    Args:
        enriched_brands: list of enriched brand dicts
    
    Returns:
        list of brand dicts with lead_ids assigned
    """
    # Mevcut CSV'yi oku
    existing_rows = []
    if os.path.exists(MARKALAR_CSV):
        with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            existing_rows = list(reader)

    now = datetime.now(TR_TZ).strftime("%Y-%m-%d %H:%M")
    new_rows = []

    for brand in enriched_brands:
        email = brand.get("best_email", "")
        email_status = brand.get("email_status", "not_found")

        lead_id = _next_lead_id()
        # Email durumuna göre outreach status belirle
        if email and email_status == "verified":
            outreach_status = "New"
        else:
            outreach_status = "No_Email"

        row = {
            "lead_id": lead_id,
            "marka_adi": brand.get("marka_adi", ""),
            "instagram_handle": brand.get("instagram_handle", ""),
            "website": brand.get("website", ""),
            "email": email,
            "email_kaynagi": brand.get("email_source", ""),
            "email_status": email_status,
            "email_contact_name": brand.get("email_contact_name", ""),
            "email_contact_title": brand.get("email_contact_title", ""),
            "sirket_aciklamasi": brand.get("sirket_aciklamasi", ""),
            "mention_sayisi": brand.get("mention_sayisi", 0),
            "is_collab": "Evet" if brand.get("is_collab") else "Hayır",
            "kaynak_profiller": ", ".join(brand.get("kaynak_profiller", [])),
            "outreach_status": outreach_status,
            "outreach_date": "",
            "outreach_message_id": "",
            "outreach_thread_id": "",
            "outreach_subject": "",
            "followup_status": "",
            "followup_date": "",
            "followup_message_id": "",
            "followup2_status": "",
            "followup2_date": "",
            "followup2_message_id": "",
            "notlar": f"Email bulunamadı ({email_status})" if not email else "",
            "kesfedilme_tarihi": now,
        }
        new_rows.append(row)
        brand["lead_id"] = lead_id

    # CSV'ye yaz
    all_rows = existing_rows + new_rows
    with open(MARKALAR_CSV, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"[OUTREACH] ✅ {len(new_rows)} marka CSV'ye eklendi. Toplam: {len(all_rows)}")
    return enriched_brands


def update_csv_row(lead_id, updates):
    """Belirli bir satırı günceller."""
    rows = []
    with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("lead_id") == lead_id:
                row.update(updates)
            rows.append(row)

    with open(MARKALAR_CSV, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def send_outreach_emails(dry_run=False):
    """
    CSV'deki 'New' statüsündeki markalara outreach emaili gönderir.
    
    Returns:
        dict: {sent: int, failed: int, skipped: int}
    """
    from src.personalizer import generate_outreach_email
    from src.gmail_sender import get_service, send_email

    if not os.path.exists(MARKALAR_CSV):
        print("[OUTREACH] markalar.csv bulunamadı!")
        return {"sent": 0, "failed": 0, "skipped": 0}

    # CSV'den yeni markaları oku
    pending = []
    with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("outreach_status") == "New" and row.get("email"):
                pending.append(row)

    if not pending:
        print("[OUTREACH] Gönderilecek yeni marka yok.")
        return {"sent": 0, "failed": 0, "skipped": 0, "queued": 0}

    # Günlük gönderim limiti uygula
    if len(pending) > DAILY_SEND_LIMIT:
        queued_count = len(pending) - DAILY_SEND_LIMIT
        print(f"  ⚠️ {len(pending)} marka var ama günlük limit {DAILY_SEND_LIMIT}. {queued_count} marka 'Queued' olarak bekletiliyor.")
        pending = pending[:DAILY_SEND_LIMIT]
    else:
        queued_count = 0

    print(f"\n{'='*60}")
    print(f"📧 {len(pending)} markaya outreach gönderiliyor (limit: {DAILY_SEND_LIMIT}/gün)...")
    print(f"{'='*60}")

    if dry_run:
        for p in pending:
            print(f"  [DRY-RUN] {p['marka_adi']} → {p['email']}")
        return {"sent": 0, "failed": 0, "skipped": len(pending), "queued": queued_count}

    service = get_service()
    stats = {"sent": 0, "failed": 0, "skipped": 0, "queued": queued_count}
    now = datetime.now(TR_TZ).strftime("%Y-%m-%d %H:%M")

    for brand_row in pending:
        brand_info = {
            "marka_adi": brand_row.get("marka_adi", ""),
            "instagram_handle": brand_row.get("instagram_handle", ""),
            "website": brand_row.get("website", ""),
            "sirket_aciklamasi": brand_row.get("sirket_aciklamasi", ""),
        }

        # Kişiselleştirilmiş email üret
        email_content = generate_outreach_email(brand_info)
        subject = email_content["subject"]
        body_html = email_content.get("body_html", "")
        body_text = email_content.get("body_text", "")

        print(f"\n  📧 {brand_info['marka_adi']} → {brand_row['email']}")
        print(f"     Konu: {subject}")

        # Gönder
        result = send_email(service, brand_row["email"], subject, body_html, body_text, plain_text_only=True)

        if result:
            update_csv_row(brand_row["lead_id"], {
                "outreach_status": "Sent",
                "outreach_date": now,
                "outreach_message_id": result.get("message_id", ""),
                "outreach_thread_id": result.get("thread_id", ""),
                "outreach_subject": subject,
            })
            print(f"     ✅ Gönderildi (Thread: {result.get('thread_id', '')})")
            stats["sent"] += 1
        else:
            update_csv_row(brand_row["lead_id"], {
                "outreach_status": "Failed",
                "outreach_date": now,
                "notlar": "Email gönderim hatası",
            })
            print(f"     ❌ Başarısız")
            stats["failed"] += 1

        wait_time = random.uniform(45, 120)
        print(f"     ⏳ Sonraki mail için {wait_time:.0f}sn bekleniyor...")
        time.sleep(wait_time)  # Anti-spam: rastgele aralıklar

    print(f"\n{'='*60}")
    print(f"📊 OUTREACH SONUÇ: {stats['sent']} gönderildi, {stats['failed']} başarısız")
    print(f"{'='*60}")
    return stats


def run_full_pipeline(dry_run=False):
    """
    Tam pipeline: scrape → analyze → find contacts → add to DB → send outreach.
    
    Bu fonksiyon scheduler tarafından haftalık çağrılır.
    """
    from src.scraper import scrape_reels
    from src.analyzer import find_new_brands
    from src.contact_finder import enrich_new_brands

    print("\n" + "═" * 60)
    print("🚀 MARKA İŞ BİRLİĞİ — HAFTALIK PİPELİNE BAŞLADI")
    print("═" * 60)

    # Adım 1: Scrape
    print("\n📌 ADIM 1: Influencer reels'leri scrape ediliyor...")
    reels = scrape_reels(dry_run=dry_run)
    if dry_run:
        print("[DRY-RUN] Scrape atlandı.")
        return

    if not reels:
        print("[PIPELINE] Reel verisi bulunamadı, pipeline durduruluyor.")
        return

    # Adım 2: Analyze
    print("\n📌 ADIM 2: Marka mention'ları analiz ediliyor...")
    new_brands = find_new_brands(reels)

    if not new_brands:
        print("\n✅ Yeni marka bulunamadı. Pipeline tamamlandı.")
        return

    # Adım 3: Find contacts
    print(f"\n📌 ADIM 3: {len(new_brands)} yeni marka için iletişim aranıyor...")
    enriched = enrich_new_brands(new_brands)

    # Adım 4: Add to DB
    print("\n📌 ADIM 4: Yeni markalar veritabanına ekleniyor...")
    add_brands_to_csv(enriched)

    # Adım 5: Send outreach
    print("\n📌 ADIM 5: Outreach e-postaları gönderiliyor...")
    stats = send_outreach_emails(dry_run=dry_run)

    print("\n" + "═" * 60)
    print("✅ HAFTALIK PİPELİNE TAMAMLANDI")
    print(f"   Yeni marka: {len(new_brands)}")
    print(f"   Email gönderilen: {stats['sent']}")
    print("═" * 60)


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    if "--send-only" in sys.argv:
        send_outreach_emails(dry_run=dry)
    else:
        run_full_pipeline(dry_run=dry)
