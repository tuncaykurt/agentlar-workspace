---
description: Tavily ve Firecrawl kullanarak derinlemesine, gürültüsüz web araştırması yap.
---

# Derin Araştırma — Web Intelligence

Bu workflow, standart web aramalarının ötesine geçerek, agentlar için optimize edilmiş verileri toplar ve yapılandırır.

## Bağlam
- **Araçlar:** 
  - `Tavily` (Aktif: tvly-dev-...)
  - `Firecrawl CLI` (Aktif: fc-2d9d-...)
- **Hedef:** Dubai emlak piyasası verileri veya kripto fundamental analizleri.
- **Not:** Anahtarlar `.env` dosyasına başarıyla işlendi.

## Adımlar

1. **Arama Parametrelerini Belirle**
   - Konu: (Örn: "Dubai Business Bay 2026 projeleri")
   - Derinlik: `advanced` veya `basic`
   - Dahil edilecek alanlar: (Haberler, teknik dökümanlar, fiyat tabloları)

2. **Tavily ile Akıllı Arama Yap**
   - `tavily-ask` veya `tavily-search` komutunu kullan.
   - Sadece güvenilir kaynaklardan gelen (DLD, Bloomberg, Coindesk vb.) verileri süz.

3. **Kritik URL'leri ve Dökümanları Analiz Et**
   - Arama sonuçlarından çıkan en önemli 3 URL'i Firecrawl ile temiz Markdown olarak çek.
   - **(Yeni)** Eğer arama sonuçlarında PDF broşürler veya teknik raporlar varsa, bunları `doc-intelligence` (Docling) skill'i ile parse et.

4. **Veriyi Yapılandır ve Kaydet**
   - Elde edilen veriyi `knowledge/research/[Tarih]_[Konu].md` olarak kaydet.
   - Verinin içindeki sayısal metrikleri çıkar (ROI, Price per sqft, TVL, vb.).

5. **Özet ve Insight Üret**
   - Toplanan devasa veriden 3 temel "Fırsat" ve 3 temel "Risk" çıkar.

## Çıktı Formatı

```markdown
# [Konu] Derin Araştırma Raporu

## 🔍 Temel Bulgular
- ...

## 📊 Sayısal Veriler (Structured)
| Metrik | Değer | Kaynak |
|--------|-------|--------|
| ...    | ...   | ...    |

## 🛠️ Firecrawl Temiz Veri Özeti
[Buraya taranan sayfalardan gelen en kritik 2-3 paragrafı ekle]

## 💡 Agent Insight
Bu veri ışığında [MÜŞTERİ_ADI] için önerilen aksiyon: ...
```
