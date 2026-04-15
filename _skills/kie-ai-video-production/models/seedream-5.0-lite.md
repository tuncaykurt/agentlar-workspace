# Seedream 5.0 Lite — Model Referansı

## Genel Bilgi
- **Model ID:** `seedream-5.0-lite` (Kie AI üzerinden)
- **Tür:** Görsel Üretimi
- **Geliştirici:** ByteDance
- **Güçlü Yönler:**
  - Multimodal reasoning
  - Hızlı üretim
  - Karmaşık prompt anlayışı

---

## Endpoint
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

## İstek Gövdesi

```json
{
  "model": "seedream-5.0-lite",
  "input": {
    "prompt": "...",
    "aspect_ratio": "1:1"
  }
}
```

---

## Ne Zaman Kullan?
- Hızlı görsel üretimi gerektiğinde
- Karmaşık, çok katmanlı prompt'larla
- Nano Banana 2 yetersiz kaldığında alternatif olarak

> 💡 **Genel tavsiye:** Ürün mockup'ı ve Instagram içerikleri için Nano Banana 2 tercih et.
> Seedream 5.0 Lite'ı alternatif/yedek olarak kullan.
