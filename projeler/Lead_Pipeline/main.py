"""
Lead Pipeline — Birleşik Ana Modül (Cron Job)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tele Satış CRM + Lead Notifier Bot'u tek bir cron job'da birleştirir.

Çalışma mantığı:
  1. CRM Sheets'ten yeni lead'leri oku → Temizle → Notion'a yaz
  2. Notifier Sheets'ten yeni lead'leri oku → Telegram + Email bildirim gönder
  3. CRM Sheets'ten gelen lead'ler için de bildirim gönder
  4. Çık (cron schedule ile 5 dakikada bir tetiklenir)

Maliyet optimizasyonu:
  - Eski: 2 ayrı always-on servis (~$4.40/ay)
  - Yeni: 1 cron job (~$1.00/ay)
  - Tasarruf: ~$3.40/ay
"""
import sys
import time
import logging
from datetime import datetime

from config import Config
from sheets_reader import SheetsReader
from data_cleaner import clean_leads_bulk
from notion_writer import NotionWriter
from notifier import process_and_notify
from ops_logger import get_ops_logger
from watchdog import run_watchdog

# ── LOGGING ──────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("lead_pipeline")


def run_crm_pipeline(crm_reader: SheetsReader, notion: NotionWriter) -> int:
    """
    CRM Pipeline: Sheets → Temizle → Notion'a yaz.
    Returns: Bu turda oluşturulan yeni lead sayısı (watchdog için)
    """
    logger.info("═══ CRM Pipeline başlatılıyor ═══")

    try:
        new_rows = crm_reader.poll_all_tabs()
    except Exception as e:
        logger.error(f"❌ CRM Sheets okunamadı: {e}")
        crm_reader.rollback_pending()
        return 0

    if not new_rows:
        logger.info("📭 CRM: Yeni lead yok")
        crm_reader.confirm_processed()
        return 0

    logger.info(f"📊 CRM: {len(new_rows)} yeni satır bulundu")

    # Toplu veri temizleme (LLM Bulk Parsing — 20'lik chunk'lar halinde)
    # Büyük batch'lerde Groq token limiti aşımını önlemek için chunking yapılır.
    # Bu olmadan 50+ lead geldiğinde LLM 400 döner → boş liste → rollback → sonsuz döngü riski.
    LLM_CHUNK_SIZE = 20
    cleaned_leads = []
    for chunk_start in range(0, len(new_rows), LLM_CHUNK_SIZE):
        chunk = new_rows[chunk_start:chunk_start + LLM_CHUNK_SIZE]
        try:
            chunk_result = clean_leads_bulk(chunk)
            cleaned_leads.extend(chunk_result)
            logger.info(f"🧠 LLM Chunk [{chunk_start+1}-{chunk_start+len(chunk)}] → {len(chunk_result)} lead temizlendi")
        except Exception as e:
            logger.error(f"❌ LLM Chunk [{chunk_start+1}-{chunk_start+len(chunk)}] hatası: {e}", exc_info=True)
            # Chunk bazlı hata: bu chunk atlanır ama diğer chunk'lar devam eder

    if not cleaned_leads:
        logger.warning("⚠️ CRM: Temizlenebilir lead bulunamadı — state GÜNCELLENMEDİ (sonraki çalışmada tekrar denenecek)")
        crm_reader.rollback_pending()
        return 0

    # ── İSİM + İLETİŞİM VALİDASYONU ──────────────────────────
    # İsmi boş olan veya hiç iletişim bilgisi olmayan lead'leri filtrele.
    # Bu kontrol olmazsa "İsimsiz Lead" olarak Notion'a spam eklenir.
    valid_leads = []
    skipped_empty = 0
    for lead in cleaned_leads:
        has_name = bool(lead.get("clean_name", "").strip())
        has_phone = bool(lead.get("clean_phone", "").strip())
        has_email = bool(lead.get("clean_email", "").strip())

        if not has_name and not has_phone and not has_email:
            skipped_empty += 1
            continue
        if not has_name:
            # İsim yok ama telefon/email var — yine de atla,
            # çünkü CRM'de isimsiz kayıt istemiyoruz.
            skipped_empty += 1
            logger.warning(
                f"⚠️ İsim boş — lead atlandı. Tel: {lead.get('clean_phone')}, "
                f"Email: {lead.get('clean_email')}"
            )
            continue
        valid_leads.append(lead)

    if skipped_empty:
        logger.info(f"🚫 {skipped_empty} lead isim/iletişim eksikliği nedeniyle atlandı")

    cleaned_leads = valid_leads
    if not cleaned_leads:
        logger.info("📭 CRM: Validasyondan geçen lead kalmadı — tümü filtrelendi, state ROLLBACK yapılıyor (sessiz veri kaybı engellendi)")
        crm_reader.rollback_pending()
        return 0

    # Toplu (bulk) duplikasyon kontrolü — API çağrılarını azaltır
    try:
        existing_phones, existing_emails, existing_names = notion.bulk_check_duplicates(cleaned_leads)
        logger.info(
            f"🔍 Bulk duplikasyon kontrolü: "
            f"{len(existing_phones)} telefon, "
            f"{len(existing_emails)} email, "
            f"{len(existing_names)} isim eşleşti"
        )
    except Exception as e:
        logger.error(f"❌ Bulk duplikasyon kontrolü hatası: {e}")
        existing_phones, existing_emails, existing_names = set(), set(), set()

    # Lead'leri Notion'a ekle
    stats = {"created": 0, "skipped": 0, "error": 0}

    for cleaned in cleaned_leads:
        # Hızlı duplikasyon kontrolü (bulk sonuçlarıyla)
        is_dup = False
        if cleaned["clean_phone"] and cleaned["clean_phone"] in existing_phones:
            is_dup = True
            logger.info(f"🔁 Duplike (bulk): {cleaned['clean_name']} — telefon")
        elif cleaned["clean_email"] and cleaned["clean_email"] in existing_emails:
            is_dup = True
            logger.info(f"🔁 Duplike (bulk): {cleaned['clean_name']} — email")
        elif (not cleaned["clean_phone"] and not cleaned["clean_email"]
              and cleaned["clean_name"] and cleaned["clean_name"] in existing_names):
            is_dup = True
            logger.info(f"🔁 Duplike (bulk): {cleaned['clean_name']} — isim")

        if is_dup:
            stats["skipped"] += 1
            continue

        try:
            result = notion.process_lead(cleaned, skip_duplicate_check=True)
            action = result.get("action", "error")
            stats[action] = stats.get(action, 0) + 1

            if action == "created":
                # Yeni numaraları/emailleri cache'e ekle (sonraki dup kontrolü için)
                if cleaned["clean_phone"]:
                    existing_phones.add(cleaned["clean_phone"])
                if cleaned["clean_email"]:
                    existing_emails.add(cleaned["clean_email"])
        except Exception as e:
            logger.error(f"❌ Notion yazım hatası ({cleaned['clean_name']}): {e}")
            stats["error"] += 1

    summary_msg = (
        f"✅ {stats['created']} oluşturuldu | "
        f"🔁 {stats['skipped']} duplike | "
        f"❌ {stats['error']} hata"
    )
    logger.info(f"📋 CRM Sonuç: {summary_msg}")

    # Notion ops log
    ops = get_ops_logger("Lead_Pipeline", "CRM")
    if stats['error'] > 0:
        ops.warning("CRM Pipeline tamamlandı (hatalarla) - ROLLBACK tetiklendi", summary_msg)
        logger.warning("⚠️ Notion API hataları nedeniyle state GÜNCELLENMEDİ (Rollback yapıldı, bir sonraki turda hatalılar tekrar denenecek)")
        crm_reader.rollback_pending()
        return 0
    elif stats['created'] > 0:
        ops.success("CRM Pipeline tamamlandı", summary_msg)
        crm_reader.confirm_processed()
    else:
        ops.info("CRM Pipeline tamamlandı", summary_msg)
        crm_reader.confirm_processed()

    return stats['created']


def run_notifier_pipeline(notifier_reader: SheetsReader):
    """
    Notifier Pipeline: Sheets → Bildirim gönder.
    Sadece Notifier tablosundaki lead'leri bildirir.
    """
    logger.info("═══ Notifier Pipeline başlatılıyor ═══")

    # Notifier Sheets'ten yeni lead'leri oku ve bildir
    try:
        new_rows = notifier_reader.poll_all_tabs()
    except Exception as e:
        logger.error(f"❌ Notifier Sheets okunamadı: {e}")
        notifier_reader.rollback_pending()
        return

    if not new_rows:
        logger.info("📭 Notifier: Yeni lead yok")
        notifier_reader.confirm_processed()
        return

    logger.info(f"📣 Notifier: {len(new_rows)} yeni lead için bildirim gönderiliyor...")

    notify_stats = {"success": 0, "partial": 0, "failed": 0}

    for lead_data in new_rows:
        try:
            result = process_and_notify(lead_data)
            if result["telegram"] and result["email"]:
                notify_stats["success"] += 1
            elif result["telegram"] or result["email"]:
                notify_stats["partial"] += 1
            else:
                notify_stats["failed"] += 1
        except Exception as e:
            logger.error(f"❌ Bildirim hatası: {e}")
            notify_stats["failed"] += 1

    notify_msg = (
        f"✅ {notify_stats['success']} tam | "
        f"⚠️ {notify_stats['partial']} kısmi | "
        f"❌ {notify_stats['failed']} başarısız"
    )
    logger.info(f"📣 Notifier Sonuç: {notify_msg}")

    # Notion ops log
    ops = get_ops_logger("Lead_Pipeline", "Notifier")
    if notify_stats['failed'] > 0:
        ops.warning("Notifier Pipeline tamamlandı (hatalarla)", notify_msg)
    elif notify_stats['success'] > 0:
        ops.success("Notifier Pipeline tamamlandı", notify_msg)
    else:
        ops.info("Notifier Pipeline tamamlandı", notify_msg)

    notifier_reader.confirm_processed()


def main():
    """Ana pipeline — cron job olarak 5 dakikada bir çalışır."""
    start_time = time.time()
    logger.info("=" * 60)
    logger.info(f"🚀 Lead Pipeline başlatılıyor — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 60)

    # Konfigürasyon doğrulaması
    if not Config.validate():
        logger.error("❌ Konfigürasyon hatalı — çıkılıyor")
        sys.exit(1)

    # Reader'ları oluştur
    crm_reader = SheetsReader(
        spreadsheet_id=Config.CRM_SPREADSHEET_ID,
        sheet_tabs=Config.CRM_SHEET_TABS,
        reader_name="crm",
        use_state_tab=True
    )

    notifier_reader = SheetsReader(
        spreadsheet_id=Config.NOTIFIER_SPREADSHEET_ID,
        sheet_tabs=Config.NOTIFIER_SHEET_TABS,
        reader_name="notifier"
    )

    # Notion writer
    notion = NotionWriter()

    # Pipeline çalıştır
    try:
        # Adım 1: CRM Pipeline (Sheets → Notion)
        new_lead_count = run_crm_pipeline(crm_reader, notion)

        # Adım 2: Notifier Pipeline (Sheets → Telegram + Email)
        run_notifier_pipeline(notifier_reader)

        # Adım 3: Watchdog (Lead akışı izleme)
        try:
            run_watchdog(crm_reader.service, Config.CRM_SPREADSHEET_ID, new_lead_count)
        except Exception as e:
            logger.warning(f"⚠️ Watchdog hatası (pipeline etkilenmez): {e}")

    except Exception as e:
        logger.error(f"❌ Pipeline hatası: {e}", exc_info=True)
        get_ops_logger("Lead_Pipeline", "Pipeline").error("Pipeline çöktü", exception=e)
        get_ops_logger("Lead_Pipeline", "Pipeline").wait_for_logs()
        sys.exit(1)

    elapsed = time.time() - start_time
    logger.info(f"✅ Lead Pipeline tamamlandı — {elapsed:.1f}s sürdü")
    logger.info("=" * 60)

    # Tüm ops loglarının Notion'a yazılmasını bekle
    get_ops_logger("Lead_Pipeline", "Pipeline").wait_for_logs()


if __name__ == "__main__":
    main()
