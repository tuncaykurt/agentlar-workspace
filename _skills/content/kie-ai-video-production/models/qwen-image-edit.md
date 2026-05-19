# Qwen Image Edit — Model Referansı

## Genel Bilgi
- **Model ID:** `qwen/image-edit`
- **Tür:** Görsel Düzenleme (Image Editing)
- **Güçlü Yönler:**
  - Semantik düzenleme (anlam bazlı)
  - Görünüm düzenleme (stil bazlı)
  - Çok dilli metin desteği
  - Nesne ekleme/çıkarma
  - Arka plan değiştirme

---

## Endpoint
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

---

## İstek Gövdesi

```json
{
  "model": "qwen/image-edit",
  "input": {
    "prompt": "Change the background to a tropical beach with palm trees",
    "image_url": "https://public-url.com/orijinal.jpg",
    "strength": 0.7,
    "output_format": "png"
  }
}
```

---

## Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `prompt` | string | ✅ | Düzenleme talimatı (**sadece İngilizce**) |
| `image_url` | string | ✅ | Düzenlenecek görselin URL'si |
| `strength` | float | ❌ | 0.0 (az değişiklik) - 1.0 (tam yeniden oluşturma) |
| `output_format` | string | ❌ | `png`, `jpeg`, `webp` |
| `negative_prompt` | string | ❌ | İstenmeyen öğeler |
| `seed` | integer | ❌ | Rastgele tohum (tutarlılık için) |

## Strength Rehberi

| Değer | Kullanım |
|-------|----------|
| 0.1-0.3 | Küçük renk/ton değişiklikleri |
| 0.4-0.6 | Orta düzey (arka plan değişiği) |
| 0.7-0.8 | Büyük değişiklikler (nesne ekleme/çıkarma) |
| 0.9-1.0 | Neredeyse tamamen yeniden üretim |

---

## ⚠️ Önemli
- Prompt'lar **sadece İngilizce** desteklenir
- Türkçe tarif gelirse → önce İngilizce'ye çevir
- Strength değerini dikkatli ayarla

---

## Kullanım Senaryoları
- ✅ Arka plan değiştirme
- ✅ Nesne ekleme/çıkarma
- ✅ Renk/ton ayarlama
- ✅ Metin ekleme/düzenleme
- ✅ Görseli revize etme
