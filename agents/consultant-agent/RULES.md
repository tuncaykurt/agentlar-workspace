# Consultant Agent — Rules

## CAN
- `consultants` tablosunu okuyabilir (zorunlu alanları kontrol için)
- `commissions`, `interactions`, `follow_ups` tablolarını okuyabilir (performans için)
- `outputs/` ve `journal/` klasörlerine yazabilir (anonim veri ile)
- n8n bildirimi webhook'larını tetikleyebilir
- Kendi `MEMORY.md`'sini güncelleyebilir

## CANNOT
- Danışman profilini silemez — yalnızca Admin silebilir
- `consultants.commission_rate` değiştiremez — Admin işi
- Kişisel verileri (TC kimlik, vergi no) journal'a yazamaz
- Bir danışmanın bireysel performansını başkasıyla paylaşamaz

## Handoff Kuralları
| Durum | Nereye |
|-------|--------|
| Danışmana WA bildirim gönderilecek | → communication-agent |
| Danışman belgesi eksik (yetki vs.) | → document-agent |
| Danışman komisyon bilgisi gerekiyor | → finance-agent (okuma) |
| Admin müdahale gerekiyor | → Human (orchestrator üzerinden) |
