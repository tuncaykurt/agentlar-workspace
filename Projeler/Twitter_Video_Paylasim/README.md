# 🐦 Twitter_Video_Paylasim — TikTok → X Otomatik Video Paylaşım

TikTok hesabındaki (@[SOSYAL_MEDYA_KULLANICI]) videoları otomatik olarak X (Twitter) hesabına cross-post eden otonom pipeline.

## Workflow

```
[Railway Cron] → TikTok profil tarama → Duplikasyon kontrolü (Notion) → Video indirme (yt-dlp)
    → Metadata temizleme + Re-encode (FFmpeg/libx264) → X API video upload → Tweet oluştur → Notion log
```

## Özellikler

- **Günde 3 kez** çalışır (TSİ 11:00, 14:00, 17:00)
- **Duplikasyon koruması**: Notion DB'den Video ID kontrolü — aynı video iki kez paylaşılmaz
- **Tam re-encode**: Video `libx264` ile baştan kodlanır → X algoritması TikTok origin'i tespit edemez
- **Metadata sıfırlama**: FFmpeg `-map_metadata -1` ile tüm kalıntılar temizlenir
- **Caption uyarlama**: Hashtag'ler temizlenir, karakter limiti uygulanır, engagement suffix eklenir
- **Notion loglama**: TikTok URL, Twitter URL ve Paylaşım Tarihi kaydedilir

## Mimari

| Dosya | Görev |
|-------|-------|
| `main.py` | Entry point — cron/schedule modu |
| `config.py` | Fail-fast ENV doğrulama |
| `core/tiktok_scraper.py` | yt-dlp ile TikTok profil tarama + video indirme |
| `core/video_processor.py` | FFmpeg metadata strip + caption temizleme |
| `core/x_publisher.py` | Tweepy OAuth1 upload + v2 tweet oluşturma |
| `core/notion_logger.py` | Duplikasyon kontrolü + paylaşım kaydı |

## ENV Değişkenleri

| Key | Açıklama |
|-----|----------|
| `NOTION_TOKEN` | Notion API token |
| `NOTION_TWITTER_DB_ID` | Notion veritabanı ID |
| `X_CONSUMER_KEY` | X API Consumer Key |
| `X_CONSUMER_SECRET` | X API Consumer Secret |
| `X_ACCESS_TOKEN` | X API Access Token |
| `X_ACCESS_TOKEN_SECRET` | X API Access Token Secret |
| `RUN_MODE` | `cron` (varsayılan) veya `schedule` (lokal dev) |

## Çalıştırma Modları

- **Railway (cron):** `RUN_MODE=cron` → `job()` bir kez çalışıp container kapanır
- **Lokal (schedule):** `RUN_MODE=schedule` → `while True` döngüsüyle 11:00, 14:00, 17:00'de çalışır

## Deploy

- **Platform:** Railway Cron
- **Cron:** `0 8,11,14 * * *` (UTC)
- **Mono-repo:** `[GITHUB_KULLANICI]/[REPO_ADI]` → Root Dir: `Projeler/Twitter_Video_Paylasim`
