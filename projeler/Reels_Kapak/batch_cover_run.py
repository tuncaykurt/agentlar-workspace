"""
Batch Cover Generation Script
==============================
Bu script belirli videoların kapağını üretir.
Normal pipeline "Çekildi - Edit YOK" statüsünü filtreler ama
bu script doğrudan belirtilen videoları işler.

📐 Mode: 3 Themes × 2 Variants = 6 Covers per video
"""

import os
import random
import json
import requests
from dotenv import load_dotenv
from autonomous_cover_agent import run_autonomous_generation, generate_three_themes
from drive_service import upload_cover_to_drive, count_existing_covers

load_dotenv()

NOTION_TOKEN = os.getenv("NOTION_TOKEN")

# ========== TARGET VIDEOS ==========
TARGET_VIDEOS = [
    {
        "name": "Typeless 3",
        "page_id": "2ef26924-bb82-80fa-8bcf-c347ced8bfcd",
        "drive_url": "https://drive.google.com/drive/folders/1rdiXoCLnvivjc4sUxp1q0vH5M13qr42G"
    },
    {
        "name": "Typeless 4",
        "page_id": "2ef26924-bb82-8004-9855-d259b874eee2",
        "drive_url": "https://drive.google.com/drive/folders/1abRTkPKkZ27NOGFDREt0-y55m6oeB6AA"
    },
    {
        "name": "Typeless 5",
        "page_id": "2f526924-bb82-808b-9abf-d92a8c78a811",
        "drive_url": "https://drive.google.com/drive/folders/1o3xtOS6WLPt4tMDakZ9mS_C4igynX46K"
    },
    {
        "name": "Typeless 6",
        "page_id": "2f526924-bb82-806a-9f39-ccb6d56a313e",
        "drive_url": "https://drive.google.com/drive/folders/1BUV4D6XwAqlr3uccxpIJEGt70D0EPddN"
    },
    {
        "name": "Morpara",
        "page_id": "31526924-bb82-8024-b546-df63c0932b4a",
        "drive_url": "https://drive.google.com/drive/folders/1Fhw6YPpqCnqZlRzyfXehP3idB28sHIfE"
    },
    {
        "name": "KickResume 6",
        "page_id": "30526924-bb82-8031-a292-d953014b7c6b",
        "drive_url": "https://drive.google.com/drive/folders/1d3MxHv7NnXDzm6rPTuP_Enhq7P2mJy6n"
    },
    {
        "name": "Meshy 5",
        "page_id": "2cf26924-bb82-800e-ac7f-d2a45f924e6a",
        "drive_url": "https://drive.google.com/drive/folders/1IhUKO-fRHInS7-BqPDdaLU1pFRKM6_30"
    },
    {
        "name": "Kimi 4",
        "page_id": "31426924-bb82-80e7-ac28-f3e36a06f3bb",
        "drive_url": "https://drive.google.com/drive/folders/13ubkDWixeC5glSrshF-zfSZwwNkLbACR"
    }
]


def get_page_content(page_id: str) -> str:
    """Fetches the blocks of a Notion page and extracts text content."""
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28"
    }
    try:
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            return ""
        data = response.json()
        script_text = ""
        for block in data.get("results", []):
            block_type = block.get("type")
            if block_type in block:
                rich_text = block[block_type].get("rich_text", [])
                for text_item in rich_text:
                    script_text += text_item.get("plain_text", "")
                script_text += "\n"
        return script_text.strip()
    except Exception as e:
        print(f"Error fetching page content for {page_id}: {e}")
        return ""


def process_batch_videos():
    print("=" * 60)
    print("  BATCH COVER GENERATION (Multi-Theme)")
    print("  📐 3 Themes × 2 Variants = 6 Covers per video")
    print("=" * 60)

    # Create outputs folder if not exists
    os.makedirs("outputs", exist_ok=True)

    # Get available pre-processed photos
    cutout_dir = "outputs/cutouts"
    if not os.path.exists(cutout_dir):
        # Fallback to assets/cutouts
        cutout_dir = "assets/cutouts"
    if not os.path.exists(cutout_dir):
        print(f"Error: No cutout directory found.")
        return

    available_cutouts = [f for f in os.listdir(cutout_dir) if f.lower().endswith(('png', 'jpg', 'jpeg'))]
    if not available_cutouts:
        print(f"Error: No image files found in {cutout_dir}.")
        return

    print(f"Found {len(available_cutouts)} cutout images available.\n")

    # Track results
    results_summary = []

    for idx, video in enumerate(TARGET_VIDEOS, 1):
        print(f"\n{'='*60}")
        print(f"  [{idx}/{len(TARGET_VIDEOS)}] Processing: {video['name']}")
        print(f"{'='*60}")

        drive_url = video.get('drive_url')
        if not drive_url:
            print(f"Skipping {video['name']}: No Drive URL.")
            results_summary.append({"name": video['name'], "status": "SKIPPED - No Drive URL"})
            continue

        # Count existing covers in Drive
        REQUIRED_COVERS = 6
        existing_count = count_existing_covers(drive_url)
        if existing_count >= REQUIRED_COVERS:
            print(f"✅ Skipping {video['name']}: All {REQUIRED_COVERS} covers already exist.")
            results_summary.append({"name": video['name'], "status": f"SKIPPED - {existing_count}/{REQUIRED_COVERS} covers exist"})
            continue
        elif existing_count > 0:
            print(f"⚠️ {video['name']}: {existing_count}/{REQUIRED_COVERS} covers found — generating remaining...")
        else:
            print(f"🆕 {video['name']}: No existing covers — full generation starting.")

        # Get script content from Notion
        script_content = get_page_content(video['page_id'])
        if script_content:
            print(f"  Script loaded ({len(script_content)} chars)")
        else:
            print(f"  Warning: No script found for this video")

        topic = video['name']

        # Generate 3 different themes via Gemini
        themes = generate_three_themes(topic, script_content)
        
        print(f"\n  📌 Generated {len(themes)} themes:")
        for t_idx, theme in enumerate(themes, 1):
            print(f"     Tema {t_idx}: {theme.get('theme_name', '?').upper()} → \"{theme.get('cover_text', '?')}\"")

        video_covers_success = 0

        # Select ONE cutout for ALL variants (face consistency)
        cutout_name = random.choice(available_cutouts)
        cutout_path = os.path.join(cutout_dir, cutout_name)
        print(f"  Using cutout for all variants: {cutout_name}")

        # Select 2 extra cutout references for face identity reinforcement
        other_cutouts = [c for c in available_cutouts if c != cutout_name]
        extra_cutout_paths = []
        if len(other_cutouts) >= 2:
            extras = random.sample(other_cutouts, 2)
            extra_cutout_paths = [os.path.join(cutout_dir, e) for e in extras]
        elif len(other_cutouts) == 1:
            extra_cutout_paths = [os.path.join(cutout_dir, other_cutouts[0])]
        print(f"  Extra face references: {len(extra_cutout_paths)}")

        # For each theme, generate 2 variants
        for t_idx, theme in enumerate(themes, 1):
            theme_name = theme.get("theme_name", f"theme{t_idx}")
            cover_text = theme.get("cover_text", "BUNU İZLE")
            scene_description = theme.get("scene_description", "")

            print(f"\n  ── Tema {t_idx}/{len(themes)}: {theme_name.upper()} ──")
            print(f"     Metin: {cover_text}")
            print(f"     Sahne: {scene_description[:100]}...")

            for v_idx in range(1, 3):  # 2 variants per theme
                print(f"\n     🎨 Varyasyon {v_idx}/2 üretiliyor...")

                safe_video_name = "".join([c for c in video['name'] if c.isalpha() or c.isdigit() or c == ' ']).rstrip()
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
                    scene_description=scene_description,
                    extra_cutout_paths=extra_cutout_paths
                )

                if not success:
                    print(f"     ❌ Varyasyon {v_idx} başarısız.")
                    continue

                video_covers_success += 1

                # Upload to Google Drive
                drive_file_name = f"Kapak T{t_idx} ({theme_name}) V{v_idx}.png"
                print(f"     ☁️ Drive'a yükleniyor: {drive_file_name}")
                upload_cover_to_drive(final_cover_path, drive_url, file_name=drive_file_name)

        status = f"OK - {video_covers_success}/6 covers"
        if video_covers_success == 0:
            status = "FAILED - No covers generated"
        results_summary.append({"name": video['name'], "status": status})

    # Print summary
    print("\n" + "=" * 60)
    print("  BATCH COVER GENERATION SUMMARY (Multi-Theme)")
    print("=" * 60)
    for result in results_summary:
        icon = "✅" if "OK" in result['status'] else "⏭️" if "SKIPPED" in result['status'] else "❌"
        print(f"  {icon} {result['name']}: {result['status']}")
    print("=" * 60)


if __name__ == "__main__":
    process_batch_videos()
