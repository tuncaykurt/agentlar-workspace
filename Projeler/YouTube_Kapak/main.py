"""
[İSİM] YouTube Kapak — Ana Pipeline
Notion'dan hazır YouTube videolarını çeker, her biri için
3 tema × 2 varyasyon = 6 yatay (16:9) thumbnail üretir,
Google Drive'a yükler ve Notion sayfasına revizyon paneli ekler.
"""

import os
import random
from notion_service import get_ready_videos, add_revision_panel
from autonomous_cover_agent import run_autonomous_generation, generate_concepts, select_cutouts_for_theme
from drive_service import upload_cover_to_drive, check_covers_exist


def process_ready_videos():
    """
    Ana pipeline: YouTube database'inden 'Çekildi' durumundaki videoları alır,
    her biri için 3 tema × 2 varyasyon = 6 thumbnail üretir.
    """
    print("=" * 60)
    print("🎬 YOUTUBE THUMBNAIL GENERATION PIPELINE")
    print("📐 Format: 16:9 Landscape (2560×1440)")
    print("📐 Mode: 5 Themes × 2 Variants = 10 Thumbnails per video")
    print("=" * 60 + "\n")
    
    videos = get_ready_videos()
    
    if not videos:
        print("No YouTube videos found with 'Çekildi' status.")
        return

    # Create outputs folder if not exists
    os.makedirs("outputs", exist_ok=True)
    
    # Get available pre-processed photos (shared with Reels project)
    cutout_dir = "assets/cutouts"
    if not os.path.exists(cutout_dir):
        # Try fallback to Reels project cutouts
        reels_cutout_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "Reels_Kapak", "assets", "cutouts"
        )
        if os.path.exists(reels_cutout_dir):
            cutout_dir = reels_cutout_dir
            print(f"ℹ️ Using shared cutouts from Reels project: {cutout_dir}")
        else:
            print(f"Error: No cutout directory found. Create {cutout_dir}")
            return
        
    available_cutouts = [f for f in os.listdir(cutout_dir) if f.lower().endswith(('png', 'jpg', 'jpeg'))]
    if not available_cutouts:
        print(f"Error: No image files found in {cutout_dir}.")
        return

    for video in videos:
        print(f"\n{'=' * 60}")
        print(f"📺 Processing YouTube Video: {video['name']}")
        print(f"{'=' * 60}")
        
        drive_url = video.get('drive_url')
        if not drive_url:
            print(f"Skipping {video['name']}: No Drive URL found in Notion properties.")
            continue
            
        # Check if thumbnails already exist
        if check_covers_exist(drive_url):
            print(f"Skipping {video['name']}: Thumbnails already exist in Drive folder.")
            continue
        
        # Get script content
        script_content = video.get('script_text', '')
        topic = video['name']
        
        # Generate 5 different themes via Gemini (YouTube-optimized)
        themes = generate_concepts(topic, script_content, count=5)
        
        print(f"\n📌 Generated {len(themes)} YouTube thumbnail themes:")
        for t_idx, theme in enumerate(themes, 1):
            print(f"   Tema {t_idx}: {theme.get('theme_name', '?').upper()} → \"{theme.get('cover_text', '?')}\"")
        
        # Track generated covers for revision panel
        themes_with_links = []
        
        # For each theme, generate 2 variants
        for t_idx, theme in enumerate(themes, 1):
            theme_name = theme.get("theme_name", f"theme{t_idx}")
            cover_text = theme.get("cover_text", "BUNU İZLE")
            scene_description = theme.get("scene_description", "")
            
            print(f"\n  ── Tema {t_idx}/{len(themes)}: {theme_name.upper()} ──")
            print(f"     Metin: {cover_text}")
            print(f"     Sahne: {scene_description[:100]}...")
            
            theme_drive_links = []
            
            screenshot_url = theme.get("screenshot_url")
            
            # Select cutouts based on theme mood
            cutout_paths = select_cutouts_for_theme(theme_name=theme_name, target_mood=theme.get('mood', 'confident'), count=3)
            base_cutout = cutout_paths[0] if cutout_paths else None
            extra_cutouts = cutout_paths[1:] if len(cutout_paths) > 1 else None
            
            for v_idx in range(1, 3):  # 2 variants per theme
                print(f"\n     🎬 YouTube Thumbnail Varyasyon {v_idx}/2 üretiliyor (16:9)...")
                
                if not base_cutout:
                    print("     ❌ Cutout bulunamadı. Varyasyon atlanıyor.")
                    continue
                
                safe_video_name = "".join([c for c in video['name'] if c.isalpha() or c.isdigit() or c == ' ']).rstrip()
                final_cover_filename = f"{safe_video_name} THUMBNAIL T{t_idx}_{theme_name}_V{v_idx}.png"
                final_cover_path = os.path.join("outputs", final_cover_filename)
                
                success = run_autonomous_generation(
                    local_person_image_path=base_cutout,
                    video_topic=topic,
                    main_text=cover_text,
                    output_path=final_cover_path,
                    max_retries=5,
                    variant_index=v_idx,
                    script_text=script_content,
                    scene_description=scene_description,
                    extra_cutout_paths=extra_cutouts,
                    screenshot_url=screenshot_url
                )
                
                if not success:
                    print(f"     ❌ Varyasyon {v_idx} başarısız. Sonrakine geçiliyor.")
                    continue
                
                # Upload to Google Drive (THUMBNAIL subfolder)
                drive_file_name = f"Thumbnail T{t_idx} ({theme_name}) V{v_idx}.png"
                print(f"     ☁️ Drive'a yükleniyor: {drive_file_name}")
                if drive_url:
                    upload_cover_to_drive(final_cover_path, drive_url, file_name=drive_file_name)
                    theme_drive_links.append({
                        "variant": v_idx,
                        "url": drive_url,
                    })
            
            # Add theme info for revision panel
            themes_with_links.append({
                "theme_index": t_idx,
                "theme_name": theme_name,
                "cover_text": cover_text,
                "drive_links": theme_drive_links,
            })
        
        # Add revision panel to Notion page
        if themes_with_links:
            print(f"\n📸 YouTube revizyon paneli Notion sayfasına ekleniyor...")
            add_revision_panel(video["id"], themes_with_links)
            
    print("\n" + "=" * 60)
    print("🎬 YOUTUBE THUMBNAIL PIPELINE COMPLETED")
    print("=" * 60)


if __name__ == "__main__":
    import os
    import time
    
    # Eğer Railway üzerinde çalışıyorsa (veya zorunlu loop isteniyorsa) sürekli döngüde çalışır.
    # Railway'de normal servisler (cron olmayan) exited olunca crash sayılır ve FAILED durumuna düşer.
    if os.environ.get("RAILWAY_ENVIRONMENT_NAME") or os.environ.get("LOOP") == "1":
        print("🔄 [Railway Worker Mode] Başlatıldı. 10 dakikada bir kontrol edilecek...")
        while True:
            try:
                process_ready_videos()
            except Exception as e:
                import logging
                logging.error(f"Beklenmeyen hata oluştu: {e}", exc_info=True)
            print("⏳ 10 dakika bekleniyor...")
            time.sleep(600)
    else:
        # Lokal veya tek seferlik çalışma
        process_ready_videos()
