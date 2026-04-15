from config import settings
from logger import get_logger
from core.apify_client import fetch_all_social_media
from infrastructure.email_sender import send_performance_report, send_technical_error_report
from core.llm_helper import generate_report_summary

logger = get_logger(__name__)

def main():
    logger.info(f"[TAKİP_EDİLEN_HESAP] Sosyal Medya Performans Raporu Botu Baslatildi (ENV={settings.ENV}, DRY_RUN={settings.IS_DRY_RUN})")
    try:
        videos, errors = fetch_all_social_media()
        
        if errors:
            logger.warning(f"Apify cekerken {len(errors)} hata olustu. Dev e-postasina bildiriliyor.")
            send_technical_error_report(errors)
            
        if videos:
            logger.info(f"Toplam {len(videos)} baraji asan video bulundu, maile hazirlaniyor...")
            summary = generate_report_summary(videos)
            send_performance_report(videos, report_summary=summary)
        else:
            logger.info("Baraji asan hicbir video bulunamadi, [TAKİP_EDİLEN_HESAP]'a e-posta gonderilmiyor.")
            
        logger.info("Islem basariyla tamamlandi.")
    except Exception as e:
        logger.error(f"Uygulama calisirken fatal bir hata olustu: {e}", exc_info=True)
        send_technical_error_report([f"Fatal Uygulama Hatası (Sistem Çöktü): {e}"])

if __name__ == "__main__":
    main()
