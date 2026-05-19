# Pipeline: Ürün Mockup Üretimi

## Senaryo
Kullanıcı bir ürün fotoğrafı verir ve profesyonel mockup görselleri ister.
İsteğe bağlı olarak referans/ilham görseli de verilebilir.

---

## Akış Varyantları

### Varyant A: Sadece Ürün Fotoğrafı

```
Kullanıcı Ürün Fotoğrafı
        │
        ▼
  ┌─────────────────┐
  │ 1. ImgBB Upload  │  Yerel görsel → Public URL
  └────────┬────────┘
           │
           ▼
  ┌───────────────────────┐
  │ 2. Görsel Analizi      │  Ürünü tanımla (ne, renk, boyut)
  │    (Agent tarafından)  │  Uygun prompt oluştur
  └────────┬──────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 3. Nano Banana 2     │  image_input + prompt → Mockup
  │    (image-to-image)  │  
  └────────┬────────────┘
           │
           ▼
      Mockup Görseli
```

### Varyant B: Ürün Fotoğrafı + Referans Görsel

```
Ürün Fotoğrafı + Referans Görsel
        │
        ▼
  ┌─────────────────┐
  │ 1. ImgBB Upload  │  Her iki görseli de public URL'ye çevir
  └────────┬────────┘
           │
           ▼
  ┌───────────────────────┐
  │ 2. Referans Analizi    │  Referans görselin stilini analiz et:
  │    (Agent tarafından)  │  - Renk paleti
  │                        │  - Işık yönü
  │                        │  - Arka plan stili
  │                        │  - Kompozisyon
  │                        │  - Genel mood/ton
  └────────┬──────────────┘
           │
           ▼
  ┌─────────────────────────┐
  │ 3. Prompt Oluşturma      │  Referans analizinden zenginleştirilmiş prompt:
  │    (Agent tarafından)    │  "Create mockup similar to reference style..."
  └────────┬────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 4. Nano Banana 2     │  image_input: [ürün] + prompt (referans stili)
  │    (image-to-image)  │  
  └────────┬────────────┘
           │
           ▼
      Mockup Görseli
```

---

## Adım 1: Görsel Yükleme (ImgBB)

```bash
# Ürün fotoğrafı
curl -X POST "https://api.imgbb.com/1/upload" \
  -F "key=77ae1f6783f43d1129e6214cfa605da1" \
  -F "image=@/path/to/urun.jpg"
# → PRODUCT_URL

# Referans varsa
curl -X POST "https://api.imgbb.com/1/upload" \
  -F "key=77ae1f6783f43d1129e6214cfa605da1" \
  -F "image=@/path/to/referans.jpg"
# → REFERENCE_URL
```

---

## Adım 2: Görsel Analizi

Agent olarak görseli analiz et:

### Ürün Analizi Şablonu:
```
Ürün: [ne olduğu]
Renk: [ana renkler]
Şekil: [genel form]
Malzeme: [varsa — metal, plastik, kumaş vb.]
Boyut tahmini: [küçük/orta/büyük]
```

### Referans Analizi Şablonu (varsa):
```
Arka plan: [stil — minimal, doğa, stüdyo, lifestyle]
Renk paleti: [baskın renkler]
Işık: [yumuşak/sert, yön]
Kompozisyon: [merkez, rule of thirds, vb.]
Mood: [premium/casual/enerjik/elegant]
```

---

## Adım 3: Prompt Oluşturma

### Referanssız (Genel Mockup):
```
"Professional product mockup of [ÜRÜN TANIMI]. 
Product placed on [clean marble surface / modern desk / minimal white platform]. 
Soft studio lighting from above-left creating gentle shadows. 
[ÜRÜN RENGİ] product against [KONTRAST ARKA PLAN]. 
Commercial photography style, premium feel, high detail. 
4K resolution."
```

### Referanslı (Stile Uygun Mockup):
```
"Product mockup of [ÜRÜN TANIMI] in [REFERANS STİLİ] style.
Background: [REFERANSTAN ÇIKARILAN ARKA PLAN]. 
Lighting: [REFERANSTAN ÇIKARILAN IŞIK STİLİ]. 
Color palette: [REFERANSTAN ÇIKARILAN RENKLER]. 
Composition: [REFERANSTAN ÇIKARILAN KOMPOZİSYON]. 
Professional quality, matching the reference aesthetic. 4K resolution."
```

---

## Adım 4: Mockup Üretimi (Nano Banana 2)

### Referanssız:
```bash
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer {KIE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nano-banana-2",
    "input": {
      "prompt": "[OLUŞTURULAN PROMPT]",
      "image_input": ["'$PRODUCT_URL'"],
      "aspect_ratio": "1:1",
      "resolution": "2k"
    }
  }'
```

### Referanslı:
```bash
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Authorization: Bearer {KIE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nano-banana-2",
    "input": {
      "prompt": "[REFERANS STİLİ İLE ZENGİNLEŞTİRİLMİŞ PROMPT]",
      "image_input": ["'$PRODUCT_URL'"],
      "aspect_ratio": "1:1",
      "resolution": "2k"
    }
  }'
```

---

## Aspect Ratio Seçimi

Kullanıcıya sor veya kullanım amacına göre seç:

| Amaç | Aspect Ratio |
|------|-------------|
| Instagram kare post | `1:1` |
| Instagram dikey post | `4:5` |
| Instagram story/Reels | `9:16` |
| YouTube thumbnail | `16:9` |
| Web banner | `16:9` veya `21:9` |
| E-ticaret listeleme | `1:1` veya `4:5` |
| Genel amaçlı | `1:1` |

---

## Çoklu Mockup Üretimi

Aynı ürün için farklı açılar/ortamlar isteyebilir. Her biri için:
1. Farklı prompt kullan (farklı arka plan, açı, ışık)
2. Aynı `image_input` ile gönder
3. Ayrı ayrı `createTask` çağrısı yap

---

## Kalite Artırma İpuçları

1. **Resolution:** Her zaman `"2k"` veya `"4k"` kullan
2. **Prompt detayı:** Yüzey, ışık, gölge, arka plan açıkça belirt
3. **Negatif talimat:** Prompt'ta istenmeyen şeyleri belirt ("no text, no watermark")
4. **Birden fazla üretim:** Aynı prompt'la 2-3 kez dene, en iyisini seç
