#!/usr/bin/env python3
"""
Contact Finder modülü — Yeni bulunan markalar için iletişim bilgisi toplar.

Pipeline (v2 — Waterfall):
1. Web Scrape → Contact/about sayfalarından email çıkarma (ücretsiz, sınırsız)
2. Hunter.io Domain Search → Domain genelinde email arama (50 kredi/ay)
3. Instagram Bio Email → IG bio'dan email regex (Apify gerekebilir)
4. Hunter.io Email Verification → Bulunan emaili doğrula
5. Doğrulanamayan/bulunamayan → email boş bırakılır, email_status: "not_found"

Apollo.io kaldırıldı (403 hatası, artık çalışmıyor).
"""

import json
import logging
import os
import re
import time
import requests
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ─── Web Scraper: Email bulmak için taranacak sayfalar ───
CONTACT_PATHS = [
    "/contact", "/contact-us", "/about", "/about-us",
    "/partnerships", "/partner", "/collaborate",
    "/press", "/media", "/business",
    "/influencer", "/creators", "/work-with-us",
    "/imprint", "/impressum",
]

EMAIL_PATTERN = re.compile(
    r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
)

# Scrape sonuçlarından filtrelenecek gürültü domain'leri
NOISE_DOMAINS = {
    "sentry.io", "wixpress.com", "cloudflare.com",
    "googleapis.com", "w3.org", "schema.org",
    "facebook.com", "twitter.com", "instagram.com",
    "google.com", "apple.com", "microsoft.com",
    "example.com", "email.com", "test.com",
    "your-domain.com", "yourdomain.com",
}

# Gürültü email prefix'leri
NOISE_PREFIXES = {
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "mailer-daemon", "postmaster", "webmaster",
    "abuse", "security",
}

# Tercih sırası — en değerli email prefix'leri önce gelir
PREFERRED_PREFIXES = [
    "partnerships", "partner", "influencer", "creators", "collab",
    "marketing", "brand", "business", "press", "media",
    "hello", "contact", "info", "team",
]

# Kişi pozisyonları için anahtar kelimeler
TARGET_TITLE_KEYWORDS = [
    "influencer", "partnership", "marketing", "brand",
    "growth", "creator", "content", "collab",
]

WEB_SCRAPER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def _get_env(key, fallback_lines=None):
    """Env var veya bilgi dosyasından değer al."""
    val = os.environ.get(key)
    if val:
        return val
    knowledge_path = os.path.join(BASE_DIR, "..", "..", "_knowledge", "api-anahtarlari.md")
    if os.path.exists(knowledge_path) and fallback_lines:
        with open(knowledge_path, "r") as f:
            content = f.read()
        for search_term in fallback_lines:
            for line in content.split("\n"):
                if search_term in line:
                    match = re.search(r"`([^`]+)`", line)
                    if match:
                        return match.group(1)
    return None


def get_domain_from_url(url):
    """URL'den domaini çıkarır."""
    if not url:
        return ""
    if not url.startswith("http"):
        url = "https://" + url
    parsed = urlparse(url)
    domain = parsed.netloc
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def guess_website_from_handle(handle):
    """Instagram handle'dan olası web sitesini tahmin et (genişletilmiş)."""
    clean = handle.lower().replace("_", "").replace(".", "")

    # AI handle'ı varsa .ai uzantısını öne al
    if "ai" in handle.lower():
        base = handle.lower().replace("_ai", "").replace(".ai", "").replace("_", "")
        candidates = [
            f"https://{base}.ai",
            f"https://www.{base}.ai",
            f"https://{base}.com",
            f"https://www.{base}.com",
            f"https://{clean}.ai",
            f"https://{clean}.com",
        ]
    else:
        candidates = [
            f"https://{clean}.com",
            f"https://www.{clean}.com",
            f"https://{clean}.ai",
            f"https://{clean}.io",
            f"https://{clean}.co",
            f"https://www.{clean}.ai",
            f"https://www.{clean}.io",
        ]

    # Ayrıca alt çizgili hali de dene (brand_name.com)
    if "_" in handle:
        dashed = handle.lower().replace("_", "-")
        candidates.extend([
            f"https://{dashed}.com",
            f"https://{dashed}.ai",
            f"https://{dashed}.io",
        ])

    # Dedup (sıralama koru)
    seen = set()
    unique = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    for url in unique:
        try:
            resp = requests.head(url, timeout=5, allow_redirects=True)
            if resp.status_code < 400:
                return url
        except Exception:
            continue

    return ""


# ═══════════════════════════════════════════════════════════
# KADEME 1: Web Scraper — Contact sayfalarından email çıkar
# ═══════════════════════════════════════════════════════════

def _is_noise_email(email):
    """Gürültü email'lerini filtrele (tracking pixel, CDN, vb)."""
    email_lower = email.lower()
    domain = email_lower.split("@")[-1] if "@" in email_lower else ""
    prefix = email_lower.split("@")[0] if "@" in email_lower else ""

    # Domain kontrolü
    if domain in NOISE_DOMAINS:
        return True

    # Prefix kontrolü
    if prefix in NOISE_PREFIXES:
        return True

    # Dosya uzantısı gibi görünen sahte email'ler
    if domain.endswith((".png", ".jpg", ".gif", ".svg", ".css", ".js")):
        return True

    # Çok kısa veya çok uzun
    if len(email_lower) < 5 or len(email_lower) > 80:
        return True

    return False


def _select_best_email(emails):
    """Email listesinden en uygununu seç (tercih sırasına göre)."""
    emails_lower = [e.lower() for e in emails]

    for prefix in PREFERRED_PREFIXES:
        for email in emails_lower:
            if email.startswith(prefix + "@"):
                return email

    # Hiçbiri eşleşmezse → en genel olanı döndür (info, hello vb genellikle iyidir)
    return emails_lower[0]


def scrape_contact_emails(website):
    """
    Web sitesinin contact/about sayfalarından email adresi çıkarır.
    Ücretsiz, sınırsız, API gerektirmez.

    Returns:
        str or None: Bulunan en uygun email adresi
    """
    if not website:
        return None

    print(f"  🔍 Web Scrape: {website} taranıyor...")
    all_emails = set()

    # Ana sayfa + contact sayfaları
    base = website.rstrip("/")
    urls_to_check = [base]
    for path in CONTACT_PATHS:
        urls_to_check.append(f"{base}{path}")

    for url in urls_to_check:
        try:
            resp = requests.get(
                url, timeout=8, headers=WEB_SCRAPER_HEADERS,
                allow_redirects=True,
            )
            if resp.status_code != 200:
                continue

            page_text = resp.text

            # 1. mailto: linklerinden çıkar (en güvenilir kaynak)
            mailto_emails = re.findall(r'mailto:([^"\'\'?\s&]+)', page_text)
            for e in mailto_emails:
                e_clean = e.strip().lower()
                if not _is_noise_email(e_clean):
                    all_emails.add(e_clean)

            # 2. Regex ile tüm email pattern'lerini bul
            page_emails = EMAIL_PATTERN.findall(page_text)
            for e in page_emails:
                e_clean = e.strip().lower()
                if not _is_noise_email(e_clean):
                    all_emails.add(e_clean)

        except requests.exceptions.RequestException:
            continue
        except Exception as exc:
            logger.debug(f"Web scrape hatası ({url}): {exc}")
            continue

    if not all_emails:
        print(f"  ℹ️ Web Scrape: Email bulunamadı")
        return None

    best = _select_best_email(list(all_emails))
    print(f"  ✅ Web Scrape: {best} (toplam {len(all_emails)} email bulundu)")
    return best


# ═══════════════════════════════════════════════════════════
# KADEME 2: Hunter.io Domain Search — API ile email arama
# ═══════════════════════════════════════════════════════════

def search_hunter_domain(domain, api_key):
    """
    Hunter.io Domain Search — Domaindeki emailleri ara.

    Returns:
        tuple: (personal_emails: list, general_emails: list)
    """
    if not api_key:
        return [], []

    print(f"  🔍 Hunter.io Domain Search: {domain}...")
    endpoint = "https://api.hunter.io/v2/domain-search"
    params = {
        "domain": domain,
        "api_key": api_key,
        "limit": 10,
    }

    try:
        resp = requests.get(endpoint, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            emails = data.get("emails", [])

            personal_emails = []
            general_emails = []

            for e in emails:
                email_val = e.get("value", "")
                email_type = e.get("type", "")

                if email_type == "personal":
                    name = f"{e.get('first_name', '')} {e.get('last_name', '')}".strip()
                    pos = e.get("position", "")
                    personal_emails.append({
                        "email": email_val,
                        "name": name,
                        "position": pos,
                    })
                elif email_type == "generic":
                    general_emails.append(email_val)

            if personal_emails:
                print(f"  ✅ Hunter Domain: {len(personal_emails)} kişisel email")
            if general_emails:
                print(f"  ℹ️ Hunter Domain: {len(general_emails)} genel email")
            if not personal_emails and not general_emails:
                print(f"  ℹ️ Hunter Domain: Email bulunamadı")

            return personal_emails, general_emails
        elif resp.status_code == 429:
            print("  ⚠️ Hunter.io rate limit aşıldı")
    except Exception as e:
        logger.error(f"Hunter.io Domain Search hatası: {e}", exc_info=True)

    return [], []


# ═══════════════════════════════════════════════════════════
# KADEME 3: Instagram Bio Email — Regex ile email çıkar
# ═══════════════════════════════════════════════════════════

def extract_email_from_ig_bio(handle):
    """
    Instagram biyografisinden email çıkarmayı dener.
    Apify Instagram Scraper kullanır.

    Returns:
        str or None: Bulunan email
    """
    apify_token = os.environ.get("APIFY_API_KEY") or _get_env("APIFY_API_KEY", ["Apify"])
    if not apify_token or not handle:
        return None

    print(f"  🔍 IG Bio Scrape: @{handle}...")

    try:
        # Apify Instagram Profile Scraper kullan
        resp = requests.post(
            "https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs",
            headers={
                "Authorization": f"Bearer {apify_token}",
                "Content-Type": "application/json",
            },
            json={
                "usernames": [handle],
                "resultsLimit": 1,
            },
            timeout=30,
        )

        if resp.status_code != 201:
            print(f"  ℹ️ IG Bio: Apify başlatılamadı (HTTP {resp.status_code})")
            return None

        run_id = resp.json().get("data", {}).get("id")
        if not run_id:
            return None

        # Sonucu bekle (max 90 saniye)
        for _ in range(9):
            time.sleep(10)
            status_resp = requests.get(
                f"https://api.apify.com/v2/actor-runs/{run_id}",
                headers={"Authorization": f"Bearer {apify_token}"},
                timeout=10,
            )
            status = status_resp.json().get("data", {}).get("status")

            if status == "SUCCEEDED":
                dataset_id = status_resp.json()["data"]["defaultDatasetId"]
                items = requests.get(
                    f"https://api.apify.com/v2/datasets/{dataset_id}/items",
                    headers={"Authorization": f"Bearer {apify_token}"},
                    timeout=10,
                ).json()

                if items:
                    bio = items[0].get("biography", "") or ""
                    external_url = items[0].get("externalUrl", "") or ""
                    business_email = items[0].get("businessEmail", "") or ""

                    # Önce business email field'ını kontrol et
                    if business_email and not _is_noise_email(business_email):
                        print(f"  ✅ IG Bio: {business_email} (business email)")
                        return business_email.lower()

                    # Bio'dan email regex ile çıkar
                    bio_emails = EMAIL_PATTERN.findall(bio)
                    for e in bio_emails:
                        if not _is_noise_email(e):
                            print(f"  ✅ IG Bio: {e} (bio'dan)")
                            return e.lower()

                    # External URL'yi de website olarak döndürebiliriz (ileride)
                    print(f"  ℹ️ IG Bio: Email bulunamadı")
                break

            elif status in ("FAILED", "ABORTED", "TIMED-OUT"):
                print(f"  ⚠️ IG Bio: Apify run {status}")
                break

    except Exception as exc:
        logger.error(f"IG Bio scrape hatası: {exc}", exc_info=True)

    return None


# ═══════════════════════════════════════════════════════════
# ADIM 4: Hunter.io Email Verification
# ═══════════════════════════════════════════════════════════

def verify_email(email, api_key):
    """
    Hunter.io Email Verification — Emailin gerçek olup olmadığını doğrula.

    Returns:
        dict: {is_valid, status, score}
    """
    if not api_key or not email:
        return {"is_valid": False, "status": "no_api_key", "score": 0}

    print(f"  🔍 Hunter.io Verify: {email}...")
    endpoint = "https://api.hunter.io/v2/email-verifier"
    params = {
        "email": email,
        "api_key": api_key,
    }

    try:
        resp = requests.get(endpoint, params=params, timeout=15)
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            result = data.get("result", "unknown")
            score = data.get("score", 0)

            is_valid = result in ("deliverable", "accept_all")

            if is_valid:
                print(f"  ✅ Verify: {email} → {result} (score: {score})")
            else:
                print(f"  ❌ Verify: {email} → {result} (score: {score}) — REDDEDİLDİ")

            return {"is_valid": is_valid, "status": result, "score": score}
        elif resp.status_code == 429:
            print("  ⚠️ Hunter.io verify rate limit")
            return {"is_valid": False, "status": "rate_limited", "score": 0}
    except Exception as e:
        logger.error(f"Hunter.io Verify hatası: {e}", exc_info=True)

    return {"is_valid": False, "status": "error", "score": 0}


# ═══════════════════════════════════════════════════════════
# ANA FONKSİYON: Marka için iletişim bilgisi topla (Waterfall)
# ═══════════════════════════════════════════════════════════

def find_contacts_for_brand(brand_info):
    """
    Tek bir marka için iletişim bilgisi toplar.

    Waterfall (v2):
    1. Web Scrape → Contact/about sayfalarından email (ücretsiz, sınırsız)
    2. Hunter.io Domain Search → API ile email arama (50 kredi/ay)
    3. Instagram Bio → IG biyografisinden email regex (Apify ile)
    4. Hunter.io Email Verify → Bulunan emaili doğrula

    Args:
        brand_info: dict with keys: instagram_handle, marka_adi, website (optional)

    Returns:
        dict: {website, best_email, email_contact_name, email_contact_title,
               email_status, email_source, personal_emails}
    """
    handle = brand_info.get("instagram_handle", "")
    brand_name = brand_info.get("marka_adi", handle)
    website = brand_info.get("website", "")

    print(f"\n📧 İletişim aranıyor: {brand_name} (@{handle})")

    # ─── Web sitesini bul/doğrula ───
    if not website:
        website = guess_website_from_handle(handle)
        if website:
            print(f"  🌐 Web sitesi tahmin edildi: {website}")
        else:
            print(f"  ⚠️ Web sitesi bulunamadı")

    domain = get_domain_from_url(website)

    # ─── API anahtarı ───
    hunter_key = _get_env("HUNTER_API_KEY", ["Hunter.io", "API Anahtarı"])

    best_email = None
    contact_name = ""
    contact_title = ""
    email_source = ""
    personal_emails = []

    # ═══ KADEME 1: Web Scrape (ücretsiz, sınırsız) ═══
    if website:
        scraped_email = scrape_contact_emails(website)
        if scraped_email:
            best_email = scraped_email
            email_source = "web_scrape"

    # ═══ KADEME 2: Hunter.io Domain Search (50 kredi/ay) ═══
    if not best_email and domain:
        hunter_personal, hunter_general = search_hunter_domain(domain, hunter_key)
        personal_emails = hunter_personal

        if hunter_personal:
            selected = _select_best_personal(hunter_personal)
            best_email = selected["email"]
            contact_name = selected.get("name", "")
            contact_title = selected.get("position", "")
            email_source = "hunter_domain_personal"
        elif hunter_general:
            best_email = _select_best_general(hunter_general)
            email_source = "hunter_domain_general"

    # ═══ KADEME 3: Instagram Bio Email (Apify) ═══
    if not best_email and handle:
        ig_email = extract_email_from_ig_bio(handle)
        if ig_email:
            best_email = ig_email
            email_source = "instagram_bio"

    # ═══ KADEME 4: Email Verification ═══
    if best_email and hunter_key:
        verification = verify_email(best_email, hunter_key)

        if verification["is_valid"]:
            email_status = "verified"
            print(f"  ✅ Doğrulanmış email: {best_email}")
        else:
            print(f"  ⛔ Email doğrulanamadı: {best_email} → {verification['status']}")
            # Web scrape'den gelen email'ler genellikle doğrudur.
            # Sadece "undeliverable" ise reddet, diğer durumlarda (risky, unknown) kabul et.
            if verification["status"] == "undeliverable":
                print(f"     → Bu markaya email GÖNDERİLMEYECEK")
                email_status = f"failed_verification:{verification['status']}"
                best_email = ""
                contact_name = ""
                contact_title = ""
            else:
                # risky / unknown / accept_all → yine de dene
                email_status = f"partially_verified:{verification['status']}"
                print(f"     → Kısmi doğrulama ({verification['status']}), yine de denenecek")
    elif best_email:
        # Hunter key yoksa ama email bulduk — doğrulama olmadan kullan
        email_status = "unverified"
        print(f"  ⚠️ Hunter key yok — email doğrulanamadı, direkt kullanılacak")
    else:
        email_status = "not_found"
        if not domain:
            print(f"  ⛔ Domain bulunamadığı için email araması yapılamadı")
        else:
            print(f"  ⛔ Email bulunamadı — bu markaya email GÖNDERİLMEYECEK")

    # ─── Sonuç ───
    result = {
        "website": website,
        "best_email": best_email,
        "email_contact_name": contact_name,
        "email_contact_title": contact_title,
        "email_status": email_status,
        "email_source": email_source,
        "personal_emails": personal_emails,
    }

    if best_email:
        print(f"  ✅ Sonuç: {best_email} (kaynak: {email_source})")
    else:
        print(f"  ⚠️ Sonuç: Email yok — marka CSV'ye '{email_status}' olarak kaydedilecek")

    return result


def _empty_result(website=""):
    """Boş sonuç döndürür."""
    return {
        "website": website,
        "best_email": "",
        "email_contact_name": "",
        "email_contact_title": "",
        "email_status": "not_found",
        "email_source": "",
        "personal_emails": [],
    }


def _select_best_personal(personal_emails):
    """
    Kişisel emailler arasından en uygununu seç.
    Marketing/partnerships/brand/influencer pozisyonlarını tercih et.
    """
    for person in personal_emails:
        pos = (person.get("position") or "").lower()
        for kw in TARGET_TITLE_KEYWORDS:
            if kw in pos:
                return person

    return personal_emails[0]


def _select_best_general(general_emails):
    """
    Genel emailler arasından en uygununu seç.
    partnerships@ > business@ > hello@ > contact@ > info@ sıralaması.
    """
    for prefix in PREFERRED_PREFIXES:
        for email in general_emails:
            if email.lower().startswith(prefix + "@"):
                return email

    return general_emails[0]


# ═══════════════════════════════════════════════════════════
# BATCH İŞLEM
# ═══════════════════════════════════════════════════════════

def enrich_new_brands(new_brands):
    """
    Yeni bulunan markalara iletişim bilgisi ekler.

    Args:
        new_brands: list of brand dicts from analyzer

    Returns:
        list of enriched brand dicts
    """
    print(f"\n{'='*60}")
    print(f"📧 {len(new_brands)} marka için iletişim bilgisi aranıyor...")
    print(f"{'='*60}")

    enriched = []
    for brand in new_brands:
        contacts = find_contacts_for_brand(brand)
        brand.update(contacts)
        enriched.append(brand)
        time.sleep(1)  # Rate limiting

    # İstatistikler
    verified = sum(1 for b in enriched if b.get("email_status") == "verified")
    partial = sum(1 for b in enriched if (b.get("email_status") or "").startswith("partially"))
    unverified = sum(1 for b in enriched if b.get("email_status") == "unverified")
    not_found = sum(1 for b in enriched if b.get("email_status") == "not_found")
    failed = sum(1 for b in enriched if (b.get("email_status") or "").startswith("failed"))

    # Kaynak dağılımı
    sources = {}
    for b in enriched:
        src = b.get("email_source", "none") or "none"
        sources[src] = sources.get(src, 0) + 1

    print(f"\n{'='*60}")
    print(f"📊 İLETİŞİM SONUÇ RAPORU")
    print(f"   ✅ Doğrulanmış: {verified}/{len(enriched)}")
    print(f"   🔶 Kısmi doğrulama: {partial}/{len(enriched)}")
    print(f"   ⚪ Doğrulanmamış: {unverified}/{len(enriched)}")
    print(f"   ⛔ Bulunamayan: {not_found}/{len(enriched)}")
    print(f"   ❌ Doğrulama başarısız: {failed}/{len(enriched)}")
    print(f"   📡 Kaynaklar: {json.dumps(sources, ensure_ascii=False)}")
    print(f"{'='*60}")

    return enriched


if __name__ == "__main__":
    # Test: tek marka
    test = find_contacts_for_brand({
        "instagram_handle": "test_ai",
        "marka_adi": "Test AI",
    })
    print(json.dumps(test, indent=2, ensure_ascii=False))
