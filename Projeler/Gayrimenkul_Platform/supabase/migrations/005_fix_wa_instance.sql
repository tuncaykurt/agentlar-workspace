-- Fix wa_instance for Tuncay Kurt consultant to use correct Evolution API instance name
UPDATE consultants
SET wa_instance = 'gayr-1e0d8620077d'
WHERE id = '1e0d8620-077d-4cbd-91b1-409e11beb2d5';
