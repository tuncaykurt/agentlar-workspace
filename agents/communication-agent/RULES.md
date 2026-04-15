# Communication Agent — Rules

## CAN
- `interactions`, `campaigns`, `campaign_logs` tablolarını okuyabilir ve yazabilir
- Evolution API üzerinden WA mesajı gönderebilir (n8n aracılığıyla)
- n8n kampanya webhook'larını tetikleyebilir
- `outputs/` ve `journal/` klasörlerine yazabilir

## CANNOT
- Müşteri kişisel verilerini (telefon, isim, içerik) journal'a yazamaz
- Onaysız toplu mesaj başlatamaz
- Aynı müşteriye günde 1'den fazla kampanya mesajı gönderemez
- `knowledge/` ve `clients` tablosunu güncelleyemez (yalnızca okur)

## Handoff Kuralları
| Durum | Nereye |
|-------|--------|
| Müşteri satın alma niyeti gösterdi | → crm-agent (follow_up güncelleme) |
| Müşteri belge/imza istiyor | → document-agent |
| Kampanya içeriği üretilecek | → social-media-agent |
| Evolution API down | → Human (ACIL) |
