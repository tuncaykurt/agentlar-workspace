import requests
from datetime import datetime
from config import NOTION_API_TOKEN, YOUTUBE_DB_ID, REELS_DB_ID

NOTION_VERSION = "2022-06-28"
HEADERS = {
    "Authorization": f"Bearer {NOTION_API_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}

def query_database(db_id, title_prop_name, status_prop_name, checkbox_prop_name, db_type_label, date_prop_name=None):
    """
    Notion veritabanından 'Yayınlandı' durumundaki kayıtları çeker.
    Bildirim Seviyesi, Son Bildirim Tarihi ve yayın tarihini de okur.
    """
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    
    # Sadece 'Yayınlandı' durumundakileri çekiyoruz
    payload = {
        "filter": {
            "property": status_prop_name,
            "select": {
                "equals": "Yayınlandı"
            }
        }
    }
    
    videos = []
    has_more = True
    next_cursor = None
    
    while has_more:
        if next_cursor:
            payload["start_cursor"] = next_cursor
            
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=30)
        
        if resp.status_code != 200:
            print(f"[{db_type_label}] Hata oluştu: {resp.status_code} - {resp.text}")
            break
            
        data = resp.json()
        results = data.get("results", [])
        
        for item in results:
            props = item.get("properties", {})
            
            # Title okuma
            title_prop = props.get(title_prop_name, {})
            title_arr = title_prop.get("title", [])
            title = "".join([t.get("plain_text", "") for t in title_arr]).strip() if title_arr else ""
            
            # Boş title → gerçek bir işbirliği kaydı değil, atla
            if not title:
                continue
            
            # Status okuma
            status_prop = props.get(status_prop_name, {})
            status = status_prop.get("select", {}).get("name", "") if status_prop.get("select") else ""
            
            # Checkbox okuma (Ödeme alındı mı?)
            check_prop = props.get(checkbox_prop_name, {})
            is_checked = check_prop.get("checkbox", False)
            
            

            # Yayın tarihi okuma (Reels'te "Paylaşım Tarihi", YouTube'da created_time fallback)
            published_date = None
            if date_prop_name:
                date_prop = props.get(date_prop_name, {})
                if date_prop.get("date") and date_prop["date"].get("start"):
                    published_date = date_prop["date"]["start"]
            
            # Eğer veritabanında tarih yoksa, Notion page'in created_time'ını kullan
            if not published_date:
                published_date = item.get("created_time", "")
            
            # Notion page URL'sini oluştur (tire kaldırılmış ID)
            page_id_clean = item["id"].replace("-", "")
            notion_url = f"https://www.notion.so/{page_id_clean}"
            
            videos.append({
                "id": item["id"],
                "title": title,
                "status": status,
                "check": is_checked,
                "database_type": db_type_label,
                "published_date": published_date,
                "notion_url": notion_url
            })
            
        has_more = data.get("has_more", False)
        next_cursor = data.get("next_cursor", None)
        
    return videos

def fetch_published_videos():
    """Tüm (YouTube ve Reels) yayımlanmış videoları çeker."""
    # YouTube DB sorgusu (tarih property'si yok, created_time fallback kullanılır)
    youtube_videos = query_database(
        db_id=YOUTUBE_DB_ID,
        title_prop_name="Video Adı",
        status_prop_name="Durum",
        checkbox_prop_name="Check",
        db_type_label="YouTube İşbirliği",
        date_prop_name=None  # YouTube DB'de tarih property'si yok
    )
    
    # Reels DB sorgusu (Paylaşım Tarihi property'si var)
    reels_videos = query_database(
        db_id=REELS_DB_ID,
        title_prop_name="Name",
        status_prop_name="Status",
        checkbox_prop_name="Check",
        db_type_label="Reels İşbirliği",
        date_prop_name="Paylaşım Tarihi"  # Gerçek yayın tarihi
    )
    
    return youtube_videos + reels_videos


def get_notification_level_from_comments(page_id):
    """
    Kayıdın yorumlarına bakar ve önceden atılmış uyarı mesajı varsa seviyeyi döndürür.
    """
    url = f"https://api.notion.com/v1/comments?block_id={page_id}"
    level = 0
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            comments = resp.json().get("results", [])
            for comment in comments:
                try:
                    text_arr = comment.get("rich_text", [])
                    if not text_arr: continue
                    text = text_arr[0].get("plain_text", "")
                    if "[SİSTEM] Kırmızı uyarı" in text:
                        level = max(level, 2)
                    elif "[SİSTEM] Sarı uyarı" in text:
                        level = max(level, 1)
                except Exception:
                    continue
    except Exception as e:
        print(f"Notion yorum okuma exception: {e}")
        
    return level


def add_page_comment(page_id, text):
    """
    Notion page'ine yorum olarak bildirim seviyesini ekler.
    """
    url = f"https://api.notion.com/v1/comments"
    
    payload = {
        "parent": {
            "page_id": page_id
        },
        "rich_text": [
            {
                "text": {
                    "content": text
                }
            }
        ]
    }
    
    try:
        resp = requests.post(url, headers=HEADERS, json=payload, timeout=30)
        if resp.status_code == 200:
            print(f"Notion'a yorum eklendi: page={page_id}")
            return True
        else:
            print(f"Notion yorum ekleme hatası: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"Notion yorum ekleme exception: {e}")
        return False
