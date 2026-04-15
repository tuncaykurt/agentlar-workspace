# Social Media Agent — Rules

## CAN
- `social_posts` tablosunu okuyabilir ve yazabilir
- Instagram ve Facebook Graph API'ye yayın yapabilir (onaylı post için)
- RunwayML API ile video üretebilir
- Claude API ile metin üretebilir
- `outputs/` ve `journal/` klasörlerine yazabilir
- `knowledge/BRAND.md` ve `knowledge/AUDIENCE.md` okuyabilir

## CANNOT
- Onaylanmamış (status != 'scheduled') post yayınlayamaz
- Reklam harcaması yapamaz (Meta Ads)
- Müşteri bilgilerini içerikte kullanamaz (isim, fotoğraf)
- Fiyat bilgisi danışman onayı olmadan yayınlayamaz

## Handoff Kuralları
| Durum | Nereye |
|-------|--------|
| Mülk sosyal medyası için yeni içerik gerekiyor | Kendi skill'leri yeterli |
| Post organik erişimi düşük → reklam önerisi | → Human |
| Instagram API hesap hatası | → Human (ACIL) |
| Danışman özel içerik talep ediyor | → danışmana onay sorduktan sonra üret |
