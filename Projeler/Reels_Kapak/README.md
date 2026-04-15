# 🎨 [İSİM] Reels Kapak — Otomatik AI Kapak Üretim Sistemi

**Durum:** ✅ Railway Active  
**Versiyon:** v3 — Multi-theme (3 tema × 2 varyasyon)  
**Son Güncelleme:** 2026-03-17

---

## Açıklama

YouTube ve Instagram Reels videoları için **AI destekli otomatik kapak görseli üretim pipeline'ı**. Notion veritabanından "çekildi" durumundaki videoları alır, Kie AI ile birden fazla tema ve varyasyonda kapak üretir, Google Drive'a yükler ve Notion'da revizyon paneli oluşturur.

### Temel Özellikler

- **Multi-Theme Generation** — Her video için 3 farklı tema × 2 varyasyon = 6 kapak
- **Autonomous Agent** — Kie AI API ile tam otonom kapak üretimi
- **Revision Engine** — Notion üzerinden revizyon talepleri ile yeniden üretim
- **Google Drive Entegrasyonu** — Kapaklar otomatik olarak ilgili Drive klasörüne yüklenir
- **Batch Processing** — Birden fazla video için toplu kapak üretimi
- **Railway Cron** — Periyodik otomatik çalışma (3 saatte bir kontrol)

## 🔄 Pipeline Akışı

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  1. Notion    │ →  │  2. Kie AI    │ →  │  3. Google Drive  │ →  │  4. Notion        │
│  (Video Bul)  │    │  (Kapak Üret) │    │  (Yükle)          │    │  (Revizyon Panel) │
└──────────────┘    └──────────────┘    └──────────────────┘    └──────────────────┘
```

## 📁 Dosya Yapısı

```
Reels_Kapak/
├── main.py                    # Ana pipeline — video bul → kapak üret → yükle
├── worker.py                  # Railway worker (cron modunda çalışır)
├── autonomous_cover_agent.py  # Kie AI ile otonom kapak üretimi
├── multi_theme_gen.py         # 3 tema × 2 varyasyon üretim motoru
├── batch_cover_run.py         # Toplu kapak üretimi
├── composition_engine.py      # Görsel kompozisyon motoru
├── image_service.py           # Görsel işleme servisi
├── notion_service.py          # Notion API — video çekme, revizyon paneli
├── drive_service.py           # Google Drive — kapak yükleme
├── google_auth.py             # Google OAuth authentication
├── revision_engine.py         # Revizyon talep işleme motoru
├── revision_cron_worker.py    # Revizyon cron worker
├── check_revisions_job.py     # Revizyon kontrolü cron job
├── manual_cover_gen.py        # Manuel kapak üretimi (ad-hoc)
├── requirements.txt           # Python bağımlılıkları
├── railway.json               # Railway deploy konfigürasyonu
├── Instruction.md             # Stil kılavuzu ve kullanım talimatları
├── learnings.md               # Öğrenilen dersler ve best practice'ler
├── rourke_style_guide.md      # Kapak tasarım stil kılavuzu (Rourke stili)
├── copy_and_run.sh            # Sandbox workaround shell scripti
└── cronjob.txt                # Cron zamanlama referansı (lokal)
```

## 🔧 Yardımcı Scriptler

Aşağıdaki dosyalar ana pipeline'ın parçası **değildir**. Ad-hoc kullanım, debug veya tek seferlik görevler için yazılmıştır. Railway'de çalışmazlar.

| Dosya | Açıklama |
|-------|----------|
| `force_regenerate.py` | Belirli videolar için mevcut kapakları silip sıfırdan yeniden üretir |
| `process_all_raw.py` | `ham-[isim]-fotolari/` klasöründeki ham fotoları cutout'a çevirir |
| `generate_website_cards.py` | Website product card görselleri üretir (Kie AI + ImgBB) |
| `generate_mustafa_cover.py` | Tek seferlik müşteri testimonial kapağı üretimi |
| `run_upload_and_v2.py` | OAuth workaround ile manuel kapak yükleme + v2 işleme |
| `copy_content.py` | Dosyaları `/tmp/` workaround klasörüne kopyalar |
| `fix_json.py` | JSON parsing hatalarını düzeltmek için yazılmış tek seferlik patch |

## ⚙️ Environment Variables

| Variable | Zorunlu | Açıklama |
|----------|---------|----------|
| `KIE_API_KEY` | ✅ | Kie AI API anahtarı |
| `NOTION_TOKEN` | ✅ | Notion API anahtarı |
| `NOTION_DATABASE_ID` | ✅ | Video veritabanı ID |
| `GOOGLE_DRIVE_CREDENTIALS_JSON` | ✅ | Google Drive SA JSON |
| `GEMINI_API_KEY` | ✅ | Gemini kapak metni ve vision analizleri için |
| `REFERENCE_PHOTO_URL` | ✅ | Referans kişi fotoğrafı URL |

## 🏗️ Deployment

- **Platform:** Railway (Native Cron Job)
- **GitHub Repo:** `[GITHUB_KULLANICI]/[REPO_ADI]` (mono-repo)
- **Servis (Unified Worker):** `python unified_worker.py` (Kapak ve Revizyon bir arada)
- **Zamanlama:** `0 6,14,22 * * *` — Günde 3 kere (Maliyet optimizasyonu)
- **Restart Policy:** `NEVER` (İşlemi biten cron başarı/hata kodu ile kapanır)

*Önceki 8 kez çalışan multi-cron model maliyet optimizasyonu adına Railway'in Cron Job mimarisinde tekil bir script (unified_worker) altında birleştirilmiştir.*

## 📋 Versiyon Geçmişi

- **v1:** Tek tema, 3 varyasyon
- **v2:** Autonomous agent + Drive entegrasyonu
- **v3:** Multi-theme (3 tema × 2 varyasyon), revision engine, batch processing
- **v4 (Güncel):** Unified worker (cron), production-grade error handling, timeouts, google-genai SDK migration & cost optimization
