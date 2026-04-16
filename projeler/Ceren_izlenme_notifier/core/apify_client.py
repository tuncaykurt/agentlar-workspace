from apify_client import ApifyClient
from datetime import datetime, timedelta, timezone
from logger import get_logger
from config import settings
from tenacity import retry, stop_after_attempt, wait_fixed

import random

logger = get_logger(__name__)

# Initialize the ApifyClient with a random API token for this execution
selected_key = random.choice(settings.APIFY_KEYS)
client = ApifyClient(selected_key)

@retry(stop=stop_after_attempt(2), wait=wait_fixed(15))
def call_apify_actor(actor_id, run_input):
    """
    Apify actor çağrısını yapar. Hata durumunda 15 saniye bekleyip 1 kez daha dener (toplam 2 deneme).
    """
    logger.info(f"Apify Actor çağrılıyor: {actor_id}")
    return client.actor(actor_id).call(run_input=run_input)

def is_within_7_days(date_str):
    """
    Checks if a given ISO8601 date string or timestamp is within the last 7 days.
    """
    if not date_str:
        return False
        
    try:
        if isinstance(date_str, (int, float)):
            # Handle standard unix timestamp (seconds). Sometimes scrapers return milliseconds.
            if date_str > 1e11:  # ms
                date_str = date_str / 1000
            dt = datetime.fromtimestamp(date_str, tz=timezone.utc)
        else:
            # Handle ISO string like "2024-03-01T12:00:00.000Z"
            # Replacing Z with +00:00 for python 3.10-, or use fromisoformat
            date_str = date_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(date_str)
            
        now = datetime.now(timezone.utc)
        margin = timedelta(days=7)
        return now - dt <= margin
    except Exception as e:
        logger.warning(f"Tarih ayristirma hatasi: {date_str} - {e}")
        return False

def get_instagram_data():
    """
    Instagram'dan profil bazli son gonderileri ceker ve filtrelenmis videoları listeler.
    Reels icin baraj: 200K > izlenme
    """
    logger.info("Instagram verileri çekiliyor...")
    videos = []
    try:
        post_run_input = {
            "usernames": ["INSTAGRAM_KULLANICI_ADI"],
            "resultsLimit": 7
        }
        
        run = call_apify_actor(settings.APIFY_INSTAGRAM_ACTOR, post_run_input)
        
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            # sometimesposts are inside latestPosts
            posts = item.get("latestPosts", [item]) if "latestPosts" in item else [item]
            for post in posts:
                dt = post.get("timestamp") or post.get("postedAt")
                if not is_within_7_days(dt):
                    continue
                    
                is_video = post.get("type") == "Video" or post.get("videoViewCount") is not None
                
                if is_video:
                    views = post.get("videoViewCount") or post.get("viewCount") or 0
                    if int(views) >= 200000:
                        videos.append({
                            "platform": "Instagram Reels",
                            "url": post.get("url"),
                            "views": views,
                            "date": dt
                        })
                    
    except Exception as e:
        logger.error(f"Instagram scrapinge hatasi: {e}", exc_info=True)
        return [], str(e)
        
    return videos, None

def get_tiktok_data():
    """
    TikTok'tan son 7 gunku videolari ceker. Baraj: 100K > izlenme
    """
    logger.info("TikTok verileri çekiliyor...")
    videos = []
    try:
        tk_run_input = {
            "profiles": ["[SOSYAL_MEDYA_KULLANICI]"],
            "resultsPerPage": 7,
            "downloadVideo": False
        }
        run = call_apify_actor(settings.APIFY_TIKTOK_ACTOR, tk_run_input)
        
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            dt = item.get("createTime") or item.get("createTimeISO")
            if not is_within_7_days(dt):
                continue
                
            views = item.get("playCount") or 0
            if isinstance(views, str):
                views = int(views.replace(",", ""))
                
            if views >= 100000:
                videos.append({
                    "platform": "TikTok",
                    "url": item.get("webVideoUrl") or item.get("videoUrl"),
                    "views": views,
                    "date": dt
                })
                
    except Exception as e:
        logger.error(f"TikTok scrapinge hatasi: {e}", exc_info=True)
        return [], str(e)
        
    return videos, None

def get_youtube_data():
    """
    YouTube'dan son 7 gunku videolari ve Shorts iceriklerini ceker. 
    Baraj: Shorts >= 100K, Long-Form >= 10K
    """
    logger.info("YouTube verileri çekiliyor...")
    videos = []
    try:
        yt_run_input = {
            "searchKeywords": "[SOSYAL_MEDYA_KULLANICI]",
            "maxResults": 5,
            "maxResultStreams": 0
        }
        run = call_apify_actor(settings.APIFY_YOUTUBE_ACTOR, yt_run_input)
        
        for item in client.dataset(run["defaultDatasetId"]).iterate_items():
            dt = item.get("uploadDate") or item.get("date")
            rel_date = str(item.get("date", "")).lower()
            
            is_recent = False
            if "hour" in rel_date or "minute" in rel_date or "second" in rel_date:
                is_recent = True
            elif "day" in rel_date:
                try:
                    num = int(rel_date.split(" ")[0])
                    if num <= 7:
                        is_recent = True
                except (ValueError, IndexError) as e:
                    logger.debug(f"rel_date parselama atlandi: {rel_date} - {e}")
            elif is_within_7_days(dt):
                is_recent = True
                
            if not is_recent:
                continue
                
            # Must be from our channel to be sure
            channel = item.get("channelName", "").lower()
            url_check = (item.get("url") or item.get("videoUrl") or "").lower()
            if "[isim]" not in channel and "[isim]" not in url_check:
                logger.debug(f"Baska kanal videosu atlandi: {channel}")
                continue
                
            views = item.get("viewCount") or item.get("views") or 0
            views_str = str(views).strip().upper().replace(",", "").replace(" ", "")
            try:
                if "M" in views_str:
                    views_num = int(float(views_str.replace("M", "")) * 1_000_000)
                elif "K" in views_str:
                    views_num = int(float(views_str.replace("K", "")) * 1_000)
                else:
                    views_num = int(float(views_str.replace(".", "")))
            except (ValueError, TypeError):
                views_num = 0
                    
            url = item.get("url") or item.get("videoUrl") or ""
            is_shorts = "/shorts/" in url or item.get("isShorts")
            
            if is_shorts and views_num >= 100000:
                videos.append({
                    "platform": "YouTube Shorts",
                    "url": url,
                    "views": int(views_num),
                    "date": dt or rel_date
                })
            elif not is_shorts and views_num >= 10000:
                videos.append({
                    "platform": "YouTube Long Video",
                    "url": url,
                    "views": int(views_num),
                    "date": dt or rel_date
                })

    except Exception as e:
        logger.error(f"YouTube scrapinge hatasi: {e}", exc_info=True)
        return [], str(e)
        
    return videos, None

def fetch_all_social_media():
    videos = []
    errors = []
    
    ig_videos, ig_err = get_instagram_data()
    videos.extend(ig_videos)
    if ig_err:
        errors.append(f"Instagram Hatası: {ig_err}")
        
    tk_videos, tk_err = get_tiktok_data()
    videos.extend(tk_videos)
    if tk_err:
        errors.append(f"TikTok Hatası: {tk_err}")
        
    yt_videos, yt_err = get_youtube_data()
    videos.extend(yt_videos)
    if yt_err:
        errors.append(f"YouTube Hatası: {yt_err}")
        
    return videos, errors
