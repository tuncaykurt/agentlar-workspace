-- Update office_name setting to Ambiance Gayrimenkul
INSERT INTO settings (key, value)
VALUES ('office_name', '"Ambiance Gayrimenkul"')
ON CONFLICT (key) DO UPDATE SET value = '"Ambiance Gayrimenkul"';
