-- Migration: 018_convert_client_type_to_text.sql
-- clients tablosundaki client_type kolonunu ENUM'dan TEXT'e çevirir.
-- Bu sayede "Emlakçı", "Network" veya herhangi bir özel etiket eklenebilir.

ALTER TABLE clients 
  ALTER COLUMN client_type TYPE TEXT;

-- Varsayılan değer dize (string) olarak kalmalı
ALTER TABLE clients 
  ALTER COLUMN client_type SET DEFAULT 'buyer';
