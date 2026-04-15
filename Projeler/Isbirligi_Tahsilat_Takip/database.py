"""
database.py — Tahsilat Bildirim Takip

Bildirim seviyesi takibi:
  1. Önce Notion yorumlarından (eski [SİSTEM] yorumları) seviye okunur
  2. In-memory cache ile aynı process'te tekrar gönderim engellenir
  3. Notion'a yeni yorum atılMAZ (kullanıcı talebi)

Bildirim Seviyeleri:
  0 = Henüz bildirim gönderilmedi
  1 = Sarı uyarı (14 gün) gönderildi
  2 = Kırmızı uyarı (28 gün) gönderildi
"""

from datetime import datetime
from notion_client import get_notification_level_from_comments, add_page_comment

# In-memory bildirim seviyesi takibi
# Aynı process süresince tekrar gönderimi engeller
# Key: page_id, Value: gönderilmiş max seviye
_notified_cache = {}


def mark_as_notified(record_id, level):
    """
    Bildirim seviyesini Notion'a yorum olarak kaydeder + in-memory cache günceller.
    
    Notion yorumu, cron job'un bir sonraki çalışmasında seviyeyi doğru okumasını sağlar.
    (In-memory cache tek process içinde çalışır, cron'da her çalışma yeni process'tir.)
    
    Args:
        record_id: Notion page ID
        level: 1=sarı (14 gün), 2=kırmızı (28 gün)
    """
    today = datetime.now().strftime("%Y-%m-%d")
    
    if level == 1:
        comment_text = f"[SİSTEM] Sarı uyarı (seviye 1) e-posta gönderildi — {today}"
        print(f"[LOG] {comment_text} — page={record_id}")
    elif level == 2:
        comment_text = f"[SİSTEM] Kırmızı uyarı (seviye 2) e-posta gönderildi — {today}"
        print(f"[LOG] {comment_text} — page={record_id}")
    else:
        return False
    
    # Notion'a yorum olarak state kaydet (cron'lar arası kalıcılık)
    add_page_comment(record_id, comment_text)
    
    # In-memory cache'e de kaydet (aynı process içinde tekrar gönderim engeli)
    current = _notified_cache.get(record_id, 0)
    _notified_cache[record_id] = max(current, level)
    
    return True


def get_pending_notifications(videos, days_threshold=14):
    """
    Notion'dan çekilen video listesinden, bildirim gerektiren kayıtları filtreler.
    
    Bildirim seviyesi belirleme sırası:
    1. In-memory cache (aynı process'te gönderilmişse)
    2. Notion yorumları (eski [SİSTEM] yorumları — geriye uyumluluk)
    
    Kriterler:
    - Ödeme onayı verilmemiş (check=False)
    - Yayınlanma üzerinden en az days_threshold gün geçmiş
    - Henüz o seviyede bildirim gönderilmemiş (bildirim_seviyesi < 2)
    
    Args:
        videos: fetch_published_videos()'dan dönen video listesi
        days_threshold: Minimum gün eşiği (varsayılan: 14)
    
    Returns:
        Bildirim gerektiren video kayıtlarının listesi
    """
    pending = []
    now = datetime.now()
    
    for video in videos:
        # Ödeme alınmış (check=True) olanları atla
        if video.get("check", False):
            continue
        
        # Yayın tarihini parse et
        published_date_str = video.get("published_date", "")
        if not published_date_str:
            continue
        
        try:
            # ISO format destekle (2024-05-12T10:00:00.000Z veya 2024-05-12)
            pub_date_clean = published_date_str.split("T")[0]
            pub_date = datetime.strptime(pub_date_clean, "%Y-%m-%d")
            diff = now - pub_date
            
            if diff.days >= days_threshold:
                page_id = video["id"]
                
                # Bildirim seviyesi: önce cache, sonra Notion yorumları
                cache_level = _notified_cache.get(page_id, 0)
                if cache_level >= 2:
                    continue
                
                # Cache'de yoksa veya düşükse, Notion yorumlarına bak (eski veriler)
                if cache_level == 0:
                    notion_level = get_notification_level_from_comments(page_id)
                    bildirim_seviyesi = max(cache_level, notion_level)
                else:
                    bildirim_seviyesi = cache_level
                
                # Zaten kırmızı seviye (2) bildirim gönderilmişse atla
                if bildirim_seviyesi >= 2:
                    _notified_cache[page_id] = bildirim_seviyesi  # cache güncelle
                    continue
                
                pending.append({
                    "id": page_id,
                    "title": video["title"],
                    "db_type": video["database_type"],
                    "published_date": pub_date.strftime("%Y-%m-%d"),
                    "notified_level": bildirim_seviyesi,
                    "days_passed": diff.days,
                    "notion_url": video.get("notion_url", "https://www.notion.so")
                })
        except Exception as e:
            print(f"Tarih parse hatası: {e} — video: {video.get('title', 'Unknown')}")
    
    return pending
