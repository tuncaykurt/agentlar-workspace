# Kling 3.0 — Model Referansı

## Genel Bilgi
- **Model ID:** `kling-3.0/video`
- **Tür:** Video Üretimi (Text-to-Video, Image-to-Video, Multi-Shot)
- **Süre:** 5-15 saniye
- **Kalite:** 4K @ 60fps
- **Güçlü Yönler:**
  - Gerçekçi hareket fiziği
  - Native ses efektleri (ambient, ortam sesi)
  - Multi-shot storytelling
  - Element referanslama (ürün tutarlılığı)
  - Image-to-video dönüşümü

> 🎯 **Ürün reklam videosu için birincil tercih.**
> Ürün fotoğrafından video üretme (image-to-video) ve ses efektleri için en iyi model.

---

## Endpoint
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

---

## Text-to-Video

```json
{
  "model": "kling-3.0/video",
  "input": {
    "prompt": "Cinematic product showcase of wireless earbuds rotating slowly on a reflective surface, dramatic studio lighting, shallow depth of field",
    "duration": "5",
    "aspect_ratio": "16:9",
    "mode": "pro",
    "multi_shots": false,
    "sound": true
  }
}
```

## Image-to-Video (REKLAM VİDEOSU İÇİN KULLAN)

```json
{
  "model": "kling-3.0/video",
  "input": {
    "image_urls": ["https://public-url.com/urun-mockup.jpg"],
    "prompt": "The product slowly rotates and the camera orbits around it, revealing details from all angles. Soft studio lighting, cinematic depth of field. The product transitions into lifestyle usage scene.",
    "duration": "10",
    "mode": "pro",
    "multi_shots": false,
    "sound": true
  }
}
```

## Image-to-Video (Başlangıç + Bitiş Karesi)

```json
{
  "model": "kling-3.0/video",
  "input": {
    "image_urls": [
      "https://public-url.com/baslangic.jpg",
      "https://public-url.com/bitis.jpg"
    ],
    "prompt": "Smooth cinematic transition from the first scene to the final scene",
    "duration": "5",
    "mode": "pro",
    "multi_shots": false
  }
}
```

## 3. Multi-Shot Video (Dinamik Çoklu Sahne - DİKKAT)

> ⚠️ **UYARI:** `multi_shots` API üzerinde sıklıkla `500 Server exception` hatası vermektedir. Dinamik reklam veya reel kurguları için **ardışık ayrı ayrı klipler oluşturup bunları FFmpeg ile birleştirme yöntemi (Bkz. pipeline: dinamik-coklu-video-birlestirme.md)** çok daha güvenilir ve profesyonel sonuç verir.

Aşağıdaki yapı teknik olarak mevcut olsa da, çalışmadığı takdirde anında manuel birleştirme yöntemine geç:

```json
{
  "model": "kling-3.0/video",
  "input": {
    "multi_shots": true,
    "multi prompt": [
      {"prompt": "A close up of a coffee cup with steam rising", "duration": "5"},
      {"prompt": "A person picks up the coffee cup and takes a sip", "duration": "5"}
    ],
    "sound": "on",
    "mode": "pro"
  }
}
```
> **Not:** `multi_shots: true` olduğunda sesi de açmak istersen boolean değer yerine `sound: "on"` olarak gönderilmelidir, aksi takdirde 422 hatası döner. Ancak yine de 500 hatası alma ihtimalinin yüksek olduğunu unutmayın.

---

## Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `prompt` | string | ✅ | Video açıklaması (İngilizce önerilir). `multi_shots: false` iken zorunlu. |
| `duration` | string | ✅ | Video süresi: `"5"`, `"10"` veya `"15"` saniye. Sayı değil STIRNG olmalı. |
| `aspect_ratio` | string | ❌ | `image_urls` yoksa `16:9`, `9:16`, `1:1` formatında zorunludur. |
| `mode` | string | ✅ | `"std"` (standart) veya `"pro"` (yüksek kalite). |
| `multi_shots` | boolean | ✅ | `false` (tekil çekim) veya `true` (çoklu çekim). |
| `sound` | boolean | ❌ | `true` = AI ortam ses efektleri açık. Dış ses DEĞİLDİR. |
| `image_urls` | array[str] | ❌ | ["ilk_kare", "son_kare"] veya sadece ["ilk_kare"] URL listesi. |
| `multi_prompt` | array | ❌ | Çoklu çekimde `{prompt, duration}` objeleri listesi. |

---

## 🔊 Ses Efektleri (`sound: true`)

`sound: true` aktifleştirildiğinde Kling 3.0:
- Prompt'tan ortam seslerini çıkarır (su sesi, rüzgar, ayak sesi vb.)
- Video içeriğine uygun ambient ses üretir
- **Dış ses / seslendirme DEĞİLDİR** — bunun için ElevenLabs kullan

---

## 🎬 Reklam Videosu Prompt Şablonu

```
"Professional product advertisement video. [ÜRÜN ADI] showcased with 
cinematic camera movements. Shot 1: Close-up product reveal on [YÜZEY], 
dramatic lighting. Shot 2: Product in use, lifestyle context. 
Shot 3: Brand message and logo. Premium commercial quality, 
shallow depth of field, smooth motion."
```

---

## Kullanım Senaryoları
- ✅ Ürün reklam videosu (birincil kullanım)
- ✅ Image-to-video dönüşümü
- ✅ Multi-shot ürün tanıtımı
- ✅ Ses efektli video
- ✅ Sosyal medya video içeriği
- ✅ E-ticaret ürün tanıtımı
