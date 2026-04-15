import os
import json

# Set correct OAUTH_DIR inline
import google_auth
google_auth.OAUTH_DIR = "/tmp/antigravity_workaround/_knowledge/credentials/oauth"

import manual_cover_gen
import drive_service

print("Uploading Video 1 cover...")
drive_service.upload_cover_to_drive("/tmp/antigravity_workaround/Reels_Kapak/outputs/video1_official_kapak.png", manual_cover_gen.DRIVE_URL, file_name="AI Tools Top 5 Kapak.png")

print("\nProcessing Video 2...")
manual_cover_gen.process_video(manual_cover_gen.video2_name, manual_cover_gen.video2_script, "outputs/video2_official_kapak.png")
print("\n✅ Tümü tamamlandı.")
