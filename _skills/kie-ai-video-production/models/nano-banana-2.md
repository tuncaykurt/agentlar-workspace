# Nano Banana 2 — Model Referansı

## Genel Bilgi
- **Model ID:** `nano-banana-2`
- **Tür:** Görsel Üretimi (Text-to-Image, Image-to-Image)
- **Altyapı:** Google Gemini 3.1 Flash Image
- **Kalite:** 1K / 2K / 4K çözünürlük
- **Güçlü Yönler:** 
  - Tipografi (metin) desteği mükemmel
  - Karakter tutarlılığı (multi-character)
  - Kültürel bağlam farkındalığı
  - Hızlı üretim
  - Gerçek dünya bilgisi entegrasyonu

> ⚠️ **Nano Banana Pro'nun güncel versiyonudur.** Yeni iş için her zaman NB2 tercih et.

---

## Endpoint
```
POST https://api.kie.ai/api/v1/jobs/createTask
```

---

## Text-to-Image (Metinden Görsel)

```json
{
  "model": "nano-banana-2",
  "input": {
    "prompt": "Professional product photography of wireless earbuds on marble surface...",
    "aspect_ratio": "4:5",
    "resolution": "2k"
  }
}
```

## Image-to-Image (Referansla Görsel — MOCKUP İÇİN KULLAN)

```json
{
  "model": "nano-banana-2",
  "input": {
    "prompt": "Transform this product into a professional Instagram-ready mockup...",
    "image_input": [
      "https://public-url.com/urun-fotografı.jpg"
    ],
    "aspect_ratio": "1:1",
    "resolution": "2k"
  }
}
```

---

## Parametreler

| Parametre | Tip | Zorunlu | Açıklama |
|-----------|-----|---------|----------|
| `prompt` | string | ✅ | Detaylı görsel açıklaması (İngilizce önerilir) |
| `aspect_ratio` | string | ❌ | En/boy oranı (varsayılan: `1:1`) |
| `image_input` | array[string] | ❌ | Referans/kaynak görsel URL listesi |
| `resolution` | string | ❌ | Çözünürlük: `1k`, `2k`, `4k` (varsayılan: `1k`) |

## Desteklenen Aspect Ratio'lar

| Oran | Kullanım Alanı |
|------|----------------|
| `1:1` | Instagram kare post |
| `4:5` | Instagram dikey post (önerilen) |
| `9:16` | Instagram story / Reels |
| `16:9` | YouTube thumbnail, yatay banner |
| `21:9` | Sinematik geniş ekran |
| `4:3` | Genel amaçlı |
| `3:2` | Fotoğraf formatı |

---

## 🎯 Mockup Üretimi İçin Prompt Stratejisi

Kullanıcı bir ürün fotoğrafı verdiğinde:

### Adım 1: Görseli Analiz Et
Görsele bakarak ürünü tanımla (ne olduğu, rengi, şekli, boyutu).

### Adım 2: Prompt Oluştur
```
"Professional product mockup of [ÜRÜN TANIMI]. 
[ÜRÜN] placed on [YÜZEY/ORTAM AÇIKLAMASI]. 
Clean minimal composition with [ARKA PLAN STİLİ]. 
[IŞIK AÇIKLAMASI]. 
[EK DETAYLAR: marka renkleri, metin, logo].
4K resolution, commercial photography style."
```

### Adım 3: image_input ile Gönder
Ürün fotoğrafını `image_input` dizisine ekle. Model, fotoğraftaki ürünü kavrayarak mockup'ı oluşturur.

### Referans Görsel Varsa
Eğer kullanıcı bir referans/ilham görseli de verdiyse:
1. Referans görseli analiz et (stil, renk, kompozisyon, ışık)
2. Bu analizden prompt'u zenginleştir
3. Ürün fotoğrafını `image_input[0]`, referans görseli `image_input[1]` olarak gönder
   (veya referansı sadece prompt detaylandırmak için kullan)

---

## Carousel Post Stratejisi

Carousel postlar için **aynı tema ve stili** koruyarak sıralı görseller üret:

1. Her slide için ayrı bir `createTask` çağrısı yap
2. Tutarlılık için:
   - Aynı renk paleti (hex kodlarıyla belirt)
   - Aynı tipografi stili
   - İçerik adım adım ilerlemeli (1/N, 2/N, ...)
   - Her görselde aynı layout yapısı

---

## Kullanım Senaryoları
- ✅ Ürün mockup'ı (ana use case)
- ✅ Instagram tekli post
- ✅ Poster / afiş
- ✅ Carousel (kaydırmalı) postlar
- ✅ Ürün reklam görselleri
- ✅ Sosyal medya banner'ları
- ✅ YouTube thumbnail
