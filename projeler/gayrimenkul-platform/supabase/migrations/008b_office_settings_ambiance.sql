-- =====================================================
-- Migration: 008b_office_settings_ambiance.sql
-- Ambiance Gayrimenkul ofis ayarlarını güncelle
-- JSON syntax: tek tırnak dışarıda, çift tırnak içeride
-- =====================================================

-- Ofis adı (Metin olduğu için çift tırnak + tek tırnak doğru)
INSERT INTO settings (key, value, description)
VALUES (
  'office_name',
  '"Ambiance Gayrimenkul"'::jsonb,
  'Ofis adı'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

-- Ofis logosu (Boş metin)
INSERT INTO settings (key, value, description)
VALUES (
  'office_logo_url',
  '""'::jsonb,
  'Ofis logo URL'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Ofis WhatsApp (Metin olduğu için çift tırnak şart)
INSERT INTO settings (key, value, description)
VALUES (
  'whatsapp_welcome_template',
  '"Merhaba {name}, Ambiance Gayrimenkul ekibine hoş geldiniz! Size nasıl yardımcı olabiliriz?"'::jsonb,
  'WhatsApp karşılama'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Komisyon Oranı (SAYI olduğu için tırnaksız veya metin formatında olmalı)
-- En garantisi budur:
INSERT INTO settings (key, value, description)
VALUES (
  'office_commission_rate',
  '3.0'::jsonb, -- JSON'da sayı tırnaksız yazılırsa direkt sayı olarak işlenir
  'Varsayılan ofis komisyon oranı (%)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
