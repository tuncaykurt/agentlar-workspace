# Social Media Agent — Heartbeat

## Schedule
- **Yeni mülk tetiklemesi**: Anlık (Supabase webhook: yeni property eklendi)
- **İçerik üretim döngüsü**: Her Salı ve Perşembe 10:00
- **Yayın tetiklemesi**: Zamanı gelen post'ları yayınla (n8n cron, her 30 dk)
- **Haftalık takvim**: Her Pazartesi 08:00 içerik takvimini hazırla

## Yeni Mülk Tetiklemesi (Anlık)
1. Yeni property eklendi → CONTENT_CREATOR çalıştır (Instagram + Facebook post)
2. status='draft' olarak kaydet (danışman onayı için)
3. Danışmana WA bildirimi: "Yeni mülk içeriği hazır, onaylayın"

## Haftalık İçerik Döngüsü (Salı + Perşembe)
1. `data/imports/post_requests.md` kontrol et
2. Bu hafta 5 post hedefe ulaşıldı mı? → Eksikse CONTENT_CREATOR çalıştır
3. Bekleyen Reels isteği var mı? → REELS_GENERATOR çalıştır

## Yayın Tetiklemesi (Her 30 dk)
1. POST_SCHEDULER: `social_posts WHERE status='scheduled' AND scheduled_at <= now()`
2. Instagram/Facebook Graph API'ye gönder
3. status = 'posted' güncelle

## Haftalık Takvim (Pazartesi 08:00)
1. Bu haftanın onaylı post'larını tara
2. `outputs/YYYY-MM-DD_content_calendar.md` üret
3. Journal'a yaz

## Eskalasyon
- Instagram API hatası → Human'a bildir
- Onay bekleyen post 48+ saat geçmiş → Danışmana hatırlatma
