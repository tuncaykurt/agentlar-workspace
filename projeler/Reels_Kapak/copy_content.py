import os
import shutil

src_root = "ANTIGRAVITY_ROOT_BURAYA/Projeler/Reels_Kapak"
dest_root = "/tmp/antigravity_workaround/Reels_Kapak"

os.makedirs(dest_root, exist_ok=True)

files_to_copy = [
    "autonomous_cover_agent.py",
    "composition_engine.py",
    "drive_service.py",
    "google_auth.py",
    "image_service.py",
    "manual_cover_gen.py",
    "notion_service.py",
    "rourke_style_guide.md",
    "requirements.txt",
    "cutout_temp.png"
]

for f in files_to_copy:
    src_file = os.path.join(src_root, f)
    dest_file = os.path.join(dest_root, f)
    try:
        shutil.copy2(src_file, dest_file)
        print(f"Copied {f}")
    except Exception as e:
        print(f"Failed to copy {f}: {e}")
