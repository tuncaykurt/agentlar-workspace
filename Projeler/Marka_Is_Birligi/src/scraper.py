#!/usr/bin/env python3
"""
Scraper modülü — Rakip influencer'ların son reels'lerini Apify ile çeker.

Her hafta çalışarak yeni marka mention'larını tespit etmek için veri sağlar.
"""

import csv
import json
import os
import time
import requests
import random
from datetime import datetime, timezone, timedelta

# ── Config ──────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAKIPLER_CSV = os.path.join(BASE_DIR, "config", "rakipler.csv")
OUTPUT_PATH = os.path.join(BASE_DIR, "data", "raw_reels.json")
ACTOR_ID = "shu8hvrXbJbY3Eb9W"  # Apify Instagram Reel Scraper
RESULTS_PER_PROFILE = 4  # Son 4 reel/profil (haftalık 1 reels varsayımı)
POLL_INTERVAL = 15  # saniye


def get_apify_token():
    """Apify token'larını env var'lardan topla ve rastgele seç (Rotasyon)."""
    keys = []
    
    # Yeni yapı: APIFY_API_KEY_1, APIFY_API_KEY_2 vs.
    for i in range(1, 10):
        val = os.environ.get(f"APIFY_API_KEY_{i}")
        if val and val not in keys:
            keys.append(val)
            
    # Geriye dönük uyumluluk
    val = os.environ.get("APIFY_API_KEY")
    if val and val not in keys:
        keys.append(val)
    val = os.environ.get("APIFY_BACKUP_TOKEN")
    if val and val not in keys:
        keys.append(val)
            
    if not keys:
        # Lokal geliştirme için fallback
        knowledge_path = os.path.join(BASE_DIR, "..", "..", "_knowledge", "api-anahtarlari.md")
        if os.path.exists(knowledge_path):
            with open(knowledge_path, "r") as f:
                content = f.read()
            # Basit parse — apify key'leri bul
            for line in content.split("\n"):
                if "apify_api_" in line and "API Anahtarı" in line:
                    start = line.find("`apify_api_")
                    if start >= 0:
                        end = line.find("`", start + 1)
                        token = line[start+1:end]
                        if token and token not in keys:
                            keys.append(token)
                            
    if keys:
        return random.choice(keys)
    return None


def read_profiles(csv_path=None):
    """Rakipler CSV'den profil URL'lerini okur."""
    csv_path = csv_path or RAKIPLER_CSV
    urls = []
    seen = set()
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = row["Link"].strip().rstrip("/")
            if url and url not in seen:
                seen.add(url)
                urls.append(url)
    print(f"[SCRAPER] {len(urls)} benzersiz profil bulundu.")
    return urls


def start_actor_run(urls, token):
    """Apify aktörünü başlatır."""
    endpoint = f"https://api.apify.com/v2/acts/{ACTOR_ID}/runs"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "directUrls": urls,
        "resultsType": "posts",
        "resultsLimit": RESULTS_PER_PROFILE,
    }

    print("[SCRAPER] Apify aktörü başlatılıyor...")
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    run_data = resp.json()["data"]
    run_id = run_data["id"]
    print(f"[SCRAPER] Çalışma başlatıldı → run_id: {run_id}")
    return run_data


def poll_run(run_id, token):
    """Çalışma tamamlanana kadar polling yapar."""
    endpoint = f"https://api.apify.com/v2/actor-runs/{run_id}"
    headers = {"Authorization": f"Bearer {token}"}

    while True:
        resp = requests.get(endpoint, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()["data"]
        status = data["status"]
        print(f"  ⏳ Durum: {status}")

        if status == "SUCCEEDED":
            dataset_id = data["defaultDatasetId"]
            print(f"[SCRAPER] ✅ Çalışma tamamlandı! Dataset: {dataset_id}")
            return dataset_id
        elif status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise Exception(f"Apify çalışma başarısız: {status}")

        time.sleep(POLL_INTERVAL)


def fetch_results(dataset_id, token):
    """Dataset'ten sonuçları çeker."""
    endpoint = f"https://api.apify.com/v2/datasets/{dataset_id}/items"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"format": "json", "clean": "true"}

    print("[SCRAPER] Sonuçlar indiriliyor...")
    resp = requests.get(endpoint, headers=headers, params=params, timeout=120)
    resp.raise_for_status()
    items = resp.json()
    print(f"[SCRAPER] {len(items)} reel verisi indirildi.")
    return items


def scrape_reels(dry_run=False):
    """
    Ana scrape fonksiyonu. Rakiplerin son reels'lerini çeker.
    
    Returns:
        list[dict]: Reel verileri listesi
    """
    urls = read_profiles()

    if dry_run:
        print("[DRY-RUN] Aşağıdaki profiller scrape edilecek:")
        for u in urls:
            print(f"  • {u}")
        print(f"[DRY-RUN] Toplam tahmini sonuç: {len(urls) * RESULTS_PER_PROFILE}")
        return []

    token = get_apify_token()
    if not token:
        raise ValueError("Apify token bulunamadı! APIFY_API_KEY env var ayarla.")

    run_data = start_actor_run(urls, token)
    dataset_id = poll_run(run_data["id"], token)
    items = fetch_results(dataset_id, token)

    # Sonuçları kaydet
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print(f"[SCRAPER] Sonuçlar kaydedildi → {OUTPUT_PATH}")

    return items


if __name__ == "__main__":
    import sys
    dry = "--dry-run" in sys.argv
    scrape_reels(dry_run=dry)
