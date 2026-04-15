#!/usr/bin/env python3
"""
Cover Generator — Drive'daki reels kapağından 16:9 blog cover üretir
=====================================================================
Strateji:
  1. Drive klasöründeki KAPAK görsellerini bul (reels kapakları, 9:16 dikey)
  2. Referans görsel olarak ImgBB'ye yükle
  3. Kie AI (Nano Banana Pro) ile 16:9 yatay versiyonunu üret
  4. .webp formatında kaydet
  5. Fallback: Kapak bulunamazsa en iyi annotated frame'i kullan

Kullanım:
    python3 cover_generator.py <video_dir> --drive-url <drive_folder_url> --slug <slug>
"""

import base64
import io
import json
import os
import re
import sys
import time
import requests
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()

# ─── Credentials ───
from env_loader import get_env, get_sa_json_path

KIE_API_KEY = get_env("KIE_API_KEY", "")
IMGBB_API_KEY = get_env("IMGBB_API_KEY", "")


# ══════════════════════════════════════════════════════════════
# DRIVE — KAPAK GÖRSELİ BULMA
# ══════════════════════════════════════════════════════════════

def init_drive_service():
    """Google Drive Service Account ile bağlan."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        sa_path = get_sa_json_path()
        if not sa_path:
            print("  ⚠️ Service account dosyası bulunamadı")
            return None

        creds = service_account.Credentials.from_service_account_file(
            sa_path,
            scopes=["https://www.googleapis.com/auth/drive.readonly"]
        )
        return build("drive", "v3", credentials=creds)
    except ImportError:
        print("  ⚠️ google-api-python-client yüklü değil")
        return None
    except Exception as e:
        print(f"  ⚠️ Drive servis hatası: {e}")
        return None


def extract_folder_id(url: str) -> str:
    """Drive URL'den folder ID çıkar."""
    if not url:
        return ""
    patterns = [
        r'/folders/([a-zA-Z0-9_-]+)',
        r'id=([a-zA-Z0-9_-]+)',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return ""


def find_cover_in_drive(service, folder_id: str) -> str:
    """Drive klasöründe kapak görselini bulur ve indirme URL'ini döner.

    Arama stratejisi:
    1. 'KAPAK' veya 'kapak' alt klasörü
    2. Dosya adında 'kapak' veya 'cover' geçen görseller
    3. Dosya adında 'thumbnail' geçen görseller
    """
    if not service or not folder_id:
        return None

    image_mimes = {'image/jpeg', 'image/png', 'image/webp'}

    try:
        # 1. KAPAK alt klasörü ara
        query = f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        results = service.files().list(q=query, fields="files(id,name)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        folders = results.get('files', [])

        kapak_folder = None
        for f in folders:
            if 'kapak' in f['name'].lower() or 'cover' in f['name'].lower():
                kapak_folder = f
                break

        if kapak_folder:
            print(f"  📁 KAPAK klasörü bulundu: {kapak_folder['name']}")
            # Klasördeki ilk görseli al
            q2 = f"'{kapak_folder['id']}' in parents and trashed=false"
            r2 = service.files().list(q=q2, fields="files(id,name,mimeType,size)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
            cover_files = [f for f in r2.get('files', []) if f.get('mimeType', '') in image_mimes]
            if cover_files:
                # En büyük görseli seç
                cover_files.sort(key=lambda x: int(x.get('size', 0)), reverse=True)
                chosen = cover_files[0]
                print(f"  🖼️ Kapak görseli seçildi: {chosen['name']}")
                return chosen['id']

        # 2. Ana klasörde kapak dosyası ara
        query = f"'{folder_id}' in parents and trashed=false"
        results = service.files().list(q=query, fields="files(id,name,mimeType,size)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        files = results.get('files', [])

        for f in files:
            name_lower = f['name'].lower()
            if f.get('mimeType', '') in image_mimes:
                if any(kw in name_lower for kw in ['kapak', 'cover', 'thumbnail', 'thumb']):
                    print(f"  🖼️ Kapak görseli bulundu: {f['name']}")
                    return f['id']

        # 3. Herhangi bir görsel dosyası
        images = [f for f in files if f.get('mimeType', '') in image_mimes]
        if images:
            images.sort(key=lambda x: int(x.get('size', 0)), reverse=True)
            chosen = images[0]
            print(f"  🖼️ Fallback — en büyük görsel: {chosen['name']}")
            return chosen['id']

        print("  ⚠️ Drive'da kapak görseli bulunamadı")
        return None

    except Exception as e:
        print(f"  ⚠️ Drive kapak arama hatası: {e}")
        return None


def download_drive_file(service, file_id: str, save_path: str) -> bool:
    """Drive'dan dosya indir."""
    try:
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        with open(save_path, 'wb') as f:
            from googleapiclient.http import MediaIoBaseDownload
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        print(f"  ✅ Kapak indirildi: {save_path}")
        return True
    except Exception as e:
        print(f"  ❌ İndirme hatası: {e}")
        return False


# ══════════════════════════════════════════════════════════════
# KIE AI — 16:9 COVER ÜRETİMİ
# ══════════════════════════════════════════════════════════════

def upload_to_imgbb(image_path: str) -> str:
    """Görseli ImgBB'ye yükle ve URL döndür."""
    if not IMGBB_API_KEY:
        print("  ⚠️ IMGBB_API_KEY bulunamadı")
        return None

    with open(image_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    resp = requests.post(
        "https://api.imgbb.com/1/upload",
        data={"key": IMGBB_API_KEY, "image": encoded},
        timeout=30
    )
    if resp.status_code == 200:
        url = resp.json()["data"]["url"]
        print(f"  📤 ImgBB'ye yüklendi: {url}")
        return url
    else:
        print(f"  ❌ ImgBB yükleme hatası: {resp.text[:200]}")
        return None


def generate_landscape_cover(reference_url: str, blog_title: str) -> str:
    """Kie AI (Nano Banana Pro) ile 16:9 yatay blog kapak görseli üret.

    Returns: Üretilen görselin URL'si veya None
    """
    if not KIE_API_KEY:
        print("  ⚠️ KIE_API_KEY bulunamadı")
        return None

    prompt = (
        f"Recreate this same visual concept and style but in LANDSCAPE 16:9 format for a professional blog header. "
        f"Maintain the same person, same mood, same color palette, same dramatic lighting. "
        f"The scene should be wider and more cinematic, suitable for a website blog header. "
        f"Keep the person as the focal point but with more environmental context visible on the sides. "
        f"DO NOT include any text or typography on the image — the blog title will be added separately by the website. "
        f"Clean, professional, cinematic quality. Shot on 35mm film, moody lighting."
    )

    headers = {
        "Authorization": f"Bearer {KIE_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "nano-banana-2",
        "input": {
            "prompt": prompt,
            "image_input": [reference_url],
            "aspect_ratio": "16:9"
        }
    }

    print(f"  🎨 Kie AI'a gönderiliyor (Nano Banana 2, 16:9)...")
    resp = requests.post("https://api.kie.ai/api/v1/jobs/createTask", headers=headers, json=payload, timeout=30)
    if resp.status_code != 200:
        print(f"  ❌ Task oluşturulamadı: {resp.text[:200]}")
        return None

    task_id = resp.json().get("data", {}).get("taskId")
    if not task_id:
        print("  ❌ taskId alınamadı")
        return None

    print(f"  ⏳ Task ID: {task_id} — Bekleniyor...")

    # Polling
    poll_url = f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}"
    max_wait = 300  # 5 dakika max
    elapsed = 0

    while elapsed < max_wait:
        time.sleep(10)
        elapsed += 10

        try:
            poll_resp = requests.get(poll_url, headers=headers, timeout=30)
            if poll_resp.status_code != 200:
                continue

            data = poll_resp.json().get("data", {})
            state = data.get("state")

            if state == "success":
                result_json = data.get("resultJson", "{}")
                result_data = json.loads(result_json)

                final_url = None
                if isinstance(result_data, list) and len(result_data) > 0:
                    final_url = result_data[0]
                elif isinstance(result_data, dict):
                    final_url = (
                        result_data.get("resultUrls", [None])[0] if "resultUrls" in result_data
                        else result_data.get("images", [{}])[0].get("url") if "images" in result_data
                        else result_data.get("url")
                    )

                if final_url:
                    print(f"  ✅ Cover üretildi! ({elapsed}s)")
                    return final_url
                else:
                    print(f"  ⚠️ Sonuç parse edilemedi: {result_json[:200]}")
                    return None

            elif state == "failed":
                print(f"  ❌ Üretim başarısız: {data.get('failMsg', 'Bilinmeyen hata')}")
                return None

            elif state in ("processing", "wait"):
                if elapsed % 30 == 0:
                    print(f"  ⏳ Hala bekleniyor... ({elapsed}s)")
                continue
        except Exception as e:
            print(f"  ⚠️ Polling hatası: {e}")
            continue

    print(f"  ❌ Zaman aşımı ({max_wait}s)")
    return None


def save_as_webp(image_url: str, output_path: str) -> bool:
    """URL'den görseli indir ve .webp olarak kaydet."""
    try:
        resp = requests.get(image_url, timeout=30)
        resp.raise_for_status()

        try:
            from PIL import Image
            img = Image.open(io.BytesIO(resp.content))
            img.save(output_path, 'WEBP', quality=85)
            size_kb = os.path.getsize(output_path) / 1024
            print(f"  💾 WebP olarak kaydedildi: {output_path} ({size_kb:.0f} KB)")
            return True
        except ImportError:
            # Pillow yoksa orijinal formatı kaydet
            ext = output_path.rsplit('.', 1)[-1]
            fallback_path = output_path.replace(f'.{ext}', '.jpg')
            with open(fallback_path, 'wb') as f:
                f.write(resp.content)
            print(f"  💾 Pillow yok, JPEG olarak kaydedildi: {fallback_path}")
            return True

    except Exception as e:
        print(f"  ❌ Görsel kaydetme hatası: {e}")
        return False


# ══════════════════════════════════════════════════════════════
# FALLBACK — ANNOTATED FRAME'DEN COVER
# ══════════════════════════════════════════════════════════════

def fallback_from_annotated(video_dir: str, output_path: str) -> bool:
    """Drive'dan kapak bulunamazsa annotated frame'lerden birini cover olarak kullan."""
    annotated_dir = os.path.join(video_dir, "annotated_v3")
    if not os.path.isdir(annotated_dir):
        return False

    images = sorted([
        f for f in os.listdir(annotated_dir)
        if f.lower().endswith(('.jpg', '.jpeg', '.png'))
    ])

    if not images:
        return False

    # İlk frame'i kullan (genellikle en tanıtıcı)
    src = os.path.join(annotated_dir, images[0])

    try:
        from PIL import Image
        img = Image.open(src)
        # 16:9 crop
        w, h = img.size
        target_ratio = 16 / 9
        current_ratio = w / h

        if current_ratio < target_ratio:
            # Daha dar → yukarıdan/aşağıdan kırp
            new_h = int(w / target_ratio)
            top = (h - new_h) // 2
            img = img.crop((0, top, w, top + new_h))
        else:
            # Daha geniş → sağdan/soldan kırp
            new_w = int(h * target_ratio)
            left = (w - new_w) // 2
            img = img.crop((left, 0, left + new_w, h))

        img.save(output_path, 'WEBP', quality=85)
        print(f"  ⚠️ Fallback cover oluşturuldu (annotated frame'den): {output_path}")
        return True
    except ImportError:
        import shutil
        fallback_path = output_path.replace('.webp', '.jpg')
        shutil.copy2(src, fallback_path)
        print(f"  ⚠️ Fallback cover (Pillow yok, kırpılmamış): {fallback_path}")
        return True


# ══════════════════════════════════════════════════════════════
# ANA FONKSİYON
# ══════════════════════════════════════════════════════════════

def generate_cover(video_dir: str, drive_url: str, slug: str, blog_title: str = "") -> str:
    """Blog için 16:9 kapak görseli üretir.

    Returns: Oluşturulan cover dosyasının yolu veya None
    """
    video_dir = os.path.abspath(video_dir)
    output_path = os.path.join(video_dir, f"{slug}-cover.webp")

    print(f"\n{'='*60}")
    print(f"🖼️ COVER GENERATOR — Blog Kapak Görseli")
    print(f"{'='*60}")
    print(f"  Slug    : {slug}")
    print(f"  Drive   : {drive_url}")

    # Zaten varsa atla
    if os.path.exists(output_path):
        print(f"  ℹ️ Cover zaten mevcut: {output_path}")
        return output_path

    folder_id = extract_folder_id(drive_url)

    if folder_id:
        # Drive'dan kapak ara
        service = init_drive_service()
        if service:
            cover_file_id = find_cover_in_drive(service, folder_id)
            if cover_file_id:
                # İndir
                temp_cover = os.path.join(video_dir, "_temp_reels_cover.jpg")
                if download_drive_file(service, cover_file_id, temp_cover):
                    # ImgBB'ye yükle
                    imgbb_url = upload_to_imgbb(temp_cover)
                    if imgbb_url:
                        # Kie AI ile 16:9 üret
                        result_url = generate_landscape_cover(imgbb_url, blog_title)
                        if result_url:
                            if save_as_webp(result_url, output_path):
                                # Temp dosyayı temizle
                                os.remove(temp_cover)
                                return output_path

                    # Cleanup
                    if os.path.exists(temp_cover):
                        os.remove(temp_cover)

    # Fallback
    print("\n  🔄 Kie AI başarısız — annotated frame'den fallback cover oluşturuluyor...")
    if fallback_from_annotated(video_dir, output_path):
        return output_path

    print("  ❌ Cover oluşturulamadı!")
    return None


# ══════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Cover Generator — Blog Kapak Görseli")
    parser.add_argument("video_dir", help="Video çalışma dizini")
    parser.add_argument("--drive-url", type=str, required=True, help="Drive klasör URL'i")
    parser.add_argument("--slug", type=str, required=True, help="Blog slug'ı")
    parser.add_argument("--title", type=str, default="", help="Blog başlığı")
    args = parser.parse_args()

    result = generate_cover(args.video_dir, args.drive_url, args.slug, args.title)
    if result:
        print(f"\n✅ Cover hazır: {result}")
    else:
        print("\n❌ Cover üretilemedi!")
        sys.exit(1)
