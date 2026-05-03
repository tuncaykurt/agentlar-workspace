-- Migration: 017_add_company_to_clients.sql
-- clients tablosuna şirket adı kolonu ekler

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS company_name TEXT;

COMMENT ON COLUMN clients.company_name IS 'Müşterinin çalıştığı şirket / kurum adı';
