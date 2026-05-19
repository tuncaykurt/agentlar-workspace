# Veo 3.1 — Model Referansı

## Genel Bilgi
- **Model ID:** `veo3.1`
- **Tür:** Video Üretimi (Text-to-Video)
- **Kalite:** 1080p native, 4K destekli
- **Süre:** Değişken
- **Güçlü Yönler:**
  - Google DeepMind altyapısı
  - Sinematik hareket ve natürel fizik
  - Senkronize ses çıktısı
  - Prompt'a güçlü bağlılık
  - İnsan yüzlerinde daha iyi sonuç (Kling'den üstün)

> 🎯 **Sinematik, premium video içerikleri için tercih et.**
> İnsan yüzü veya detaylı sahne gerektiren videolarda Kling yerine bunu kullan.

---

## Endpoint

Veo 3.1, standart `createTask` yerine kendine ait özel endpointler kullanır.

```http
POST https://api.kie.ai/api/v1/veo/generate
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

---

## İstek Gövdesi

> ⚠️ **KRİTİK:** Payload `input` objesi içine sarılmaz, tamamen **düz (flat)** JSON alanlarından oluşur.

```json
{
  "model": "veo3_fast",
  "prompt": "A confident woman walks through a modern office space, natural lighting, cinematic",
  "aspect_ratio": "16:9",
  "mode": "TEXT_2_VIDEO"
}
```

---

## Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `model` | string | ✅ | `"veo3_fast"` (veya kullanılabilirse `"veo3_quality"`) |
| `prompt` | string | ✅ | Video açıklaması (İngilizce önerilir) |
| `aspect_ratio` | string | ❌ | `"16:9"`, `"9:16"`, `"1:1"` |
| `mode` | string | ❌ | `"TEXT_2_VIDEO"` veya `"IMAGE_2_VIDEO"` |
| `imageUrls` | array | ❌ | IMAGE_2_VIDEO modunda 1 adet referans görsel linki |

---

## Durum Sorgulama (Polling)

Görev ID'si (taskId) `/generate` isteğinden döner. Veo'nun sorgu adresi farklıdır:

```http
GET https://api.kie.ai/api/v1/veo/record-info?taskId={taskId}
Authorization: Bearer {API_KEY}
```

Yanıt başarılıysa `"successFlag": 1` veya `state: "success"` içeren bir data objesi gelir ve video URL `video_url` veya `resultUrls` altında bulunur.

---

## Ne Zaman Veo, Ne Zaman Kling?

| Kriter | Veo 3.1 | Kling 3.0 |
|--------|---------|-----------|
| İnsan yüzü | ✅ Daha iyi | ⚠️ Hata verebilir |
| Ürün reklam videosu | ✅ İyi | ✅ Çok iyi |
| Image-to-video | ❌ Desteklemiyor | ✅ Destekliyor |
| Ses efektleri | ✅ Senkron ses | ✅ sound: "on" |
| Multi-shot | ❌ Yok | ✅ multi_shots: true |
| Sinematik kalite | ✅ Premium | ✅ İyi |
| Fiyat | 💰 Daha pahalı | 💰 Uygun |

---

## Kullanım Senaryoları
- ✅ Sinematik marka videosu
- ✅ İnsan içeren sahneler
- ✅ Premium tanıtım filmi
- ✅ Konsept video
