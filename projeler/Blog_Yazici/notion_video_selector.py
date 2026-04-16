#!/usr/bin/env python3
"""
notion_video_selector.py — Notion Video → Blog Uygunluk Değerlendirici
=====================================================================
Notion "[İSİM] Reels" database'inden "Yayınlandı" statüsündeki videoları çeker,
her videonun Google Drive klasörünü analiz eder ve blog yazılmaya uygunluk
puanı hesaplar.

Kullanım:
    python3 notion_video_selector.py                    # Sadece yeni videoları değerlendir
    python3 notion_video_selector.py --force            # Tüm videoları değerlendir (processed listesini görmezden gel)
    python3 notion_video_selector.py --reset            # processed_videos.json sıfırla
    python3 notion_video_selector.py --threshold 50     # Minimum score eşiği değiştir

Token Kaynağı: _knowledge/credentials/master.env
Drive Analizi: Google Service Account + drive_cache.json fallback
⚠️  Notion'a ASLA yazma/güncelleme yapılmaz — sadece okuma.
"""

import os
import sys
import json
import re
import argparse
import logging
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("❌ 'requests' paketi gerekli: pip install requests")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────────────
# PATHS
# ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent.resolve()
ANTIGRAVITY_ROOT = SCRIPT_DIR.parent.parent
MASTER_ENV = ANTIGRAVITY_ROOT / "_knowledge" / "credentials" / "master.env"

PROCESSED_FILE = Path("/tmp") / "processed_videos.json"
REPORT_FILE = Path("/tmp") / "video_assessment_report.json"
UNKNOWN_LOG = Path("/tmp") / "unknown_patterns.log"
DRIVE_CACHE = Path("/tmp") / "drive_cache.json"

# ──────────────────────────────────────────────────────────────────────
# LOGGING
# ──────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("selector")


def _safe_write(path: Path, content: str):
    """Dosyayı yaz, izin hatası olursa /tmp'ye fallback."""
    try:
        path.write_text(content, encoding="utf-8")
        return path
    except PermissionError:
        fallback = Path("/tmp") / path.name
        fallback.write_text(content, encoding="utf-8")
        log.warning(f"⚠️  {path.name} → izin hatası, {fallback} konumuna yazıldı")
        return fallback


# ══════════════════════════════════════════════════════════════════════
# 1. ENV LOADER
# ══════════════════════════════════════════════════════════════════════
def load_master_env() -> dict:
    """master.env dosyasını parse eder. Railway'de os.environ kullanılır."""
    from env_loader import get_env
    # env_loader önce os.environ'a bakar, sonra master.env'e fallback yapar
    keys = ["NOTION_SOCIAL_TOKEN", "NOTION_DB_REELS_KAPAK"]
    env = {}
    for k in keys:
        val = get_env(k)
        if val:
            env[k] = val
    return env


# ══════════════════════════════════════════════════════════════════════
# 2. NOTION CLIENT
# ══════════════════════════════════════════════════════════════════════
class NotionClient:
    """Notion REST API ile veritabanı sorgulama (sadece OKUMA)."""

    BASE = "https://api.notion.com/v1"

    def __init__(self, token: str):
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        }

    def query_published(self, db_id: str) -> list:
        """Yayınlandı statüsündeki tüm kayıtları çeker (pagination destekli)."""
        url = f"{self.BASE}/databases/{db_id}/query"
        payload = {
            "filter": {"property": "Status", "select": {"equals": "Yayınlandı"}},
            "page_size": 100,
        }
        all_results = []
        has_more = True
        while has_more:
            resp = requests.post(url, headers=self.headers, json=payload, timeout=30)
            if resp.status_code != 200:
                log.error(f"Notion API hatası: {resp.status_code} — {resp.text[:300]}")
                return all_results
            data = resp.json()
            all_results.extend(data.get("results", []))
            has_more = data.get("has_more", False)
            if has_more:
                payload["start_cursor"] = data["next_cursor"]
        log.info(f"📋 Notion'dan {len(all_results)} adet 'Yayınlandı' video çekildi")
        return all_results

    @staticmethod
    def parse_video(page: dict) -> dict:
        """Notion page → basit dict."""
        props = page.get("properties", {})
        name_parts = props.get("Name", {}).get("title", [])
        name = "".join(t.get("plain_text", "") for t in name_parts).strip()
        status_obj = props.get("Status", {}).get("select")
        status = status_obj.get("name", "") if status_obj else ""
        drive_url = props.get("Drive", {}).get("url") or ""
        date_obj = props.get("Paylaşım Tarihi", {}).get("date")
        publish_date = date_obj.get("start") if date_obj else None
        return {
            "page_id": page["id"],
            "name": name,
            "status": status,
            "drive_url": drive_url,
            "publish_date": publish_date,
            "notion_url": page.get("url", ""),
        }


# ══════════════════════════════════════════════════════════════════════
# 3. DRIVE ANALYZER
# ══════════════════════════════════════════════════════════════════════
class DriveAnalyzer:
    """Google Drive klasör analizi — SA + cache fallback."""

    CAMERA_RE = [
        re.compile(r"^MVI_", re.I),
        re.compile(r"^HAM\s*V[İI]DEO", re.I),
        re.compile(r"^HAM\s*VIDEO", re.I),
    ]
    EDIT_RE = [
        re.compile(r"tiktok", re.I),
        re.compile(r"insta(?!ll)", re.I),
        re.compile(r"revize", re.I),
    ]
    SCREEN_RE = [
        re.compile(r"^Screen\s*Recording", re.I),
        re.compile(r"^Ekran\s*Kay[ıi]t", re.I),
    ]
    NUMBERED_RE = re.compile(r"^\d+[\s\-\.]+")
    VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm"}

    def __init__(self):
        self.service = None
        self.cache: dict = {}
        self.unknown_patterns: list = []
        self._init_service()
        self._load_cache()

    # ── SA init ──
    def _init_service(self):
        from env_loader import get_sa_json_path
        sa_path = get_sa_json_path()
        if not sa_path:
            log.warning("Service Account JSON bulunamadı → cache kullanılacak")
            return
        try:
            from google.oauth2 import service_account as sa_mod
            from googleapiclient.discovery import build

            creds = sa_mod.Credentials.from_service_account_file(
                sa_path, scopes=["https://www.googleapis.com/auth/drive.readonly"]
            )
            self.service = build("drive", "v3", credentials=creds, cache_discovery=False)
            log.info("🔑 Drive API — Service Account bağlantısı kuruldu")
        except ImportError:
            log.warning("google-api-python-client yüklü değil → cache kullanılacak")
        except Exception as e:
            log.warning(f"Drive API init hatası: {e}")

    # ── Cache ──
    def _load_cache(self):
        if DRIVE_CACHE.exists():
            try:
                self.cache = json.loads(DRIVE_CACHE.read_text(encoding="utf-8"))
                log.info(f"📦 Drive cache yüklendi: {len(self.cache)} klasör")
            except Exception:
                self.cache = {}

    def save_cache(self):
        _safe_write(DRIVE_CACHE, json.dumps(self.cache, ensure_ascii=False, indent=2))

    # ── Folder ID extraction ──
    @staticmethod
    def extract_folder_id(url: str):
        if not url:
            return None
        m = re.search(r"/folders/([a-zA-Z0-9_-]+)", url)
        return m.group(1) if m else None

    # ── API list ──
    def _list_folder_api(self, folder_id: str):
        if not self.service:
            return None
        try:
            res = self.service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                fields="files(id, name, mimeType, size)",
                pageSize=100,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            return res.get("files", [])
        except Exception as e:
            log.debug(f"  SA erişim hatası ({folder_id[:12]}…): {e}")
            return None

    # ── File classification ──
    def classify(self, name: str) -> str:
        ext = Path(name).suffix.lower()
        if ext not in self.VIDEO_EXTS:
            return "non_video"
        for p in self.CAMERA_RE:
            if p.search(name):
                return "camera"
        for p in self.SCREEN_RE:
            if p.search(name):
                return "screen_recording"
        for p in self.EDIT_RE:
            if p.search(name):
                return "edit"
        if self.NUMBERED_RE.match(name):
            return "screen_recording"
        if ext in {".mov", ".mp4"}:
            return "probable_screen"
        return "unknown"

    # ── Folder analysis ──
    def analyze(self, folder_id: str, video_name: str = "") -> dict:
        empty = {
            "folder_id": folder_id,
            "accessible": False,
            "source": "none",
            "total_files": 0,
            "video_files": 0,
            "screen_recordings": 0,
            "probable_screen": 0,
            "camera_files": 0,
            "edit_files": 0,
            "unknown_video": 0,
            "subfolders": 0,
            "subfolder_screen_recs": 0,
            "file_details": [],
            "errors": [],
        }

        # 1) Cache
        if folder_id in self.cache:
            cached = self.cache[folder_id]
            if cached.get("accessible"):
                log.info(f"  📦 Cache hit: {video_name}")
                return cached

        # 2) API
        files = self._list_folder_api(folder_id)
        if files is None:
            empty["errors"].append("Drive erişimi yok (SA yetkisi veya cache gerekli)")
            return empty

        result = dict(empty)
        result["accessible"] = True
        result["source"] = "api"
        subfolder_ids = []

        for f in files:
            if f.get("mimeType") == "application/vnd.google-apps.folder":
                result["subfolders"] += 1
                subfolder_ids.append(f)
                continue
            result["total_files"] += 1
            cls = self.classify(f["name"])
            result["file_details"].append(
                {"name": f["name"], "cls": cls, "size": int(f.get("size", 0))}
            )
            self._count(result, cls, f["name"], video_name, folder_id)

        # Alt klasörler (1 seviye)
        for sf in subfolder_ids:
            sf_files = self._list_folder_api(sf["id"])
            if not sf_files:
                continue
            for f in sf_files:
                if f.get("mimeType") == "application/vnd.google-apps.folder":
                    continue
                result["total_files"] += 1
                cls = self.classify(f["name"])
                result["file_details"].append(
                    {"name": f["name"], "cls": cls, "sub": sf["name"], "size": int(f.get("size", 0))}
                )
                if cls in ("screen_recording", "probable_screen"):
                    result["subfolder_screen_recs"] += 1
                    result["video_files"] += 1
                elif cls == "camera":
                    result["camera_files"] += 1
                    result["video_files"] += 1
                elif cls == "edit":
                    result["edit_files"] += 1
                    result["video_files"] += 1

        self.cache[folder_id] = result
        return result

    def _count(self, r, cls, fname, vname, fid):
        if cls == "screen_recording":
            r["screen_recordings"] += 1
            r["video_files"] += 1
        elif cls == "probable_screen":
            r["probable_screen"] += 1
            r["video_files"] += 1
        elif cls == "camera":
            r["camera_files"] += 1
            r["video_files"] += 1
        elif cls == "edit":
            r["edit_files"] += 1
            r["video_files"] += 1
        elif cls == "unknown":
            r["unknown_video"] += 1
            self.unknown_patterns.append({"video": vname, "file": fname, "folder_id": fid})


# ══════════════════════════════════════════════════════════════════════
# 4. CONFIDENCE SCORER
# ══════════════════════════════════════════════════════════════════════
def calculate_confidence(video: dict, drive: dict) -> tuple:
    """Blog uygunluk puanı (0–100) ve kırılım döndürür."""
    bd = {}
    score = 0

    # K1: Drive link (15 pt)
    has = bool(video.get("drive_url"))
    pts = 15 if has else 0
    score += pts
    bd["drive_link"] = {"pts": pts, "max": 15, "note": "✓ link var" if has else "✗ link yok"}

    # K2: Ekran kaydı varlığı (40 pt)
    if drive.get("accessible"):
        sr = drive["screen_recordings"] + drive["probable_screen"] + drive["subfolder_screen_recs"]
        if sr >= 3:
            pts, note = 40, f"{sr} ekran kaydı (mükemmel)"
        elif sr >= 1:
            pts, note = 25, f"{sr} ekran kaydı (yeterli)"
        else:
            pts, note = 0, "Ekran kaydı bulunamadı"
    else:
        pts, note = 0, "Drive erişimi yok"
    score += pts
    bd["screen_recs"] = {"pts": pts, "max": 40, "note": note}

    # K3: Hacim bonusu (15 pt)
    if drive.get("accessible"):
        sr = drive["screen_recordings"] + drive["probable_screen"] + drive["subfolder_screen_recs"]
        pts = 15 if sr >= 5 else (10 if sr >= 3 else (5 if sr >= 2 else 0))
        note = f"{sr} kayıt hacmi"
    else:
        pts, note = 0, "—"
    score += pts
    bd["volume"] = {"pts": pts, "max": 15, "note": note}

    # K4: Toplam dosya (10 pt)
    if drive.get("accessible"):
        t = drive["total_files"]
        pts = 10 if t >= 8 else (7 if t >= 4 else (4 if t >= 2 else 2))
        note = f"{t} dosya"
    else:
        pts, note = 0, "—"
    score += pts
    bd["files"] = {"pts": pts, "max": 10, "note": note}

    # K5: Video adı (10 pt)
    n = video.get("name", "")
    pts = 10 if len(n) > 5 else (5 if len(n) > 2 else 0)
    score += pts
    bd["name"] = {"pts": pts, "max": 10, "note": f'"{n}"'}

    # K6: Tarih (10 pt)
    has = bool(video.get("publish_date"))
    pts = 10 if has else 0
    score += pts
    bd["date"] = {"pts": pts, "max": 10, "note": video.get("publish_date") or "—"}

    return score, bd


# ══════════════════════════════════════════════════════════════════════
# 5. PROCESSED TRACKER
# ══════════════════════════════════════════════════════════════════════
def load_processed() -> dict:
    if not PROCESSED_FILE.exists():
        return {"processed": []}
    try:
        return json.loads(PROCESSED_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"processed": []}


def save_processed(data: dict):
    _safe_write(PROCESSED_FILE, json.dumps(data, ensure_ascii=False, indent=2))


def get_processed_ids(data: dict) -> set:
    return {p["page_id"] for p in data.get("processed", [])}


# ══════════════════════════════════════════════════════════════════════
# 6. REPORT GENERATOR
# ══════════════════════════════════════════════════════════════════════
def print_table(rows: list, threshold: int):
    """Konsola renkli ASCII tablo basar."""
    header = f"{'#':>3}  {'Video Adı':<32} {'Score':>5}  {'Ekran K.':>8}  {'Tarih':<12}  {'Durum'}"
    sep = "─" * len(header)
    print(f"\n{sep}")
    print(header)
    print(sep)
    for i, r in enumerate(rows, 1):
        sc = r["score"]
        sr = r.get("screen_recs", "—")
        dt = r["video"].get("publish_date") or "—"
        name = r["video"]["name"][:30]
        if sc >= threshold:
            flag = "✅ UYGUN"
        elif sc >= threshold - 10:
            flag = "⚠️  SINIRDA"
        else:
            flag = "❌ DÜŞÜK"
        if not r.get("drive_accessible"):
            flag += " 🔒"
        print(f"{i:>3}  {name:<32} {sc:>5}  {sr:>8}  {dt:<12}  {flag}")
    print(sep)


def generate_report(new_assessed: list, processed_list: list, threshold: int):
    """JSON rapor ve konsol çıktısı üretir."""
    def parse_date(date_str):
        if not date_str:
            return "1970-01-01"
        return date_str[:10]

    # Sort primarily by date (newest first), then by score desc
    new_assessed.sort(
        key=lambda x: (
            parse_date(x["video"].get("publish_date")),
            x["score"]
        ),
        reverse=True
    )

    above = [r for r in new_assessed if r["score"] >= threshold]
    below = [r for r in new_assessed if r["score"] < threshold]
    inaccessible = [r for r in new_assessed if not r.get("drive_accessible")]

    print("\n" + "═" * 60)
    print("📊 BLOG UYGUNLUK DEĞERLENDİRME RAPORU")
    print("═" * 60)
    print(f"  Toplam Yayınlandı video  : {len(new_assessed) + len(processed_list)}")
    print(f"  Daha önce işlenmiş       : {len(processed_list)}")
    print(f"  Yeni değerlendirilen      : {len(new_assessed)}")
    print(f"  Eşik üstü (≥{threshold})       : {len(above)}")
    print(f"  Eşik altı (<{threshold})        : {len(below)}")
    if inaccessible:
        print(f"  🔒 Drive erişimi yok      : {len(inaccessible)}")

    if new_assessed:
        print("\n── 🆕 YENİ VİDEOLAR (Değerlendirildi) ──")
        print_table(new_assessed, threshold)

    if processed_list:
        print(f"\n── ✅ DAHA ÖNCE İŞLENMİŞ ({len(processed_list)} video) ──")
        for p in processed_list:
            blog = p.get("blog_path", "—")
            print(f"  • {p['name']:<30} | blog: {blog} | tarih: {p.get('processed_at', '—')}")

    # JSON rapor kaydet
    report = {
        "generated_at": datetime.now().isoformat(),
        "threshold": threshold,
        "summary": {
            "total_published": len(new_assessed) + len(processed_list),
            "previously_processed": len(processed_list),
            "newly_assessed": len(new_assessed),
            "above_threshold": len(above),
            "below_threshold": len(below),
            "drive_inaccessible": len(inaccessible),
        },
        "new_videos": [
            {
                "name": r["video"]["name"],
                "page_id": r["video"]["page_id"],
                "score": r["score"],
                "breakdown": r["breakdown"],
                "drive_url": r["video"]["drive_url"],
                "publish_date": r["video"].get("publish_date"),
                "drive_accessible": r.get("drive_accessible", False),
                "above_threshold": r["score"] >= threshold,
            }
            for r in new_assessed
        ],
        "processed_videos": processed_list,
    }

    saved_to = _safe_write(REPORT_FILE, json.dumps(report, ensure_ascii=False, indent=2))
    log.info(f"📄 Rapor kaydedildi: {saved_to}")
    return report


# ══════════════════════════════════════════════════════════════════════
# 7. MAIN
# ══════════════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(description="Notion Video → Blog Uygunluk Değerlendirici")
    parser.add_argument("--force", action="store_true", help="Tüm videoları değerlendir (processed listesini görmezden gel)")
    parser.add_argument("--reset", action="store_true", help="processed_videos.json dosyasını sıfırla")
    parser.add_argument("--threshold", type=int, default=45, help="Minimum confidence score eşiği (varsayılan: 45)")
    args = parser.parse_args()

    # ── Reset ──
    if args.reset:
        save_processed({"processed": []})
        log.info("🔄 processed_videos.json sıfırlandı")
        if not args.force:
            print("✅ Sıfırlama tamamlandı. Değerlendirme yapmak için tekrar çalıştırın.")
            return

    # ── Env yükle ──
    env = load_master_env()
    notion_token = env.get("NOTION_SOCIAL_TOKEN")
    db_id = env.get("NOTION_DB_REELS_KAPAK")
    if not notion_token or not db_id:
        log.error("NOTION_SOCIAL_TOKEN veya NOTION_DB_REELS_KAPAK master.env'de bulunamadı")
        sys.exit(1)

    # ── Notion'dan çek ──
    notion = NotionClient(notion_token)
    raw_pages = notion.query_published(db_id)
    if not raw_pages:
        print("⚠️  Notion'da 'Yayınlandı' statüsünde video bulunamadı.")
        return

    all_videos = [NotionClient.parse_video(p) for p in raw_pages]

    # ── Processed kontrolü ──
    proc_data = load_processed()
    proc_ids = get_processed_ids(proc_data)
    proc_list = proc_data.get("processed", [])

    if args.force:
        new_videos = all_videos
        log.info(f"🔓 --force: Tüm {len(new_videos)} video değerlendirilecek")
    else:
        new_videos = [v for v in all_videos if v["page_id"] not in proc_ids]
        log.info(f"🆕 {len(new_videos)} yeni video bulundu ({len(proc_ids)} daha önce işlenmiş)")

    if not new_videos and not proc_list:
        print("✅ Değerlendirilecek yeni video yok ve daha önce işlenmiş video da yok.")
        return

    # ── Drive analizi ──
    drive_analyzer = DriveAnalyzer()
    assessed = []

    for v in new_videos:
        name = v["name"]
        log.info(f"🔍 Analiz ediliyor: {name}")
        folder_id = DriveAnalyzer.extract_folder_id(v["drive_url"])

        if folder_id:
            drive_result = drive_analyzer.analyze(folder_id, name)
        else:
            drive_result = {"accessible": False, "errors": ["Drive URL yok veya geçersiz"]}

        score, breakdown = calculate_confidence(v, drive_result)
        sr = drive_result.get("screen_recordings", 0) + drive_result.get("probable_screen", 0) + drive_result.get("subfolder_screen_recs", 0)

        assessed.append({
            "video": v,
            "drive": drive_result,
            "score": score,
            "breakdown": breakdown,
            "drive_accessible": drive_result.get("accessible", False),
            "screen_recs": sr if drive_result.get("accessible") else "—",
        })

    # ── Cache kaydet ──
    drive_analyzer.save_cache()

    # ── Unknown patterns loglama ──
    if drive_analyzer.unknown_patterns:
        lines = [f"[{datetime.now().isoformat()}] Tanınmayan dosya pattern'leri:\n"]
        for u in drive_analyzer.unknown_patterns:
            lines.append(f"  Video: {u['video']} | Dosya: {u['file']} | Klasör: {u['folder_id']}\n")
        try:
            with open(UNKNOWN_LOG, "a", encoding="utf-8") as f:
                f.writelines(lines)
        except PermissionError:
            fallback = Path("/tmp") / UNKNOWN_LOG.name
            with open(fallback, "a", encoding="utf-8") as f:
                f.writelines(lines)
            log.warning(f"⚠️  unknown_patterns.log → izin hatası, {fallback} kullanıldı")
        log.warning(f"⚠️  {len(drive_analyzer.unknown_patterns)} tanınmayan dosya pattern'i loglandı")

    # ── Rapor ──
    generate_report(assessed, proc_list, args.threshold)

    print(f"\n💡 Blog yazmaya başlamak için eşik üstü videolardan birini seçin.")
    print(f"   Örnek: python3 run_pipeline.py <video_klasoru>")


if __name__ == "__main__":
    main()
