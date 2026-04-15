---
name: gorsel-analiz
description: |
  Ürün etiketlerinden, supplement kutularından ve takviye edici gıda ambalajlarından
  AI destekli içerik çıkarımı yapar. Gemini 2.5 Flash/Pro ile görsel analiz yaparak
  besin değerleri tablosu, bileşim, kullanım önerileri ve ürün bilgilerini
  yapılandırılmış JSON formatında döndürür.
  Kullanıcı "etiketi analiz et", "supplement oku", "içerik tablosunu çıkar",
  "fotoğraftaki bilgileri oku" gibi isteklerde bulunduğunda BU SKILL kullanılır.
---

# 📸 Görsel Analiz — Supplement & Ürün Etiketi Okuyucu

Bu skill, fotoğraflardan ürün bilgilerini yapılandırılmış formatta çıkarır.
Gemini Vision API kullanarak OCR + anlam çıkarımı (semantic extraction) yapar.

---

## 📁 Proje Konumu

```
./_skills/gorsel-analiz/
```

## 🔑 Temel Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `scripts/analyze_supplement.py` | Ana analiz motoru (Gemini Vision) |
| `requirements.txt` | Python bağımlılıkları (pinned) |
| `test_images/` | Test görselleri |
| `outputs/` | Analiz çıktıları |

---

## 🧠 Nasıl Çalışır

```
1. Kullanıcı fotoğraf verir (dosya yolu, klasör veya inline görsel)
2. Görsel base64'e encode edilir
3. Gemini 2.5 Flash'a yapılandırılmış prompt ile gönderilir
4. AI, görseldeki tüm bilgileri yapılandırılmış JSON olarak döndürür
5. JSON parse edilir ve istenen formatta (json/markdown/text) sunulur
```

**Desteklenen görsel formatları:** JPG, JPEG, PNG, WEBP, HEIC, GIF

---

## 🎯 Kullanım Senaryoları

### Senaryo 1: Tek fotoğraf analizi

**Kullanıcı der ki:** *"Bu fotoğraftaki supplement bilgilerini çıkar"*

```bash
cd ./_skills/gorsel-analiz
source venv/bin/activate
GEMINI_API_KEY="AIzaSyBm-23Dr71RgICy-gWTw2y3OUPs5sCCKkc" \
python3 scripts/analyze_supplement.py /path/to/image.jpg --output markdown
```

### Senaryo 2: Birden fazla fotoğraf (aynı ürün, farklı yüzler)

**Kullanıcı der ki:** *"Bu 4 fotoğraf aynı ürünün farklı yüzleri, hepsini birleştir"*

```bash
cd ./_skills/gorsel-analiz
source venv/bin/activate
GEMINI_API_KEY="AIzaSyBm-23Dr71RgICy-gWTw2y3OUPs5sCCKkc" \
python3 scripts/analyze_supplement.py /path/to/images_folder/ --multi --output json
```

### Senaryo 3: Klasördeki tüm fotoğrafları tek tek analiz et

```bash
cd ./_skills/gorsel-analiz
source venv/bin/activate
GEMINI_API_KEY="AIzaSyBm-23Dr71RgICy-gWTw2y3OUPs5sCCKkc" \
python3 scripts/analyze_supplement.py /path/to/images_folder/ --output json --save output.json
```

### Senaryo 4: Python API olarak kullanım (agent entegrasyonu)

```python
import sys, os
sys.path.insert(0, './_skills/gorsel-analiz/scripts')
os.environ['GEMINI_API_KEY'] = 'AIzaSyBm-23Dr71RgICy-gWTw2y3OUPs5sCCKkc'

from analyze_supplement import analyze_image, analyze_multiple_images, format_output

# Tek görsel
result = analyze_image('/path/to/image.jpg')
print(format_output(result, fmt='markdown'))

# Çoklu görsel (aynı ürünün farklı yüzleri)
result = analyze_multiple_images([
    '/path/to/front.jpg',
    '/path/to/back.jpg',
    '/path/to/side.jpg',
])
print(format_output(result, fmt='json'))
```

### Senaryo 5: Inline görsel (konuşmada paylaşılan fotoğraf)

Kullanıcı doğrudan konuşmada fotoğraf paylaşırsa:
1. Fotoğrafı `/tmp` veya `test_images/` klasörüne kaydet
2. Script'i kaydettiğin yol ile çalıştır
3. Sonucu kullanıcıya sun

---

## 🤖 Desteklenen Modeller

| Model | Avantajı | Ne Zaman Kullan |
|-------|----------|-----------------|
| `gemini-2.5-flash` (varsayılan) | Hızlı, ucuz, yeterli doğruluk | İlk deneme, çoğu durum |
| `gemini-2.5-pro` (fallback) | Daha yüksek doğruluk, küçük yazılarda daha iyi | Flash yetersiz kalırsa |

**Model değiştirme:**
```bash
python3 scripts/analyze_supplement.py image.jpg --model gemini-2.5-pro
```

---

## 📋 Çıktı Formatları

### JSON (varsayılan)
Yapılandırılmış veri — downstream sistemlere (Notion, Sheets) aktarım için ideal.

### Markdown
İnsan-okunur tablo formatı — kullanıcıya doğrudan sunmak için.

### Text
Ham AI yanıtı — debug için.

---

## ⚠️ Kurallar

1. **Gemini API Key:** `master.env` dosyasından veya `GEMINI_API_KEY` ortam değişkeninden okunur
2. **Sandbox ortamında** `GEMINI_API_KEY` env variable olarak geçilmeli (master.env'e erişim kısıtlı olabilir)
3. **Büyük fotoğraflar:** 20MB üstü fotoğraflar sıkıştırılmalı
4. **Çoklu ürün:** Her ürün için ayrı analiz çağrısı yap, karıştırma
5. **Doğrulama:** AI çıktısını kullanıcıya göster, kritik veriler (doz bilgisi) için kullanıcı onayı al

---

## 🔧 Ortam Kurulumu

```bash
cd ./_skills/gorsel-analiz
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## 📊 Çıktı Yapısı (JSON Schema)

```json
{
  "urun_bilgisi": {
    "urun_adi": "string",
    "marka": "string",
    "urun_turu": "tablet | kapsül | toz | sıvı",
    "porsiyon_buyuklugu": "string",
    "toplam_porsiyon": "string"
  },
  "icerik_tablosu": [
    {
      "madde_adi": "string (Türkçe)",
      "madde_adi_en": "string (İngilizce)",
      "miktar": "string",
      "birim": "mg | mcg | IU | g",
      "brd_yuzde": "string"
    }
  ],
  "bilesim": "string (virgülle ayrılmış liste)",
  "kullanim_onerisi": {
    "onerilen_kullanim": "string",
    "gunluk_doz": "string",
    "uyarilar": "string"
  },
  "diger_bilgiler": {
    "uretici": "string",
    "sertifikalar": ["string"],
    "saklama_kosullari": "string",
    "son_kullanma_tarihi": "string",
    "barkod": "string"
  }
}
```
