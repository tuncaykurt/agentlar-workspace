# Agent Registry

Master list of all agents in this workspace.

## Gayrimenkul Danışman Platformu Ajanları

| Agent | Folder | Goals | Skills | Heartbeat | Status |
|-------|--------|-------|--------|-----------|--------|
| CRM Agent | `agents/crm-agent/` | Takip %85, İletişim sıklığı %70, Lead dönüşüm %15 | CONTACT_MANAGER, FOLLOW_UP_SCHEDULER, INTERACTION_REPORTER | Günlük 08:30, Haftalık Pazartesi | Active |
| Portfolio Agent | `agents/portfolio-agent/` | Güncellik %90, Scraping %80, Eşleştirme <1sa | URL_SCRAPER, PORTFOLIO_SYNC, MATCH_ENGINE | Günlük 09:00, Haftalık Cuma | Active |
| Finance Agent | `agents/finance-agent/` | Komisyon 0 hata, Aylık rapor %100, Gider onay <2gün | COMMISSION_CALCULATOR, EXPENSE_TRACKER, FINANCE_REPORTER | Satış tetiklemesi + Haftalık Çarşamba + Aylık 1. | Active |
| Communication Agent | `agents/communication-agent/` | WA yanıt %60, Kampanya teslim %95, Log %100 | WHATSAPP_CAMPAIGNER, CALL_LOGGER, COMMUNICATION_REPORTER | Anlık webhook + Haftalık Pazartesi | Active |
| Document Agent | `agents/document-agent/` | İmza <24sa, Şablon %90, Arşiv %100 | CONTRACT_GENERATOR, SIGNATURE_TRACKER, DOCUMENT_ARCHIVER | Anlık webhook + Günlük 10:00 | Active |
| Social Media Agent | `agents/social-media-agent/` | ≥5 post/hafta, Reels <15dk, Onay %80 | CONTENT_CREATOR, REELS_GENERATOR, POST_SCHEDULER | Anlık + Salı+Perşembe + Her 30dk | Active |
| Consultant Agent | `agents/consultant-agent/` | Profil %95, Sertifika %100, Rapor %100 | PROFILE_MANAGER, CERTIFICATION_TRACKER, PERFORMANCE_REPORTER | Haftalık Pazartesi + Aylık 2. | Active |

## Bağlam

Bu ajanlar `projeler/gayrimenkul-platform/` projesine hizmet eder.
- **Web App**: `projeler/gayrimenkul-platform/frontend/` (Next.js 14)
- **Veritabanı**: Self-hosted Supabase
- **Otomasyon**: n8n (self-hosted) + Evolution API (WhatsApp)
- **Dijital İmza**: DocuSign API
- **AI**: Claude API + RunwayML
