# ElevenLabs TTS — Seslendirme Referansı

## Genel Bilgi
- **Platform:** ElevenLabs
- **Tür:** Text-to-Speech (Metin → Ses)
- **Dil:** Türkçe dahil 32+ dil
- **Güçlü Yönler:**
  - Doğal, insan benzeri sesler
  - Duygusal ifade ve tonlama
  - Türkçe'de yüksek kalite
  - Hız/stil ayarlanabilir

> 🎯 **Türkçe reklam seslendirmesi için birincil tercih.**
> Video dış sesi (voiceover), ürün tanıtımı, reklam metni seslendirmesi.

---

## API Bilgileri

- **Base URL:** `https://api.kie.ai/api/v1/jobs` (Kie AI ortak endpoint'i)
- **API Key:** Kie AI API anahtarı (`97d226c568fea77abdeaedde37a6c6aa` veya ortam değişkeni)
- **Auth Header:** `Authorization: Bearer {KIE_API_KEY}`

> 💡 **Büyük Avantaj:** Ayrı bir ElevenLabs API The key'ine ihtiyacın yok! Tüm seslendirmeleri doğrudan Kie AI içindeki bakiyenden kullanabilirsin.

---

## Endpoint (Kie AI Çatısı Altında)

Tıpkı Kling ve Nano Banana gibi, ElevenLabs de **Asenkron Görev** (CreateTask -> RecordInfo polling) yapısıyla çalışır.

### Text-to-Speech (Multilingual v2)
```http
POST https://api.kie.ai/api/v1/jobs/createTask
Headers:
  Authorization: Bearer {KIE_API_KEY}
  Content-Type: application/json
```

```json
{
  "model": "elevenlabs/text-to-speech-multilingual-v2",
  "input": {
    "text": "Farkı hissedin. Yepyeni bir deneyim.",
    "voice": "Rachel",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "speed": 1
  }
}
```

**Yanıt:** `taskId`. Ardından `recordInfo` endpoint'inden sonucu (`resultUrls` içindeki `mp3` linki) alırsın.

---

## 🎙️ Desteklenen Sesler (Voice Parametresi)

Kie AI wrapper'ı üzerinden API kullanılırken, `voice` parametresine sadece aşağıdaki izin verilen ses isimlerini yazabilirsin. (Test edilip onaylanmıştır):

| Ses Adı | Ton/Cinsiyet | Önerilen Kullanım |
|---------|--------------|-------------------|
| `"Rachel"` | Kadın, Sıcak | Reklam dış sesi, samimi anlatıcı |
| `"Charlie"`| Erkek, Doğal | Kurumsal anlatım |
| `"Callum"` | Erkek, Tok  | Aksiyon, sinematik, iddialı |
| `"Daniel"` | Erkek, Spiker| Haber, profesyonel sunum |
| `"Liam"`   | Erkek, Genç | Dinamik, enerjik marka |

> ⚠️ **UYARI:** "Adam", "Elli" gibi diğer ElevenLabs sesleri Kie AI API wrapper'ı üzerinden doğrudan isimle çağrıldığında "voice is not within the range" hatası verebilir. Yukardaki 5 sesi kullanmaya özen göster.

## Önerilen Modeller

| Model ID | Açıklama | Türkçe? | Kullanım |
|----------|----------|---------|----------|
| `eleven_multilingual_v2` | En stabil çok dilli model | ✅ | Reklam seslendirmesi, dış ses |
| `eleven_v3` | En duygusal ve ifadeli | ✅ | Dramatik içerik |
| `eleven_flash_v2_5` | Ultra düşük gecikme (~75ms) | ✅ | Gerçek zamanlı uygulamalar |
| `eleven_turbo_v2_5` | Kalite + hız dengesi | ✅ | Genel amaçlı |

> 💡 **Reklam seslendirmesi için önerilen:** `eleven_multilingual_v2`

---

## Türkçe Ses Seçimi

### Adım 1: Sesleri Listele
```bash
curl -s "https://api.elevenlabs.io/v1/voices" \
  -H "xi-api-key: {API_KEY}" | jq '.voices[] | {name, voice_id, labels}'
```

### Adım 2: Türkçe Sesleri Filtrele
Yanıttaki `labels` alanında `language: tr` veya Türkçe destekleyen sesleri seç.
Alternatif olarak:
- Voice Library'den Türkçe sesleri ara
- Kendi ses klonunu oluştur

### Popüler Türkçe Uyumlu Sesler
Multilingual v2 modeli **tüm ön tanımlı seslerle** Türkçe çalışır. 
Metni Türkçe yazmanız yeterli — model otomatik tanır.

---

## Voice Settings Rehberi

| Parametre | Aralık | Açıklama |
|-----------|--------|----------|
| `stability` | 0.0 - 1.0 | Yüksek = tutarlı, düşük = daha ifadeli |
| `similarity_boost` | 0.0 - 1.0 | Seçilen sese ne kadar benzeyeceği |
| `style` | 0.0 - 1.0 | Stil ekstrapolasyonu (dramatik ifade) |
| `use_speaker_boost` | bool | Ses netliğini artır |

### Reklam Seslendirmesi İçin Önerilen Ayarlar:
```json
{
  "stability": 0.5,
  "similarity_boost": 0.75,
  "style": 0.4,
  "use_speaker_boost": true
}
```

---

## 🔊 Ses Dosyası Kaydetme

ElevenLabs API yanıtı **binary audio** döndürür. Dosyaya kaydet:

```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}" \
  -H "xi-api-key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bu ürünü keşfedin. Yeni nesil teknoloji, benzersiz tasarım.",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75
    }
  }' \
  --output "/tmp/reklam_seslendirme.mp3"
```

---

## ⏱️ Süre Hesaplama (Video Senkronizasyonu İçin)

Türkçe ortalama konuşma hızı: **~2.5 kelime/saniye**

| Video Süresi | Yaklaşık Kelime Sayısı | Karakter Sayısı (~6 char/kelime) |
|-------------|----------------------|--------------------------------|
| 5 saniye | 12-13 kelime | ~75 karakter |
| 10 saniye | 25 kelime | ~150 karakter |
| 15 saniye | 37-38 kelime | ~225 karakter |
| 30 saniye | 75 kelime | ~450 karakter |

### Senkronizasyon Stratejisi:
1. **Video süresini belirle** (Kling/Veo'dan)
2. **Metni video süresine göre ayarla** (yukarıdaki tabloyu kullan)
3. **ElevenLabs'te üret** ve gerçek süresini kontrol et
4. Gerekirse video süresini veya metin uzunluğunu düzelt

---

## Audio Format Seçenekleri

| Format | Kullanım |
|--------|----------|
| `mp3_44100_128` | Genel amaçlı (varsayılan) |
| `mp3_22050_32` | Küçük dosya boyutu |
| `pcm_16000` | Ham ses, post-processing için |

Header ile format belirt:
```
Accept: audio/mpeg  (mp3 için)
```

Query parameter ile:
```
POST .../text-to-speech/{voice_id}?output_format=mp3_44100_128
```

---

## Kullanım Senaryoları
- ✅ Türkçe reklam dış sesi (birincil kullanım)
- ✅ Ürün tanıtım seslendirmesi
- ✅ Video voiceover (Kling/Veo videoları üzerine)
- ✅ Podcast/audio içerik
- ✅ Çok dilli seslendirme
