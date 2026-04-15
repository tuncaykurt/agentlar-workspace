import os
import sys
import datetime
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
_master_env = "ANTIGRAVITY_ROOT_BURAYA/_knowledge/credentials/master.env"
if os.path.exists(_master_env):
    load_dotenv(_master_env)

from notion_service import NOTION_TOKEN, DATABASE_ID
from revision_engine import process_all_revisions

# Null guard: Railway'de env var eksikse erken çık
if not NOTION_TOKEN or not DATABASE_ID:
    print("⚠️ NOTION_TOKEN veya DATABASE_ID tanımlı değil. Revizyon kontrolü atlanıyor.")


def get_recently_edited_pages(hours_ago: int = 24) -> list:
    """
    Fetches pages from the Notion database that were edited within the last N hours.
    This helps to limit the number of API calls when searching for revisions.
    """
    url = f"https://api.notion.com/v1/databases/{DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    # Calculate ISO time for N hours ago
    past_time = (datetime.datetime.utcnow() - datetime.timedelta(hours=hours_ago)).isoformat() + "Z"

    # We filter by Last edited time to only check recently touched pages
    payload = {
        "filter": {
            "timestamp": "last_edited_time",
            "last_edited_time": {
                "on_or_after": past_time
            }
        },
        "page_size": 50
    }

    pages = []
    has_more = True
    next_cursor = None

    while has_more:
        if next_cursor:
            payload["start_cursor"] = next_cursor

        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if response.status_code != 200:
            print(f"❌ Veritabanı sorgusu başarısız: {response.status_code} - {response.text}")
            break

        data = response.json()
        for res in data.get("results", []):
            page_id = res["id"]
            
            # Kapak URL var mı diye bakalım, çünkü bazen url property'sinde durur
            # Drive Folder bilgisini de props'tan alalım
            props = res.get("properties", {})
            drive_folder_url = None
            if "Kapak" in props and "url" in props["Kapak"]:
                drive_folder_url = props["Kapak"]["url"]
            elif "Google Drive URL" in props and "url" in props["Google Drive URL"]:
                drive_folder_url = props["Google Drive URL"]["url"]
                
            pages.append({
                "page_id": page_id,
                "drive_folder_url": drive_folder_url
            })

        has_more = data.get("has_more", False)
        next_cursor = data.get("next_cursor")

    return pages


def run_cron_job():
    print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 🔄 Otomatik Revizyon Kontrolü Başlıyor...")
    
    # 1. Son 24 saatte güncellenen sayfaları bul
    recent_pages = get_recently_edited_pages(hours_ago=24)
    print(f"🔍 Son 24 saatte güncellenmiş {len(recent_pages)} sayfa bulundu.")
    
    total_processed = 0
    total_success = 0
    
    # API Limits & Loops Protection: Max 10 sayfada feedback işle. 
    # Not: process_all_revisions zaten sadece "✅" veya "⚠️" olmayanları işler.
    
    for page_data in recent_pages[:10]:
        page_id = page_data["page_id"]
        drive_folder_url = page_data.get("drive_folder_url")
        
        try:
            results = process_all_revisions(page_id, drive_folder_url)
            total_processed += results.get("total", 0)
            total_success += results.get("success", 0)
        except Exception as e:
            print(f"❌ Sayfa işlenirken hata oluştu ({page_id}): {e}")
            
    print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] ✅ Otomatik Revizyon Kontrolü Tamamlandı.")
    print(f"   Bulunan Toplam Revize: {total_processed}")
    print(f"   Başarılı Düzenleme: {total_success}")


if __name__ == "__main__":
    run_cron_job()
