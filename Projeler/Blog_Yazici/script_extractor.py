#!/usr/bin/env python3
"""
script_extractor.py — Notion'dan video caption'ı çek → script.txt oluştur
==========================================================================
Video klasöründe script.txt yoksa, Notion Caption alanından çekmeyi dener.
Genelde caption boştur — bu durumda scriptsiz devam edilir.

Kullanım:
    python3 script_extractor.py <page_id> <output_dir>
"""

import os
import sys
import json
import requests
from pathlib import Path


def load_master_env() -> dict:
    from env_loader import get_env
    return {"NOTION_SOCIAL_TOKEN": get_env("NOTION_SOCIAL_TOKEN", "")}


def get_notion_caption(page_id: str, token: str):
    """Notion page'den caption/description alanını çek."""
    url = f"https://api.notion.com/v1/pages/{page_id}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": "2022-06-28",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            print(f"  ⚠️ Notion API hatası: {resp.status_code}")
            return None

        page = resp.json()
        props = page.get("properties", {})

        # Caption olabilecek alanları dene
        for field_name in ["Caption", "caption", "Açıklama", "Description", "Script", "İçerik"]:
            field = props.get(field_name, {})
            if field.get("type") == "rich_text":
                parts = field.get("rich_text", [])
                text = "".join(p.get("plain_text", "") for p in parts).strip()
                if text and len(text) > 20:  # En az 20 karakter olsun
                    return text

        return None
    except Exception as e:
        print(f"  ⚠️ Notion çekme hatası: {e}")
        return None


def extract_or_create_script(page_id: str, output_dir: str, force: bool = False):
    """
    script.txt yoksa Notion'dan çekmeyi dener.
    Returns: script.txt path veya None
    """
    script_path = os.path.join(output_dir, "script.txt")

    # Zaten var mı?
    if os.path.exists(script_path) and not force:
        with open(script_path, "r", encoding="utf-8") as f:
            text = f.read().strip()
        if text:
            print(f"  ✅ script.txt zaten mevcut ({len(text)} karakter)")
            return script_path

    # Notion'dan çek
    env = load_master_env()
    token = env.get("NOTION_SOCIAL_TOKEN")
    if not token:
        print("  ⚠️ NOTION_SOCIAL_TOKEN bulunamadı — script oluşturulamıyor")
        return None

    print(f"  🔍 Notion'dan caption çekiliyor (page: {page_id[:12]}...)")
    caption = get_notion_caption(page_id, token)

    if caption:
        os.makedirs(output_dir, exist_ok=True)
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(caption)
        print(f"  ✅ script.txt oluşturuldu ({len(caption)} karakter)")
        return script_path
    else:
        print("  ℹ️ Notion'da caption bulunamadı — scriptsiz devam edilecek")
        return None


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Kullanım: python3 script_extractor.py <page_id> <output_dir>")
        sys.exit(1)

    page_id = sys.argv[1]
    output_dir = sys.argv[2]

    result = extract_or_create_script(page_id, output_dir)
    if result:
        print(f"Script: {result}")
    else:
        print("Script bulunamadı — pipeline scriptsiz devam edecek")
