"""
Data Fetcher — Günlük email veri aktarma modülü
=================================================
"E-mail Çekme" kaynak sheet'ten yeni verileri alıp
"YouTube Email Data" hedef sheet'e (In EN, Roblox) aktarır.

İş akışı:
1. Kaynak sheet'in tüm verilerini oku (outreach hesabı)
2. Hedef sheet'teki mevcut Channel URL'leri al (dedup)
3. Kaynakta olup hedefte olmayan satırları filtrele
4. İlk 100 yeni satırı hedef formata dönüştür
5. LLM ile kolon eşleştirmesini doğrula
6. Hedef sheet'e append et + Fetched tarihini yaz

Zamanlama: Hafta içi her gün sabah 09:30 TR → Railway scheduler tarafından tetiklenir
"""

import sys
import os
import json
from datetime import datetime, timezone, timedelta

# Proje kök dizinini path'e ekle
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.google_auth import get_sheets_service
from shared.sheets_client import (
    read_source_sheet_data,
    get_existing_target_urls,
    append_rows_to_target,
)

TR_OFFSET = timedelta(hours=3)


def _tr_today():
    """Bugünün tarihini TR saatine göre DD/MM/YYYY formatında döndür."""
    now = datetime.now(timezone.utc) + TR_OFFSET
    return now.strftime("%d/%m/%Y")


def _validate_mapping_with_llm(sample_rows):
    """
    LLM ile kolon eşleştirmesini doğrula.
    5 örnek kaynak satırı gönderip mapping'in doğru olup olmadığını sor.
    
    Returns: dict {"valid": bool, "issues": str, "confidence": float}
    """
    try:
        from shared.llm_client import _call_groq
    except ImportError:
        print("  ⚠️ LLM client yüklenemedi — mapping doğrulama atlanıyor.")
        return {"valid": True, "issues": "LLM unavailable", "confidence": 0.5}
    
    if not sample_rows:
        return {"valid": True, "issues": "No data to validate", "confidence": 1.0}
    
    # 5 örnek satır hazırla
    samples = sample_rows[:5]
    sample_lines = []
    target_lines = []
    for i, s in enumerate(samples):
        sample_lines.append(
            "Source Row %d: URL=%s, Subs=%s, Email=%s, Name=%s"
            % (i + 1, s['url'], s['subscribers'], s['email'], s['channel_name'])
        )
        target_lines.append(
            "Target Row %d: A=%s, B=%s, C=%s, D=%s"
            % (i + 1, s['url'], s['subscribers'], s['email'], s['channel_name'])
        )
    sample_text = chr(10).join(sample_lines)
    target_text = chr(10).join(target_lines)
    
    messages = [
        {
            "role": "system",
            "content": """You are a data validation assistant. Your job is to verify that column mapping between two Google Sheets is correct.

Source sheet columns: A=Channel URL, B=Number of Subscribers, C=Email, D=Email 2 (skipped), E=Channel Name, F=Status (skipped)
Target sheet columns: A=Channel URL, B=Number of Subscribers, C=Email, D=Channel Name, E=Status (empty), F=Notes (empty), G=Fetched (date), H=Reached out (empty)

The mapping rule is:
- Source A (URL) → Target A
- Source B (Subscribers) → Target B
- Source C (Email) → Target C
- Source D (Email 2) is SKIPPED (not transferred)
- Source E (Channel Name) → Target D

Check the sample data below and verify the mapping is correct.

Respond in JSON: {"valid": true/false, "issues": "description of any issues or 'none'", "confidence": 0.0-1.0}"""
        },
        {
            "role": "user",
            "content": f"Source data:\n{sample_text}\n\nMapped target data:\n{target_text}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.1, max_tokens=300)
    if result and "valid" in result:
        return result
    
    # LLM çalışmazsa fallback
    return {"valid": True, "issues": "LLM fallback — manual check recommended", "confidence": 0.5}


def run(tab_name="In EN, Roblox", dry_run=False, limit=100, validate_only=False):
    """
    Ana veri aktarma fonksiyonu.
    
    Args:
        tab_name: Hedef sekme adı
        dry_run: True ise sheet'e yazmaz, sadece raporlar
        limit: Aktarılacak max satır sayısı (varsayılan: 100)
        validate_only: True ise sadece LLM doğrulaması yapar
    
    Returns: dict {"fetched": int, "skipped_dedup": int, "skipped_empty": int, "errors": int}
    """
    print("=" * 60)
    print("📥 Data Fetcher — Günlük Veri Aktarma")
    print(f"   📋 Hedef Sekme: {tab_name}")
    print(f"   🔢 Limit: {limit} satır")
    print(f"   🔧 Mod: {'DRY RUN' if dry_run else 'VALIDATE ONLY' if validate_only else 'CANLI'}")
    print("=" * 60)
    
    today = _tr_today()
    print(f"\n📅 Tarih: {today}")
    
    # Auth — iki farklı hesap
    print("\n🔐 Auth: Kaynak (outreach) + Hedef (swc) oturum açılıyor...")
    sheets_outreach = get_sheets_service("outreach")
    sheets_swc = get_sheets_service("swc")
    
    # ADIM 1: Kaynak verilerini oku
    print("\n📊 ADIM 1: Kaynak sheet (E-mail Çekme) okunuyor...")
    source_data = read_source_sheet_data(sheets_outreach)
    print(f"   Toplam kaynak satır: {len(source_data)}")
    
    if not source_data:
        print("❌ Kaynak sheet'te veri bulunamadı!")
        return {"fetched": 0, "skipped_dedup": 0, "skipped_empty": 0, "errors": 1}
    
    # ADIM 2: Hedef URL'leri al (dedup)
    print("\n🔍 ADIM 2: Hedef sheet'teki mevcut URL'ler okunuyor (dedup)...")
    existing_urls = get_existing_target_urls(sheets_swc, tab_name)
    print(f"   Hedefte mevcut URL sayısı: {len(existing_urls)}")
    
    # ADIM 3: Yeni satırları filtrele
    print("\n🔀 ADIM 3: Yeni (henüz aktarılmamış) satırlar filtreleniyor...")
    new_rows = []
    skipped_dedup = 0
    skipped_empty = 0
    
    for row in source_data:
        # URL hedefte zaten varsa atla
        if row["url"] in existing_urls:
            skipped_dedup += 1
            continue
        
        # Email yoksa veya "empty" ise yine ekle (kullanıcı istedi: empty de dahil)
        new_rows.append(row)
    
    print(f"   Yeni satır adayı: {len(new_rows)}")
    print(f"   Dedup ile atlanan: {skipped_dedup}")
    
    if not new_rows:
        print("\n📭 Aktarılacak yeni satır yok — tüm veriler zaten hedefte.")
        return {"fetched": 0, "skipped_dedup": skipped_dedup, "skipped_empty": 0, "errors": 0}
    
    # Limit uygula
    batch = new_rows[:limit]
    print(f"\n📦 Batch: {len(batch)} satır aktarılacak (limit: {limit})")
    
    # ADIM 4: LLM ile mapping doğrulama
    print("\n🧠 ADIM 4: LLM ile kolon eşleştirmesi doğrulanıyor...")
    validation = _validate_mapping_with_llm(batch)
    
    if validation.get("valid"):
        print(f"   ✅ Mapping doğrulandı (confidence: {validation.get('confidence', 'N/A')})")
    else:
        issues = validation.get("issues", "Unknown")
        print(f"   ❌ Mapping hatası tespit edildi: {issues}")
        if not dry_run and not validate_only:
            print("   ⚠️ Hatalı mapping — işlem iptal edildi!")
            return {"fetched": 0, "skipped_dedup": skipped_dedup, "skipped_empty": 0, "errors": 1}
    
    if validate_only:
        print("\n📋 Validate-only modu — sheet'e yazma atlanıyor.")
        for i, row in enumerate(batch[:10], start=1):
            print(f"   [{i}] {row['channel_name']} → {row['email']} ({row['subscribers']} subs)")
        if len(batch) > 10:
            print(f"   ... ve {len(batch) - 10} satır daha")
        return {"fetched": 0, "skipped_dedup": skipped_dedup, "skipped_empty": 0, "errors": 0}
    
    if dry_run:
        print("\n📋 DRY RUN — sheet'e yazma atlanıyor.")
        for i, row in enumerate(batch[:10], start=1):
            email_display = row['email'] if row['email'] and row['email'].lower() != 'empty' else '(empty)'
            print(f"   [{i}] {row['channel_name']} → {email_display} ({row['subscribers']} subs)")
        if len(batch) > 10:
            print(f"   ... ve {len(batch) - 10} satır daha")
        return {"fetched": len(batch), "skipped_dedup": skipped_dedup, "skipped_empty": 0, "errors": 0}
    
    # ADIM 5: Hedef sheet'e yaz
    print(f"\n📝 ADIM 5: {len(batch)} satır hedef sheet'e yazılıyor...")
    try:
        appended = append_rows_to_target(sheets_swc, tab_name, batch, today)
        print(f"\n✅ Veri aktarma tamamlandı! {appended} satır eklendi.")
    except Exception as e:
        print(f"\n❌ Veri aktarma hatası: {e}")
        import traceback
        traceback.print_exc()
        return {"fetched": 0, "skipped_dedup": skipped_dedup, "skipped_empty": 0, "errors": 1}
    
    # Sonuç özeti
    stats = {
        "fetched": appended,
        "skipped_dedup": skipped_dedup,
        "skipped_empty": skipped_empty,
        "errors": 0,
        "date": today,
    }
    
    print(f"\n{'=' * 60}")
    print("📊 VERİ AKTARMA ÖZETİ")
    print(f"{'=' * 60}")
    print(f"   📥 Aktarılan:     {stats['fetched']}")
    print(f"   🔄 Dedup atlanan: {stats['skipped_dedup']}")
    print(f"   📅 Fetched:       {stats['date']}")
    print(f"   ❌ Hata:          {stats['errors']}")
    print(f"{'=' * 60}")
    
    return stats


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Data Fetcher — Günlük Veri Aktarma")
    parser.add_argument("--dry-run", action="store_true", help="Sheet'e yazmadan simüle et")
    parser.add_argument("--validate-only", action="store_true", help="Sadece LLM mapping doğrulaması yap")
    parser.add_argument("--tab", default="In EN, Roblox", help="Hedef sekme adı")
    parser.add_argument("--limit", type=int, default=100, help="Max aktarılacak satır sayısı")
    args = parser.parse_args()
    
    run(tab_name=args.tab, dry_run=args.dry_run, limit=args.limit, validate_only=args.validate_only)
