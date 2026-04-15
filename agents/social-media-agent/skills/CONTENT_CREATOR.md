# Skill: CONTENT_CREATOR

## Purpose
Mülk bilgilerinden ve örnek görsellerden Instagram/Facebook için AI destekli post metni ve görsel önerisi üret.

## Serves Goals
- Haftalık içerik ≥5
- İçerik onay oranı >%80

## Inputs
- Supabase: `properties` (başlık, konum, m2, oda sayısı, fiyat, fotoğraflar)
- `data/imports/sample_images/` — Danışmanın referans görselleri
- `knowledge/BRAND.md` — Marka sesi (ton, değerler)
- `knowledge/AUDIENCE.md` — Hedef kitle profili

## Process
1. Mülk bilgilerini çek (veya post_requests.md'den özel istek al)
2. Claude API ile post metni üret:
   ```
   System: Türk gayrimenkul danışmanı için {BRAND.md'den ton} tarzında Instagram/Facebook post yaz.
   Hedef kitle: {AUDIENCE.md'den segment}
   
   Mülk bilgileri: {title, city, district, m2, room_count, price, features}
   
   Üret:
   - 3-5 cümle post metni (emoji ile)
   - 10-15 hashtag (Türkçe + İngilizce karışık)
   - Call-to-action cümlesi
   
   Fiyat bilgisini dahil et. Samimi ve profesyonel ol.
   ```
3. Görsel önerisi oluştur:
   - Mülkün fotoğrafları varsa → ilk fotoğrafı kullan
   - sample_images/ varsa → referans stile uygun görsel notu ekle
   - DALL-E prompt önerisi oluştur (danışman üretmek isterse)
4. social_posts tablosuna kaydet (status='draft')
5. Danışmana WA bildirimi: onay linki ile

## Outputs
- Yeni `social_posts` kaydı (status='draft')
- WA onay bildirimi (communication-agent üzerinden)

## Quality Bar
- Post metni 150-300 karakter arası
- Minimum 8 hashtag
- Fiyat mülke göre gerçekçi ve doğru
- Her içerik marka ses tonuna uygun

## Tools
- Claude API (metin üretimi)
- Supabase REST API
- n8n webhook: `/webhook/content-approval-notify`
