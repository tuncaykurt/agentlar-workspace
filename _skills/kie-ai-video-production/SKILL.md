---
name: kie-ai-video-production
description: |
  Kie AI platformu üzerinden video, görsel ve ses üretimi. Tüm modelleri tanır, doğru model seçimini yapar, 
  çok adımlı pipeline'ları yönetir. Ürün reklam videosu, mockup üretimi, seslendirme, 
  video+ses birleştirme gibi uçtan uca üretim süreçlerini kapsar.
  Bu skill'i video/görsel/mockup üretimi istendiğinde, ürün tanıtımı yapılacağında, 
  veya Kie AI API ile herhangi bir işlem gerektiğinde kullan.
---

# Kie AI — Kapsamlı Üretim Skill'i

Bu skill, Kie AI API üzerindeki **tüm modelleri** tanır, kullanıcı ihtiyacına göre **doğru modeli seçer** ve 
**çok adımlı pipeline'ları** (mockup → video → ses → birleştirme) uçtan uca yönetir.

---

## 🔑 Kimlik Bilgileri

- **Kie AI API Key:** `_knowledge/api-anahtarlari.md` → Kie AI bölümünden al
- **Base URL:** `https://api.kie.ai/api/v1/`
- **Auth Header:** `Authorization: Bearer {API_KEY}`
- **ElevenLabs API Key:** `_knowledge/api-anahtarlari.md` → ElevenLabs bölümünden al (yoksa kullanıcıdan iste)
- **ImgBB API Key:** `_knowledge/api-anahtarlari.md` → ImgBB bölümünden al (yerel görseli URL'ye çevirmek için)

---

## 📦 Model Kataloğu — Hangi İşe Hangi Model?

Kullanıcı bir şey istediğinde **bu tabloyu** kontrol et ve doğru modeli seç:

### 🖼️ GÖRSEL ÜRETİMİ

| Model | Model ID | Ne Zaman Kullan? | Detay Dosyası |
|-------|----------|-------------------|---------------|
| **Nano Banana 2** | `nano-banana-2` | Ürün mockup'ı, Instagram postu, poster, carousel, 4K görsel | `models/nano-banana-2.md` |
| **Nano Banana Pro** | `nano-banana-pro` | Ürün görseli, Instagram postu (eski versiyon, NB2 tercih et) | `models/nano-banana-pro.md` |
| **GPT Image 1.5** | `gpt-image-1.5` | Fotogerçekçi görsel, detaylı illüstrasyon | `models/gpt-image-1.5.md` |
| **Seedream 5.0 Lite** | `seedream-5.0-lite` | Hızlı görsel üretimi, multimodal reasoning | `models/seedream-5.0-lite.md` |

### 🎬 VİDEO ÜRETİMİ

| Model | Model ID | Ne Zaman Kullan? | Detay Dosyası |
|-------|----------|-------------------|---------------|
| **Kling 3.0** | `kling-3.0/video` | Ürün reklam videosu, image-to-video, multi-shot, ses efektli | `models/kling-3.md` |
| **Veo 3.1** | `veo3.1` | Yüksek kalite sinematik video, doğal hareket, senkron ses | `models/veo-3.1.md` |
| **Sora 2 Pro Storyboard** | `sora-2-pro-storyboard` | Çok sahneli hikaye anlatımı, storyboard video | `models/sora-2-pro-storyboard.md` |
| **Seedance 2.0** | `bytedance/seedance-2` | Sinematik video, kamera kontrolü, text/image-to-video, multimodal referans (görsel+video+ses), karakter tutarlılığı, native audio, zincirleme üretim | `models/seedance-2.0.md` |
| **Wan 2.6** | `wan-2.6` | Uygun fiyatlı sinematik video, çoklu çekim, 1080p | `models/wan-2.6.md` |

### 🖌️ GÖRSEL DÜZENLEME

| Model | Model ID | Ne Zaman Kullan? | Detay Dosyası |
|-------|----------|-------------------|---------------|
| **Qwen Image Edit** | `qwen/image-edit` | Mevcut görseli düzenleme, arka plan değiştirme, nesne ekleme/çıkarma | `models/qwen-image-edit.md` |

### 🔊 SES & SESLENDİRME

| Platform | Ne Zaman Kullan? | Detay Dosyası |
|----------|-------------------|---------------|
| **ElevenLabs** | Türkçe/İngilizce seslendirme, reklam sesi, dış ses | `models/elevenlabs-tts.md` |
| **Kling 3.0 Sound** | Video içi ses efektleri (ambient, ortam sesi) | `models/kling-3.md` (sound parametresi) |

---

## 🧠 Model Seçim Mantığı (Karar Ağacı)

Kullanıcının isteğini analiz et ve şu karar ağacını izle:

```
Kullanıcı ne istiyor?
│
├── 📸 Statik görsel mi?
│   ├── Ürün mockup'ı / Instagram postu → Nano Banana 2
│   ├── Mevcut görseli düzenleme → Qwen Image Edit
│   ├── Fotogerçekçi illüstrasyon → GPT Image 1.5
│   └── Hızlı görsel → Seedream 5.0 Lite
│
├── 🎬 Video mu?
│   ├── Ürün reklam videosu (kısa, efektli) → Kling 3.0
│   ├── Sinematik/premium video → Veo 3.1 veya Seedance 2.0
│   ├── Reel/TikTok/Reklam Çoklu Dinamik Video → Kling/Veo klipleri (Ayrı Üret) + FFmpeg birleştirme
│   ├── Image-to-video (görselden video) → Seedance 2.0 (first_frame_url) veya Kling 3.0
│   ├── Karakter tutarlılığı / multimodal referans → Seedance 2.0 (referans sistemi)
│   ├── Zincirleme sahne üretimi → Seedance 2.0 (return_last_frame → sonraki sahne)
│   └── Çok sahneli hikaye → Sora 2 Pro Storyboard (⚠️ Backup model; 500 hatası verebilir)
│
├── 🔊 Seslendirme mi?
│   ├── Türkçe dış ses → ElevenLabs (Kie AI v2)
│   └── Video içi ses efektleri → Kling 3.0 (sound: "on")
│
└── 🔄 Çok adımlı pipeline mı?
    ├── Ürün fotoğrafı → Reklam videosu → pipelines/urun-reklam-videosu.md
    ├── Dinamik 15s+ video → pipelines/dinamik-coklu-video-birlestirme.md
    ├── Mockup üretimi → pipelines/mockup-uretimi.md
    └── Video + Seslendirme → pipelines/video-seslendirme.md
```

---

## 🔄 Asenkron Görev Modeli (Tüm Modeller İçin Ortak)

Kie AI tüm üretim görevlerini **asenkron** işler. Akış her zaman aynıdır:

### Adım 1: Görev Oluşturma
```http
POST https://api.kie.ai/api/v1/jobs/createTask
Authorization: Bearer {API_KEY}
Content-Type: application/json
```
```json
{
  "model": "MODEL_ID",
  "input": { /* model-spesifik parametreler */ },
  "callBackUrl": "opsiyonel-webhook"
}
```
**Yanıt:** `{ "code": 200, "data": { "taskId": "abc123" } }`

### Adım 2: Durum Sorgulama (Polling)
```http
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}
Authorization: Bearer {API_KEY}
```
**state değerleri:**
- `processing` / `waiting` → 10-30 saniye bekle, tekrar sorgula
- `success` → `resultJson` alanını parse et, `resultUrls` dizisinden URL'leri al
- `failed` / `fail` → `failMsg` alanını kontrol et

### Adım 3: Sonuç Alma
`resultJson` bir JSON string'dir. Parse edince:
```json
{ "resultUrls": ["https://cdn.example.com/output.mp4"] }
```

### ⚠️ Polling Kuralları
- Minimum 10 saniye aralıkla sorgula
- Görseller: ~30-60 saniye  
- Videolar: ~2-5 dakika
- Video + ses: ~5-10 dakika
- **Maximum 60 deneme** (5 dakika interval ile)

---

## 📤 Yerel Görsel Yükleme (ImgBB)

Kullanıcı yerel bir görsel paylaşırsa, önce ImgBB'ye yükle:

```bash
curl -X POST "https://api.imgbb.com/1/upload" \
  -F "key=77ae1f6783f43d1129e6214cfa605da1" \
  -F "image=@/yerel/dosya/yolu.jpg"
```

Yanıttaki `data.url` değerini Kie AI API'lerine `image_url` / `image_input` olarak kullan.

---

## 🚀 Pipeline'lar (Uçtan Uca Üretim Akışları)

### Pipeline 1: Ürün Reklam Videosu
**Senaryo:** Kullanıcı ürün fotoğrafı verir → Profesyonel reklam videosu çıktısı ister.

```
1. [ImgBB] Yerel görsel → Public URL
2. [Nano Banana 2] Ürünü mockup/reklam görseline dönüştür
3. [Kling 3.0] Mockup görselinden reklam videosu üret (sound: "on")
4. [ElevenLabs] Türkçe reklam metnini seslendir
5. [FFmpeg] Video + ses birleştir, senkronize et
```
**Detay:** `pipelines/urun-reklam-videosu.md`

### Pipeline 2: Ürün Mockup Üretimi
**Senaryo:** Kullanıcı ürün fotoğrafı verir → Profesyonel mockup görselleri ister.

```
1. [ImgBB] Yerel görsel → Public URL
2. [Nano Banana 2] Referans görselle mockup üret
   - Eğer referans görsel varsa: analiz et → prompt oluştur → image_input olarak gönder
   - Eğer referans yoksa: doğrudan prompt ile üret
```
**Detay:** `pipelines/mockup-uretimi.md`

### Pipeline 3: Video + Seslendirme Birleştirme
**Senaryo:** Video üretildi, Türkçe dış ses eklenmesi gerekiyor.

```
1. [Kling 3.0 / Veo 3.1 / Seedance 2.0] Video üret
2. [ElevenLabs] Türkçe seslendirme üret (video süresiyle eşleştir)
3. [FFmpeg] Video + ses birleştir
```
**Detay:** `pipelines/video-seslendirme.md`

---

## ❌ Hata Yönetimi

| Hata | Neden | Çözüm |
|------|-------|-------|
| `401` | API anahtarı hatalı | `_knowledge/api-anahtarlari.md` kontrol et |
| `402` | Yetersiz kredi | Kredi sorgula: `GET /chat/credit` |
| `404` | Model adı yanlış | Bu dosyadaki Model Kataloğu tablosunu kontrol et |
| `422` | Eksik/hatalı parametre | Model dosyasındaki parametreleri kontrol et |
| `429` | Rate limit aşıldı | 30 saniye bekle, tekrar dene |
| `500` | Sunucu hatası | 30 saniye bekle, tekrar dene |
| `state: failed` | Üretim başarısız | `failMsg` oku, prompt'u sadeleştir |

---

## 💰 Kredi Sorgulama

```http
GET https://api.kie.ai/api/v1/chat/credit
Authorization: Bearer {API_KEY}
```

---

## 📁 Dosya Yapısı

```
_skills/kie-ai-video-production/
├── SKILL.md                          ← Bu dosya (ana yönerge)
├── models/
│   ├── nano-banana-2.md              ← Nano Banana 2 (görsel üretimi)
│   ├── nano-banana-pro.md            ← Nano Banana Pro (eski, referans)
│   ├── kling-3.md                    ← Kling 3.0 (video üretimi)
│   ├── veo-3.1.md                    ← Veo 3.1 (sinematik video)
│   ├── sora-2-pro-storyboard.md      ← Sora 2 Pro (çok sahneli)
│   ├── seedance-2.0.md               ← Seedance 2.0 (sinematik video)
│   ├── qwen-image-edit.md            ← Qwen Image Edit (düzenleme)
│   ├── elevenlabs-tts.md             ← ElevenLabs TTS (seslendirme)
│   └── gpt-image-1.5.md             ← GPT Image 1.5 (görsel)
├── guides/
│   └── Seedance_2_0_Skill_Guide.md   ← Seedance 2.0 prompt & karar rehberi
├── pipelines/
│   ├── urun-reklam-videosu.md        ← Tam pipeline: fotoğraf → video
│   ├── mockup-uretimi.md             ← Pipeline: fotoğraf → mockup
│   └── video-seslendirme.md          ← Pipeline: video + ses birleştirme
└── scripts/
    └── kie_poll.sh                   ← Ortak polling helper
```

---

## 📎 İlişkili Kaynaklar

- `_knowledge/api-anahtarlari.md` — Tüm API anahtarları
- `Projeler/İçerik_Otomasyon_Test/api-docs/` — Detaylı API dökümanları
- `Projeler/İçerik_Otomasyon_Test/prompt-rehberleri/` — Prompt yazım kılavuzları
- `guides/Seedance_2_0_Skill_Guide.md` — Seedance 2.0 prompt yazma ve karar alma rehberi
- `models/KIE_AI_Seedance_2_API_Docs.md` — Seedance 2.0 API ham dokümantasyonu
- `Projeler/İçerik_Otomasyon_Test/scripts/` — Mevcut shell script'ler

---

## 📏 Dosya Saklama Süresi
Üretilen dosyalar **14 gün** boyunca saklanır — indirmek için bu süreyi aşma.
