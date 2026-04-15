# Sora 2 Pro Storyboard — Model Referansı

## Genel Bilgi
- **Model ID:** `sora-2-pro-storyboard`
- **Tür:** Çok Sahneli Video (Storyboard Video)
- **Süre:** 10, 15 veya 25 saniye
- **Güçlü Yönler:**
  - Birden fazla sahne (storyboard)
  - Referans görseller ile tutarlılık
  - Narratif süreklilik

> ⚠️ **KRİTİK UYARI (BACKUP MODEL):**
> Bu model API üzerinde sıklıkla **`500 Internal Server Error`** vermektedir. Bu nedenle çok sahneli/dinamik videolar oluştururken bu model ilk tercih **olmamalıdır**. Sadece yedek (fallback) planı olarak tutun. Dinamik çoklu videolar için Kling veya Veo 3.1 ile ayrı ayrı klipler üretip FFmpeg ile birleştirmek **her zaman daha garantili ve profesyonel** yoldur.

---

## Endpoint
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

---

## İstek Gövdesi

```json
{
  "model": "sora-2-pro-storyboard",
  "input": {
    "n_frames": "15",
    "image_urls": ["https://public-url.com/urun-gorseli.jpg"],
    "aspect_ratio": "landscape",
    "upload_method": "s3"
  }
}
```

---

## Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `n_frames` | string | ✅ | Video süresi: `"10"`, `"15"`, `"25"` saniye |
| `image_urls` | array[string] | ❌ | Referans görsel URL'leri |
| `aspect_ratio` | string | ❌ | `"portrait"` veya `"landscape"` (varsayılan: `"landscape"`) |
| `upload_method` | string | ❌ | `"s3"` (varsayılan) veya `"oss"` |

---

## ⚠️ KRİTİK: Prompt-Süre Uyumu

> Her sahne için prompt'taki eylem miktarı ile verilen süre uyumlu olmalıdır.

| Süre | Prompt İçerebilir | İçeremez |
|------|-------------------|----------|
| 3s | Statik çekim veya tek basit eylem | Konuşma, çoklu hareket |
| 4-5s | Tek eylem + kamera hareketi | Diyalog, sahne değişimi |
| 6-8s | Ana eylem + ortam + kamera | Çoklu karakter etkileşimi |
| 8-10s | Sahne + karakter + kamera + atmosfer | Tam hikaye anlatımı |

**Konuşma kuralı:** ~2-3 kelime/saniye. 3s sahneye max 9 kelime sığar.

---

## Kullanım Senaryoları
- ✅ E-ticaret ürün tanıtım videoları
- ✅ Marka reklam filmleri
- ✅ Konsept/prototip videoları
- ✅ Karakter odaklı hikaye sekansları
