#!/usr/bin/env python3
"""
Notion Service — Brand Reachout Tracker CRUD işlemleri.

Bu modül tüm Notion okuma/yazma işlemlerini tek noktada toplar.
Railway'de container reset olsa bile veri kaybolmaz.
"""

import os
import logging
import time
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# ── Sabitler ────────────────────────────────────────────────────────────
TR_TZ = timezone(timedelta(hours=3))

# Notion config — env'den okunur (fail-fast)
NOTION_TOKEN = os.environ.get("NOTION_SOCIAL_TOKEN", "")
NOTION_DB_ID = os.environ.get("NOTION_DB_BRAND_REACHOUT", "")
NOTION_DB_LOGS_ID = os.environ.get("NOTION_DB_BRAND_LOGS", "")

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# Property name → Notion property type mapping (referans)
# Marka Adı: title
# Email: email
# Website: url
# Kişi Adı: rich_text
# Açıklama: rich_text
# Outreach Status: select
# Outreach Date: date
# Thread ID: rich_text
# Message ID: rich_text
# Subject: rich_text
# Follow-up 1 Status: select
# Follow-up 1 Date: date
# Follow-up 2 Status: select
# Follow-up 2 Date: date
# Keşfedilme Tarihi: date
# Notlar: rich_text


def _headers():
    """Notion API headers."""
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _check_config():
    """Token ve DB ID kontrolü (fail-fast)."""
    if not NOTION_TOKEN:
        raise EnvironmentError(
            "NOTION_SOCIAL_TOKEN env variable tanımlı değil! "
            "Railway ENV veya master.env kontrol edin."
        )
    if not NOTION_DB_ID:
        raise EnvironmentError(
            "NOTION_DB_BRAND_REACHOUT env variable tanımlı değil! "
            "Railway ENV veya master.env kontrol edin."
        )
    if not NOTION_DB_LOGS_ID:
        logger.warning("NOTION_DB_BRAND_LOGS tanımlı değil, loglama yapılamayacak.")


# ═══════════════════════════════════════════════════════════════════════
# READ — Notion'dan marka listesi oku
# ═══════════════════════════════════════════════════════════════════════

def get_all_brands():
    """
    Tüm markaları Notion database'den okur.
    
    Returns:
        list[dict]: Her biri pipeline'ın beklediği formatta brand dict
    """
    import requests
    _check_config()
    
    url = f"{NOTION_API_BASE}/databases/{NOTION_DB_ID}/query"
    all_results = []
    has_more = True
    start_cursor = None
    
    while has_more:
        body = {"page_size": 100}
        if start_cursor:
            body["start_cursor"] = start_cursor
        
        resp = requests.post(url, headers=_headers(), json=body, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        all_results.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")
    
    brands = []
    for page in all_results:
        brand = _page_to_brand(page)
        brands.append(brand)
    
    logger.info(f"[NOTION] {len(brands)} marka okundu.")
    return brands


def get_brands_by_status(status):
    """
    Belirli bir outreach status'e sahip markaları filtreler.
    
    Args:
        status: "New", "Sent", "Replied", etc.
    
    Returns:
        list[dict]: Filtrelenmiş brand listesi
    """
    import requests
    _check_config()
    
    url = f"{NOTION_API_BASE}/databases/{NOTION_DB_ID}/query"
    all_results = []
    has_more = True
    start_cursor = None
    
    while has_more:
        body = {
            "filter": {
                "property": "Outreach Status",
                "select": {"equals": status}
            },
            "page_size": 100,
        }
        if start_cursor:
            body["start_cursor"] = start_cursor
        
        resp = requests.post(url, headers=_headers(), json=body, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        all_results.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")
    
    brands = [_page_to_brand(p) for p in all_results]
    logger.info(f"[NOTION] Status='{status}': {len(brands)} marka bulundu.")
    return brands


def get_followup_candidates():
    """
    Follow-up adaylarını filtreler.
    
    Returns:
        tuple: (followup1_candidates, followup2_candidates)
    """
    sent_brands = get_brands_by_status("Sent")
    now = datetime.now(TR_TZ)
    
    followup1 = []
    followup2 = []
    
    for brand in sent_brands:
        outreach_date = _parse_date(brand.get("outreach_date", ""))
        followup1_status = brand.get("followup_status", "")
        followup2_status = brand.get("followup2_status", "")
        
        # Follow-up 1 adayı: outreach gönderilmiş, 5+ gün geçmiş, followup1 yok
        if not followup1_status and outreach_date:
            days_since = (now - outreach_date).days
            if days_since >= 5:
                brand["_days_since"] = days_since
                brand["_followup_type"] = "followup1"
                followup1.append(brand)
        
        # Follow-up 2 adayı: followup1 gönderilmiş, 5+ gün geçmiş, followup2 yok
        elif followup1_status == "Sent" and not followup2_status:
            followup1_date = _parse_date(brand.get("followup_date", ""))
            if followup1_date:
                days_since = (now - followup1_date).days
                if days_since >= 5:
                    brand["_days_since"] = days_since
                    brand["_followup_type"] = "followup2"
                    followup2.append(brand)
    
    logger.info(f"[NOTION] Follow-up: {len(followup1)} FU1 + {len(followup2)} FU2 adayı")
    return followup1, followup2


# ═══════════════════════════════════════════════════════════════════════
# WRITE — Notion'a yeni marka ekle
# ═══════════════════════════════════════════════════════════════════════

def add_brand(brand_info):
    """
    Yeni markayı Notion database'e ekler.
    
    Args:
        brand_info: dict with marka_adi, email, website, etc.
    
    Returns:
        str: Notion page ID (sonraki update'lerde kullanılır)
    """
    import requests
    _check_config()
    
    props = _brand_to_properties(brand_info)
    body = {
        "parent": {"database_id": NOTION_DB_ID},
        "properties": props,
    }
    
    resp = requests.post(
        f"{NOTION_API_BASE}/pages", headers=_headers(), json=body, timeout=30
    )
    resp.raise_for_status()
    page_id = resp.json()["id"]
    
    logger.info(f"[NOTION] ✅ Marka eklendi: {brand_info.get('marka_adi', '?')} → {page_id}")
    return page_id


def add_brands_batch(enriched_brands):
    """
    Birden fazla markayı Notion'a ekler.
    
    Args:
        enriched_brands: list of enriched brand dicts
    
    Returns:
        list: brand dicts with notion_page_id eklendi
    """
    added = 0
    for brand in enriched_brands:
        try:
            email = brand.get("best_email", "")
            email_status = brand.get("email_status", "not_found")
            
            brand_data = {
                "marka_adi": brand.get("marka_adi", ""),
                "instagram_handle": brand.get("instagram_handle", ""),
                "email": email,
                "website": brand.get("website", ""),
                "kisi_adi": brand.get("email_contact_name", ""),
                "aciklama": brand.get("sirket_aciklamasi", ""),
                "outreach_status": "New" if email and email_status == "verified" else "No_Email",
                "notlar": f"Email bulunamadı ({email_status})" if not email else "",
                "kesfedilme_tarihi": datetime.now(TR_TZ).strftime("%Y-%m-%d"),
            }
            
            page_id = add_brand(brand_data)
            brand["notion_page_id"] = page_id
            added += 1
            
            # Eğer email bulunamadıysa, bunu da loglara yazalım.
            if brand_data["outreach_status"] == "No_Email":
                try:
                    log_data = {
                        "icerik_kimligi": f"[NO_EMAIL] {brand_data['marka_adi']}",
                        "mail_durumu": "Bulunamadı",
                        "ai_yorumu": f"Marka bulundu adım 3'e geçti, ancak e-posta adresi çıkarılamadı (Durum: {email_status}).",
                        "mail_icerigi": "Mail adresi bulunamadığı için mail oluşturulmadı."
                    }
                    log_ai_process(log_data)
                except Exception as e:
                    logger.error(f"[NOTION LOG] No_Email loglanamadı: {e}")

            time.sleep(0.35)  # Notion rate limit: ~3 req/sec
        except Exception as e:
            logger.error(f"[NOTION] ❌ Marka eklenemedi: {brand.get('marka_adi', '?')}: {e}", exc_info=True)
    
    print(f"[NOTION] ✅ {added}/{len(enriched_brands)} marka Notion'a eklendi.")
    return enriched_brands


# ═══════════════════════════════════════════════════════════════════════
# UPDATE — Notion'daki marka bilgilerini güncelle
# ═══════════════════════════════════════════════════════════════════════

def update_brand(page_id, updates):
    """
    Notion page'ini günceller.
    
    Args:
        page_id: Notion page ID
        updates: dict of field names and values to update
    
    Supported fields:
        outreach_status, outreach_date, thread_id, message_id, subject,
        followup_status, followup_date, followup_message_id,
        followup2_status, followup2_date, followup2_message_id, notlar
    """
    import requests
    _check_config()
    
    props = {}
    
    # Select fields
    select_map = {
        "outreach_status": "Outreach Status",
        "followup_status": "Follow-up 1 Status",
        "followup2_status": "Follow-up 2 Status",
    }
    for key, notion_name in select_map.items():
        if key in updates and updates[key]:
            props[notion_name] = {"select": {"name": updates[key]}}
    
    # Date fields
    date_map = {
        "outreach_date": "Outreach Date",
        "followup_date": "Follow-up 1 Date",
        "followup2_date": "Follow-up 2 Date",
    }
    for key, notion_name in date_map.items():
        if key in updates and updates[key]:
            date_val = updates[key]
            if " " in date_val:  # "2026-03-26 15:30" → ISO format
                date_val = date_val.replace(" ", "T") + ":00+03:00"
            props[notion_name] = {"date": {"start": date_val}}
    
    # Rich text fields
    text_map = {
        "thread_id": "Thread ID",
        "message_id": "Message ID",
        "subject": "Subject",
        "followup_message_id": "Follow-up 1 Message ID",  # Bu alan DB'de yoksa oluşturulur
        "followup2_message_id": "Follow-up 2 Message ID",
        "notlar": "Notlar",
    }
    for key, notion_name in text_map.items():
        if key in updates:
            val = updates[key] or ""
            props[notion_name] = {"rich_text": [{"text": {"content": val}}]} if val else {"rich_text": []}
    
    if not props:
        logger.warning(f"[NOTION] Güncellenecek alan yok: {updates}")
        return
    
    body = {"properties": props}
    resp = requests.patch(
        f"{NOTION_API_BASE}/pages/{page_id}", headers=_headers(), json=body, timeout=30
    )
    resp.raise_for_status()
    logger.info(f"[NOTION] ✅ Güncellendi: {page_id} → {list(updates.keys())}")


# ═══════════════════════════════════════════════════════════════════════
# HELPERS — Notion data format dönüşümleri
# ═══════════════════════════════════════════════════════════════════════

def _page_to_brand(page):
    """Notion page'ini pipeline'ın beklediği dict formatına çevirir."""
    props = page.get("properties", {})
    
    return {
        "notion_page_id": page["id"],
        "marka_adi": _get_title(props.get("Marka Adı", {})),
        "email": props.get("Email", {}).get("email", "") or "",
        "website": (props.get("Website", {}).get("url", "") or ""),
        "kisi_adi": _get_rich_text(props.get("Kişi Adı", {})),
        "email_contact_name": _get_rich_text(props.get("Kişi Adı", {})),
        "sirket_aciklamasi": _get_rich_text(props.get("Açıklama", {})),
        "outreach_status": _get_select(props.get("Outreach Status", {})),
        "outreach_date": _get_date(props.get("Outreach Date", {})),
        "outreach_thread_id": _get_rich_text(props.get("Thread ID", {})),
        "outreach_message_id": _get_rich_text(props.get("Message ID", {})),
        "outreach_subject": _get_rich_text(props.get("Subject", {})),
        "instagram_handle": _get_rich_text(props.get("Instagram Handle", {})),
        "followup_status": _get_select(props.get("Follow-up 1 Status", {})),
        "followup_date": _get_date(props.get("Follow-up 1 Date", {})),
        "followup_message_id": _get_rich_text(props.get("Follow-up 1 Message ID", {})),
        "followup2_status": _get_select(props.get("Follow-up 2 Status", {})),
        "followup2_date": _get_date(props.get("Follow-up 2 Date", {})),
        "notlar": _get_rich_text(props.get("Notlar", {})),
        "kesfedilme_tarihi": _get_date(props.get("Keşfedilme Tarihi", {})),
    }


def _brand_to_properties(brand):
    """Pipeline brand dict'ini Notion properties formatına çevirir."""
    props = {
        "Marka Adı": {"title": [{"text": {"content": brand.get("marka_adi", "")}}]},
    }
    
    if brand.get("email"):
        props["Email"] = {"email": brand["email"]}
    if brand.get("website"):
        props["Website"] = {"url": brand["website"]}
    if brand.get("kisi_adi"):
        props["Kişi Adı"] = {"rich_text": [{"text": {"content": brand["kisi_adi"]}}]}
    if brand.get("aciklama"):
        props["Açıklama"] = {"rich_text": [{"text": {"content": brand["aciklama"]}}]}
    if brand.get("instagram_handle"):
        props["Instagram Handle"] = {"rich_text": [{"text": {"content": brand["instagram_handle"]}}]}
    if brand.get("outreach_status"):
        props["Outreach Status"] = {"select": {"name": brand["outreach_status"]}}
    if brand.get("notlar"):
        props["Notlar"] = {"rich_text": [{"text": {"content": brand["notlar"]}}]}
    if brand.get("kesfedilme_tarihi"):
        props["Keşfedilme Tarihi"] = {"date": {"start": brand["kesfedilme_tarihi"]}}
    
    return props


def _get_title(prop):
    """Notion title property'den plain text çıkarır."""
    items = prop.get("title", [])
    return items[0]["plain_text"] if items else ""


def _get_rich_text(prop):
    """Notion rich_text property'den plain text çıkarır."""
    items = prop.get("rich_text", [])
    return items[0]["plain_text"] if items else ""


def _get_select(prop):
    """Notion select property'den value çıkarır."""
    sel = prop.get("select")
    return sel["name"] if sel else ""


def _get_date(prop):
    """Notion date property'den ISO string çıkarır."""
    date = prop.get("date")
    if date and date.get("start"):
        return date["start"]
    return ""


def _parse_date(date_str):
    """Tarih string'ini parse eder (ISO ve TR formatlarını destekler)."""
    if not date_str or not date_str.strip():
        return None
    try:
        # ISO format: 2026-03-26T15:30:00+03:00
        if "T" in date_str:
            from datetime import datetime as dt
            return dt.fromisoformat(date_str)
        # Simple date: 2026-03-26
        return datetime.strptime(date_str.strip(), "%Y-%m-%d").replace(tzinfo=TR_TZ)
    except (ValueError, TypeError):
        return None


# ═══════════════════════════════════════════════════════════════════════
# DUPLICATE CHECK — Aynı markayı tekrar eklememek için
# ═══════════════════════════════════════════════════════════════════════

def brand_exists(marka_adi):
    """Marka adının Notion'da zaten var olup olmadığını kontrol eder."""
    import requests
    _check_config()
    
    url = f"{NOTION_API_BASE}/databases/{NOTION_DB_ID}/query"
    body = {
        "filter": {
            "property": "Marka Adı",
            "title": {"equals": marka_adi}
        },
        "page_size": 1,
    }
    
    resp = requests.post(url, headers=_headers(), json=body, timeout=30)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return len(results) > 0


# ═══════════════════════════════════════════════════════════════════════
# AI İŞLEM LOGLARI (SÜREÇ TAKİBİ)
# ═══════════════════════════════════════════════════════════════════════

def log_ai_process(log_data):
    """
    Kullanıcının talebi üzerine, profillerin nasıl analiz edildiğini,
    AI'ın yorumlarını, mail bulunma durumunu ve atılan mailleri loglar.
    
    Beklenen log_data argümanları:
    - icerik_kimligi (str): Profil Adı veya Video ID vs.
    - profil_cekimi (str): "Başarılı" veya "Başarısız"
    - orijinal_caption (str)
    - ai_yorumu (str): AI'ın caption vb değerlendirmesi
    - mail_durumu (str): "Bulundu", "Bulunamadı", "Aranmadı"
    - bulunan_mailler (str)
    - mail_icerigi (str): Üretilen veya Atılan Mail İçeriği
    """
    import requests
    _check_config()
    
    if not NOTION_DB_LOGS_ID:
        logger.warning(f"NOTION_DB_BRAND_LOGS tanımlı olmadığı için log yazılamadı: {log_data.get('icerik_kimligi')}")
        return None
        
    date_str = datetime.now(TR_TZ).isoformat()
    
    # 2000 karakterlik limitten korunmak için uzun textleri kırp
    def safe_text(txt):
        if not txt:
            return ""
        if len(txt) > 2000:
            return txt[:1997] + "..."
        return txt
        
    props = {
        "İçerik / Profil Kimliği": {"title": [{"text": {"content": safe_text(log_data.get("icerik_kimligi", "Bilinmeyen Başlık"))}}]},
        "İşlem Tarihi": {"date": {"start": date_str}},
    }
    
    if log_data.get("profil_cekimi"):
        props["1-Profil Çekimi"] = {"select": {"name": log_data["profil_cekimi"]}}
        
    if log_data.get("orijinal_caption"):
        props["Orijinal Caption"] = {"rich_text": [{"text": {"content": safe_text(log_data["orijinal_caption"])}}]}
        
    if log_data.get("ai_yorumu"):
        props["2-AI Caption Yorumu"] = {"rich_text": [{"text": {"content": safe_text(log_data["ai_yorumu"])}}]}
        
    if log_data.get("mail_durumu"):
        props["3-Mail Bulma Durumu"] = {"select": {"name": log_data["mail_durumu"]}}
        
    if log_data.get("bulunan_mailler"):
        props["Bulunan Mailler"] = {"rich_text": [{"text": {"content": safe_text(log_data["bulunan_mailler"])}}]}
        
    if log_data.get("mail_icerigi"):
        props["4-Oluşturulan Mail İçeriği"] = {"rich_text": [{"text": {"content": safe_text(log_data["mail_icerigi"])}}]}

    body = {
        "parent": {"database_id": NOTION_DB_LOGS_ID},
        "properties": props,
    }
    
    try:
        resp = requests.post(f"{NOTION_API_BASE}/pages", headers=_headers(), json=body, timeout=30)
        resp.raise_for_status()
        logger.info(f"[NOTION LOG] ✅ AI işlemi loglandı: {log_data.get('icerik_kimligi')}")
        return resp.json()["id"]
    except Exception as e:
        logger.error(f"[NOTION LOG] ❌ Log yazılamadı: {e}", exc_info=True)
        return None
