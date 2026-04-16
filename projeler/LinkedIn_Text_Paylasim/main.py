"""
LinkedIn Text Paylaşım — Ana orkestratör.
n8n'deki iki workflow'un birleştirilmiş Python karşılığı:
  1. LinkedIn Automation (Pazartesi): Haftanın en önemli 5 AI gelişmesi
  2. LinkedIn AI Tips (Perşembe): Herkesin kullanabileceği bilinmeyen AI tavsiyesi

Pipeline (her ikisi aynı):
  Schedule → Perplexity (Araştır) → GPT-4.1 (Post Yaz)
  → GPT-4.1-mini (Görsel Prompt) → Gemini (Görsel Üret)
  → LinkedIn API (Paylaş)
"""
import logging
import os
import time
import schedule

from logger import setup_logging
from core.researcher import Researcher
from core.post_writer import PostWriter
from core.image_generator import ImageGenerator
from core.linkedin_publisher import LinkedInPublisher
from core.notion_logger import NotionLogger


def run_weekly_news():
    """
    Workflow 1: Haftanın AI Haberleri — Her Pazartesi
    n8n: "LinkedIn Automation - Onaysız"
    """
    logging.info("=" * 60)
    logging.info("WORKFLOW 1: Haftanın AI Haberleri başlatılıyor...")
    logging.info("=" * 60)

    post_type = "Haftalık AI Haberleri"
    notion_logger = NotionLogger()

    try:
        # Duplicate kontrol
        if notion_logger.is_already_posted_this_week(post_type):
            logging.info("Bu hafta zaten AI haberleri postu atılmış. Atlanıyor.")
            return

        # Step 1: Perplexity ile araştırma
        researcher = Researcher()
        logging.info("Adım 1/5: Perplexity ile AI haberleri araştırılıyor...")
        research_content = researcher.research_weekly_news()
        logging.info(f"Araştırma tamamlandı ({len(research_content)} karakter)")

        # Step 2: GPT-4.1 ile post yaz
        writer = PostWriter()
        logging.info("Adım 2/5: GPT-4.1 ile LinkedIn postu yazılıyor...")
        post_text = writer.write_weekly_news_post(research_content)
        logging.info(f"Post yazıldı ({len(post_text)} karakter)")

        # Step 3: GPT-4.1-mini ile görsel prompt üret + Gemini ile görsel üret
        img_gen = ImageGenerator()
        logging.info("Adım 3/5: Görsel prompt üretiliyor + Gemini ile görsel oluşturuluyor...")
        image_path = img_gen.generate_post_image(post_text)
        if image_path:
            logging.info(f"Görsel üretildi: {image_path}")
        else:
            logging.warning("Görsel üretilemedi, sadece metin post atılacak.")

        # Step 4: LinkedIn'e paylaş
        publisher = LinkedInPublisher()
        logging.info("Adım 4/5: LinkedIn'e paylaşılıyor...")
        post_urn = publisher.create_text_image_post(text=post_text, image_path=image_path)

        if post_urn:
            linkedin_url = f"https://www.linkedin.com/feed/update/{post_urn}/"
            logging.info(f"Adım 5/5: Notion'a loglanıyor...")
            notion_logger.log_post(
                post_type=post_type,
                status="Success",
                post_text=post_text,
                linkedin_url=linkedin_url
            )
            logging.info("=" * 60)
            logging.info(f"✅ BAŞARILI: AI haberleri postu paylaşıldı!")
            logging.info(f"LinkedIn URL: {linkedin_url}")
            logging.info("=" * 60)
        else:
            logging.error("LinkedIn post oluşturulamadı!")
            notion_logger.log_post(
                post_type=post_type,
                status="Failed",
                post_text=post_text,
                error_message="LinkedIn API post oluşturma başarısız"
            )

        # Temizlik: geçici görsel dosyasını sil
        if image_path and os.path.exists(image_path):
            os.remove(image_path)
            logging.info(f"Geçici görsel silindi: {image_path}")

    except Exception as e:
        logging.error(f"FATAL: Haftanın AI haberleri workflow hatası: {e}", exc_info=True)
        try:
            notion_logger.log_post(
                post_type=post_type,
                status="Failed",
                error_message=str(e)[:2000]
            )
        except Exception:
            pass


def run_weekly_tip():
    """
    Workflow 2: Haftalık AI Tavsiyesi — Her Perşembe
    n8n: "LinkedIn AI Tips - Onaysız"
    """
    logging.info("=" * 60)
    logging.info("WORKFLOW 2: Haftalık AI Tavsiyesi başlatılıyor...")
    logging.info("=" * 60)

    post_type = "Haftalık AI Tavsiyesi"
    notion_logger = NotionLogger()

    try:
        # Duplicate kontrol
        if notion_logger.is_already_posted_this_week(post_type):
            logging.info("Bu hafta zaten AI tavsiyesi postu atılmış. Atlanıyor.")
            return

        # Step 1: Perplexity ile araştırma
        researcher = Researcher()
        logging.info("Adım 1/5: Perplexity ile AI tavsiyesi araştırılıyor...")
        research_content = researcher.research_weekly_tip()
        logging.info(f"Araştırma tamamlandı ({len(research_content)} karakter)")

        # Step 2: GPT-4.1 ile post yaz
        writer = PostWriter()
        logging.info("Adım 2/5: GPT-4.1 ile LinkedIn postu yazılıyor...")
        post_text = writer.write_weekly_tip_post(research_content)
        logging.info(f"Post yazıldı ({len(post_text)} karakter)")

        # Step 3: GPT-4.1-mini ile görsel prompt üret + Gemini ile görsel üret
        img_gen = ImageGenerator()
        logging.info("Adım 3/5: Görsel prompt üretiliyor + Gemini ile görsel oluşturuluyor...")
        image_path = img_gen.generate_post_image(post_text)
        if image_path:
            logging.info(f"Görsel üretildi: {image_path}")
        else:
            logging.warning("Görsel üretilemedi, sadece metin post atılacak.")

        # Step 4: LinkedIn'e paylaş
        publisher = LinkedInPublisher()
        logging.info("Adım 4/5: LinkedIn'e paylaşılıyor...")
        post_urn = publisher.create_text_image_post(text=post_text, image_path=image_path)

        if post_urn:
            linkedin_url = f"https://www.linkedin.com/feed/update/{post_urn}/"
            logging.info(f"Adım 5/5: Notion'a loglanıyor...")
            notion_logger.log_post(
                post_type=post_type,
                status="Success",
                post_text=post_text,
                linkedin_url=linkedin_url
            )
            logging.info("=" * 60)
            logging.info(f"✅ BAŞARILI: AI tavsiyesi postu paylaşıldı!")
            logging.info(f"LinkedIn URL: {linkedin_url}")
            logging.info("=" * 60)
        else:
            logging.error("LinkedIn post oluşturulamadı!")
            notion_logger.log_post(
                post_type=post_type,
                status="Failed",
                post_text=post_text,
                error_message="LinkedIn API post oluşturma başarısız"
            )

        # Temizlik
        if image_path and os.path.exists(image_path):
            os.remove(image_path)
            logging.info(f"Geçici görsel silindi: {image_path}")

    except Exception as e:
        logging.error(f"FATAL: Haftalık AI tavsiyesi workflow hatası: {e}", exc_info=True)
        try:
            notion_logger.log_post(
                post_type=post_type,
                status="Failed",
                error_message=str(e)[:2000]
            )
        except Exception:
            pass


if __name__ == "__main__":
    setup_logging()

    import os
    from datetime import datetime
    mode = os.environ.get("RUN_MODE", "cron").lower()

    if mode == "schedule":
        # Lokal geliştirme veya sürekli çalışan mod
        logging.info("LinkedIn_Text_Paylasim started in SCHEDULE mode (local dev).")
        logging.info("Zamanlama: Pazartesi 08:00 (AI Haberleri) + Perşembe 08:00 (AI Tavsiyesi)")
        schedule.every().monday.at("08:00").do(run_weekly_news)
        schedule.every().thursday.at("08:00").do(run_weekly_tip)
        while True:
            schedule.run_pending()
            time.sleep(60)
    else:
        # Railway Cron modu: container açılır, gün kontrolü yapar, ilgili job çalışır, exit.
        # Cron: 0 5 * * 1,4 (UTC 05:00 Pazartesi+Perşembe = TR 08:00)
        today = datetime.utcnow().weekday()  # 0=Monday, 3=Thursday
        logging.info(f"LinkedIn_Text_Paylasim started in CRON mode. Today is weekday={today}")

        if today == 0:  # Monday
            logging.info("Bugün Pazartesi — Haftalık AI Haberleri workflow'u çalıştırılıyor...")
            run_weekly_news()
        elif today == 3:  # Thursday
            logging.info("Bugün Perşembe — Haftalık AI Tavsiyesi workflow'u çalıştırılıyor...")
            run_weekly_tip()
        else:
            logging.info(f"Bugün ne Pazartesi ne Perşembe (weekday={today}). Atlanıyor.")

        logging.info("Job finished. Container will now exit.")
