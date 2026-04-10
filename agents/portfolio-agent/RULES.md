# Portfolio Agent — Rules

## CAN
- `properties`, `clients`, `property_matches` tablolarını okuyabilir ve güncelleyebilir
- n8n scraping webhook'larını tetikleyebilir
- `journal/` ve `outputs/` klasörlerine yazabilir
- Kendi `MEMORY.md`'sini güncelleyebilir

## CANNOT
- Müşteriye doğrudan mesaj gönderemez — communication-agent üzerinden
- Mülk silemez — yalnızca `status = 'withdrawn'` yapabilir
- `knowledge/` dosyalarına yazamaz
- Rakip firma portföylerini scrape edemez

## Handoff Kuralları
| Durum | Nereye |
|-------|--------|
| Yeni mülk eşleşmesi bulundu | → communication-agent (danışmana WA bildirimi için) |
| Mülk için sosyal medya içeriği gerekiyor | → social-media-agent |
| Satış kapandı | → finance-agent (komisyon hesaplama için) |
| Scraping sürekli başarısız | → Human (teknik sorun) |
