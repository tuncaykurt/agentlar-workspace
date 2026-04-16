-- =====================================================
-- Migration: 011_sync_url_and_limits.sql
-- Sahibinden sync URL güncelle + limit ayarı
-- =====================================================

-- Çalışan Bursa satılık arama URL'sini ayarla
-- (Her çalışmada 50 ilan çeker, source_listing_id ile deduplikasyon yapılır)
INSERT INTO settings (key, value, description)
VALUES (
  'office_sahibinden_url',
  '"https://www.sahibinden.com/satilik/bursa"'::jsonb,
  'Sahibinden sync için arama URL (Bursa satılık)'
)
ON CONFLICT (key) DO UPDATE
  SET value = '"https://www.sahibinden.com/satilik/bursa"'::jsonb,
      updated_at = now();

-- Her çalışmada kaç ilan çekileceği (maliyet kontrolü)
-- 50 ilan = ~$0.30 per run
INSERT INTO settings (key, value, description)
VALUES (
  'office_sync_max_items',
  '50'::jsonb,
  'Sync başına max ilan sayısı (Apify maliyet kontrolü)'
)
ON CONFLICT (key) DO UPDATE
  SET value = '50'::jsonb,
      updated_at = now();
