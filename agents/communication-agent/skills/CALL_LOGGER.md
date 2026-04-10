# Skill: CALL_LOGGER

## Purpose
Sanal santral tamamlanan çağrılarını müşteri kaydına bağla ve interactions tablosuna logla.

## Serves Goals
- Çağrı kayıt tamamlık oranı >%98

## Inputs
- Sanal santral CDR webhook payload:
  ```json
  { "caller_number": "+905XX", "callee_number": "+905YY",
    "direction": "inbound/outbound", "duration_seconds": 120,
    "recording_url": "https://...", "started_at": "ISO8601" }
  ```

## Process
1. caller_number / callee_number ile `clients.phone` eşleştir (normalize et: +90 prefix)
2. Danışmanın numarasını `consultants.phone` ile eşleştir
3. `interactions` tablosuna kaydet:
   - channel: 'call_inbound' veya 'call_outbound'
   - duration_seconds: santraldan gelen süre
   - recording_url: ses kaydı URL'i
   - content: NULL (danışman sonradan not ekleyebilir)
4. Eşleşme bulunamazsa: `phone_unknown` olarak kaydet + danışmana WA ile bildir

## Outputs
- Yeni `interactions` kaydı
- WA bildirimi (eşleşme bulundu ise danışmana çağrı özeti)

## Quality Bar
- Tüm tamamlanan çağrılar loglanmalı
- Eşleşme bulunamayan çağrılar kaybolmamalı (unknown olarak kaydet)
- Süre 0 saniye olan çağrıları (cevapsız) ayrıca işaretle
