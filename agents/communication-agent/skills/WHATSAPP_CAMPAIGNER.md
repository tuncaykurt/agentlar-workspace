# Skill: WHATSAPP_CAMPAIGNER

## Purpose
Planlanmış WhatsApp kampanyalarını segmentlere göre toplu gönder ve sonuçları raporla.

## Serves Goals
- Kampanya teslim oranı >%95

## Inputs
- Supabase: `campaigns WHERE status = 'scheduled' AND scheduled_at <= now()`
- Supabase: `clients` (segment filtreleme için)

## Process
1. Gönderilecek kampanyaları çek
2. Hedef kitleyi belirle:
   - `target_client_type` filtresi
   - `target_lead_status` filtresi
   - `custom_client_ids` varsa doğrudan kullan
3. Her müşteri için:
   a. `{name}`, `{consultant_name}`, `{property_title}` gibi placeholder'ları doldur
   b. n8n webhook: `POST /webhook/wa-send` → Evolution API
   c. campaign_logs: status güncelle (sent / failed)
4. Rate limiting: saniyede maksimum 3 mesaj (WA ban koruması)
5. Tamamlandığında: campaign.status = 'completed', sent_count ve failed_count güncelle
6. Rapor üret

## Outputs
- Güncellenmiş `campaign_logs` ve `campaigns` kayıtları
- `outputs/YYYY-MM-DD_campaign_[name]_report.md`

## Quality Bar
- Teslim oranı >%95 olmalı
- Rate limiting mutlaka uygulanmalı (saniyede 3 mesaj max)
- Aynı müşteriye aynı kampanya 2 kez gönderilmemeli
- Gönderim sırasında hata olursa failed olarak işaretle, durma

## Tools
- n8n webhook: `/webhook/wa-send`
- Evolution API (n8n üzerinden)
- Supabase REST API
