# Seedance 2.0 — Model Referansı

## Genel Bilgi

| Alan | Değer |
|------|-------|
| **Model ID** | `bytedance/seedance-2` |
| **Fast Versiyon** | `bytedance/seedance-2-fast` (aynı yapı, daha hızlı) |
| **Tür** | Video Üretimi (Text-to-Video, Image-to-Video, Multimodal) |
| **Geliştirici** | ByteDance |
| **Süre** | 4–15 saniye |
| **Çözünürlük** | 480p, 720p |
| **Aspect Ratio** | 1:1, 4:3, 3:4, 16:9, 9:16, 21:9, adaptive |
| **Ses** | Native audio üretimi (Dual-Branch Diffusion Transformer) |
| **Tahmini Üretim Süresi** | ~60-180 saniye (çözünürlüğe bağlı) |

### Güçlü Yönler
- Sinematik çıktı kalitesi
- Native sesli video üretimi (video + ses eş zamanlı)
- Kamera kontrolü (dolly, orbit, tracking, crane vb.)
- Gerçek dünya fiziği simülasyonu
- Sabit lens desteği (motion blur azaltma)
- Multimodal referans sistemi (görsel + video + ses)
- First/last frame kontrolü (başlangıç/bitiş karesi sabitleme)
- Zincirleme üretim (`return_last_frame` ile)

---

## Endpoint

Kie AI standart `createTask` endpoint'ini kullanır.

```
POST https://api.kie.ai/api/v1/jobs/createTask
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

> ⚠️ Eski bağımsız endpoint (`seedanceapi.org`) artık kullanılmıyor. 
> Tüm işlemler Kie AI üzerinden yapılır.

---

## Input Parametreleri

### Üst Düzey Parametreler

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|------------|----------|
| `model` | string | ✅ | — | `bytedance/seedance-2` |
| `callBackUrl` | string (uri) | ❌ | — | Webhook URL (prodüksiyon için önerilir) |
| `input` | object | ✅ | — | Video üretim parametreleri |

### `input` Objesi

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|------------|----------|
| `prompt` | string | ❌ (ama pratikte gerekli) | — | Video açıklaması. Min 3, max 2500 karakter. |
| `first_frame_url` | string | ❌ | — | İlk kare görseli. URL veya `asset://{assetId}` |
| `last_frame_url` | string | ❌ | — | Son kare görseli. URL veya `asset://{assetId}` |
| `reference_image_urls` | array[string] | ❌ | — | Referans görseller. Max 9 adet (first/last dahil). |
| `reference_video_urls` | array[string] | ❌ | — | Referans videolar. Max 3 adet, toplam max 15s. |
| `reference_audio_urls` | array[string] | ❌ | — | Referans sesler. Max 3 adet, toplam max 15s. |
| `return_last_frame` | boolean | ❌ | `false` | Son kareyi görsel olarak döndürür (zincirleme üretim için) |
| `generate_audio` | boolean | ❌ | `true` | `true` = sesli (pahalı), `false` = sessiz |
| `resolution` | string | ❌ | `720p` | `480p` veya `720p` |
| `aspect_ratio` | string | ❌ | `16:9` | `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `adaptive` |
| `duration` | integer | ❌ | `8` | 4–15 saniye |
| `web_search` | boolean | ❌ | `false` | Online arama kullanımı |

---

## ⚠️ Birbirini Dışlayan Senaryolar (KRİTİK)

Bu üç senaryo birlikte KULLANILAMAZ. Hangisini kullanacağını önceden belirle:

| Senaryo | Kullanılan Parametreler | Ne Zaman? |
|---------|-------------------------|-----------|
| **1. Image-to-Video (İlk Kare)** | `first_frame_url` | Belirli bir görselden video başlatmak |
| **2. Image-to-Video (İlk + Son Kare)** | `first_frame_url` + `last_frame_url` | Başlangıç ve bitiş karesi sabit olacaksa |
| **3. Multimodal Referans** | `reference_image_urls` + `reference_video_urls` + `reference_audio_urls` | Karakter tutarlılığı, kamera transferi, ses senkronizasyonu |

> **Kural:** Senaryo 1/2 ile Senaryo 3 aynı anda kullanılamaz.
> Multimodal referansta first/last frame etkisini prompt içinde dolaylı elde edebilirsin.

---

## Referans Materyal Kısıtlamaları

### Görseller
| Kısıtlama | Değer |
|-----------|-------|
| Max adet | 9 (first/last frame dahil toplam) |
| Formatlar | jpeg, png, webp, bmp, tiff, gif |
| Boyut | Max 30MB/görsel |
| Çözünürlük | 300–6000px (kısa kenar) |
| Aspect ratio | 0.4–2.5 |

### Videolar
| Kısıtlama | Değer |
|-----------|-------|
| Max adet | 3 |
| Toplam süre | Max 15s |
| Tek video süre | 2–15s |
| Formatlar | mp4, mov (H.264/H.265) |
| Boyut | Max 50MB |
| Çözünürlük | 480p veya 720p |
| FPS | 24–60 |

### Ses
| Kısıtlama | Değer |
|-----------|-------|
| Max adet | 3 |
| Toplam süre | Max 15s |
| Tek ses süre | 2–15s |
| Formatlar | wav, mp3 |
| Boyut | Max 15MB |

---

## Asset Sistemi (Opsiyonel)

Referans dosyaları doğrudan URL veya önceden yüklenmiş asset olarak kullanılabilir.

**Asset oluştur:**
```
POST https://api.kie.ai/api/v1/playground/createAsset
```

**Asset durumu sorgula:**
```
GET https://api.kie.ai/api/v1/playground/getAsset
```

**Kullanım formatı:** `asset://asset-20260404242101-76djj`

---

## Request Örnekleri

### Text-to-Video (Basit)

```json
{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "A serene beach at sunset with waves gently crashing on the shore, palm trees swaying in the breeze, and seagulls flying across the orange sky",
        "resolution": "720p",
        "aspect_ratio": "16:9",
        "duration": 8,
        "generate_audio": false,
        "web_search": false
    }
}
```

### Image-to-Video (İlk Kare)

```json
{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "Camera slowly pushes in, preserve composition and colors, gentle wind motion, warm lighting, 6 seconds",
        "first_frame_url": "https://example.com/product-photo.png",
        "resolution": "720p",
        "aspect_ratio": "16:9",
        "duration": 6,
        "generate_audio": false,
        "web_search": false
    }
}
```

### Multimodal Referans (Görsel + Video + Ses)

```json
{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "@Image1 as the main character. She walks through a neon-lit street at night. Reference @Video1 camera tracking movement. Sync pacing to @Audio1 rhythm.",
        "reference_image_urls": [
            "https://example.com/character-ref.png"
        ],
        "reference_video_urls": [
            "https://example.com/camera-movement-ref.mp4"
        ],
        "reference_audio_urls": [
            "https://example.com/background-music.mp3"
        ],
        "resolution": "720p",
        "aspect_ratio": "9:16",
        "duration": 10,
        "generate_audio": true,
        "web_search": false
    }
}
```

### cURL Örneği

```bash
curl --location --request POST 'https://api.kie.ai/api/v1/jobs/createTask' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "Two cats fighting in an arena, dramatic lighting, cinematic action style",
        "resolution": "720p",
        "aspect_ratio": "16:9",
        "duration": 8,
        "generate_audio": true,
        "web_search": false
    }
}'
```

---

## Durum Sorgulama (Polling)

```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}
Authorization: Bearer {API_KEY}
```

### State Değerleri

| State | Anlam | Aksiyon |
|-------|-------|---------|
| `waiting` | Sırada bekliyor | 10s bekle, tekrar sorgula |
| `processing` | Üretiliyor | 10s bekle, tekrar sorgula |
| `success` | Tamamlandı | `resultJson` parse et → `resultUrls` al |
| `failed` / `fail` | Başarısız | `failMsg` oku, prompt düzelt |

### Polling Kuralları
- **Aralık:** Her 10 saniyede bir sorgula
- **Tahmini süre:** 60-180 saniye (çözünürlüğe bağlı)
- **Max deneme:** 60 (toplam ~10 dakika)

### Sonuç Alma
`resultJson` bir JSON string'dir. Parse edince:
```json
{ "resultUrls": ["https://cdn.example.com/output.mp4"] }
```

---

## Hata Kodları

| Kod | Anlam | Çözüm |
|-----|-------|-------|
| `200` | Başarılı | — |
| `401` | API key geçersiz | `_knowledge/api-anahtarlari.md` kontrol et |
| `402` | Yetersiz kredi | Kredi sorgula |
| `404` | Endpoint bulunamadı | URL'i kontrol et |
| `422` | Parametre hatası | Birbirini dışlayan senaryoları kontrol et |
| `429` | Rate limit | 30s bekle, tekrar dene |
| `455` | Servis bakımda | Bekle |
| `500` | Sunucu hatası | 30s bekle, tekrar dene |
| `501` | Üretim başarısız | `failMsg` oku, prompt sadeleştir |
| `505` | Özellik devre dışı | Alternatif model dene |

---

## 💰 Kredi Sorgulama

```
GET https://api.kie.ai/api/v1/chat/credit
Authorization: Bearer {API_KEY}
```

---

## Kullanım Senaryoları ve İlişkili Rehber

| Senaryo | Uygun mu? | Detay |
|---------|-----------|-------|
| Sinematik ürün videosu | ✅ | `guides/Seedance_2_0_Skill_Guide.md` → §4.1 |
| Dinamik aksiyon (dövüş, spor) | ✅ (referanssız) | `guides/Seedance_2_0_Skill_Guide.md` → §4.2 |
| Karakter tutarlılığı (çoklu sahne) | ✅ (multimodal referans) | `guides/Seedance_2_0_Skill_Guide.md` → §4.3 |
| Atmosferik manzara | ✅ | `guides/Seedance_2_0_Skill_Guide.md` → §4.4 |
| UGC / sosyal medya hook | ✅ | `guides/Seedance_2_0_Skill_Guide.md` → §4.5 |
| ASMR / makro çekim | ✅ | `guides/Seedance_2_0_Skill_Guide.md` → §4.6 |
| Stil transferi | ✅ (video referanslı) | `guides/Seedance_2_0_Skill_Guide.md` → §4.7 |
| Image-to-video dönüşümü | ✅ | Senaryo 1 veya 2 kullan |
| Sesli video üretimi | ✅ | `generate_audio: true` |
| Zincirleme sahne üretimi | ⚠️ Kısıtlı | `return_last_frame: true` kabul ediliyor ama API response'da `lastFrameUrl` dönmüyor. Workaround: videonun son karesini manuel çıkararak sonraki sahnenin `first_frame_url`'ine ver. |

---

## 🧪 Doğrulanmış Test Sonuçları (4 Nisan 2026)

7 farklı senaryo test edildi, çıktılar frame-by-frame analiz edildi:

| Test | Senaryo | Parametre | Çözünürlük | Süre | Durum |
|------|---------|-----------|------------|------|-------|
| 1 | Text-to-Video | Sadece prompt | 864×496 (16:9) | 4.04s | ✅ PASS |
| 2 | Image-to-Video | `first_frame_url` | 864×496 (16:9) | 4.04s | ✅ PASS |
| 3 | Multimodal Referans | `reference_image_urls` | 864×496 (16:9) | 4.04s | ✅ PASS |
| 4 | Native Audio | `generate_audio: true` | 864×496 (16:9) | 4.06s | ✅ PASS (AAC 44.1kHz) |
| 5 | First + Last Frame | `first_frame_url` + `last_frame_url` | 864×496 (16:9) | 4.04s | ✅ PASS |
| 7 | Return Last Frame | `return_last_frame: true` | 864×496 (16:9) | 4.04s | ⚠️ Video OK, `lastFrameUrl` yok |
| 8 | 9:16 Reels Format | `aspect_ratio: "9:16"` | 496×864 (9:16) | 4.04s | ✅ PASS |

### Bilinen Kısıtlamalar

1. **`return_last_frame` → `lastFrameUrl` dönmüyor:** Kie AI proxy'si bu alanı API yanıtında iletmiyor. Zincirleme üretim için videonun son karesini ffmpeg/programatik yöntemle çıkar.
2. **480p düşük maliyet modu:** `resolution: "480p"` + `duration: 4` + `generate_audio: false` en uygun maliyetli konfigürasyon.
3. **Senaryo çakışması:** `first_frame_url` veya `last_frame_url` kullanılırken `reference_image_urls` göndermek 422 hatası döndürür.

---

## 📎 İlişkili Dosyalar

- **Prompt & Strateji Rehberi:** `guides/Seedance_2_0_Skill_Guide.md`
- **API Dokümantasyonu (ham):** `models/KIE_AI_Seedance_2_API_Docs.md`
- **Kie AI API referansı:** https://docs.kie.ai/market/bytedance/seedance-2
- **API Anahtarları:** `_knowledge/api-anahtarlari.md`
- **Test Dashboard:** `test-results/seedance-2.0/analysis-dashboard.html`
- **Test Videoları:** `test-results/seedance-2.0/test*.mp4`

---

*Son güncelleme: 4 Nisan 2026*
