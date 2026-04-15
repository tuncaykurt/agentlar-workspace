# Skill: URL_SCRAPER

## Purpose
Danışmanın yapıştırdığı ilan URL'inden mülk bilgilerini otomatik olarak çek ve properties tablosunu doldur.

## Serves Goals
- Scraping başarı oranı >%80
- Portföy tamamlık oranı >%95

## Inputs
- `data/imports/urls.txt` — Her satırda bir URL

## Process
1. `urls.txt` dosyasını oku, her URL'i işle
2. URL'den portalı tespit et (sahibinden / cb.com.tr / diğer)
3. n8n webhook tetikle: `POST /webhook/scrape-property`
   ```json
   { "url": "https://...", "platform": "sahibinden" }
   ```
4. n8n workflow:
   - **cb.com.tr**: Playwright ile doğrudan çek
   - **sahibinden.com**: ScraperAPI (render=true) → HTML → Claude API ile parse
   - **Diğer**: Browserless.io headless Chrome → Ham metin → Claude API ile parse
5. Claude API prompt:
   ```
   Bu gayrimenkul ilanından aşağıdaki bilgileri JSON olarak çıkar:
   title, price, city, district, neighborhood, property_type, 
   m2_gross, m2_net, room_count, floor, total_floors, age, 
   heating_type, features (dizi), description
   Bulamazsan null döndür.
   ```
6. JSON döner → Supabase `properties` tablosuna kaydet (source_url ile)
7. Başarılı: URL'i `data/imports/processed/` klasörüne taşı
8. Başarısız: `data/imports/failed/YYYY-MM-DD_failed_urls.txt` dosyasına ekle + hata nedeni

## Outputs
- Yeni/güncellenmiş `properties` kayıtları
- `outputs/YYYY-MM-DD_scraping_log.md`

## Quality Bar
- Başarılı parse'ta en az: title, price, city, property_type dolu olmalı
- Aynı source_url iki kez eklenmemeli (duplicate kontrolü)
- Maksimum süre: 2 dakika/URL

## Tools
- n8n webhook: `/webhook/scrape-property`
- ScraperAPI (sahibinden için)
- Browserless.io (diğer siteler için)
- Claude API (veri çıkarımı için)
- Supabase REST API
