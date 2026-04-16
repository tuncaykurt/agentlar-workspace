# 📋 Project Card
> Bu dosya Antigravity'nin projeyi hızla anlaması için hazırlanmıştır.

| Alan | Değer |
|------|-------|
| **Platform** | railway-cron |
| **Start Command** | `python unified_worker.py` (Kapak üretimi + Revizyon) |
| **Cron** | `0 6,14,22 * * *` (Günde 3 kez) |
| **Root Directory** | `Projeler/Reels_Kapak` |
| **GitHub Repo** | `[GITHUB_KULLANICI]/[REPO_ADI]` (mono-repo) |

## Env Variables
| Variable | Kaynak | Açıklama |
|----------|--------|----------|
| `NOTION_SOCIAL_TOKEN` | master.env | İşbirlikleri Notion workspace |
| `KIE_API_KEY` | master.env | Kie AI pipeline (Reels kapak) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | master.env | Google Drive upload yetkisi |
| `GEMINI_API_KEY` | master.env | Revizyon değerlendirmesi ve metin üretimi |

## Dosya Yapısı (kısa)
- `unified_worker.py` → Konsolide edilmiş ana cron (Kapak üretimi + Revizyon)
- `check_revisions_job.py` → Revizyon işlerini yöneten modül
- `autonomous_cover_agent.py` → Kie Workflow tetikleme ana motoru (Timeout vs eklendi)
- `revision_engine.py` → Feedback'leri algılayıp yeni prompt üretir (google-genai SDK)
- `notion_service.py` → Notion'dan meta dataları çeker
- `composition_engine.py` → Multi-theme kapak varyasyonlarını yönetir.

## Bilinen Platform Kısıtlamaları
- generate_image ARACI KULLANILMAZ. Üretim Kie AI pipeline'ı üzerinden yapılır.
- Tüm Drive ve Notion JSON tokenları env var üstünden çekilir.

## Son Doğrulama
- **Tarih:** 2026-03-24
- **Durum:** ✅ Stabilized & Fully Operational (google-genai migrated, bug fixes, dependencies optimized, timeouts added)
