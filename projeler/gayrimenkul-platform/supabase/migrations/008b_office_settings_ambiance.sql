-- =====================================================
-- Migration: 008b_office_settings_ambiance.sql
-- Ambiance Gayrimenkul ofis ayarlarını güncelle
-- JSON syntax: tek tırnak dışarıda, çift tırnak içeride
-- =====================================================

-- Ofis adı
INSERT INTO settings (key, value, description)
VALUES (
  'office_name',
  '"Ambiance Gayrimenkul"'::jsonb,
  'Ofis adı'
)
ON CONFLICT (key) DO UPDATE
  SET value = '"Ambiance Gayrimenkul"'::jsonb,
      updated_at = now();

-- Ofis logosu (varsayılan boş)
INSERT INTO settings (key, value, description)
VALUES (
  'office_logo_url',
  '""'::jsonb,
  'Ofis logo URL (Supabase Storage)'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- Ofis WhatsApp karşılama şablonu
INSERT INTO settings (key, value, description)
VALUES (
  'whatsapp_welcome_template',
  '"Merhaba {name}, Ambiance Gayrimenkul ekibine hoş geldiniz! Size nasıl yardımcı olabiliriz?"'::jsonb,
  'WhatsApp karşılama mesaj şablonu'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- Varsayılan ofis komisyon oranı
INSERT INTO settings (key, value, description)
VALUES (
  'office_commission_rate',
  '3.0'::jsonb,
  'Varsayılan ofis komisyon oranı (%)'
)
ON CONFLICT (key) DO NOTHING;
