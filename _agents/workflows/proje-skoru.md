---
description: Dubai gayrimenkul projelerini ROI, fiyat ve konum bazlı skorla.
---

# Proje Skoru — Gayrimenkul Analizörü

Bu workflow, bir gayrimenkul projesinin verilerini analiz ederek yatırım potansiyelini 1-10 arası bir skorla değerlendirir.

## Bağlam
- **Veri Kaynakları:** DLD (Dubai Land Department), Property Finder, Bayut, Reidin.
- **Parametreler:** 
  - Lansman fiyatı vs. Bölge ortalaması.
  - Ödeme planı esnekliği.
  - Teslim tarihi riski.
  - Tahmini kira getirisi (Net ROI).

## Adımlar

1. **Proje Verilerini Topla**
   - Proje Adı: (Örn: "Sobha Orbis - Motor City")
   - Toplanan Veriler: m² fiyatı, toplam ünite sayısı, teslim yılı.
   - **(Yeni)** Eğer projenin PDF broşürü veya ödeme planı dökümanı varsa, `doc-intelligence` (Docling) skill'i ile ödeme planı detaylarını otomatik ayıkla.

2. **Bölge Kıyaslaması Yap**
   - Aynı bölgedeki (örn: Motor City) son 6 aydaki ikincil el satış fiyatlarını Tavily ile sorgula.
   - Projenin fiyatı bölge ortalamasından % kaç yukarıda/aşağıda?

3. **ROI Hesapla**
   - Brüt kira tahmini yap.
   - Servis ücretlerini (Service charges) düşerek Net ROI hesapla.
   - `/hesaplama-scripti` workflow'unu kullanarak matematiksel modeli doğrula.

4. **Risk Analizi**
   - Geliştirici (Developer) geçmişi performansı.
   - Bölgedeki arz/talep dengesi.

5. **Final Skor Üret**
   - 1-10 arası puan ver ve gerekçelendir.

## Çıktı Formatı

```markdown
# 🏘️ Proje Değerlendirme: [Proje Adı]

### 📊 Yatırım Karnesi
- **Konum Skoru:** 8/10
- **Fiyat Avantajı:** 7/10
- **ROI Potansiyeli:** %X (Net)
- **Final Skor:** **7.5/10**

### 📝 Analiz Notları
- **Artılar:** ...
- **Eksiler:** ...

### 💰 Hesaplama Tablosu
| Kalem | Değer |
|-------|-------|
| Alış Fiyatı | ... |
| Tahmini Kira | ... |
| Net ROI | %... |

**Karar:** [Yatırım Yapılabilir / Bekle ve Gör / Uzak Dur]
```
