# API_REFERENCE.md — API Endpoint'leri ve Entegrasyon Detayları

Bu dosya, otomasyonda kullanılacak tüm API'lerin endpoint'lerini, request/response formatlarını ve entegrasyon notlarını içerir.

---

## 1. TKGM Parsel Sorgu (Reverse-Engineered API)

### Base URL
```
https://cbsservis.tkgm.gov.tr/megsiswebapi.v3/api/idpidrisi
```

### ÖNEMLİ UYARI
Bu endpoint'ler resmi/dokümante edilmiş API değildir. TKGM'nin parselsorgu.tkgm.gov.tr sitesinin arka planında kullandığı servislerdir. Değişebilir veya kapatılabilir.

---

### 1.1 İl Listesi

**Endpoint:**
```
GET /ilListesi
```

**Full URL:**
```
https://cbsservis.tkgm.gov.tr/megsiswebapi.v3/api/idpidrisi/ilListesi
```

**Response Format:** JSON Array
```json
[
  {"id": 1, "ad": "ADANA"},
  {"id": 2, "ad": "ADIYAMAN"},
  ...
  {"id": 81, "ad": "DÜZCE"}
]
```

**Kullanım:** İl adından il ID'sini bul.

---

### 1.2 İlçe Listesi

**Endpoint:**
```
GET /ilceListesi/{il_id}
```

**Örnek:**
```
https://cbsservis.tkgm.gov.tr/megsiswebapi.v3/api/idpidrisi/ilceListesi/7
```
(7 = Antalya)

**Response Format:** JSON Array
```json
[
  {"id": 101, "ad": "AKSEKI"},
  {"id": 102, "ad": "ALANYA"},
  ...
]
```

---

### 1.3 Mahalle Listesi

**Endpoint:**
```
GET /mahalleListesi/{ilce_id}
```

**Response Format:** JSON Array
```json
[
  {"id": 10234, "ad": "KESTEL MAH."},
  ...
]
```

---

### 1.4 Parsel Sorgu

**Endpoint:**
```
GET /parselSorgu/{mahalle_id}/{ada_no}/{parsel_no}
```

**Örnek:**
```
https://cbsservis.tkgm.gov.tr/megsiswebapi.v3/api/idpidrisi/parselSorgu/146765/2216/13
```

**Response Format:** JSON Object
```json
{
  "tapiType": "...",
  "ilAd": "ANTALYA",
  "ilceAd": "ALANYA",
  "mahalleAd": "KESTEL",
  "adaNo": "2216",
  "parselNo": "13",
  "alan": 1250.00,
  "nitelik": "ARSA",
  "mevkii": "...",
  "paftaNo": "...",
  "geometri": {
    "type": "Polygon",
    "coordinates": [
      [
        [32.1234, 36.5432],
        [32.1245, 36.5432],
        [32.1245, 36.5440],
        [32.1234, 36.5440],
        [32.1234, 36.5432]
      ]
    ]
  }
}
```

**Kritik Alanlar:**
- `alan` → Yüzölçümü (m²) — Frame 3 metin için
- `nitelik` → Arsa tipi — Proje seçimi için
- `geometri` → GeoJSON polygon — Sınır çizimi ve bounding box için

---

### 1.5 Parsel Sorgu (Koordinat ile)

**Web URL (doğrudan erişim):**
```
https://parselsorgu.tkgm.gov.tr/#ara/cografi/{latitude}/{longitude}
```

**Örnek:**
```
https://parselsorgu.tkgm.gov.tr/#ara/cografi/39.87431706591352/32.859305441379554
```

Bu URL sayfayı açar ve tıklayınca parsel bilgileri gelir. API olarak değil, scraping için kullanılabilir.

---

### 1.6 GeoJSON İndirme

Parsel sorgu sitesinden parselin GeoJSON dosyası indirilebilir:
- Site üzerinde parsel sorgula
- Üç nokta menüsünden "İndir" → "GeoJSON" seç
- İndirilen dosya parselin tam polygon geometrisini içerir

**GeoJSON Format:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [longitude1, latitude1],
            [longitude2, latitude2],
            [longitude3, latitude3],
            [longitude4, latitude4],
            [longitude1, latitude1]
          ]
        ]
      },
      "properties": {
        "ILCE": "ALANYA",
        "KOYMAHALLE": "KESTEL",
        "ADA": "2216",
        "PARSEL": "13",
        "TAPUALANI": 1250.0,
        "NITELIK": "ARSA"
      }
    }
  ]
}
```

---

### TKGM Hata Yönetimi

| Durum | Yanıt | Aksiyon |
|-------|-------|---------|
| Parsel bulunamadı | Boş response veya 404 | Emlakçıya bildir |
| Rate limit | 429 Too Many Requests | 5 saniye bekle, tekrar dene |
| Server down | 500/503 | Apify fallback'e geç |
| Geometri boş | `geometri: null` | Sadece öznitelik bilgilerini kullan, koordinat için emlakçıdan Google Maps linki iste |

---

## 2. Google Maps Static API

### Base URL
```
https://maps.googleapis.com/maps/api/staticmap
```

### Authentication
Google Cloud Console'dan API key gerekli. Maps Static API etkinleştirilmiş olmalı.

### Temel İstek

**Endpoint:**
```
GET https://maps.googleapis.com/maps/api/staticmap?{parameters}
```

### Parametreler

| Parametre | Değer | Açıklama |
|-----------|-------|----------|
| `center` | `{lat},{lon}` | Harita merkezi (parsel merkezi) |
| `zoom` | `15-20` | Zoom seviyesi (dinamik hesaplanacak) |
| `size` | `1080x1920` | Görsel boyutu (dikey) |
| `scale` | `2` | Retina kalite (efektif 2160x3840) |
| `maptype` | `satellite` | Uydu görüntüsü |
| `format` | `png` | Kayıpsız format |
| `key` | `{API_KEY}` | Google Maps API key |

### Örnek İstek
```
https://maps.googleapis.com/maps/api/staticmap?center=36.5432,32.1234&zoom=18&size=1080x1920&scale=2&maptype=satellite&format=png&key=YOUR_API_KEY
```

### Zoom Level Hesaplama Algoritması

Parsel bounding box'ından uygun zoom level hesaplama:

```
Pixel genişliği = 1080 (veya scale=2 ile 2160)

Her zoom level'da 1 pixel = 
  zoom 20: ~0.15m
  zoom 19: ~0.30m
  zoom 18: ~0.60m
  zoom 17: ~1.19m
  zoom 16: ~2.39m
  zoom 15: ~4.77m

Gerekli genişlik = bounding_box_width * 3 (3x zoom out)

Uygun zoom = en yüksek zoom level ki:
  pixel_başına_metre * 1080 >= gerekli_genişlik_metre
```

**Pratik kılavuz:**
- Arsa < 500m²: zoom = 19
- Arsa 500-2000m²: zoom = 18
- Arsa 2000-10000m²: zoom = 17
- Arsa > 10000m²: zoom = 16

### Opsiyonel: Parsel Sınırı Overlay

Uydu görseli üzerine parselin sınırlarını çizmek için `path` parametresi kullanılabilir:

```
&path=color:0x00FFFF80|weight:3|fillcolor:0x00FFFF20|{lat1},{lon1}|{lat2},{lon2}|{lat3},{lon3}|{lat4},{lon4}
```

Bu, uydu görselinin üzerine yarı-şeffaf mavi polygon çizer. Ama biz bunu AI ile yapacağımız için opsiyonel.

### Maliyet
- Ayda ilk 28.500 yükleme ücretsiz ($200 kredi)
- Sonrası: $2.00 / 1000 istek

### Response
- Content-Type: image/png
- Doğrudan binary image döner
- Başarısızlık: HTTP 4xx/5xx hata kodu

---

## 3. Nano Banana Pro (Image-to-Image)

### Platform
Nano Banana Pro — AI image generation servisi

### Entegrasyon
Anti-gravity üzerinden doğrudan entegre edilebilir. API detayları platforma göre değişir.

### Genel API Pattern (tipik image-to-image servisleri)
```
POST /api/v1/generate
Content-Type: multipart/form-data

{
  "image": <binary image data>,
  "prompt": "...",
  "negative_prompt": "...",
  "strength": 0.55,
  "guidance_scale": 8,
  "num_inference_steps": 40,
  "width": 1080,
  "height": 1920
}
```

### Response
```json
{
  "status": "success",
  "images": [
    {
      "url": "https://...",
      "seed": 12345
    }
  ]
}
```

### Notlar
- Exact API endpoint'leri Nano Banana Pro'nun kendi dokümantasyonuna bağlı
- Anti-gravity platformunda entegrasyon farklı olabilir
- Önemli olan prompt ve parametreler — bunlar PROMPTS.md'de detaylı

---

## 4. Kling API (Video Generation)

### Platform
Kling AI — Video generation from start/end frames

### Genel API Pattern
```
POST /api/v1/video/generate
Content-Type: multipart/form-data

{
  "start_frame": <binary image>,
  "end_frame": <binary image>,
  "prompt": "...",
  "duration": 5,
  "fps": 24,
  "resolution": "1080x1920",
  "mode": "standard"
}
```

### Response
```json
{
  "task_id": "abc123",
  "status": "processing",
  "estimated_time": 120
}
```

### Status Check (Asenkron)
```
GET /api/v1/video/status/{task_id}
```

```json
{
  "task_id": "abc123",
  "status": "completed",
  "video_url": "https://...",
  "duration": 5.0,
  "resolution": "1080x1920"
}
```

### Önemli Parametreler
- `duration`: 3-10 saniye (bizim case'de 4-5 saniye ideal)
- `mode`: "standard" veya "professional" (kaliteye göre)
- Start + End frame modu: İki görsel arasında interpolation yapıyor

### Maliyet
- Video başına kredit kullanımı (plan'a bağlı)
- Tahmini: $0.25-0.50 / video

### Bekleme Süresi
- Standard: 2-5 dakika / video
- Professional: 5-10 dakika / video

---

## 5. Video Birleştirme

### Seçenek A: FFmpeg (Eğer Anti-gravity'de shell erişimi varsa)

```bash
# 4 videoyu birleştir
ffmpeg -i video1.mp4 -i video2.mp4 -i video3.mp4 -i video4.mp4 \
  -filter_complex "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[outv]" \
  -map "[outv]" -c:v libx264 -crf 23 final_output.mp4
```

### Crossfade ile birleştirme:
```bash
ffmpeg -i video1.mp4 -i video2.mp4 -i video3.mp4 -i video4.mp4 \
  -filter_complex "
    [0:v][1:v]xfade=transition=fade:duration=0.5:offset=4[v01];
    [v01][2:v]xfade=transition=fade:duration=0.5:offset=7.5[v012];
    [v012][3:v]xfade=transition=fade:duration=0.5:offset=11[outv]
  " \
  -map "[outv]" -c:v libx264 -crf 23 final_output.mp4
```

### Seçenek B: Cloud Video API
Eğer Anti-gravity'de FFmpeg kullanılamıyorsa:
- Creatomate API
- Shotstack API
- Kapwing API

Bu servislerin hepsi video birleştirme için API sunuyor.

---

## 6. Yardımcı Hesaplamalar

### Bounding Box Hesaplama (Polygon'dan)

```
Input: coordinates = [[lon1, lat1], [lon2, lat2], ...]

north = max(tüm latitude'ler)
south = min(tüm latitude'ler)
east = max(tüm longitude'ler)
west = min(tüm longitude'ler)

center_lat = (north + south) / 2
center_lon = (east + west) / 2

width_degrees = east - west
height_degrees = north - south

// 2-3x zoom out için padding ekle
padding_factor = 2.5
padded_north = north + (height_degrees * padding_factor / 2)
padded_south = south - (height_degrees * padding_factor / 2)
padded_east = east + (width_degrees * padding_factor / 2)
padded_west = west - (width_degrees * padding_factor / 2)
```

### Derece → Metre Dönüşümü (Türkiye enlemi için yaklaşık)
```
1 derece latitude ≈ 111,000 metre
1 derece longitude ≈ 85,000 metre (Türkiye enlemi ~37-42° için)

parsel_width_meters = width_degrees * 85000
parsel_height_meters = height_degrees * 111000
```

### Polygon Şekil Tarifçisi

AI prompt'larında arsanın şeklini tarif etmek için:
```
köşe_sayısı = coordinates.length - 1 (son nokta = ilk nokta olduğu için)

if köşe_sayısı == 3: "triangular"
if köşe_sayısı == 4:
  en_boy_oranı = width / height
  if 0.8 < en_boy_oranı < 1.2: "roughly square"
  else: "rectangular"
if köşe_sayısı == 5: "pentagonal"
if köşe_sayısı > 5: "irregular polygon with {n} corners"
```

### Yüzölçümü Formatlama (Türkiye formatı)
```
1250 → "1.250 m²"
500 → "500 m²"
15750 → "15.750 m²"

Kural: Binlik ayırıcı olarak nokta, ondalık ayırıcı olarak virgül kullan
```

---

## 7. Rate Limiting ve Best Practices

| Servis | Rate Limit | Bekleme Stratejisi |
|--------|-----------|-------------------|
| TKGM | Bilinmiyor (~düşük) | İstekler arası 2 saniye bekle |
| Google Maps Static | 25.000/gün | Limit dolmaz, endişelenme |
| Nano Banana Pro | Plan'a bağlı | Kuyruklama sistemi kullan |
| Kling | Plan'a bağlı | Asenkron, status polling |

### Genel Retry Stratejisi
```
Tüm API çağrıları için:
- İlk hata: 3 saniye bekle, tekrar dene
- İkinci hata: 10 saniye bekle, tekrar dene
- Üçüncü hata: Hata logla, kullanıcıya bildir
- Timeout: 60 saniye (TKGM/Maps), 300 saniye (AI servisleri)
```
