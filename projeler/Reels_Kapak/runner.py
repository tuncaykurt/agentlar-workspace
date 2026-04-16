"""
Runner — Lokal çalıştırma script'i.
Environment variable'ları .env dosyasından veya ortam değişkenlerinden okur.
"""
import os
import sys

# Env var'lar .env dosyasından veya shell ortamından gelmelidir
# Örnek: export NOTION_TOKEN=xxx && python runner.py
required_vars = ["NOTION_TOKEN", "NOTION_DATABASE_ID", "KIE_API_KEY", "IMGBB_API_KEY", "GEMINI_API_KEY"]
missing = [v for v in required_vars if not os.environ.get(v)]
if missing:
    print(f"❌ Eksik environment variable'lar: {', '.join(missing)}")
    print("💡 Önce değişkenleri ayarlayın: export NOTION_TOKEN=xxx")
    sys.exit(1)

import main
main.process_ready_videos()
