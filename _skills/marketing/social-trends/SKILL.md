---
name: Social Media Trend Analysis
description: Instagram, TikTok ve YouTube üzerindeki viral emlak içeriklerini analiz etme.
---

## Açıklama
Bu skill, rakip emlakçıların ve global yatırımcıların hangi konulara odaklandığını anlamak için sosyal medya verilerini kazır ve analiz eder. En çok izlenen videoların "hook" (giriş) cümlelerini ve konu başlıklarını çıkarır.

## Araçlar
- **Apify:** Instagram Scraper, TikTok Scraper.
- **Firecrawl:** Sosyal medya trend raporu sayfalarını analiz etmek için.

## Adımlar
1. **Veri Toplama:** Belirlenen hashtag'ler (#DubaiRealEstate, #PropertyInvestment) üzerinden son 24 saatteki en popüler 10 videoyu çek.
2. **İçerik Analizi:** Videoların açıklamalarını, hashtag'lerini ve (mümkünse) transkriptlerini AI ile özetle.
3. **Fikir Üretimi:** Bu trendlere uygun olarak `/script-yaz` workflow'una girdi sağla.

## Çıktı Formatı
- Trend Konu: (Örn: "Dubai'de vergisiz yaşam")
- Popüler Hook: ("Neden herkes Dubai'ye taşınıyor?")
- Önerilen İçerik Tipi: (Reels, Long-form Video)
