import os
import random
from notion_service import get_ready_videos, add_revision_panel
from autonomous_cover_agent import run_autonomous_generation, generate_three_themes
from drive_service import upload_cover_to_drive, count_existing_covers


def process_ready_videos():
    """
    Ana pipeline: Notion'dan hazır videoları çeker, her biri için
    3 tema × 2 varyasyon = 6 kapak üretir, Drive'a yükler ve
    Notion sayfasına revizyon paneli ekler.
    """
    print("=== Starting Multi-Theme Auto Cover Generation Pipeline ===")
    print("📐 Mode: 3 Themes × 2 Variants = 6 Covers per video\n")
    
    videos = get_ready_videos()
    
    if not videos:
        print("No videos found with 'Çekildi - Edit YOK' status.")
        return

    # Create outputs folder if not exists
    os.makedirs("outputs", exist_ok=True)
    
    # Get available pre-processed photos
    cutout_dir = "assets/cutouts"
    if not os.path.exists(cutout_dir):
        print(f"Error: {cutout_dir} directory not found.")
        return
        
    available_cutouts = [f for f in os.listdir(cutout_dir) if f.lower().endswith(('png', 'jpg', 'jpeg'))]
    if not available_cutouts:
        print(f"Error: No image files found in {cutout_dir}.")
        return

    for video in videos:
        print(f"\n{'='*60}")
        print(f"🎬 Processing Video: {video['name']}")
        print(f"{'='*60}")
        
        drive_url = video.get('drive_url')
        if not drive_url:
            print(f"Skipping {video['name']}: No Drive URL found in Notion properties.")
            continue
            
        # Count existing covers in the Drive folder
        REQUIRED_COVERS = 6
        existing_count = count_existing_covers(drive_url)
        if existing_count >= REQUIRED_COVERS:
            print(f"✅ Skipping {video['name']}: All {REQUIRED_COVERS} covers already exist.")
            continue
        elif existing_count > 0:
            print(f"⚠️ {video['name']}: {existing_count}/{REQUIRED_COVERS} covers found — generating remaining...")
        else:
            print(f"🆕 {video['name']}: No existing covers — full generation starting.")
        
        # Get script content
        script_content = video.get('script_text', '')
        topic = video['name']
        
        # Generate 3 different themes via Gemini
        themes = generate_three_themes(topic, script_content)
        
        print(f"\n📌 Generated {len(themes)} themes:")
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
            
            for v_idx in range(1, 3):  # 2 variants per theme
                print(f"\n     🎨 Varyasyon {v_idx}/2 üretiliyor...")
                
                # Select a random cutout
                cutout_name = random.choice(available_cutouts)
                cutout_path = os.path.join(cutout_dir, cutout_name)
                
                safe_video_name = "".join([c for c in video['name'] if c.isalpha() or c.isdigit() or c==' ']).rstrip()
                final_cover_filename = f"{safe_video_name} KAPAK T{t_idx}_{theme_name}_V{v_idx}.png"
                final_cover_path = os.path.join("outputs", final_cover_filename)
                
                success = run_autonomous_generation(
                    local_person_image_path=cutout_path,
                    video_topic=topic,
                    main_text=cover_text,
                    output_path=final_cover_path,
                    max_retries=2,
                    variant_index=v_idx,
                    script_text=script_content,
                    scene_description=scene_description
                )
                
                if not success:
                    print(f"     ❌ Varyasyon {v_idx} başarısız. Sonrakine geçiliyor.")
                    continue
                
                # Upload to Google Drive
                drive_file_name = f"Kapak T{t_idx} ({theme_name}) V{v_idx}.png"
                print(f"     ☁️ Drive'a yükleniyor: {drive_file_name}")
                if drive_url:
                    upload_cover_to_drive(final_cover_path, drive_url, file_name=drive_file_name)
                    # Build Drive view link for revision panel
                    # (The actual file URL will be the KAPAK subfolder in the drive)
                    theme_drive_links.append({
                        "variant": v_idx,
                        "url": drive_url,  # Links to the KAPAK folder
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
            print(f"\n📸 Revizyon paneli Notion sayfasına ekleniyor...")
            add_revision_panel(video["id"], themes_with_links)
            
    print("\n=== Multi-Theme Pipeline Execution Completed ===")


if __name__ == "__main__":
    process_ready_videos()
