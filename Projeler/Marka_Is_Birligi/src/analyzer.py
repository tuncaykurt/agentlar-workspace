#!/usr/bin/env python3
"""
Analyzer modülü — Scrape edilen reels'lerden AI marka mention'larını tespit eder.

Caption analizine dayanarak hangi markaların influencer iş birliği yaptığını bulur
ve yeni markaları keşfeder.
"""

import csv
import json
import os
import re
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_REELS_PATH = os.path.join(BASE_DIR, "data", "raw_reels.json")
MARKALAR_CSV = os.path.join(BASE_DIR, "data", "markalar.csv")
CALISAN_MARKALAR_PATH = os.path.join(BASE_DIR, "data", "calisan_markalar.json")

# ── İş birliği belirteçleri ─────────────────────────────────────────────────
COLLAB_MARKERS_TR = [
    "işbirliği", "iş birliği", "reklam", "sponsorlu",
    "sponsor", "ortaklık", "tanıtım",
]
COLLAB_MARKERS_EN = [
    "ad ", " ad\n", "#ad ", "sponsored", "partnership",
    "collab", "collaboration", "paid partnership",
]

# ── Bilinen AI markaları ────────────────────────────────────────────────────
KNOWN_AI_BRANDS = {
    "chatgpt", "openai", "claude", "anthropic", "gemini", "googlegemini",
    "midjourney", "dalle", "dall_e", "stability", "stablediffusion",
    "copilot", "microsoftcopilot", "perplexity", "perplexity_ai",
    "runway", "runwayml", "heygen", "heygenofficial", "synthesia",
    "sora", "luma_ai", "lumalabs", "kling", "klingai", "klingcreator",
    "pika", "topview_ai", "topviewai", "creatify.ai", "creatifyai",
    "canva", "adobe", "adobefirefly", "figma", "pixelcut", "pixelcutapp",
    "napkin_ai", "napkinai", "suno", "sunomusic", "udio",
    "jasper_ai", "copy.ai", "writesonic", "aithor", "aithorai",
    "repl.it", "replit", "cursor_ai", "cursorapp", "v0", "v0dev",
    "bolt", "boltai", "elevenlabs", "descript", "gamma", "gammaapp",
    "ideogram", "ideogramai", "fluxai", "flux", "recraft", "recraftai",
    "magnific", "magnific_ai", "krea", "krea_ai", "invideo", "invideoai",
    "captions", "captionsapp", "pictory", "pictoryai",
}

AI_KEYWORDS = [
    "ai", "yapay zeka", "artificial intelligence", "machine learning",
    "deep learning", "gpt", "llm", "generative", "neural",
    "automation", "chatbot", "copilot",
]

# ── False positive filtresi ─────────────────────────────────────────────────
FALSE_POSITIVES = {
    "ibrahimselim", "birceakalay", "duygubaloglut",
    "sedaincekilagoz", "gaminggentr", "nvidiageforcetr",
    "hepsiburada", "iamozdesign", "raw.dijital",
    "aysevain", "burakcakir.ai", "archivinciai",
}

SKIP_BIG_COMPANIES = {
    "googleturkiye", "googlegemini", "meta.ai", "samsungturkiye",
}


def extract_mentions_from_caption(caption):
    """Caption metninden @mention'ları çıkarır."""
    return re.findall(r"@([\w.]+)", caption)


def normalize_mention(mention):
    """Mention'ı temizler."""
    return mention.strip().rstrip(".").lower()


def has_collab_marker(caption):
    """Caption'da iş birliği belirteci var mı?"""
    cap_lower = caption.lower()
    for marker in COLLAB_MARKERS_TR + COLLAB_MARKERS_EN:
        if marker in cap_lower:
            return True
    if "/işbirliği" in cap_lower or "/iş birliği" in cap_lower:
        return True
    return False


def extract_mentions_from_field(mentions_field):
    """Apify mentions alanından kullanıcı adlarını çıkarır."""
    results = []
    if not mentions_field:
        return results
    for m in mentions_field:
        if isinstance(m, str):
            results.append(normalize_mention(m))
        elif isinstance(m, dict):
            username = m.get("username", "")
            if username:
                results.append(normalize_mention(username))
    return results


def is_likely_ai_brand(handle, sources):
    """Bir markanın yapay zeka odaklı olup olmadığını tahmin eder."""
    handle_lower = handle.lower()

    if handle_lower in KNOWN_AI_BRANDS:
        return True

    for kw in ["ai", "_ai", ".ai", "yapay", "zeka"]:
        if kw in handle_lower:
            return True

    for src in sources:
        caption = src.get("caption_snippet", "").lower()
        ai_score = sum(1 for kw in AI_KEYWORDS if kw in caption)
        if ai_score >= 2 and src.get("is_collab"):
            return True

    return False


def load_existing_brands():
    """Halihazırda çalışılan markaları yükler."""
    handles = set()
    names = set()
    
    if os.path.exists(CALISAN_MARKALAR_PATH):
        with open(CALISAN_MARKALAR_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        handles = set(h.lower() for h in data.get("instagram_handles_to_exclude", []))
        names = set(n.lower().strip() for n in data.get("brands", []))
    
    return handles, names


def load_existing_csv_brands():
    """Mevcut markalar.csv'deki markaları yükler (dedup için)."""
    existing = set()
    if os.path.exists(MARKALAR_CSV):
        with open(MARKALAR_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                handle = row.get("instagram_handle", "").strip().lower().lstrip("@")
                if handle:
                    existing.add(handle)
    return existing


def analyze_reels(reels):
    """
    Reels verilerinden marka mention'larını analiz eder.
    
    Returns:
        dict: {handle: {mention_count, sources, instagram_handle, has_collab_marker}}
    """
    brands = defaultdict(lambda: {"mention_count": 0, "sources": [], "instagram_handle": ""})

    # Kendi profil kullanıcı adlarımız — bunları filtreleyelim
    competitor_handles = set()
    for reel in reels:
        owner = (reel.get("ownerUsername") or "").lower()
        if owner:
            competitor_handles.add(owner)

    for reel in reels:
        caption = reel.get("caption") or ""
        owner_username = (reel.get("ownerUsername") or "").lower()
        url = reel.get("url") or ""
        is_collab = has_collab_marker(caption)

        mentions_from_field = extract_mentions_from_field(reel.get("mentions"))
        mentions_from_caption = [normalize_mention(m) for m in extract_mentions_from_caption(caption)]
        tagged_users = extract_mentions_from_field(reel.get("taggedUsers"))

        all_mentions = set(mentions_from_field + mentions_from_caption + tagged_users)
        all_mentions -= competitor_handles
        all_mentions -= {"", "yapayzeka", "ai", "yapay_zeka"}

        for mention in all_mentions:
            brand = brands[mention]
            brand["mention_count"] += 1
            brand["instagram_handle"] = mention
            brand["sources"].append({
                "profil": owner_username,
                "caption_snippet": caption[:200],
                "url": url,
                "is_collab": is_collab,
            })

    return dict(brands)


def find_new_brands(reels=None):
    """
    Ana analiz fonksiyonu. Yeni markaları keşfeder.
    
    Args:
        reels: Reel verisi listesi. None ise dosyadan okur.
    
    Returns:
        list[dict]: Yeni bulunan markaların listesi
    """
    if reels is None:
        if not os.path.exists(RAW_REELS_PATH):
            print("[ANALYZER] raw_reels.json bulunamadı!")
            return []
        with open(RAW_REELS_PATH, "r", encoding="utf-8") as f:
            reels = json.load(f)

    print(f"[ANALYZER] {len(reels)} reel analiz ediliyor...")

    all_brands = analyze_reels(reels)
    print(f"[ANALYZER] {len(all_brands)} benzersiz mention tespit edildi.")

    # Filtreleme
    existing_handles, existing_names = load_existing_brands()
    csv_handles = load_existing_csv_brands()
    all_existing_handles = existing_handles | csv_handles

    new_brands = []
    seen_names = set()

    for handle, data in sorted(all_brands.items(), key=lambda x: -x[1]["mention_count"]):
        # False positive filtresi
        if handle in FALSE_POSITIVES or handle in SKIP_BIG_COMPANIES:
            continue

        # Zaten çalışılan marka filtresi
        if handle.lower() in all_existing_handles:
            continue

        # AI markası kontrolü
        if not is_likely_ai_brand(handle, data["sources"]):
            continue

        # İsim bazlı dedup
        brand_name = handle.replace("_", " ").replace(".", " ").title()
        name_lower = brand_name.lower()
        if name_lower in seen_names:
            continue
        if any(ex in name_lower or name_lower in ex for ex in existing_names if len(ex) > 2):
            continue
        seen_names.add(name_lower)

        has_collab = any(s["is_collab"] for s in data["sources"])
        source_profiles = list(set(s["profil"] for s in data["sources"]))

        new_brands.append({
            "instagram_handle": handle,
            "marka_adi": brand_name,
            "mention_sayisi": data["mention_count"],
            "is_collab": has_collab,
            "kaynak_profiller": source_profiles,
            "caption_samples": [s["caption_snippet"][:100] for s in data["sources"][:3]],
        })

    print(f"[ANALYZER] ✅ {len(new_brands)} yeni marka keşfedildi!")
    for b in new_brands:
        collab_icon = "🤝" if b["is_collab"] else "🤖"
        print(f"  {collab_icon} @{b['instagram_handle']} ({b['mention_sayisi']} mention)")

    return new_brands


if __name__ == "__main__":
    new = find_new_brands()
    print(f"\nToplam yeni marka: {len(new)}")
