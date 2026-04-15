# Skill: POST_SCHEDULER

## Purpose
Danışmanın onayladığı postları Instagram/Facebook Graph API üzerinden planlanan saatte yayınla.

## Serves Goals
- Post planlama tutarlılığı >%95

## Inputs
- Supabase: `social_posts WHERE status='scheduled' AND scheduled_at <= now()`
- Supabase: `consultants` (platform bağlantı token'ları)

## Process
1. Zamanı gelen postları çek
2. Her post için:
   - platform = 'instagram' → Instagram Graph API
   - platform = 'facebook' → Facebook Graph API
   - Görsel varsa: media upload → container → publish
   - Video varsa: video upload (async) → container → publish
3. Başarılı → status = 'posted', posted_at = now(), platform_post_id kaydet
4. Başarısız → status = 'failed', hata journal'a yaz
5. Danışmana yayın bildirimi (WA: "Instagram'da yayınlandı")

## Outputs
- Güncellenmiş `social_posts` kayıtları
- WA bildirimleri

## Quality Bar
- Planlanan saatten ±5 dakika sapma tolere edilir
- Başarısız post için Human'a bildir + manual yayın isteği

## Tools
- Instagram Graph API
- Facebook Graph API
- n8n webhook: `/webhook/post-published`
- Supabase REST API

## Token Yönetimi
- Instagram/Facebook access token'ları `settings` tablosunda şifreli saklanır
- 60 günlük token yenileme n8n cron ile otomatik yapılır
