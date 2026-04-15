#!/usr/bin/env python3
"""
Frame Extractor — Dinamik Sampling (Round 1)
Ekran kaydından her N saniyede bir frame çıkarır.
"""
import cv2
import os
import sys
import json

VIDEO_PATH = sys.argv[1] if len(sys.argv) > 1 else ""
OUTPUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "typeless5/frames"
INTERVAL_SEC = int(sys.argv[3]) if len(sys.argv) > 3 else 6  # Her 6 saniyede 1 frame

def extract_frames(video_path, output_dir, interval_sec):
    os.makedirs(output_dir, exist_ok=True)
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"ERROR: Video açılamadı: {video_path}")
        return []
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps if fps > 0 else 0
    
    print(f"Video bilgileri:")
    print(f"  FPS: {fps}")
    print(f"  Toplam frame: {total_frames}")
    print(f"  Süre: {duration_sec:.1f} saniye ({duration_sec/60:.1f} dakika)")
    print(f"  Aralık: Her {interval_sec} saniyede 1 frame")
    
    frame_interval = int(fps * interval_sec)
    extracted = []
    frame_idx = 0
    saved_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_idx % frame_interval == 0:
            timestamp_sec = frame_idx / fps
            filename = f"frame_{saved_count:03d}_t{timestamp_sec:.0f}s.jpg"
            filepath = os.path.join(output_dir, filename)
            
            # Blog kalitesini artırmak için frame orijinal çözünürlükte kaydedilir (resize edilmez)
            # JPEG kalitesi maksimum netlik için 95'e çıkarıldı.
            # (Groq'a gitmeden önce, vision_analyzer içinde hafızada resize edilecek)
            cv2.imwrite(filepath, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            extracted.append({
                "index": saved_count,
                "timestamp_sec": round(timestamp_sec, 1),
                "filename": filename,
                "filepath": filepath
            })
            saved_count += 1
        
        frame_idx += 1
    
    cap.release()
    
    print(f"\nÇıkarılan frame sayısı: {saved_count}")
    print(f"Kayıt dizini: {output_dir}")
    
    # Metadata kaydet
    metadata = {
        "video_path": video_path,
        "fps": fps,
        "total_frames": total_frames,
        "duration_sec": round(duration_sec, 1),
        "interval_sec": interval_sec,
        "extracted_frames": extracted
    }
    
    meta_path = os.path.join(output_dir, "frames_metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    
    print(f"Metadata: {meta_path}")
    return extracted

if __name__ == "__main__":
    if not VIDEO_PATH:
        print("Kullanım: python3 extract_frames.py <video_path> [output_dir] [interval_sec]")
        sys.exit(1)
    
    frames = extract_frames(VIDEO_PATH, OUTPUT_DIR, INTERVAL_SEC)
    print(f"\nToplam {len(frames)} frame başarıyla çıkarıldı.")
