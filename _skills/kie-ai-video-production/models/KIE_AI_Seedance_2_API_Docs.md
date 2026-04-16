# KIE AI — Seedance 2.0 API Dokümantasyonu

## 1. Model ID

```
bytedance/seedance-2
```

Kie AI üzerinde bu model string'i `model` alanında kullanılır. "Fast" versiyonu için ayrı bir model mevcuttur: `bytedance/seedance-2-fast` (farklı endpoint, aynı yapı).

---

## 2. Endpoint

Kie AI standart `createTask` endpoint'ini kullanır.

```
POST https://api.kie.ai/api/v1/jobs/createTask
```

**Authentication:** Bearer Token

```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

API Key almak için: https://kie.ai/api-key

---

## 3. Input Parametreleri

### 3.1. Üst Düzey Parametreler

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|------------|----------|
| `model` | enum\<string\> | ✅ Evet | — | `bytedance/seedance-2` olmalı |
| `callBackUrl` | string \<uri\> | ❌ Hayır | — | Tamamlanma bildirimi alacak webhook URL'i. Prodüksiyon için önerilir. |
| `input` | object | ✅ Evet | — | Video üretim parametrelerini içerir (aşağıda detaylı) |

### 3.2. `input` Objesi İçindeki Parametreler

| Parametre | Tip | Zorunlu | Varsayılan | Açıklama |
|-----------|-----|---------|------------|----------|
| `prompt` | string | ❌ (opsiyonel ama pratikte gerekli) | — | Video üretim prompt'u. Min 3, max 2500 karakter. |
| `first_frame_url` | string | ❌ | — | İlk kare görseli. URL veya `asset://{assetId}` formatında. |
| `last_frame_url` | string | ❌ | — | Son kare görseli. URL veya `asset://{assetId}` formatında. |
| `reference_image_urls` | array\[string\] | ❌ | — | Referans görsel URL'leri listesi. Max 9 adet (first/last frame dahil toplam). Format: jpeg, png, webp, bmp, tiff, gif. Aspect ratio: 0.4–2.5. Boyut: 300–6000px. Max 30MB/görsel. |
| `reference_video_urls` | array\[string\] | ❌ | — | Referans video URL'leri. Max 3 adet, toplam süre max 15s. Format: mp4, mov. Çözünürlük: 480p/720p. Tek video: 2–15s. Boyut: max 50MB. FPS: 24–60. |
| `reference_audio_urls` | array\[string\] | ❌ | — | Referans ses dosyaları. Max 3 adet, toplam süre max 15s. Format: wav, mp3. Tek ses: 2–15s. Boyut: max 15MB. |
| `return_last_frame` | boolean | ❌ | `false` | Videonun son karesini görsel olarak döndürür. Zincirleme üretim için faydalı. |
| `generate_audio` | boolean | ❌ | `true` | Ses üretimi. `true` = sesli (daha pahalı), `false` = sessiz. |
| `resolution` | enum\<string\> | ❌ | `720p` | Video çözünürlüğü. Değerler: `480p`, `720p`. |
| `aspect_ratio` | enum\<string\> | ❌ | `16:9` | En-boy oranı. Değerler: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `adaptive`. |
| `duration` | integer | ❌ | `8` | Video süresi, saniye cinsinden. Aralık: 4–15. |
| `web_search` | boolean | ✅ Evet | — | Online arama kullanımı. |

### 3.3. Birbirini Dışlayan Senaryolar (Önemli)

Aşağıdaki üç senaryo birlikte KULLANILAMAZ:

1. **Image-to-Video (İlk Kare):** `first_frame_url` kullanımı
2. **Image-to-Video (İlk ve Son Kare):** `first_frame_url` + `last_frame_url` kullanımı
3. **Multimodal Referans:** `reference_image_urls`, `reference_video_urls`, `reference_audio_urls` kullanımı

Multimodal referans modunda ilk/son kare etkisini prompt içinde dolaylı olarak elde edebilirsin. Ancak kesin ilk/son kare garantisi gerekiyorsa Senaryo 2'yi tercih et.

### 3.4. Asset Sistemi

Referans dosyaları doğrudan URL olarak verilebilir veya önceden Kie AI'a yüklenerek `asset://` formatında kullanılabilir.

**Asset Oluşturma:**
```
POST https://api.kie.ai/api/v1/playground/createAsset
```

**Asset Durumu Sorgulama:**
```
GET https://api.kie.ai/api/v1/playground/getAsset
```

Asset ID formatı: `asset://asset-20260404242101-76djj`

---

## 4. Çıktı Yapısı

### 4.1. Task Oluşturma Response'u (createTask)

```json
{
    "code": 200,
    "msg": "success",
    "data": {
        "taskId": "task_bytedance_1765186743319"
    }
}
```

| Alan | Tip | Açıklama |
|------|-----|----------|
| `code` | integer | Durum kodu (aşağıda tüm kodlar) |
| `msg` | string | Durum mesajı, hata durumunda açıklama |
| `data.taskId` | string | Üretilen task'ın benzersiz ID'si |

### 4.2. Response Kodları

| Kod | Anlam |
|-----|-------|
| `200` | Başarılı |
| `401` | Yetkilendirme hatası — API key eksik veya geçersiz |
| `402` | Yetersiz kredi |
| `404` | Endpoint bulunamadı |
| `422` | Validasyon hatası — parametreler hatalı |
| `429` | Rate limit aşıldı |
| `455` | Servis bakımda |
| `500` | Sunucu hatası |
| `501` | Üretim başarısız |
| `505` | Özellik devre dışı |

---

## 5. Polling — Durum Sorgulama

Task oluşturduktan sonra sonucu almak için iki yöntem var:

### 5.1. Polling (GET ile sorgulama)

```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}
```

Dönen yanıtta `state` alanı task'ın durumunu belirtir.

**Beklenen `state` değerleri:**

| State | Anlam |
|-------|-------|
| `pending` | Sırada bekliyor |
| `processing` | Üretiliyor |
| `completed` | Tamamlandı — `resultJson` içinde video URL'i mevcut |
| `failed` | Başarısız |

**Önerilen polling aralığı:** Her 5-10 saniyede bir sorgula. Üretim süresi çözünürlüğe göre 60-180 saniye arasında değişir.

### 5.2. Callback (Webhook ile bildirim — Önerilen)

`callBackUrl` parametresi verilmişse, task tamamlandığında Kie AI bu URL'e POST isteği gönderir. Prodüksiyon ortamı için polling yerine callback kullanılması önerilir.

Callback güvenliği için: https://docs.kie.ai/common-api/webhook-verification

---

## 6. Kısıtlamalar

| Kısıtlama | Değer |
|-----------|-------|
| Max prompt uzunluğu | 2500 karakter |
| Min prompt uzunluğu | 3 karakter |
| Desteklenen çözünürlükler | 480p, 720p |
| Desteklenen aspect ratio'lar | 1:1, 4:3, 3:4, 16:9, 9:16, 21:9, adaptive |
| Video süresi aralığı | 4–15 saniye |
| Max referans görsel sayısı | 9 (first/last frame dahil toplam) |
| Max referans video sayısı | 3 |
| Max referans video toplam süre | 15 saniye |
| Tek referans video süre aralığı | 2–15 saniye |
| Max referans ses sayısı | 3 |
| Max referans ses toplam süre | 15 saniye |
| Tek referans ses süre aralığı | 2–15 saniye |
| Referans görsel formatları | jpeg, png, webp, bmp, tiff, gif |
| Referans görsel boyut | max 30MB, 300–6000px, aspect ratio 0.4–2.5 |
| Referans video formatları | mp4, mov (H.264/H.265) |
| Referans video boyut | max 50MB, 480p/720p, FPS 24–60 |
| Referans ses formatları | wav, mp3 |
| Referans ses boyut | max 15MB |
| Üretim süresi | ~60-180 saniye (çözünürlüğe bağlı) |

---

## 7. Fiyatlandırma

Kie AI kredi bazlı çalışır. Seedance 2.0 için kredi maliyeti parametrelere göre değişir:

- `generate_audio: true` → daha yüksek maliyet
- Daha yüksek çözünürlük (720p vs 480p) → daha yüksek maliyet
- Daha uzun süre → daha yüksek maliyet

Kredi bakiyesi sorgulamak için:
```
GET https://api.kie.ai/common-api/get-account-credits
```

---

## 8. Örnek Request

### Text-to-Video (Basit)

```json
{
    "model": "bytedance/seedance-2",
    "callBackUrl": "https://your-domain.com/api/callback",
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

## 9. Durum Sorgulama Örneği

```bash
curl --location --request GET 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_bytedance_1765186743319' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

---

*Referans: https://docs.kie.ai/market/bytedance/seedance-2*
*Son güncelleme: Nisan 2026*
