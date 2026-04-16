# Skill: SIGNATURE_TRACKER

## Purpose
DocuSign imza durumlarını takip et, hatırlatma gönder ve süresi dolan belgeleri yönet.

## Serves Goals
- İmza tamamlanma süresi <24 saat

## Inputs
- DocuSign webhook event
- Supabase: `documents WHERE status = 'sent'`

## Process
1. DocuSign webhook geldi:
   - completed → DOCUMENT_ARCHIVER tetikle
   - declined → documents.signature_status = 'declined', danışmana WA bildir
   - expired → documents.signature_status = 'expired', yeniden gönder mi? → danışmana sor
2. Günlük kontrol:
   - 18+ saat bekliyenler → müşteriye WA hatırlatma (imza linki)
   - 24+ saat bekliyenler → danışmana ACIL WA uyarısı

## Outputs
- Güncellenmiş documents.signature_status
- WA bildirimleri (communication-agent üzerinden)

## Quality Bar
- Her DocuSign webhook işleme süresi <30 saniye
- Hiçbir belge takipsiz kalmamalı
