-- =====================================================
-- Migration: 010_set_office_sahibinden_url.sql
-- Ambiance CB ofis Sahibinden mağaza URL'sini kaydet
-- =====================================================

INSERT INTO settings (key, value, description)
VALUES (
  'office_sahibinden_url',
  '"https://cbambiance.sahibinden.com/"'::jsonb,
  'Ofis Sahibinden mağaza sayfası (CB Ambiance)'
)
ON CONFLICT (key) DO UPDATE
  SET value = '"https://cbambiance.sahibinden.com/"'::jsonb,
      updated_at = now();
