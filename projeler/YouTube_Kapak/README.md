# 🎬 [İSİM] YouTube Kapak (Thumbnail Generator)

YouTube videoları için otomatik, 16:9 yatay thumbnail (kapak) üretim sistemi.

## Nasıl Çalışır?

1. **Notion Sorgusu:** YouTube veritabanından `Çekildi` durumundaki veya henüz kapak kapağı eklenmemiş videoları çeker.
2. **Tema Üretimi:** Video scripti/konusu üzerinden Gemini AI (Flash 2.0) kullanarak kanıta dayalı, amaca uygun kompozisyon ve hook (text) konseptleri oluşturur.
3. **Pure Kie AI Üretimi (Nano Banana 2):** Eski Gemini Vision "kalite kontrol (retry) döngüleri" **tamamen kaldırılarak**, doğrudan `kie-ai-video-production` Skill standartlarındaki Asenkron Task + Polling mimarisine entegre edilmiştir. Bu sayede kredi israfı önlenerek, tek hamlede (Zero-Shot) YouTube formatına (16:9) tam uyumlu, spagetti koddan arındırılmış hızlı bir üretim yapılır.
4. **Drive Yükleme:** Üretilen thumbnail'ları videonun Google Drive klasörüne (`THUMBNAIL` alt klasörü) otomatik olarak organize edip yükler.
5. **Notion Revizyon:** Video sayfasına URL'leri ekleyerek takip ve onay imkanı sunar.

## Reels Kapak Projesinden Farklar

| Özellik | Reels (9:16) | YouTube (16:9) |
|---------|-------------|---------------|
| **Format** | 1080×1920 dikey | Yüksek Kalite 16:9 yatay |
| **Ana Model** | Nano Banana Pro | **Nano Banana 2** |
| **Üretim Mimarisi** | Vision Retry Döngüsü | **Saf Kie AI Skill Pipeline** (Asenkron) |
| **Safe Zone** | Üst/alt %15 (4:5 grid kırpma) | Sağ alt (Süre alanı), alt %10 (Mobil) |
| **Klasör** | KAPAK | THUMBNAIL |

## Proje Yapısı

```
YouTube_Kapak/
├── main.py                      # Ana pipeline giriş noktası (Notion → Üretim → Drive)
├── autonomous_cover_agent.py    # 16:9 Kie AI Nano Banana 2 Skill entegrasyon ajanı
├── notion_service.py            # YouTube DB Notion bağlantısı
├── drive_service.py             # Google Drive yükleme aracı
├── google_auth.py               # Merkezi OAuth yetkilendirmesi
├── youtube_style_guide.md       # YouTube thumbnail prompt & stil rehberi
├── learnings.md                 # Makine çevirileri ve geçmiş tecrübeler
├── assets/cutouts/              # Referans portre (yüz) görselleri
├── outputs/                     # Lokal olarak kaydedilen thumbnail'lar
├── .env                         # Notion + API credentials yedeklemesi
└── requirements.txt             # Python bağımlılık listesi
```

## Kullanım

```bash
# Env ve bağımlılık kontrolü ardından
python3 main.py
```

## API Servisleri ve Rolleri

- **Kie AI (Nano Banana 2):** Ana görüntü üretim motoru. Doğrudan `api.kie.ai` üzerinden asenkron şekilde kullanılır.
- **ImgBB:** Referans referans/cut-out yüz görsellerini Nano Banana 2'nin anlayacağı Public URL'e yüklemek için kullanılır.
- **Gemini (Flash 2.0):** Videonun script metnini anlayarak Thumbnail için en vurucu metinleri (hook) kurgulamakla görevlidir (görsel işlem/kontrol yapmaz).
- **Google Drive:** Thumbnail arşivlemesi.
