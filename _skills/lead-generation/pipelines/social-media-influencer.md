# Sosyal Medya (Instagram / TikTok / YouTube) Pipeline

Müşterinin "Kripto / Teknoloji Influencerlarını bul", "Dubai gayrimenkul hashtag'indeki popüler profilleri bul" veya "X influencer'ını takip eden kişilerin datasını çek" gibi B2C ve Influencer Marketing odaklı taleplerinde kullanılır.

## 🎯 Hedef
İnstagram, TikTok veya YouTube üzerinden Anahtar Kelime (Keyword), Hashtag veya Hedef Profil üzerinden binlerce kişinin Data'sını, Follower/Following metriklerini çekmek ve uygun olanların biolarından (varsa) email veya iletişim kanallarını ayıklamak.

## ⚙️ Kullanılacak Aktörler
- **Instagram:** `apify/instagram-profile-scraper` , `apify/instagram-hashtag-scraper`
- **TikTok:** `clockworks/tiktok-user-search-scraper`
- **YouTube:** `streamers/youtube-scraper`
- **İletişim (Opsiyonel Enrichment):** `vdrmota/contact-info-scraper`

---

## 🚀 Adım Adım İşleyiş (Agent Talimatları)

### Adım 1: Platformu ve Amacı Belirle
- **Amaç:** "Rakip firma `ayse_gayrimenkul` 'ün takipçilerini istiyorum" -> `Instagram Profil Scraper (Takipçiler modu)`
- **Amaç:** "Dubai kelimesi geçen Tiktok fenomenlerini istiyorum" -> `TikTok User Search Scraper`

### Adım 2: İlk Aktörü Çalıştır (Platform Kazıma)
*Örnek: Instagram Profili / Takipçi Kazıma*

```python
payload = {
    "usernames": ["hedef_kullanici_adi"],
    "resultsLimit": 500, # Kredi kullanımına dikkat et
    # EĞER takipçiler isteniyorsa aktörün "followers" ayarlarını true yap. 
    # Sadece profil metrikleri isteniyorsa false bırak.
}

# Apify run başlat..
```

### Adım 3: Dönen Dataset'i Analiz Et
Sosyal medyadan gelen veriler çok büyük ve düzensiz olur. 

**Değer Çıkarımı (Regex veya JSON Field):**
- Biyografi (Bio / Description) metninde "📧", "Mail:", "İletişim" olanları özel bir regex (`[\w\.-]+@[\w\.-]+`) ile ayıkla.
- Profilinde bir **Web Sitesi (Link in Bio / External URL)** varsa o URL'yi 2. Aşama için ayır (Zenginleştirmeye yollanacaklar).

### Adım 4 (Opsiyonel): Web Sitesi Olanları Zenginleştir
Tıpkı Local Maps pipeline'ındaki gibi, profiline web sitesi / linktree koymuş yüksek potansiyelli Influencer'ların veya markaların web sitelerini `vdrmota/contact-info-scraper`'a gönderip oradaki gizli e-posta veya telefonları çek.

### Adım 5: Filtreleme ve Formatlama
Dosyayı müşteriye vermeden önce gürültüyü azalt (Noise Reduction):
- `Takipçi Sayısı < 500` olanları (veya spam botları) eleyebilirsin. (Müşteri aksini istemediyse).
- Sütunlar: 
  `Kullanıcı Adı` | `Platform` | `Takipçi (Followers)` | `Takip Ettiği (Following)` | `Bio Linki (External URL)` | `Bio Metni` | **Bulunan E-posta**

### Adım 6: CSV'ye Çevir
Temizlenmiş Python List/Dictionary verisiyle `Projeler/` altındaki klasöre (Örn: `Projeler/Sosyal_Medya_Dubai_Gayrimenkul/leads.csv`) dosyayı kaydet.
