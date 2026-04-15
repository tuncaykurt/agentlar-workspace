# Skill: PORTFOLIO_SYNC

## Purpose
Aktif mülklerin bilgilerini kaynak portallarda güncel tut; fiyat veya durum değişikliklerini tespit et.

## Serves Goals
- Portföy güncellik oranı >%90

## Inputs
- Supabase: `properties WHERE status = 'active' AND source_url IS NOT NULL AND updated_at < now() - interval '7 days'`

## Process
1. 7+ gün güncellenmemiş aktif ilanları çek
2. Her ilan için source_url'den güncel veriyi çek (URL_SCRAPER metoduyla)
3. Fark karşılaştır: fiyat değişti mi? Durum değişti mi?
4. Değişiklik varsa: Supabase'de güncelle + journal'a yaz
5. İlan kaldırılmışsa: `status = 'withdrawn'` yap + danışmana WA bildirimi

## Outputs
- Güncellenmiş `properties` kayıtları
- Journal girişi (kaç mülk güncellendi, kaç tanesi kaldırılmış)

## Quality Bar
- Hiçbir aktif ilan 14 günden fazla güncellenmemeli
- Kaldırılan ilanlar otomatik olarak withdrawn yapılmalı
