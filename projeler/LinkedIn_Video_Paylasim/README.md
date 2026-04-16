# LinkedIn Paylaşım — TikTok → LinkedIn Otonom Pipeline

TikTok'taki en son videoyu akıllı bir şekilde LinkedIn'de paylaşan otonom pipeline.

## Özellikler

- **LLM İçerik Filtresi:** Groq (llama-3.3-70b) ile LinkedIn'e uygun olmayan içerikler otomatik filtrelenir
- **Akıllı Caption:** TikTok caption'ı LLM ile LinkedIn'e uygun profesyonel tona dönüştürülür
- **1080p Video:** Metadata temizlenmiş, 1080p kalitede video
- **Notion Log:** Tüm paylaşım ve filtreleme kararları Notion database'ine loglanır
- **Günlük 1 Paylaşım:** LinkedIn'in profesyonel yapısına uygun, 13:00'te tek paylaşım

## Mimari

```
main.py → Scheduler + Workflow Orchestration
├── core/tiktok_scraper.py    → TikTok'tan video çekme (yt-dlp)
├── core/video_processor.py   → FFmpeg metadata strip + 1080p
├── core/content_filter.py    → LLM filtre + caption adaptation (Groq)
├── core/linkedin_publisher.py → LinkedIn Videos API + Posts API
└── core/notion_logger.py     → Notion database logging
```

## Environment Variables

| Variable | Açıklama |
|----------|----------|
| `LINKEDIN_ACCESS_TOKEN` | OAuth2 Bearer Token |
| `LINKEDIN_PERSON_URN` | urn:li:person:XXXXX |
| `LINKEDIN_FILTER_STRICTNESS` | relaxed / moderate / strict |
| `GROQ_API_KEY` | Groq API key |
| `NOTION_SOCIAL_TOKEN` | Notion integration token (Social workspace) |
| `NOTION_LINKEDIN_DB_ID` | LinkedIn log database ID |
| `TIKTOK_USERNAME` | TikTok kullanıcı adı |

## Filter Strictness Seviyeleri

- **relaxed:** Sadece açıkça uygunsuz içerikler reddedilir
- **moderate:** (default) İş dünyasıyla ilişkili içerikler geçer, casual eğlence reddedilir
- **strict:** Sadece direkt iş/yatırım/kariyer içerikleri geçer

## 🛡️ Stabilizasyon ve Hata Giderme (2026-03-26)

- **Fix 1:** LinkedIn API versiyon `202403` sunset olmuştu → `202503`'e güncellendi
- **Fix 2:** yt-dlp `2024.3.10` → `2026.3.17`'ye güncellendi (TikTok extraction uyumluluğu)
- **Fix 3:** `.gitignore`'a `token.json`, `credentials.json`, `.venv/` eklendi
- **Fix 4:** README'deki `NOTION_TOKEN` env var adı `NOTION_SOCIAL_TOKEN` olarak düzeltildi
- **Doğrulama:** Tüm komponent testleri (Content Filter, Caption, Notion Logger, LinkedIn API) başarılı
