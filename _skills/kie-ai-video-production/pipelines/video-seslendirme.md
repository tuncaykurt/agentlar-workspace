# Pipeline: Video + Seslendirme Birleştirme

## Senaryo
Bir video üretildi (veya mevcut bir video var) ve üzerine Türkçe dış ses eklenmesi gerekiyor.
Ses ve video sürelerinin senkronize olması kritik.

---

## Tam Akış

```
Video (Kling/Veo/Sora'dan)
        │
        ▼
  ┌─────────────────────┐
  │ 1. Video Bilgisi Al   │  → Süre, çözünürlük, format
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────────┐
  │ 2. Seslendirme Metni     │  Video süresine göre metin hazırla
  │    Hazırla               │  (~2.5 kelime/saniye)
  └────────┬────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 3. ElevenLabs        │  Türkçe seslendirme üret
  │    (text-to-speech)  │  → .mp3 dosyası
  └────────┬────────────┘
           │
           ▼
  ┌─────────────────────────┐
  │ 4. Senkronizasyon        │  Ses ve video sürelerini karşılaştır
  │    Kontrolü              │  Gerekirse ayarla
  └────────┬────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 5. FFmpeg            │  Video + ses birleştir
  │    (birleştirme)     │
  └────────┬────────────┘
           │
           ▼
     Sesli Final Video
```

---

## Adım 1: Video Bilgisi

### Video URL'den İndir
```bash
curl -o /tmp/source_video.mp4 "$VIDEO_URL"
```

### Süre ve Format Bilgisi
```bash
# Süre
ffprobe -i /tmp/source_video.mp4 \
  -show_entries format=duration \
  -v quiet -of csv="p=0"

# Detaylı bilgi
ffprobe -i /tmp/source_video.mp4 \
  -show_entries stream=width,height,duration,codec_name \
  -v quiet -of json
```

---

## Adım 2: Seslendirme Metni Hazırlama

### Süre-Metin Eşleştirmesi

| Video Süresi | Kelime Sayısı | Örnek Metin |
|-------------|--------------|-------------|
| 5s | ~12 kelime | "Tarzınızı yansıtan mükemmel bir tasarım. Kalite ve şıklığın buluştuğu nokta." |
| 10s | ~25 kelime | "Her anı özel kılan bir tasarım. Premium kalite, benzersiz detaylar ve üstün konfor bir arada. Farkı hissedin, farkı yaşayın." |
| 15s | ~37 kelime | "Tarzınızı yansıtan mükemmel bir tasarım burada. Premium kalite malzemeler, benzersiz detaylar ve üstün konfor bir arada. Modern yaşamın gerekliliklerini karşılayan, sizi bir adım öne taşıyan bir deneyim. Farkı keşfedin." |

### Metin Yazım Kuralları:
1. **Kısa, net cümleler** — karmaşık yapılardan kaçın
2. **Aksiyona yönelik** — "keşfedin", "deneyin", "hissedin"
3. **Marka tonu** — premium, güvenilir, profesyonel
4. **Son cümle CTA** — aksiyon çağrısı ile bitir
5. **Noktalama önemli** — virgül = kısa duraklama, nokta = uzun duraklama

---

## Adım 3: Seslendirme

```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128" \
  -H "xi-api-key: {ELEVENLABS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "[HAZIRLANAN METİN]",
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

---

## Adım 4: Senkronizasyon Kontrolü

```bash
# Ses süresini al
AUDIO_DURATION=$(ffprobe -i /tmp/voiceover.mp3 \
  -show_entries format=duration \
  -v quiet -of csv="p=0")

# Video süresini al
VIDEO_DURATION=$(ffprobe -i /tmp/source_video.mp4 \
  -show_entries format=duration \
  -v quiet -of csv="p=0")

echo "Video: ${VIDEO_DURATION}s | Ses: ${AUDIO_DURATION}s"
```

### Eğer ses > video:
- **Seçenek 1:** Metni kısalt, tekrar ElevenLabs'te üret
- **Seçenek 2:** FFmpeg ile sesi hızlandır:
  ```bash
  ffmpeg -i /tmp/voiceover.mp3 -filter:a "atempo=1.2" /tmp/voiceover_fast.mp3
  ```
  (max 2.0x, natürel kalmak için 1.1-1.3x arasında tut)

### Eğer ses < video:
- **Seçenek 1:** Metni uzat, tekrar üret
- **Seçenek 2:** Başlangıçta/sonunda sessizlik ekle:
  ```bash
  # 2 saniye başlangıç gecikmesi + sondaki sessizlik
  ffmpeg -i /tmp/voiceover.mp3 \
    -af "adelay=2000|2000,apad" \
    -t $VIDEO_DURATION \
    /tmp/voiceover_padded.mp3
  ```

---

## Adım 5: FFmpeg Birleştirme

### Senaryo A: Video sesli + dış ses ekle (iki ses katmanı)
```bash
ffmpeg -i /tmp/source_video.mp4 -i /tmp/voiceover.mp3 \
  -filter_complex "[0:a]volume=0.25[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" \
  -c:v copy -c:a aac -b:a 192k \
  -shortest \
  /tmp/final_video.mp4
```

### Senaryo B: Video sessiz + dış ses ekle
```bash
ffmpeg -i /tmp/source_video.mp4 -i /tmp/voiceover.mp3 \
  -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k \
  -shortest \
  /tmp/final_video.mp4
```

### Senaryo C: Video sesli + dış ses + fade in/out
```bash
ffmpeg -i /tmp/source_video.mp4 -i /tmp/voiceover.mp3 \
  -filter_complex "\
    [0:a]volume=0.2[bg];\
    [1:a]afade=t=in:ss=0:d=0.5,afade=t=out:st=$(echo "$VIDEO_DURATION - 1" | bc):d=1,volume=1.0[vo];\
    [bg][vo]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" \
  -c:v copy -c:a aac -b:a 192k \
  -shortest \
  /tmp/final_video.mp4
```

---

## Volume Ayar Rehberi

| İçerik Tipi | Video Sesi | Dış Ses |
|-------------|-----------|---------|
| Ürün reklamı | 0.2-0.3 | 1.0 |
| Tanıtım filmi | 0.3-0.4 | 0.9 |
| Müzikli video | 0.5-0.6 | 0.8 |
| Sadece dış ses | 0.0 | 1.0 |

---

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| "No such filter: amix" | FFmpeg'i güncelleye: `brew install ffmpeg` |
| Ses çıktı yok | Video'nun ses stream'i var mı kontrol et: `ffprobe -i video.mp4 -show_streams` |
| Senkronizasyon bozuk | adelay ile gecikme ekle veya atempo ile hızlandır |
| Kaliteli ses çok | `-b:a 192k` yeterli, daha yüksek gereksiz |
