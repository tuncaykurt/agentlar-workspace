-- =====================================================
-- Migration: 009_sync_settings.sql
-- Sahibinden ofis sync için gerekli settings kayıtları
-- =====================================================

-- Cron secret (Coolify task'taki header ile eşleşmeli)
INSERT INTO settings (key, value, description)
VALUES (
  'office_sync_cron_secret',
  '"AmbianceSync2026!"'::jsonb,
  'Coolify scheduled task cron secret (x-cron-secret header)'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- Ofis Sahibinden mağaza/arama URL'si (buraya ofisinin sahibinden.com URL'sini gir)
-- Örnek: https://www.sahibinden.com/magazaprofile/XXXXX
INSERT INTO settings (key, value, description)
VALUES (
  'office_sahibinden_url',
  '""'::jsonb,
  'Ofis Sahibinden mağaza veya arama sayfası URL (sync için gerekli)'
)
ON CONFLICT (key) DO NOTHING;

-- Son sync zamanı (sistem otomatik günceller)
INSERT INTO settings (key, value, description)
VALUES (
  'office_sync_last_run',
  'null'::jsonb,
  'Son Sahibinden sync tarihi (otomatik)'
)
ON CONFLICT (key) DO NOTHING;

-- Son sync sonucu (sistem otomatik günceller)
INSERT INTO settings (key, value, description)
VALUES (
  'office_sync_last_result',
  'null'::jsonb,
  'Son Sahibinden sync sonucu (otomatik)'
)
ON CONFLICT (key) DO NOTHING;
