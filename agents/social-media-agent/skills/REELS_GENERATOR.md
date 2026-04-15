# Skill: REELS_GENERATOR

## Purpose
Danışmanın yüklediği mülk fotoğraflarından 25 saniyelik Instagram/TikTok Reels videosu üret.

## Serves Goals
- Reels üretim süresi <15 dk

## Inputs
- Supabase: `properties.photos[]` — Mülk fotoğrafları
- `data/imports/sample_images/` — Stil referansı
- Mülk başlığı, konumu, özellikleri (overlay metin için)

## Process
1. Danışman `post_requests.md`'de Reels isteği bırakır:
   ```
   TYPE: reels
   PROPERTY_ID: xxx
   STYLE: luxury / modern / minimal
   MUSIC: upbeat / calm / dramatic
   ```
2. Mülk fotoğraflarını çek (en az 5 fotoğraf önerilir)
3. RunwayML Gen-3 Alpha API çağrısı:
   - Input: mülk fotoğrafları + stil promptu
   - Duration: 25 saniye
   - Output: MP4
   ```
   Prompt: "Lüks gayrimenkul tanıtım videosu. {property_type} in {city}.
   Smooth kamera hareketi. Professional real estate cinematography style.
   Bright, warm lighting. {style} aesthetic."
   ```
4. Video üretildi → Supabase Storage'a yükle
5. social_posts tablosuna kaydet (video_url ile, status='draft')
6. Danışmana WA bildirimi: "Reels hazır, onaylayın"

**Alternatif (RunwayML yoksa):**
- Fotoğrafları slideshow animasyonuyla birleştir (n8n + FFmpeg)
- Müzik + overlay metin ekle
- 25 sn MP4 çıktı

## Outputs
- MP4 video → Supabase Storage
- Yeni `social_posts` kaydı (video_url ile)
- WA bildirimi

## Quality Bar
- Video 25 saniye (±2 sn)
- MP4 formatında, 1080x1920 (9:16 dikey)
- Boyut <50MB
- Mülk adı ve ofis logosu overlay olarak eklenebilmeli

## Tools
- RunwayML Gen-3 Alpha API (n8n HTTP node)
- Alternatif: Pika API, Kling AI
- FFmpeg (n8n üzerinden slideshow için)
- Supabase Storage
