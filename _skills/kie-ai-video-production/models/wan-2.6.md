# Wan 2.6 — Model Referansı

## Genel Bilgi
- **Model ID:** `wan-2.6` (Kie AI üzerinden)
- **Tür:** Video Üretimi (Text-to-Video, Image-to-Video)
- **Geliştirici:** Alibaba / Wan Team
- **Güçlü Yönler:**
  - Uygun fiyat/performans oranı
  - 1080p çıktı desteği
  - Çoklu çekim modları
  - Geniş aspect ratio desteği

---

## Endpoint
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

## İstek Gövdesi

```json
{
  "model": "wan-2.6",
  "input": {
    "prompt": "...",
    "resolution": "1080p",
    "aspect_ratio": "16:9",
    "duration": 5
  }
}
```

---

## Ne Zaman Kullan?
- Bütçe kısıtlı video üretiminde (Seedance/Veo'ya göre daha ucuz)
- 1080p çözünürlük gerektiğinde (Seedance max 720p)
- Basit sinematik çekimler ve manzara videoları için

> 💡 **Genel tavsiye:** Sinematik kalite ve gelişmiş kontrol (kamera, multimodal referans) gerekiyorsa Seedance 2.0 tercih et.
> Wan 2.6'yı bütçe dostu alternatif ve 1080p gerektiğinde kullan.

---

*Son güncelleme: 4 Nisan 2026*
