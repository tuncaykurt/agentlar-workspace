---
name: Web Intelligence
description: Tavily ve Firecrawl kullanarak agentlar için temiz ve yapılandırılmış veri toplar.
---

# Web Intelligence Skill

Bu yetenek, agent'ın internetteki bilgi kirliliğinden sıyrılıp sadece en alakalı ve temiz veriye ulaşmasını sağlar.

## Kullanım Senaryoları
- Bir projenin güncel fiyatlarını doğrulamak.
- Rakip emlakçıların son 24 saatteki duyurularını takip etmek.
- Kripto projelerinin whitepaper ve teknik dökümanlarını analiz etmek.

## Teknik Detaylar
- **Tavily:** "AI-first search" yaparak sadece LLM'lerin ihtiyacı olan rafine sonuçları getirir. 
  - `Invoke-RestMethod` ile PowerShell üzerinden veya doğrudan API çağrılarıyla kullanılır.
- **Firecrawl CLI:** Tavily'den gelen URL'leri derinlemesine kazımak, sayfadaki veriyi agent'ın okuyabileceği saf Markdown'a çevirmek için kullanılır.
  - Komut: `firecrawl scrape <URL> -o .firecrawl/output.md`

## En İyi Performans Akışı (Best Practice)
1. **Arama:** Önce `Tavily` ile geniş çaplı ama rafine bir arama yap.
2. **Filtreleme:** Arama sonuçlarından en alakalı 3-5 URL'yi seç.
3. **Kazıma:** Seçilen URL'leri `firecrawl-cli` ile Markdown formatına çevir.
4. **Analiz:** Temizlenen Markdown verisi üzerinde LLM analizi yaparak rapor üret.

## Performans İpuçları
- **Token Tasarrufu:** Firecrawl'un `scrape` modunda `--include-tags` veya `--exclude-tags` kullanarak sadece ilgilendiğiniz HTML etiketlerini çekin.
- **Hız:** Birden fazla URL kazırken, PowerShell'de `ForEach-Object -Parallel` kullanarak işlemleri eşzamanlı çalıştırın.
- **Tavily Depth:** Hızlı sonuç için `basic`, derinlemesine rapor için `advanced` search modunu tercih edin.
