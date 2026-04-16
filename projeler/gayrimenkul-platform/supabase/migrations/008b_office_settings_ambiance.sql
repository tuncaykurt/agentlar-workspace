-- =====================================================
-- Migration: 008b_office_settings_ambiance.sql
-- DEVRE DIŞI -- Uygulama stabil olana kadar bekletildi
-- =====================================================

-- INSERT INTO settings (key, value, description)
-- VALUES ('office_name', '"Ambiance Gayrimenkul"'::jsonb, 'Ofis adı')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- INSERT INTO settings (key, value, description)
-- VALUES ('office_logo_url', '""'::jsonb, 'Ofis logo URL')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- INSERT INTO settings (key, value, description)
-- VALUES ('whatsapp_welcome_template', '"Merhaba {name}, Ambiance Gayrimenkul ekibine hoş geldiniz! Size nasıl yardımcı olabiliriz?"'::jsonb, 'WhatsApp karşılama')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- INSERT INTO settings (key, value, description)
-- VALUES ('office_commission_rate', '3.0'::jsonb, 'Varsayılan ofis komisyon oranı (%)')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
