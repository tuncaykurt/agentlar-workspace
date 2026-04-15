# n8n Workflow Rehberi

Bu klasör tüm n8n workflow JSON export'larını içerir.
Her workflow manuel olarak n8n'e import edilmelidir.

## Gerekli Bağlantılar (n8n Credentials)

Önce n8n'de şu credential'ları tanımlayın:

| Credential | Tip | Kullanım |
|------------|-----|---------|
| `Supabase API` | HTTP Header Auth | Tüm Supabase işlemleri |
| `Evolution API` | HTTP Header Auth | WhatsApp gönderimi |
| `Claude API` | HTTP Header Auth | AI içerik ve parse |
| `DocuSign` | OAuth2 | Dijital imza |
| `ScraperAPI` | HTTP Header Auth | Sahibinden scraping |
| `RunwayML` | HTTP Header Auth | Reels video üretimi |
| `Instagram Graph API` | OAuth2 | Instagram yayın |
| `Facebook Graph API` | OAuth2 | Facebook yayın |

## Webhook URL'leri (n8n'de oluşturulacak)

| Webhook | Açıklama | Kim Tetikler |
|---------|----------|--------------|
| `/webhook/new-client-welcome` | Yeni müşteri karşılama WA | crm-agent / web app |
| `/webhook/send-follow-up` | Takip mesajı gönder | crm-agent |
| `/webhook/scrape-property` | URL scraping tetikle | portfolio-agent / web app |
| `/webhook/notify-match` | Alıcı-mülk eşleşme bildirimi | portfolio-agent |
| `/webhook/sale-closed` | Satış kapandı → komisyon hesapla | finance-agent / web app |
| `/webhook/commission-notify` | Komisyon WA bildirimi | finance-agent |
| `/webhook/expense-reminder` | Gider onay hatırlatma | finance-agent |
| `/webhook/wa-send` | Tekil WA mesaj gönder | Tüm ajanlar |
| `/webhook/campaign-send` | Toplu WA kampanyası | communication-agent |
| `/webhook/generate-pdf` | HTML → PDF çevir | document-agent |
| `/webhook/docusign-create` | DocuSign envelope oluştur | document-agent |
| `/webhook/content-approval-notify` | İçerik onay bildirimi | social-media-agent |
| `/webhook/monthly-report` | Aylık raporu WA gönder | finance-agent |

## Workflow Dosyaları

```
n8n-workflows/
├── 01_crm_welcome.json          → Yeni müşteri karşılama
├── 02_crm_follow_up.json        → Otomatik takip gönderimi
├── 03_crm_passive_alert.json    → Pasif müşteri uyarısı
├── 04_portfolio_scrape.json     → URL scraping + AI parse
├── 05_portfolio_match.json      → Alıcı-mülk eşleştirme
├── 06_finance_sale_closed.json  → Satış kapanma akışı
├── 07_finance_monthly.json      → Aylık mali rapor
├── 08_wa_campaign.json          → WhatsApp toplu kampanya
├── 09_call_log.json             → Sanal santral çağrı loglama
├── 10_document_generate.json    → PDF oluşturma + DocuSign
├── 11_document_signed.json      → DocuSign webhook işleme
├── 12_social_post.json          → Sosyal medya yayın
├── 13_reels_generate.json       → RunwayML Reels üretimi
└── 14_consultant_alerts.json    → Sertifika + profil uyarıları
```

## Kurulum Sırası

1. Supabase'de tüm migration'ları çalıştır (`supabase/migrations/`)
2. n8n'de credential'ları tanımla
3. Workflow'ları sırasıyla import et (01 → 14)
4. Her webhook URL'sini kopyala → ilgili ajanın HEARTBEAT.md dosyasını güncelle
5. Test: `/webhook/wa-send` endpoint'ine test payload gönder

## Evolution API Entegrasyonu

Mevcut Evolution API'niz için n8n'de:
```
HTTP Request Node:
  URL: http://[evolution-api-ip]:8080/message/sendText/[instance-name]
  Method: POST
  Headers: apikey: [your-api-key]
  Body: { "number": "905XXXXXXXXX", "text": "Mesaj metni" }
```

## Sanal Santral Webhook Entegrasyonu

Santralınızın CDR webhook'unu n8n'e yönlendirin:
```
Santral webhook URL → n8n /webhook/call-completed
n8n bu webhook'u 09_call_log.json workflow'u ile işler
```
