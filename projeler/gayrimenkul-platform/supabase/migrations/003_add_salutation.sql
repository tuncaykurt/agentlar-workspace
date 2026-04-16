-- Migration: 003_add_salutation.sql
-- Müşterilere hitap şekli alanı ekle

ALTER TABLE clients ADD COLUMN IF NOT EXISTS salutation TEXT DEFAULT '';

COMMENT ON COLUMN clients.salutation IS 'Hitap şekli: Bey, Hanım, Dr., Av., Prof. vb.';
