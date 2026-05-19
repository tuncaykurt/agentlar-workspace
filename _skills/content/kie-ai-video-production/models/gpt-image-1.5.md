# GPT Image 1.5 — Model Referansı

## Genel Bilgi
- **Model ID:** `gpt-image-1.5` (Kie AI üzerinden)
- **Tür:** Görsel Üretimi
- **Geliştirici:** OpenAI
- **Güçlü Yönler:**
  - Fotogerçekçi görseller
  - Detaylı illüstrasyon
  - Mükemmel prompt anlayışı
  - Karmaşık sahne kompozisyonları

---

## Endpoint
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

## İstek Gövdesi

```json
{
  "model": "gpt-image-1.5",
  "input": {
    "prompt": "Photorealistic product photography of luxury watch on dark marble surface...",
    "aspect_ratio": "1:1"
  }
}
```

---

## Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `prompt` | string | ✅ | Detaylı görsel açıklaması |
| `aspect_ratio` | string | ❌ | En/boy oranı |

---

## Ne Zaman GPT Image, Ne Zaman Nano Banana 2?

| Kriter | GPT Image 1.5 | Nano Banana 2 |
|--------|----------------|---------------|
| Ürün mockup'ı | ✅ İyi | ✅ Çok iyi (birincil) |
| Tipografi | ⚠️ Orta | ✅ Mükemmel |
| Fotogerçekçilik | ✅ Çok iyi | ✅ İyi |
| Karakter tutarlılığı | ⚠️ Orta | ✅ Çok iyi |
| Image-to-image | ✅ Destekler | ✅ Destekler |
| Hız | ⚠️ Yavaş | ✅ Hızlı |

> 💡 **Genel tavsiye:** Çoğu iş için Nano Banana 2 yeterli. 
> GPT Image 1.5'i fotogerçekçi detay gerektiğinde tercih et.

---

## Kullanım Senaryoları
- ✅ Fotogerçekçi ürün görseli
- ✅ Detaylı illüstrasyon
- ✅ Karmaşık sahne kompozisyonu
