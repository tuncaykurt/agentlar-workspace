#!/usr/bin/env python3
"""
drive_downloader.py — Google Drive'dan ekran kayıtlarını indir
==============================================================
Drive klasöründeki video dosyalarını analiz eder, kameralı çekimleri
(MVI_*, HAM VİDEO*) atlar ve ekran kayıtlarını lokal klasöre indirir.

Kullanım:
    python3 drive_downloader.py <folder_id> -o ./output_dir
    python3 drive_downloader.py --drive-url "https://drive.google.com/..." -o ./skywork

Yetkilendirme: Google Service Account (_knowledge/credentials/google-service-account.json)
"""

import os
import sys
import re
import json
import argparse
import logging
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
ANTIGRAVITY_ROOT = SCRIPT_DIR.parent.parent
from env_loader import get_sa_json_path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("drive_dl")

# ── File classification patterns ──
CAMERA_PATTERNS = [
    re.compile(r"^MVI_", re.I),
    re.compile(r"^HAM\s*V[İI]DEO", re.I),
    re.compile(r"^HAM\s*VIDEO", re.I),
]
EDIT_PATTERNS = [
    re.compile(r"tiktok", re.I),
    re.compile(r"insta(?!ll)", re.I),
    re.compile(r"revize", re.I),
]
SCREEN_PATTERNS = [
    re.compile(r"^Screen\s*Recording", re.I),
    re.compile(r"^Ekran\s*Kay[ıi]t", re.I),
]
NUMBERED_RE = re.compile(r"^\d+[\s\-\.]+")
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm"}


def classify_file(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext not in VIDEO_EXTS:
        return "non_video"
    if any(p.search(name) for p in CAMERA_PATTERNS):
        return "camera"
    if any(p.search(name) for p in SCREEN_PATTERNS):
        return "screen_recording"
    if NUMBERED_RE.match(name):
        return "screen_recording"
    if any(p.search(name) for p in EDIT_PATTERNS):
        return "edit"
    if ext in {".mov", ".mp4"}:
        return "probable_screen"
    return "unknown"


def extract_folder_id(url: str):
    if not url:
        return None
    m = re.search(r"/folders/([a-zA-Z0-9_-]+)", url)
    return m.group(1) if m else None


def init_drive_service():
    """Service Account ile Drive API bağlantısı kur."""
    sa_path = get_sa_json_path()
    if not sa_path:
        log.error("Service Account JSON bulunamadı (env var veya dosya)")
        return None
    try:
        from google.oauth2 import service_account as sa_mod
        from googleapiclient.discovery import build
        creds = sa_mod.Credentials.from_service_account_file(
            sa_path, scopes=["https://www.googleapis.com/auth/drive.readonly"]
        )
        service = build("drive", "v3", credentials=creds, cache_discovery=False)
        log.info("🔑 Drive API — Service Account bağlantısı kuruldu")
        return service
    except ImportError:
        log.error("google-api-python-client yüklü değil: pip install google-api-python-client google-auth")
        return None
    except Exception as e:
        log.error(f"Drive API init hatası: {e}")
        return None


def list_folder(service, folder_id: str) -> list:
    try:
        results = []
        page_token = None
        while True:
            resp = service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, mimeType, size)",
                pageSize=100,
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            results.extend(resp.get("files", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return results
    except Exception as e:
        log.error(f"Klasör listelenemedi ({folder_id}): {e}")
        return []


def download_file(service, file_id: str, file_name: str, output_path: str) -> bool:
    """Drive'dan dosyayı indir (büyük dosyalar için streaming — 50MB chunk)."""
    try:
        from googleapiclient.http import MediaIoBaseDownload
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        with open(output_path, 'wb') as fh:
            downloader = MediaIoBaseDownload(fh, request, chunksize=50 * 1024 * 1024)
            done = False
            while not done:
                status, done = downloader.next_chunk()
                if status:
                    pct = int(status.progress() * 100)
                    print(f"\r    ⬇️  {file_name}: %{pct}", end="", flush=True)
            print()
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        log.info(f"  ✅ İndirildi: {file_name} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        log.error(f"  ❌ İndirme hatası ({file_name}): {e}")
        if os.path.exists(output_path):
            os.remove(output_path)
        return False


def download_screen_recordings(service, folder_id: str, output_dir: str,
                                max_files: int = 10, scan_subfolders: bool = True) -> dict:
    """Drive klasöründen ekran kayıtlarını indir."""
    os.makedirs(output_dir, exist_ok=True)
    result = {"downloaded": [], "skipped": [], "errors": [], "total_size_mb": 0}

    files = list_folder(service, folder_id)
    log.info(f"📁 Klasörde {len(files)} öğe bulundu")

    screen_files = []
    subfolders = []

    for f in files:
        if f.get("mimeType") == "application/vnd.google-apps.folder":
            subfolders.append(f)
            continue
        cls = classify_file(f["name"])
        size_mb = int(f.get("size", 0)) / (1024 * 1024)

        if cls == "camera":
            log.info(f"  ⏭️  Kamera çekimi atlanıyor: {f['name']} ({size_mb:.1f} MB)")
            result["skipped"].append({"name": f["name"], "reason": "camera", "size_mb": round(size_mb, 1)})
        elif cls == "edit":
            log.info(f"  ⏭️  Düzenlenmiş video atlanıyor: {f['name']} ({size_mb:.1f} MB)")
            result["skipped"].append({"name": f["name"], "reason": "edit", "size_mb": round(size_mb, 1)})
        elif cls in ("screen_recording", "probable_screen", "unknown") and Path(f["name"]).suffix.lower() in VIDEO_EXTS:
            screen_files.append({**f, "size_mb": size_mb, "source": "root"})
        # non_video files silently skipped

    if scan_subfolders:
        for sf in subfolders:
            log.info(f"  📂 Alt klasör taranıyor: {sf['name']}")
            sf_files = list_folder(service, sf["id"])
            for f in sf_files:
                if f.get("mimeType") == "application/vnd.google-apps.folder":
                    continue
                cls = classify_file(f["name"])
                size_mb = int(f.get("size", 0)) / (1024 * 1024)
                if cls in ("screen_recording", "probable_screen") and Path(f["name"]).suffix.lower() in VIDEO_EXTS:
                    screen_files.append({**f, "size_mb": size_mb, "source": sf["name"]})
                elif cls == "camera":
                    result["skipped"].append({"name": f["name"], "reason": "camera", "size_mb": round(size_mb, 1)})

    screen_files.sort(key=lambda x: x["name"])
    if len(screen_files) > max_files:
        log.warning(f"⚠️  {len(screen_files)} ekran kaydı bulundu, max {max_files} indirilecek")
        screen_files = screen_files[:max_files]

    log.info(f"📥 {len(screen_files)} ekran kaydı indirilecek")

    for i, sf in enumerate(screen_files):
        output_path = os.path.join(output_dir, sf["name"])
        if os.path.exists(output_path):
            existing_size = os.path.getsize(output_path) / (1024 * 1024)
            if abs(existing_size - sf["size_mb"]) < 0.5:
                log.info(f"  ⏩ Zaten mevcut: {sf['name']} ({existing_size:.1f} MB)")
                result["downloaded"].append({"name": sf["name"], "path": output_path,
                                             "size_mb": round(existing_size, 1), "cached": True})
                result["total_size_mb"] += existing_size
                continue

        log.info(f"  [{i+1}/{len(screen_files)}] İndiriliyor: {sf['name']} ({sf['size_mb']:.1f} MB)")
        if download_file(service, sf["id"], sf["name"], output_path):
            actual_size = os.path.getsize(output_path) / (1024 * 1024)
            result["downloaded"].append({"name": sf["name"], "path": output_path,
                                         "size_mb": round(actual_size, 1), "cached": False})
            result["total_size_mb"] += actual_size
        else:
            result["errors"].append({"name": sf["name"], "error": "download_failed"})

    result["total_size_mb"] = round(result["total_size_mb"], 1)
    return result


def main():
    parser = argparse.ArgumentParser(description="Drive'dan ekran kayıtlarını indir")
    parser.add_argument("folder_id", nargs="?", help="Drive folder ID")
    parser.add_argument("--drive-url", help="Drive klasör URL'si")
    parser.add_argument("--output", "-o", default=None, help="İndirme dizini")
    parser.add_argument("--max-files", type=int, default=10, help="Max indirme (varsayılan: 10)")
    parser.add_argument("--no-subfolders", action="store_true", help="Alt klasörleri tarama")
    args = parser.parse_args()

    fid = args.folder_id
    if not fid and args.drive_url:
        fid = extract_folder_id(args.drive_url)
    if not fid:
        print("❌ folder_id veya --drive-url gerekli")
        sys.exit(1)

    output = args.output or os.path.join(str(SCRIPT_DIR), "downloads", fid[:12])
    service = init_drive_service()
    if not service:
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"📥 DRIVE DOWNLOADER")
    print(f"{'='*60}")
    print(f"  Klasör ID : {fid}")
    print(f"  Çıktı     : {output}")

    result = download_screen_recordings(service, fid, output,
                                         max_files=args.max_files,
                                         scan_subfolders=not args.no_subfolders)

    print(f"\n{'='*60}")
    print(f"📊 İNDİRME RAPORU")
    print(f"{'='*60}")
    print(f"  İndirilen  : {len(result['downloaded'])} dosya ({result['total_size_mb']:.1f} MB)")
    print(f"  Atlanan    : {len(result['skipped'])} dosya")
    print(f"  Hatalar    : {len(result['errors'])} dosya")

    manifest_path = os.path.join(output, "download_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"  Manifest   : {manifest_path}")
    return result


if __name__ == "__main__":
    main()
