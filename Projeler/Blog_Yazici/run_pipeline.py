#!/usr/bin/env python3
"""
Blog_Yazici Pipeline Orkestrasyonu — End-to-End Auto-Publish
=============================================================
Kullanım:
    # Eski mod — belirli bir video klasörü ile:
    python3 run_pipeline.py <video_klasoru_veya_dosya>

    # Notion'dan otomatik video seçerek:
    python3 run_pipeline.py --from-notion
    python3 run_pipeline.py --from-notion --video-name "Skywork"
    python3 run_pipeline.py --from-notion --video-name "Skywork" --max-downloads 5
    python3 run_pipeline.py --from-notion --video-name "Emergent 28" --no-publish
"""

import os
import sys
import subprocess
import argparse
import json
import requests
from pathlib import Path
from datetime import datetime

try:
    sys.path.insert(0, str(Path(__file__).parent.resolve()))
    from notion_logger import logger
except ImportError:
    logger = None

SCRIPT_DIR = Path(__file__).parent.resolve()
ANTIGRAVITY_ROOT = SCRIPT_DIR.parent.parent
PYTHON_BIN = str(SCRIPT_DIR / "env" / "bin" / "python3")

# Fallback: env yoksa system python
if not os.path.exists(PYTHON_BIN):
    PYTHON_BIN = sys.executable


# ══════════════════════════════════════════════════════════════
# UTILS
# ══════════════════════════════════════════════════════════════

def run_step(step_name, command_args):
    """Pipeline adımı çalıştır."""
    print(f"\n{'='*60}")
    print(f"🚀 {step_name}")
    print(f"{'='*60}")
    try:
        subprocess.run(command_args, check=True, text=True, cwd=str(SCRIPT_DIR))
        return True
    except subprocess.CalledProcessError as e:
        print(f"\n❌ HATA: '{step_name}' aşamasında sorun! (Exit Code: {e.returncode})")
        if logger:
            try:
                logger.error(
                    title=f"Pipeline Hatası: {step_name}",
                    message=f"Program exit code {e.returncode} ile fail etti.\nKomut: {' '.join(command_args)}"
                )
                logger.wait_for_logs()
            except:
                pass
        return False

def safe_dir_name(name: str) -> str:
    """Video adından güvenli klasör adı oluştur."""
    safe = "".join(c if c.isalnum() or c in "_- " else "_" for c in name).strip()
    return safe.replace(" ", "_").lower()


def find_best_video(download_dir: str):
    """İndirilen videolardan en büyüğünü (ana içerik) seç."""
    video_exts = {".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm"}
    videos = []
    for f in os.listdir(download_dir):
        if Path(f).suffix.lower() in video_exts:
            fpath = os.path.join(download_dir, f)
            size = os.path.getsize(fpath)
            videos.append((fpath, size))

    if not videos:
        return None

    videos.sort(key=lambda x: x[1], reverse=True)
    best = videos[0]
    size_mb = best[1] / (1024 * 1024)
    print(f"  📹 En büyük video seçildi: {os.path.basename(best[0])} ({size_mb:.1f} MB)")
    return best[0]


def update_notion_status(page_id: str, new_status: str = "Blog Yazıldı"):
    """Blog yayınlandıktan sonra Notion'daki video status'ünü güncelle.
    
    Bu sayede notion_video_selector.py bir sonraki çalıştırmada
    bu videoyu tekrar seçmez (Status != 'Yayınlandı').
    """
    try:
        if str(SCRIPT_DIR) not in sys.path:
            sys.path.insert(0, str(SCRIPT_DIR))
        from env_loader import get_env
        token = get_env("NOTION_SOCIAL_TOKEN")
        if not token:
            print("  ⚠️ NOTION_SOCIAL_TOKEN bulunamadı — status güncellenemedi")
            return False

        headers = {
            "Authorization": f"Bearer {token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        }
        resp = requests.patch(
            f"https://api.notion.com/v1/pages/{page_id}",
            headers=headers,
            json={"properties": {"Status": {"select": {"name": new_status}}}},
            timeout=15,
        )
        if resp.status_code == 200:
            print(f"  ✅ Notion status güncellendi: '{new_status}'")
            return True
        else:
            print(f"  ⚠️ Notion status güncellenemedi ({resp.status_code}): {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"  ⚠️ Notion status update hatası: {e}")
        return False


def mark_as_processed(video_info: dict, blog_path: str):
    """Video'yu processed listesine ekle (ikincil güvenlik — Notion status asıl korumadır).
    
    ⚠️ NOT: /tmp Railway container'larında ephemeral'dır — her redeploy'da sıfırlanır.
    Bu dosya SADECE aynı container ömrü boyunca geçerlidir.
    Asıl mükerrer koruma: Notion status = "Blog Yazıldı" (notion_video_selector tarafından filtrelenir).
    """
    processed_path = Path("/tmp") / "processed_videos.json"
    try:
        if processed_path.exists():
            data = json.loads(processed_path.read_text(encoding="utf-8"))
        else:
            data = {"processed": []}

        # Zaten ekli mi?
        existing_ids = {p["page_id"] for p in data.get("processed", [])}
        if video_info["page_id"] in existing_ids:
            return

        data["processed"].append({
            "page_id": video_info["page_id"],
            "name": video_info["name"],
            "blog_path": blog_path,
            "processed_at": datetime.now().isoformat(),
        })
        processed_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  📝 Processed listesine eklendi: {video_info['name']}")
    except Exception as e:
        print(f"  ⚠️ Processed kayıt hatası: {e}")


# ══════════════════════════════════════════════════════════════
# NOTION → DRIVE → PIPELINE (YENİ MOD)
# ══════════════════════════════════════════════════════════════

def resolve_video_from_notion(video_name=None, threshold=45):
    """Notion'dan video seç. video_assessment_report.json gerektirir."""
    report_path = Path("/tmp") / "video_assessment_report.json"

    # Raporu yenile
    print(f"\n{'='*60}")
    print(f"📋 NOTION VİDEO SEÇİCİ")
    print(f"{'='*60}")

    run_step(
        "Notion Video Değerlendirmesi",
        [PYTHON_BIN, str(SCRIPT_DIR / "notion_video_selector.py"), "--threshold", str(threshold)]
    )

    if not report_path.exists():
        print("❌ video_assessment_report.json oluşturulamadı")
        sys.exit(1)

    with open(report_path, "r", encoding="utf-8") as f:
        report = json.load(f)

    videos = report.get("new_videos", [])
    above = [v for v in videos if v.get("above_threshold")]

    if not above:
        print("❌ Eşik üstü video bulunamadı!")
        sys.exit(1)

    # Video seç
    if video_name:
        matches = [v for v in above if video_name.lower() in v["name"].lower()]
        if not matches:
            print(f"❌ '{video_name}' adında bir video bulunamadı")
            print(f"   Mevcut videolar: {', '.join(v['name'] for v in above[:10])}")
            sys.exit(1)
        selected = matches[0]
    else:
        selected = above[0]

    print(f"\n  ✅ Seçilen video: {selected['name']} (Score: {selected['score']})")
    print(f"     Drive URL   : {selected.get('drive_url', 'N/A')}")
    return selected


def run_from_notion(args):
    """Notion'dan video seçip tam pipeline çalıştır."""
    # 1. Video seç
    video_info = resolve_video_from_notion(
        video_name=args.video_name,
        threshold=args.threshold,
    )

    video_name = video_info["name"]
    video_dir = str(SCRIPT_DIR / safe_dir_name(video_name))
    os.makedirs(video_dir, exist_ok=True)
    print(f"\n  📁 Çalışma dizini: {video_dir}")

    # 2. Script.txt çek (Notion caption)
    try:
        # sys.path'e SCRIPT_DIR ekle (import için)
        if str(SCRIPT_DIR) not in sys.path:
            sys.path.insert(0, str(SCRIPT_DIR))
        from script_extractor import extract_or_create_script
        extract_or_create_script(video_info["page_id"], video_dir)
    except Exception as e:
        print(f"  ⚠️ Script çekme hatası (devam ediliyor): {e}")

    # 3. Drive'dan video indir
    drive_url = video_info.get("drive_url", "")
    if not drive_url:
        print("❌ Video için Drive URL bulunamadı")
        sys.exit(1)

    download_dir = os.path.join(video_dir, "raw_videos")
    print(f"\n{'='*60}")
    print(f"📥 DRIVE İNDİRME")
    print(f"{'='*60}")

    try:
        from drive_downloader import extract_folder_id, init_drive_service, download_screen_recordings
        folder_id = extract_folder_id(drive_url)
        if not folder_id:
            print(f"❌ Geçersiz Drive URL: {drive_url}")
            sys.exit(1)

        service = init_drive_service()
        if not service:
            print("❌ Drive servisine bağlanılamadı")
            sys.exit(1)

        dl_result = download_screen_recordings(
            service, folder_id, download_dir,
            max_files=args.max_downloads,
        )

        if not dl_result["downloaded"]:
            print("❌ İndirilecek ekran kaydı bulunamadı")
            sys.exit(1)

        print(f"\n  📊 İndirme: {len(dl_result['downloaded'])} dosya, "
              f"{dl_result['total_size_mb']:.1f} MB toplam")
    except Exception as e:
        print(f"❌ Drive indirme hatası: {e}")
        sys.exit(1)

    # 4. En iyi videoyu seç
    best_video = find_best_video(download_dir)
    if not best_video:
        print("❌ İndirilen dosyalar arasında video bulunamadı")
        sys.exit(1)

    # 5. Pipeline adımları — Faz 1: Blog İçeriği Üretimi
    frames_dir = os.path.join(video_dir, "frames")

    content_steps = [
        ("Adım 1/4: Frame Çıkarma",
         [PYTHON_BIN, str(SCRIPT_DIR / "extract_frames.py"), best_video, frames_dir]),
        ("Adım 2/4: Vision Analizi (Groq)",
         [PYTHON_BIN, str(SCRIPT_DIR / "vision_analyzer.py"), frames_dir]),
        ("Adım 3/4: Annotation (Dinamik Mod)",
         [PYTHON_BIN, str(SCRIPT_DIR / "annotate_v3.py"), video_dir]),
        ("Adım 4/4: Blog Üretimi (Gemini 2.5 Pro)",
         [PYTHON_BIN, str(SCRIPT_DIR / "generate_blog.py"), video_dir]),
    ]

    for step_name, cmd in content_steps:
        if not run_step(step_name, cmd):
            print(f"\n💀 Pipeline durduruldu: {step_name}")
            sys.exit(1)

    blog_path = os.path.join(video_dir, "blog_draft.md")
    if not os.path.exists(blog_path):
        print(f"\n❌ Blog dosyası üretilemedi: {blog_path}")
        sys.exit(1)

    # 6. Pipeline Faz 2: Format + Cover + Publish
    print(f"\n{'='*60}")
    print(f"📦 FAZ 2: Blog Formatlama ve Yayınlama")
    print(f"{'='*60}")

    # 6a. MDX Formatlama
    try:
        if str(SCRIPT_DIR) not in sys.path:
            sys.path.insert(0, str(SCRIPT_DIR))
        from blog_formatter import format_blog
        format_result = format_blog(video_dir, video_name=video_name)
        if not format_result:
            print("❌ Blog formatlama başarısız!")
            sys.exit(1)
        slug = format_result['slug']
        blog_title = format_result['title']
    except Exception as e:
        print(f"❌ Formatter hatası: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)

    # 6b. Cover Image Üretimi
    drive_url = video_info.get("drive_url", "")
    try:
        from cover_generator import generate_cover
        cover_path = generate_cover(video_dir, drive_url, slug, blog_title)
        if not cover_path:
            print("  ⚠️ Cover üretilemedi — devam ediliyor (cover'sız)")
    except Exception as e:
        print(f"  ⚠️ Cover generator hatası (devam ediliyor): {e}")

    # 6c. Yayınlama
    if getattr(args, 'no_publish', False):
        print(f"\n  ℹ️ --no-publish: Blog hazırlandı ama yayınlanmadı.")
        print(f"  📄 MDX : {format_result['mdx_path']}")
    else:
        try:
            from blog_publisher import publish_blog
            success = publish_blog(video_dir, slug, blog_title)
            if not success:
                print("\n❌ Blog yayınlanamadı!")
                sys.exit(1)
        except Exception as e:
            print(f"❌ Publisher hatası: {e}")
            import traceback; traceback.print_exc()
            sys.exit(1)

    # 7. Final Rapor
    print(f"\n{'='*60}")
    print(f"✅ PIPELINE TAMAMLANDI!")
    print(f"{'='*60}")
    print(f"  Video       : {video_name}")
    print(f"  Blog        : {format_result['mdx_path']}")
    print(f"  Slug        : {slug}")
    if not getattr(args, 'no_publish', False):
        print(f"  URL         : https://KISISEL_WEBSITE_BURAYA/blog/{slug}")
    print(f"  Klasör      : {video_dir}")
    mark_as_processed(video_info, format_result['mdx_path'])

    # Notion status'ünü güncelle — aynı videonun tekrar bloglanmasını önle
    update_notion_status(video_info["page_id"], "Blog Yazıldı")

    if logger:
        try:
            blog_url = f"https://KISISEL_WEBSITE_BURAYA/blog/{slug}" if not getattr(args, 'no_publish', False) else ""
            logger.success(
                title=f"Blog Hazır: {video_name[:40]}",
                message=f"Video başarıyla blog'a dönüştürüldü ve formata uygun kaydedildi.",
                blog_link=blog_url
            )
            logger.wait_for_logs()
        except Exception as e:
            print(f"  ⚠️ Logger hatası: {e}")


# ══════════════════════════════════════════════════════════════
# KLASİK MOD (Geriye dönük uyumluluk)
# ══════════════════════════════════════════════════════════════

def run_classic(target_dir_or_file: str):
    """Eski mod — belirli bir video klasörü veya dosyası ile pipeline çalıştır."""
    target = os.path.abspath(target_dir_or_file)

    print(f"Hedef: {target}")
    print("Sırayla çalıştırılacak araçlar:")
    print(" 1. extract_frames.py")
    print(" 2. vision_analyzer.py")
    print(" 3. annotate_v3.py")
    print(" 4. generate_blog.py")

    # Video dosyası mı yoksa klasör mü?
    if os.path.isfile(target):
        video_path = target
        target_dir = os.path.splitext(video_path)[0]
        frames_dir = os.path.join(target_dir, "frames")
        run_step("Adım 1: Frame Çıkarma",
                 [PYTHON_BIN, "extract_frames.py", video_path, frames_dir])
    else:
        target_dir = target
        frames_dir = os.path.join(target_dir, "frames")
        print(f"\nAdım 1 Atlandı: {target_dir} bir video dosyası değil. "
              f"Mevcut '{frames_dir}' klasörü kullanılacak.")

    # Vision Analizi
    if not run_step("Adım 2: Vision Analizi", [PYTHON_BIN, "vision_analyzer.py", frames_dir]):
        sys.exit(1)

    # Annotation
    if not run_step("Adım 3: Annotation", [PYTHON_BIN, "annotate_v3.py", target_dir]):
        sys.exit(1)

    # Blog Üretimi
    if not run_step("Adım 4: Blog Üretimi", [PYTHON_BIN, "generate_blog.py", target_dir]):
        sys.exit(1)

    print("\n✅ TÜM PIPELINE BAŞARIYLA TAMAMLANDI!")


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Blog_Yazici Multi-Video Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Örnekler:
  python3 run_pipeline.py typeless5                              # Klasik mod
  python3 run_pipeline.py --from-notion                          # En yüksek puanlı video
  python3 run_pipeline.py --from-notion --video-name "Skywork"   # Belirli video
        """
    )

    parser.add_argument("target", nargs="?", help="Video dosyası veya klasör yolu (klasik mod)")
    parser.add_argument("--from-notion", action="store_true",
                        help="Notion'dan video seçerek pipeline başlat")
    parser.add_argument("--video-name", type=str, default=None,
                        help="Notion'dan seçilecek videonun adı (kısmi eşleşme)")
    parser.add_argument("--threshold", type=int, default=45,
                        help="Minimum confidence score eşiği (varsayılan: 45)")
    parser.add_argument("--max-downloads", type=int, default=5,
                        help="Drive'dan max video indirme sayısı (varsayılan: 5)")
    parser.add_argument("--no-publish", action="store_true",
                        help="Blog'u hazırla ama GitHub'a push etme")

    args = parser.parse_args()

    print(f"\n{'═'*60}")
    print(f"📝 BLOG YAZICI — End-to-End Auto-Publish Pipeline v3.0")
    print(f"{'═'*60}")
    print(f"  Zaman : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Python: {PYTHON_BIN}")

    if args.from_notion:
        print(f"  Mod   : 🌐 Notion → Drive → Pipeline")
        if args.video_name:
            print(f"  Video : {args.video_name}")
        run_from_notion(args)
    elif args.target:
        print(f"  Mod   : 📂 Klasik (lokal dosya/klasör)")
        run_classic(args.target)
    else:
        # Varsayılan: typeless5
        default_dir = str(SCRIPT_DIR / "typeless5")
        print(f"  Mod   : 📂 Klasik (varsayılan: typeless5)")
        run_classic(default_dir)


if __name__ == "__main__":
    main()
