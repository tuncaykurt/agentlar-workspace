# Skill: MATCH_ENGINE

## Purpose
Yeni eklenen mülkü alıcı kriterleriyle karşılaştır, eşleşenleri bul ve danışmanlara bildir.

## Serves Goals
- Alıcı eşleştirme hızı <1 saat

## Inputs
- Supabase: `properties` (yeni eklenen veya güncellenen)
- Supabase: `clients WHERE client_type IN ('buyer', 'both') AND lead_status NOT IN ('won', 'lost')`
- Alıcı kriterleri: `budget_min/max`, `preferred_cities`, `preferred_districts`, `preferred_property_types`, `min_m2`, `max_m2`, `min_rooms`

## Process
1. Tetikleyici: Yeni mülk eklendiğinde veya günlük döngüde
2. Her aktif alıcı için eşleşme puanı hesapla:
   - Fiyat aralığında mı? → +30 puan
   - Şehir eşleşiyor mu? → +20 puan
   - İlçe eşleşiyor mu? → +20 puan
   - Mülk tipi eşleşiyor mu? → +15 puan
   - M2 aralığında mı? → +10 puan
   - Oda sayısı uyuyor mu? → +5 puan
3. Puan >= 60: Eşleşme kaydet (`property_matches` tablosu)
4. Puan >= 80: Danışmana otomatik WA bildirimi tetikle
5. `outputs/YYYY-MM-DD_matches.md` üret

## Outputs
- `property_matches` tablosuna yeni kayıtlar
- n8n webhook: `/webhook/notify-match` (danışman bildirimi için)
- `outputs/YYYY-MM-DD_matches.md`

## Quality Bar
- Her yeni mülk 1 saat içinde tüm alıcılarla karşılaştırılmış olmalı
- Aynı mülk-alıcı çifti 2 kez bildirilmemeli (UNIQUE constraint)
