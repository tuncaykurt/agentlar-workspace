"""
Revizyon Otomatik Kontrol Servisi
Günde 5 kez (10:00, 13:00, 16:00, 19:00, 22:00 TSİ) çalışarak
Notion'daki feedback satırlarını tarar ve revize eder.
"""

import datetime
import sys
from dotenv import load_dotenv

load_dotenv()

def run_job():
    """Revizyon kontrol işini çalıştır"""
    print(f"[{datetime.datetime.utcnow().isoformat()}] 🔄 Revizyon kontrolü başlatılıyor...")
    try:
        from check_revisions_job import run_cron_job
        run_cron_job()
    except Exception as e:
        print(f"[{datetime.datetime.utcnow().isoformat()}] ❌ Revizyon kontrolü hatası: {e}", file=sys.stderr)

def main():
    print("🚀 Revizyon Cron Worker başlıyor (Cron Modu).")
    run_job()
    print("Mevcut revizyonlar kontrol edildi.")
    sys.exit(0)

if __name__ == "__main__":
    main()
