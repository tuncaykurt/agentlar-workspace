# Skill: CERTIFICATION_TRACKER

## Purpose
Danışman sertifikalarının geçerlilik tarihlerini izle ve süresi dolmadan uyarı gönder.

## Serves Goals
- Sertifika geçerlilik takibi %100

## Inputs
- Supabase: `consultants.certifications` (JSONB array)
  Format: `[{"name": "SPK Lisansı", "expires_at": "2026-06-01", "doc_url": "..."}]`

## Process
1. Tüm danışmanların sertifikalarını çek
2. Her sertifika için:
   - 30 gün kaldıysa → WA uyarısı + journal notu
   - 7 gün kaldıysa → ACIL WA + admin bildirimi
   - Süresi geçmişse → ACIL admin + danışman bildirimi, journal'a yaz
3. Haftalık sertifika durum tablosu üret

## Outputs
- WA bildirimleri (n8n webhook)
- `outputs/YYYY-MM-DD_certification_status.md`
- Journal girişi (sertifika uyarısı varsa)

## Quality Bar
- Hiçbir sertifika uyarısız sona ermemeli
- Her Pazartesi çalışmalı
