# Pipeline: Ürün Reklam Videosu

## Senaryo
Kullanıcı bir ürün fotoğrafı verir ve profesyonel bir reklam videosu ister.
Video, Türkçe sesli bir dış ses (voiceover) ile birlikte teslim edilir.

---

## Tam Akış

```
Kullanıcı Ürün Fotoğrafı
        │
        ▼
  ┌─────────────────┐
  │ 1. ImgBB Upload  │  Yerel görsel → Public URL
  └────────┬────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 2. Nano Banana 2     │  Ürünü mockup/reklam görseline çevir
  │    (image-to-image)  │  
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 3. Kling 3.0         │  Mockup → Reklam videosu
  │    (image-to-video)  │  sound: "on" ile ses efektleri
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 4. ElevenLabs        │  Türkçe seslendirme üret
  │    (text-to-speech)  │  Video süresine göre metin ayarla
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 5. FFmpeg            │  Video + ses birleştir
  │    (post-processing) │  Senkronize et
  └────────┬────────────┘
           │
           ▼
     Tamamlanmış Video
```

---

## Adım 1: Görsel Yükleme (ImgBB)

Eğer kullanıcı yerel bir dosya verdiyse:

```bash
curl -X POST "https://api.imgbb.com/1/upload" \
  -F "key=77ae1f6783f43d1129e6214cfa605da1" \
  -F "image=@/path/to/urun.jpg"
```

Yanıttaki `data.url` değerini kaydet → `PRODUCT_IMAGE_URL`

---

## Adım 2: Mockup Üretimi (Nano Banana 2)

Ürün fotoğrafını reklama uygun bir mockup'a dönüştür:

```bash
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer {KIE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nano-banana-2",
    "input": {
      "prompt": "Professional product advertisement mockup. [ÜRÜN ADI] displayed on clean modern surface with premium lighting. Commercial photography style, studio quality, dramatic shadows, professional composition. 4K resolution.",
      "image_input": ["'$PRODUCT_IMAGE_URL'"],
      "aspect_ratio": "16:9",
      "resolution": "2k"
    }
  }'
```

**Polling** yap → Mockup URL'sini al → `MOCKUP_URL`

---

## Adım 3: Video Üretimi (Kling 3.0)

Mockup görselinden reklam videosu üret:

```bash
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer {KIE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-3.0/video",
    "input": {
      "generationType": "REFERENCE_2_VIDEO",
      "imageUrls": ["'$MOCKUP_URL'"],
      "prompt": "Cinematic product advertisement. The product slowly rotates and the camera gracefully orbits around it, revealing details from every angle. Soft studio lighting, shallow depth of field, premium commercial quality. Smooth slow-motion movements, professional color grading.",
      "duration": 10,
      "aspect_ratio": "16:9",
      "sound": "on"
    }
  }'
```

**Polling** yap → Video URL'sini al → `VIDEO_URL`

---

## Adım 4: Türkçe Seslendirme (ElevenLabs)

### 4a. Metin Hazırlama (Video süresine göre)

10 saniyelik video → ~25 kelimelik metin:
```
"Tarzınızı yansıtan mükemmel bir tasarım. Kalite ve şıklığın buluştuğu nokta."
```

### 4b. Seslendirme

```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}" \
  -H "xi-api-key: {ELEVENLABS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Tarzınızı yansıtan mükemmel bir tasarım. Kalite ve şıklığın buluştuğu nokta.",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75,
      "style": 0.4,
      "use_speaker_boost": true
    }
  }' \
  --output "/tmp/voiceover.mp3"
```

### 4c. Ses Süresini Kontrol Et

```bash
ffprobe -i /tmp/voiceover.mp3 -show_entries format=duration -v quiet -of csv="p=0"
```

Eğer ses süresi video süresinden uzunsa → metni kısalt ve tekrar üret.
Eğer kısaysa → video süresini ayarla veya sessiz aralık ekle.

---

## Adım 5: Video + Ses Birleştirme (FFmpeg)

### 5a. Video İndir

```bash
curl -o /tmp/reklam_video.mp4 "$VIDEO_URL"
```

### 5b. Birleştir

```bash
# Video'nun kendi sesini koru (ses efektleri) + dış sesi ekle
ffmpeg -i /tmp/reklam_video.mp4 -i /tmp/voiceover.mp3 \
  -filter_complex "[0:a]volume=0.3[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" \
  -c:v copy -c:a aac \
  -shortest \
  /tmp/final_reklam.mp4
```

**Notlar:**
- `volume=0.3` → Video'nun ses efektlerini %30'a düşür (arka plan olarak kalır)
- `volume=1.0` → Dış ses tam güçte
- `amix` → İki sesi birleştir
- `-shortest` → Kısa olanın süresine göre kes

### 5c. Sadece Dış Ses (Video orijinal sesi yoksa)

```bash
ffmpeg -i /tmp/reklam_video.mp4 -i /tmp/voiceover.mp3 \
  -map 0:v -map 1:a \
  -c:v copy -c:a aac \
  -shortest \
  /tmp/final_reklam.mp4
```

---

## Sonuç

`/tmp/final_reklam.mp4` → Kullanıcıya teslim et.

---

## Sık Karşılaşılan Sorunlar

| Sorun | Çözüm |
|-------|-------|
| Mockup kalitesi düşük | Prompt'u detaylandır, resolution: "2k" kullan |
| Video fazla hızlı/yavaş | Duration ve prompt'taki eylem sayısını dengele |
| Ses-video uyumsuz | Ses süresini kontrol et, metni ayarla |
| FFmpeg komutu başarısız | ffmpeg'in kurulu olduğunu doğrula: `which ffmpeg` |
| ImgBB upload başarısız | Dosya boyutunu kontrol et (max 32 MB) |
