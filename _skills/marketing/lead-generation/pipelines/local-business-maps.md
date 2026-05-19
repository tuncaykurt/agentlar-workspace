# Yerel İşletme (Google Maps) Pipeline

Belirli bir bölgedeki fiziksel veya yerel hizmet veren işletmeleri (Diş hekimleri, Restoranlar, Oteller, Emlakçılar vb.) bulmak gerektiğinde kullanılır. En güçlü Lead bulma taktiklerinden biridir.

## 🎯 Hedef
Google Haritalar üzerinden şirketleri toplamak ve ardından her birinin **Web Sitesi** adresine giderek oradan E-posta, Telefon ve Sosyal Medya hesaplarını (Instagram vb.) kazımak (Zenginleştirmek - Enrichment).

## ⚙️ Kullanılacak Aktörler
1. **Liste Toplama:** `compass/crawler-google-places`
2. **Web Zenginleştirme:** `vdrmota/contact-info-scraper`

---

## 🚀 Adım Adım İşleyiş (Agent Talimatları)

### Adım 1: Google Maps'ten Şirketleri Topla
İşletmeci "Beşiktaş'taki Diş Klinikleri" dediğinde önce lokasyonu belirle.

```python
# 1. Google Maps Scraper (compass/crawler-google-places)
payload_maps = {
    "searchStringsArray": ["Diş Klinikleri Beşiktaş, İstanbul"],
    "maxCrawledPlacesPerSearch": 30, # Kredi tasarrufu için 30-50 arası tut
    "language": "tr",
    "countryCode": "TR"
}
# Apify Polling mantığıyla run başlat ve dataset'i al
```

### Adım 2: Web Adreslerini (URL) Ayıkla
Dönen dataset'ten SADECE `website` değeri olanları filtrele. (Web sitesi olmayanlardan e-posta alamayız).

```python
websites = [place["website"] for place in maps_dataset if place.get("website")]
# Çıktı Örn: ["https://diskliniği1.com", "https://diskliniği2.com"]
```

### Adım 3: İletişim Bilgilerini Zenginleştir (Enrichment)
Bulunan website listesini 2. Aktöre (Contact Info Scraper) gönder. Ekstra derinliğe inmemesi için `maxDepth` ayarını düşük tut.

```python
# 2. Contact Info Scraper (vdrmota/contact-info-scraper)
payload_contacts = {
    "startUrls": [{"url": site} for site in websites],
    "maxDepth": 1, # Sadece anasayfa ve iletişim sayfasını taraması yeterli
    "maxPagesPerDomain": 3,
    "sameDomain": True
}
# İkinci bir Apify Run başlat ve dataset'i çek
```

### Adım 4: Verileri Birleştir (Join) ve Çıktı Al
İkisi birbirinden bağımsız datasetler. İlki (Şirket adı, Adres, Maps Rating), ikincisi (E-posta, Telefon, Instagram, LinkedIn).
Bunu **Website URL'si** üzerinden birleştir.

**Formatlanacak Sütunlar:**
- İşletme Adı (Maps)
- Kategori (Maps)
- Yorum Puanı (Maps)
- Adres (Maps)
- Web Sitesi
- **E-postalar** (Enrichment)
- **Doğrulanmış Telefonlar** (Enrichment)
- **Instagram Url** (Enrichment)
- **LinkedIn Url** (Enrichment)

### Adım 5: CSV Kaydet
Elde edilen birleştirilmiş veriyi Excel/CSV olarak kaydet.

---

## ⚠️ Önemli Notlar
- Google Maps aktörü Apify'da cömerttir, ancak Contact Info Scraper yavaş olabilir. Sitelerin taranmasını beklerken timeout sürelerine dikkat et.
- Bazen sitelerin iletişim kısmında form olur email olmaz, "0 email return" olabilir. Müşteriye "30 Site tarandı, %40 oranında email / %80 oranında Instagram bulundu" gibi şeffaf **oran metrikleri** ver.
