#!/usr/bin/env python3
"""
Follow-Up modülü — Cevap vermemiş markalara reply email atar.

3 adımlı sequence:
  1. İlk outreach (outreach.py)
  2. Follow-up 1 — 5 gün sonra (bu modül)
  3. Follow-up 2 — 5 gün sonra (bu modül) — son deneme, sonra "Not_Interested"

Gmail API reply-in-thread özelliğini kullanarak aynı thread'de görünür.
Seçenek A: Markanın son Instagram paylaşımları + web sitesi analizi ile
kişiselleştirilmiş follow-up üretir.
"""

import csv
import json
import os
import time
from datetime import datetime, timezone, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKALAR_CSV = os.path.join(BASE_DIR, "data", "markalar.csv")

TR_TZ = timezone(timedelta(hours=3))
FOLLOWUP1_WAIT_DAYS = 5  # İlk follow-up: 5 gün sonra
FOLLOWUP2_WAIT_DAYS = 5  # İkinci follow-up: 5 gün sonra


def get_followup_candidates():
    """
    Follow-up gönderilmesi gereken markaları filtreler.
    
    İki kategori döndürür:
    - followup1: İlk follow-up adayları (outreach'ten 5+ gün geçmiş, followup henüz yok)
    - followup2: İkinci follow-up adayları (followup1'den 5+ gün geçmiş, followup2 henüz yok)
    
    Returns:
        tuple: (followup1_candidates, followup2_candidates)
    """
    # CSV yoksa otomatik oluştur (Railway deploy sonrası)
    from src.outreach import ensure_csv_exists
    ensure_csv_exists()
    
    if not os.path.exists(MARKALAR_CSV):
        print("[FOLLOWUP] markalar.csv bulunamadı!")
        return [], []

    now = datetime.now(TR_TZ)
    followup1_candidates = []
    followup2_candidates = []

    with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get("outreach_status", "")
            
            # Replied veya Bounced olanlara follow-up atma
            if status in ("Replied", "Bounced", "Not_Interested", "No_Email", "Failed"):
                continue

            # ── Follow-up 1 adayları ──
            if status == "Sent" and not row.get("followup_status"):
                outreach_date = _parse_date(row.get("outreach_date", ""))
                if outreach_date:
                    days_since = (now - outreach_date).days
                    if days_since >= FOLLOWUP1_WAIT_DAYS:
                        row["_days_since"] = days_since
                        row["_followup_type"] = "followup1"
                        followup1_candidates.append(row)

            # ── Follow-up 2 adayları ──
            elif status == "Sent" and row.get("followup_status") == "Sent" and not row.get("followup2_status"):
                followup1_date = _parse_date(row.get("followup_date", ""))
                if followup1_date:
                    days_since = (now - followup1_date).days
                    if days_since >= FOLLOWUP2_WAIT_DAYS:
                        row["_days_since"] = days_since
                        row["_followup_type"] = "followup2"
                        followup2_candidates.append(row)

    print(f"[FOLLOWUP] {len(followup1_candidates)} follow-up 1 adayı, {len(followup2_candidates)} follow-up 2 adayı bulundu.")
    return followup1_candidates, followup2_candidates


def _parse_date(date_str):
    """Tarih string'ini parse eder."""
    if not date_str or not date_str.strip():
        return None
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M")
        return dt.replace(tzinfo=TR_TZ)
    except ValueError:
        try:
            dt = datetime.strptime(date_str.strip(), "%Y-%m-%d")
            return dt.replace(tzinfo=TR_TZ)
        except ValueError:
            return None


def update_csv_followup(lead_id, updates):
    """Belirli bir satırın follow-up bilgilerini günceller."""
    from src.outreach import CSV_FIELDNAMES
    
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


def send_followup_emails(dry_run=False):
    """
    Follow-up adaylarına kişiselleştirilmiş reply emaili gönderir.
    
    Returns:
        dict: {sent: int, failed: int, skipped: int, closed: int}
    """
    from src.personalizer import generate_followup_email, research_brand_for_followup
    from src.gmail_sender import get_service, send_reply

    followup1_candidates, followup2_candidates = get_followup_candidates()
    all_candidates = followup1_candidates + followup2_candidates

    if not all_candidates:
        print("[FOLLOWUP] Follow-up gönderilecek marka yok.")
        return {"sent": 0, "failed": 0, "skipped": 0, "closed": 0}

    print(f"\n{'='*60}")
    print(f"📬 {len(followup1_candidates)} follow-up 1 + {len(followup2_candidates)} follow-up 2 gönderiliyor...")
    print(f"{'='*60}")

    if dry_run:
        for c in all_candidates:
            ftype = c.get("_followup_type", "?")
            days = c.get("_days_since", "?")
            print(f"  [DRY-RUN] [{ftype}] {c['marka_adi']} → {c['email']} ({days} gün önce)")
        return {"sent": 0, "failed": 0, "skipped": len(all_candidates), "closed": 0}

    service = get_service()
    stats = {"sent": 0, "failed": 0, "skipped": 0, "closed": 0}
    now = datetime.now(TR_TZ).strftime("%Y-%m-%d %H:%M")

    for candidate in all_candidates:
        brand_info = {
            "marka_adi": candidate.get("marka_adi", ""),
            "instagram_handle": candidate.get("instagram_handle", ""),
            "website": candidate.get("website", ""),
            "sirket_aciklamasi": candidate.get("sirket_aciklamasi", ""),
        }

        thread_id = candidate.get("outreach_thread_id", "")
        # Reply-to: son gönderilen message_id'yi kullan
        followup_type = candidate.get("_followup_type", "followup1")
        
        if followup_type == "followup2":
            message_id = candidate.get("followup_message_id", "") or candidate.get("outreach_message_id", "")
        else:
            message_id = candidate.get("outreach_message_id", "")
        
        original_subject = candidate.get("outreach_subject", "")

        if not thread_id or not message_id:
            print(f"  ⚠️ {brand_info['marka_adi']}: Thread bilgisi eksik, atlanıyor.")
            stats["skipped"] += 1
            continue

        print(f"\n  📬 [{followup_type.upper()}] {brand_info['marka_adi']} → {candidate['email']}")
        print(f"     ({candidate.get('_days_since', '?')} gün önce)")

        # Marka araştırması (sadece followup1 için, followup2 kısa olacak)
        if followup_type == "followup1":
            print(f"     🔍 Marka araştırılıyor...")
            brand_context = research_brand_for_followup(brand_info)
        else:
            brand_context = None

        # Kişiselleştirilmiş follow-up üret
        if followup_type == "followup2":
            followup_content = _generate_final_followup(brand_info)
        else:
            followup_content = generate_followup_email(brand_info, brand_context)
        
        body_html = followup_content.get("body_html", "")
        body_text = followup_content.get("body_text", "")

        # Reply olarak gönder
        result = send_reply(
            service,
            to=candidate["email"],
            subject=original_subject,
            body_html=body_html,
            thread_id=thread_id,
            message_id=message_id,
            body_text=body_text,
        )

        if result:
            if followup_type == "followup1":
                update_csv_followup(candidate["lead_id"], {
                    "followup_status": "Sent",
                    "followup_date": now,
                    "followup_message_id": result.get("message_id", ""),
                })
            else:  # followup2
                update_csv_followup(candidate["lead_id"], {
                    "followup2_status": "Sent",
                    "followup2_date": now,
                    "followup2_message_id": result.get("message_id", ""),
                    "outreach_status": "Not_Interested",
                    "notlar": f"{candidate.get('notlar', '')} | 3 email sonrası cevap yok, kapatıldı".strip(" |"),
                })
                stats["closed"] += 1
            
            print(f"     ✅ {followup_type} gönderildi!")
            stats["sent"] += 1
        else:
            if followup_type == "followup1":
                update_csv_followup(candidate["lead_id"], {
                    "followup_status": "Failed",
                    "followup_date": now,
                    "notlar": f"{candidate.get('notlar', '')} | Follow-up 1 gönderim hatası".strip(" |"),
                })
            else:
                update_csv_followup(candidate["lead_id"], {
                    "followup2_status": "Failed",
                    "followup2_date": now,
                    "notlar": f"{candidate.get('notlar', '')} | Follow-up 2 gönderim hatası".strip(" |"),
                })
            print(f"     ❌ {followup_type} başarısız!")
            stats["failed"] += 1

        time.sleep(15)  # Rate limiting

    print(f"\n{'='*60}")
    print(f"📊 FOLLOW-UP SONUÇ: {stats['sent']} gönderildi, {stats['failed']} başarısız, {stats['skipped']} atlandı, {stats['closed']} kapatıldı")
    print(f"{'='*60}")
    return stats


def _generate_final_followup(brand_info):
    """
    Son follow-up emaili — kısa, nazik kapanış.
    Cevap gelmezse bu markayla outreach biter.
    """
    from src.personalizer import _call_openai, _safe_parse_json, _append_signature, EMAIL_SIGNATURE_TEXT, EMAIL_SIGNATURE_HTML

    brand_name = brand_info.get("marka_adi", "Brand")

    system_prompt = """You are writing a FINAL follow-up email for [İSİM SOYAD].
This is the last email in a 3-email sequence. No response was received to the previous 2 emails.

Rules:
- MAX 50 words
- Be graceful and professional — don't be pushy
- Say something like "I understand if the timing isn't right" 
- Leave the door open for future contact
- End with a soft "If anything changes, feel free to reach out"
- Write in English

Output format (JSON):
{"body_text": "...", "body_html": "..."}
"""

    prompt = f"""Write a final, graceful follow-up to {brand_name}.
This is email #3 — they haven't replied to the previous 2 emails.
Keep it very short and close the loop professionally."""

    result = _call_openai(prompt, system_prompt)
    if result:
        parsed = _safe_parse_json(result)
        if parsed and "body_text" in parsed:
            parsed = _append_signature(parsed)
            return parsed

    # Fallback
    body_text = f"""Hi again,

Just a final note — I completely understand if the timing isn't right for {brand_name}. 

If a collaboration ever makes sense in the future, my door is always open. Feel free to reach out anytime.

Wishing you continued success!
{EMAIL_SIGNATURE_TEXT}"""

    body_html = f"""<p>Hi again,</p>

<p>Just a final note — I completely understand if the timing isn't right for <strong>{brand_name}</strong>.</p>

<p>If a collaboration ever makes sense in the future, my door is always open. Feel free to reach out anytime.</p>

<p>Wishing you continued success!</p>
{EMAIL_SIGNATURE_HTML}"""

    return {"body_text": body_text, "body_html": body_html}


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    send_followup_emails(dry_run=dry)
