# 📋 Project Card
> Bu dosya Antigravity'nin projeyi hızla anlaması için hazırlanmıştır.

| Alan | Değer |
|------|-------|
| **Platform** | railway-cron |
| **Start Command** | `python main.py` |
| **Cron Schedule** | `*/10 * * * *` (10 dakikada bir) |
| **Root Directory** | `Projeler/Lead_Pipeline` |
| **GitHub Repo** | `[GITHUB_KULLANICI]/[REPO_ADI]` (mono-repo) |

## Env Variables
| Variable | Kaynak | Açıklama |
|----------|--------|----------|
| `NOTION_API_TOKEN` | master.env | Ana Notion workspace |
| `TELEGRAM_BOT_TOKEN` | master.env | Bildirim botu |
| `TELEGRAM_CHAT_ID` | master.env | Savaş'ın Chat ID'si |
| `GOOGLE_OUTREACH_TOKEN_JSON` | master.env | Google Sheets okuma yetkisi (OAuth) |

## Dosya Yapısı (kısa)
- `main.py` → Entry point (hem CRM hem Notifier mantığını çalıştırır)
- `config.py` → Tüm yapılandırma değişkenleri
- `sheets_reader.py` → Google Sheets'ten verileri okur ve _Meta tabına log yazar
- `notion_writer.py` → Leads database'ine deduplication ile kayıt atar
- `notifier.py` → Telegram üzerinden satış/bildirim mesajı gönderir

## Bilinen Platform Kısıtlamaları
- Railway'de ephemeral FS olduğu için kalıcı veriler Google Sheets `_Meta` sayfasına kaydedilmelidir.
- Smtplib yasaklandığı için e-posta gönderilecekse Google Workspace aracı veya Gmail API kullanılmalıdır. (Mail gönderimi yerine şu an Telegram aktiftir).

## Son Doğrulama
- **Tarih:** 2026-03-23
- **Durum:** ✅ Çalışıyor (Birleşik Cron Job)
