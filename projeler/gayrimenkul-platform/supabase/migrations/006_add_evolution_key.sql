-- Add per-consultant Evolution API instance key
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS evolution_instance_key TEXT;
