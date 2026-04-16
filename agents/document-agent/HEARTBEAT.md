# Document Agent — Heartbeat

## Schedule
- **Anlık**: Yeni `documents` kaydı eklendi (Supabase webhook)
- **Anlık**: DocuSign webhook (imza durumu değişti)
- **Günlük**: Her gün 10:00 (bekleyen imzaları kontrol et)
- **Haftalık rapor**: Her Cuma 16:00

## Anlık: Yeni Belge
1. documents.status = 'draft' ve pdf_url NULL → CONTRACT_GENERATOR çalıştır
2. PDF oluşturuldu → DocuSign envelope oluştur → documents.status = 'sent'
3. Müşteriye WA bildirimi (communication-agent üzerinden)

## Anlık: DocuSign Webhook
1. Durum güncelle: signed / declined / expired
2. İmzalandıysa → DOCUMENT_ARCHIVER çalıştır
3. Reddedildiyse → Danışmana WA bildirimi

## Günlük Kontrol (10:00)
1. status = 'sent' ve 18+ saat geçmiş belgeler → Müşteriye hatırlatma WA
2. expires_at yaklaşanlar (48 saat içinde) → ACIL bildirim

## Haftalık Rapor (Cuma 16:00)
1. İmzalanan / bekleyen / reddedilen / süresi dolan belge sayısı
2. Ortalama imza süresi hesapla
3. Rapor üret + journal'a yaz

## Eskalasyon
- DocuSign API hatası → ACIL Human bildirimi
- 48 saat imzalanmayan yetki belgesi → Human + danışmana ACIL uyarı
