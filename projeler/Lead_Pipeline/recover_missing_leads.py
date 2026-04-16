#!/usr/bin/env python3
"""
recover_missing_leads.py
Bu script, Google Sheets ile Notion arasındaki tutarsızlıkları gidermek için
manuel veya gerektiğinde çalıştırılmak üzere yazılmıştır.
Geçmişte LLM veya API hatalarından dolayı "işlenmiş" gibi görünüp
Notion'a hiç yazılmayan lead'leri bulur ve sisteme dahil eder.
"""
import sys
import time
import logging
from typing import List, Dict

from config import Config
from sheets_reader import SheetsReader
from notion_writer import NotionWriter, NOTION_API_URL
from data_cleaner import clean_leads_bulk

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("recovery")


def fetch_all_notion_leads(notion: NotionWriter):
    """Notion veri tabanındaki tüm telefon, email ve isimleri çeker."""
    logger.info(f"⏳ Notion DB'den kayıtlar çekiliyor... ID: {notion.database_id}")
    
    existing_phones = set()
    existing_emails = set()
    existing_names = set()
    
    has_more = True
    next_cursor = None
    url = f"{NOTION_API_URL}/databases/{notion.database_id}/query"
    total_fetched = 0
    
    while has_more:
        payload = {"page_size": 100}
        if next_cursor:
            payload["start_cursor"] = next_cursor
            
        try:
            resp = notion._api_call("post", url, json=payload)
            data = resp.json()
            results = data.get("results", [])
            total_fetched += len(results)
            
            for page in results:
                props = page.get("properties", {})
                
                # Telefon
                phone_prop = props.get("Phone", {})
                if phone_prop.get("phone_number"):
                    existing_phones.add(phone_prop["phone_number"].strip())
                
                # Email
                email_prop = props.get("email", {})
                if email_prop.get("email"):
                    existing_emails.add(email_prop["email"].strip().lower())
                
                # İsim
                name_prop = props.get("İsim", {})
                title_arr = name_prop.get("title", [])
                if title_arr and title_arr[0].get("text", {}).get("content"):
                    existing_names.add(title_arr[0]["text"]["content"].strip().lower())
            
            has_more = data.get("has_more", False)
            next_cursor = data.get("next_cursor")
            time.sleep(0.1) # rate limit prevention
            logger.info(f"Yüklenen: {total_fetched} kayıt...")
            
        except Exception as e:
            logger.error(f"Notion toplu çekim hatası: {e}")
            break
            
    logger.info(f"✅ Notion'dan {total_fetched} toplam kayıt çekildi.")
    logger.info(f"📊 Benzersiz Telefon: {len(existing_phones)}, Email: {len(existing_emails)}, İsim: {len(existing_names)}")
    return existing_phones, existing_emails, existing_names


def is_already_in_notion(raw_lead: Dict, existing_phones: set, existing_emails: set, existing_names: set) -> bool:
    """Temel bir heuristic ile raw_lead'in içinde daha önceden eklendiğine dair bir işaret olup olmadığına bakar.
    LLM'den önce (kredi harcamamak için) hızlı eleme yapar."""
    
    # Raw JSON'u string yap ve küçük harfe çevir
    raw_str = " ".join(str(v).lower() for v in raw_lead.values() if v)
    
    # Çok basit bir eşleşme arayacağız. Eğer sheet'teki veri Notiona geçtiyse,
    # telefon numarasından (aralardaki boşluklar hariç) yakalamaya çalışalım.
    for ep in existing_phones:
        # raw data içinde +90555 vb bir şey geçiyor mu?
        clean_ep = ep.replace(" ", "").replace("+90", "").replace("90", "")
        # En az 10 haneli numaralara bakalım
        if len(clean_ep) >= 10 and clean_ep in raw_str.replace(" ", ""):
            return True
            
    for em in existing_emails:
        if em in raw_str:
            return True
            
    # Eğer isim benzersiz bir isimse kontrol edelim
    for en in existing_names:
        # sadece 4 harften büyük isimler için hızlı eşleşme, false positive riski var, dikkatli ol
        if len(en) > 5 and en in raw_str:
            return True
            
    return False


def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def main():
    logger.info("=" * 60)
    logger.info("🚀 RECOVERY PIPELINE BAŞLADI")
    logger.info("=" * 60)
    
    if not Config.validate():
        logger.error("❌ Konfigürasyon hatalı — çıkılıyor")
        sys.exit(1)
        
    notion = NotionWriter()
    existing_phones, existing_emails, existing_names = fetch_all_notion_leads(notion)
    
    # Burada use_state_tab=False kullanarak TÜM lead'leri (baştan sona) çekiyoruz
    logger.info(f"📥 Sheets verileri çekiliyor: {Config.CRM_SHEET_TABS}")
    crm_reader = SheetsReader(
        spreadsheet_id=Config.CRM_SPREADSHEET_ID,
        sheet_tabs=Config.CRM_SHEET_TABS,
        reader_name="recovery_crm",
        use_state_tab=False
    )
    
    all_raw_rows = []
    try:
        crm_reader.authenticate()
        for tab_info in Config.CRM_SHEET_TABS:
            tab_name = tab_info["name"]
            logger.info(f"Tablo okunuyor: {tab_name}")
            rows = crm_reader.get_all_rows(tab_name)
            for r in rows:
                r["_source_tab"] = tab_name
                all_raw_rows.append(r)
    except Exception as e:
        logger.error(f"❌ Sheets okunamadı: {e}")
        sys.exit(1)
        
    logger.info(f"📊 Sheets'ten toplam {len(all_raw_rows)} satır çekildi.")
    
    # 1. Aşama Eleme (LLM Harcamadan, Heuristic ile)
    # Bu adım mükemmel değildir, ancak binlerce satırlık eski lead tablosunda LLM'i boğmamak içindir.
    suspicious_missing_leads = []
    
    for row in all_raw_rows:
        # Tabii LLM öncesi tam bir temizlik olmadığı için tam duplicate garantisi yoktur.
        # Bu yüzden emin olamadıklarımızı suspect listesine atıyoruz.
        if not is_already_in_notion(row, existing_phones, existing_emails, existing_names):
            suspicious_missing_leads.append(row)
            
    logger.info(f"🕵️ Heuristic filtreleme tamamlandı. {len(suspicious_missing_leads)} adet potansiyel EKSİK lead bulundu.")
    
    if not suspicious_missing_leads:
        logger.info("🎉 Hiçbir eksik lead bulunamadı. Sistem %100 senkronize.")
        sys.exit(0)
        
    # Her ihtimale karşı soralım, bulk temizleme yapılacak
    logger.info(f"🔄 LLM üzerinden detaylı analiz ve Notion'a yazma işlemi başlıyor...")
    
    stats = {"created": 0, "skipped": 0, "error": 0}
    
    # 20'şerli gruplar halinde işleyelim
    for chunked_raw in chunk_list(suspicious_missing_leads, 20):
        try:
            logger.info(f"LLM Chunk (Boyut: {len(chunked_raw)}) analiz ediliyor...")
            cleaned_leads = clean_leads_bulk(chunked_raw)
        except Exception as e:
            logger.error(f"❌ Toplu veri temizleme hatası (Chunk atlanıyor): {e}")
            continue
            
        for cleaned in cleaned_leads:
            # Sıkı Check 
            is_dup = False
            if cleaned["clean_phone"] and cleaned["clean_phone"] in existing_phones:
                is_dup = True
            elif cleaned["clean_email"] and cleaned["clean_email"] in existing_emails:
                is_dup = True
            elif not cleaned["clean_phone"] and not cleaned["clean_email"] and cleaned["clean_name"] and cleaned["clean_name"].lower() in existing_names:
                is_dup = True
                
            if is_dup:
                stats["skipped"] += 1
                continue
                
            # Hala dup değilse, demek ki gerçekten eksikmiş. Notion'a yaz!
            logger.info(f"🔥 YENİ KURTARILAN LEAD: {cleaned['clean_name']} - {cleaned['clean_phone']}")
            try:
                result = notion.process_lead(cleaned, skip_duplicate_check=True)
                action = result.get("action", "error")
                stats[action] = stats.get(action, 0) + 1
                
                if action == "created":
                    if cleaned["clean_phone"]: existing_phones.add(cleaned["clean_phone"])
                    if cleaned["clean_email"]: existing_emails.add(cleaned["clean_email"])
                    if cleaned["clean_name"]: existing_names.add(cleaned["clean_name"].lower())
            except Exception as e:
                logger.error(f"❌ Notion yazım hatası ({cleaned['clean_name']}): {e}")
                stats["error"] += 1
                
    logger.info("=" * 60)
    logger.info(f"✅ RECOVERY TAMAMLANDI")
    logger.info(f"📈 Kurtarılan ve Notion'a eklenen: {stats['created']}")
    logger.info(f"🔁 Önceden var olan (Heuristic kaçırmış): {stats['skipped']}")
    logger.info(f"❌ Hata alan: {stats['error']}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
