# 🎬 [İSİM] Reels Kapak — Proje Talimatları

## Projenin Amacı
[İSİM]'ın Instagram Reels videoları için AI destekli kapak fotoğrafı (thumbnail) üretim sistemi.
Notion'daki video veritabanını takip ederek, uygun statüdeki videolar için otomatik olarak kapak fotoğrafları üretir ve Google Drive'a yükler.

## Sistem Mimarisi

### Akış (Pipeline)
```
Notion DB (video listesi)
    → Script/senaryo içeriği okunur
    → Gemini ile Türkçe kapak metni + sahne açıklaması üretilir
    → Cutout fotoğraf ImgBB'ye yüklenir
    → Kie AI (Nano Banana Pro) ile kapak fotoğrafı üretilir
    → Gemini Vision ile değerlendirme (score 0-10)
        → Score < 8 ise yeniden üretim (max 3 deneme)
    → En iyi kapak Google Drive'a yüklenir (KAPAK klasörü)
```

### Dosya Yapısı
| Dosya | Açıklama |
|-------|----------|
| `main.py` | Ana orkestrasyon scripti — Notion'dan videoları çeker, kapak üretimini başlatır |
| `autonomous_cover_agent.py` | Çekirdek AI kapak üretim motoru — metin üretimi, görsel üretim, değerlendirme |
| `notion_service.py` | Notion API entegrasyonu — video verilerini çekme |
| `drive_service.py` | Google Drive API — kapak yükleme, klasör yönetimi |
| `image_service.py` | Görsel servisleri (ImgBB upload) |
| `composition_engine.py` | Görsel kompozisyon motoru |
| `learnings.md` | Kullanıcı feedback'lerinden çıkarılan kurallar ve öğrenimler |
| `rourke_style_guide.md` | Rourke tarzı stil kılavuzu |
| `batch_cover_run.py` | Toplu kapak üretim scripti |
| `force_regenerate.py` | Belirli videoların kapaklarını zorla yeniden üretme |

### Kullanılan API'ler ve Servisler
| Servis | Amaç | API Key Env |
|--------|------|------------|
| **Gemini (Google AI)** | Metin üretimi + Vision değerlendirme | `GEMINI_API_KEY` |
| **Kie AI (Nano Banana Pro)** | Görsel üretimi | `KIE_API_KEY` |
| **ImgBB** | Cutout fotoğrafların URL'e dönüştürülmesi | `IMGBB_API_KEY` |
| **Notion API** | Video veritabanı erişimi | `NOTION_TOKEN` |
| **Google Drive API** | Kapak yükleme | `credentials.json` + `token.json` |

## Temel Kurallar ve İlkeler

### ⚠️ Kritik — Kapak Metni Üretimi
1. **Video adı ASLA kapak metni olarak kullanılmaz.** "Typeless 5" gibi isimler dahili takip isimleridir.
2. **Script içeriği okunmalıdır.** Kapak metni MUTLAKA videonun senaryo içeriğinden türetilirdi.
3. **Safety check**: Üretilen metnin video adına benzeyip benzemediği otomatik kontrol edilir.
4. **Fallback**: Script yoksa "BUNU BİLMELİSİN" kullanılır (video adı değil).

### ⚠️ Kritik — Görsel Kalite
1. **Metin MUTLAKA render edilmelidir.** Boş kapak = Score 0, otomatik retry.
2. **Türkçe zorunlu.** İngilizce kelime (ekrandaki yazılar dahil) = Score 0.
3. **Metin tekrarı yasak.** Aynı metin iki kere render edilirse = Score 0.
4. **Instagram 4:5 safe zone** — metin görselin %25-%75 dikey alanında olmalı.

### Yaratıcılık İlkeleri
- "Bilgisayar başında oturan kişi" klişesinden kaçın
- Fiziksel metaforlar kullan (klavye dağı, patlayan objeler, vs.)
- Arka plan dramatik olabilir ama kişi her zaman öne çıkmalı
- Çok karmaşık arka planlardan kaçın — kişi tanınabilir olmalı

## Çalıştırma

### Otomatik (Cron Job)
```bash
cd ANTIGRAVITY_ROOT_BURAYA/Projeler/Reels_Kapak
source venv/bin/activate
python main.py
```

### Manuel Toplu Üretim (macOS sandbox bypass)
macOS'un sandbox kısıtlamaları nedeniyle toplu üretim `/tmp` klasöründen çalıştırılır:
```bash
source /tmp/reels_venv/bin/activate
python3 -u /tmp/regenerate_covers.py
```

### Tek Video Üretim
```python
from autonomous_cover_agent import run_autonomous_generation
run_autonomous_generation(
    local_person_image_path="ham-[isim]-fotolari/cutout.png",
    video_topic="AI aracı tanıtımı",
    main_text="SEKRETERİNİ KOV",
    output_path="outputs/kapak.png",
    max_retries=3,
    variant_index=1,  # 1=candid, 2=selfie, 3=mystery
    script_text="Video senaryosu burada...",
    scene_description="A cinematic scene of..."
)
```

## Öğrenimler
Tüm kullanıcı feedback'leri ve kurallar `learnings.md` dosyasında tutulur.
Bu dosya her değerlendirme prompt'unda referans olarak kullanılır.
Yeni feedback geldiğinde bu dosya güncellenmelidir.

## Konsept-Varyasyon Yaklaşımı (v3)

### Yapı
Her video için:
1. **2-3 farklı konsept** belirlenir (farklı hook/angle/mesaj)
2. Her konsept için **2 varyasyon** üretilir (farklı görsel tema)
3. Toplamda minimum **4 kapak**, maksimum **6 kapak** üretilir

### Adlandırma
| Kod | Açıklama |
|-----|----------|
| 1A | Konsept 1, Varyasyon A |
| 1B | Konsept 1, Varyasyon B |
| 2A | Konsept 2, Varyasyon A |
| 2B | Konsept 2, Varyasyon B |
| 3A | Konsept 3, Varyasyon A *(opsiyonel)* |
| 3B | Konsept 3, Varyasyon B *(opsiyonel)* |

### Klasör Yapısı
```
outputs/
  Video_Adi/
    Konsept_1/
      Kapak_1A.png
      Kapak_1B.png
    Konsept_2/
      Kapak_2A.png
      Kapak_2B.png
```

## Teknik Notlar

### macOS Sandbox Sorunu
- Proje klasöründen doğrudan Python çalıştırılınca bazı API çağrıları sandbox kısıtlamalarına takılabiliyor.
- **Çözüm**: Self-contained script'ler `/tmp` klasörüne kopyalanıp oradan çalıştırılır.
- Token/credentials dosyaları script içine embed edilir.

### Kie AI Queue Süreleri
- Kie AI'da yoğun zamanlarda queue bekleme süresi 5-30 dakika arasında değişebilir.
- Toplu üretim (8 video × 3 variant × potential retry = ~24+ generation) saatler sürebilir.
- Sabırlı olmak gerekir, script otomatik polling yapar.

### Gemini Model
- Metin üretimi: `gemini-2.5-pro` (JSON response mode)
- Vision değerlendirme: `gemini-2.5-pro` (image + text)
