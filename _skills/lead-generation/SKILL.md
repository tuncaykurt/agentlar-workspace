---
name: lead-generation
description: |
  Apify odaklı, tek API anahtarı ile B2B/B2C, Yerel İşletme ve Topluluk (Skool vb.) Lead toplama skill'i.
  Farklı platformlardan hedef kitle bulur ve kapsamlı iletişim bilgilerini (e-posta, sosyal medya, telefon) zenginleştirir (Enrichment). 
  Hunter.io ve Apollo.io zorunluluğunu kaldırır.
---

# Lead Generation — Kapsamlı Lead Bulma ve Zenginleştirme Skill'i

Bu skill, hedef kitle (B2B, B2C, Influencer, Topluluk Üyesi) ve onların iletişim bilgilerini (E-posta, Telefon, Sosyal Medya) bulmak için **Apify** merkezli bir mimari kullanır.
İşletmecilerin kullanmasını kolaylaştırmak için **tek bir API anahtarı** (Apify) üzerinden çalışacak şekilde tasarlanmıştır.

---

## 🔑 Kimlik Bilgileri & Önceliklendirme

Sistemin ana motoru Apify'dır. Diğer araçlar (Hunter/Apollo) sadece yedek (fallback) amaçlıdır.

1. **ÖNCELİKLİ (ZORUNLU): Apify API Key**
   - Kaynak: `_knowledge/api-anahtarlari.md` ([İSİM] Ana Hesap veya Yedek Hesap)
   - Kullanım: Arama, kazıma (scraping), e-posta/telefon zenginleştirme (enrichment) işlemleri.

2. **YEDEK (OPSİYONEL): Hunter.io & Apollo.io**
   - Kaynak: `_knowledge/api-anahtarlari.md`
   - Kullanım: Eğer Apify limitleri dolmuşsa VEYA spesifik bir B2B kişi e-postası bulunamıyorsa fallback olarak kullan. (Öncelik her zaman Apify'dır).

---

## 📦 Apify Actor Kataloğu — Hangi İşe Hangi Aktör?

Kullanıcının isteğini analiz et ve **doğru aktörü (veya aktör kombinasyonunu)** seç.

### 🏢 1. B2B & ŞİRKET LEAD'LERİ

| Model / Actor ID | Ne Zaman Kullan? | Beklenen Çıktı | Durum |
|---|---|---|---|
| **`anchor/linkedin-profile-enrichment`** | LinkedIn profil URL'lerinden detaylı kişi bilgisi çekmek için. **Login/Cookie GEREKMEZ.** API üzerinden çalışır. ✅ TEST EDİLDİ | İsim, Unvan, Deneyimler, Eğitim, Şirket Adı/Sektörü/Büyüklüğü, Şirket Web Sitesi | ✅ Aktif |
| `harvestapi/linkedin-profile-search-scraper-no-cookies` | LinkedIn'de kişi aramak ve detaylı profil verilerini (Deneyim, Eğitim) "Loginsiz" çekmek için. | LinkedIn Profil Detayları | ✅ Aktif |
| `code_crafter/leads-finder` | Sektör, Lokasyon, Unvan ile toplu B2B lead listesi oluşturma (Apollo alternatifi). | İsim, E-posta, LinkedIn, Şirket | ⚠️ **Sadece ücretli Apify planında API erişimi var. Free planda sadece Apify web arayüzünden çalışır.** |


### 📍 2. YEREL İŞLETMELER (Google Maps)

| Model / Actor ID | Ne Zaman Kullan? | Beklenen Çıktı |
|---|---|---|
| `compass/crawler-google-places` | "Dubai diş klinikleri", "İstanbul gayrimenkul ofisleri" gibi lokasyon bazlı firma aramalarında. (Apify'ın en iyi Maps aktörü). | Firma Adı, Adres, Telefon, Yorum Sayısı, **Web Sitesi** |

### 👤 3. TOPLULUK & KURSLAR (Skool vb.)

| Model / Actor ID | Ne Zaman Kullan? | Beklenen Çıktı |
|---|---|---|
| `memo23/skool-members-scraper` | Skool.com gibi yeni nesil platformlardaki grup üyelerini (potansiyel girişimciler/müşteriler) bulmak için. *(Not: Genelde üyelik çerezleri/cookies gerektirebilir)*. | Üye Profilleri, Bio, Sosyal Medya Linkleri |

### 📱 4. B2C & SOSYAL MEDYA (Influencer, Trend)

| Model / Actor ID | Ne Zaman Kullan? | Beklenen Çıktı |
|---|---|---|
| `apify/instagram-profile-scraper` | Belirli hedef kitlenin/influencer'ın takipçilerini, profillerini ve biousunu çekmek için. | Instagram Profil Metrikleri, Bio (bazen E-posta) |
| `clockworks/tiktok-user-search-scraper` | Belirli anahtar kelimelerle TikTok'ta içerik üreten kişileri bulmak için. | TikTok Profilleri |
| `streamers/youtube-scraper` | YouTube kanallarını ve metriklerini çekmek için. | Kanal Verileri, Abone Sayısı |

### 🔍 5. ZENGİNLEŞTİRME (ENRICHMENT - EKRANIN GİZLİ KAHRAMANI)

**DİKKAT:** Bir web sitesi (domain) elinde varsa *asla başka yere gitme*, doğrudan bu aktörü kullan!

| Model / Actor ID | Ne Zaman Kullan? | Beklenen Çıktı |
|---|---|---|
| **`vdrmota/contact-info-scraper`** | G.Maps veya Şirket aramalarından dönen **Web Sitesi (URL)** listesinden iletişim bilgisi çıkarmak. | E-posta, Doğrulanmış Telefon, Tüm Sosyal Medya Linkleri |
| `email-extractor` | *Sadece* web sitelerinden salt e-posta adresi toplamaya odaklanıldığında (contact-info-scraper her zaman önceliklidir). | Sadece E-posta adresleri |

---

## 🧠 Model Seçim Mantığı ve Algoritması

```
Kullanıcı ne istiyor?
│
├── 🏢 "Bize potansiyel müşteri/şirket listesi lazım (örn. E-ticaret Ajansları)"
│   ├── LinkedIn profil URL'leri varsa → anchor/linkedin-profile-enrichment ile zenginleştir (✅ API'den çalışır, Cookie gerektirmez)
│   ├── Ücretli Apify planı varsa → code_crafter/leads-finder ile toplu liste çıkar
│   └── Şirket web sitesi varsa → vdrmota/contact-info-scraper ile e-posta/telefon bul. (Pipeline: b2b-apollo-alternative)
│
├── 📍 "Şu bölgedeki işletmeleri ve iletişim bilgilerini bul (örn. İzmir Otelleri)"
│   └── 1. compass/crawler-google-places ile firmaların Web Sitelerini topla.
│       2. vdrmota/contact-info-scraper ile sitelerden E-posta/Telefon/Sosyal medya çek. (Pipeline: local-business-maps)
│
├── 👥 "Şu Skool grubundaki veya topluluktaki kişileri bul"
│   └── Skool grubuna özel scraper'ları kullan. (Pipeline: community-skool)
│
├── 📱 "İçerik üretenleri / Influencer'ları bul (örn. Dubai Gayrimenkul tiktokçuları)"
│   └── clockworks/tiktok-user-search-scraper veya Instagram alternatifini kullan. (Pipeline: social-media-influencers)
│
└── 🌐 "Şu 10 web sitesinin e-postalarını bul"
    └── vdrmota/contact-info-scraper ile doğrudan içeriye gir. (Pipeline: local-business-maps ile aynı zenginleştirme mantığı)
```

---

## 🔄 Asenkron Apify Görev Modeli (Doğrudan HTTP / Python Requests)

Apify görevleri zaman alabilir (asenkron). Koddaki karmaşayı önlemek ve ek kütüphane gereksinimini kaldırmak için standart `requests` kullanılır. Akış her zaman üç adımdır:

### Adım 1: Görevi Başlatma (Run Actor)
```python
import requests
import time

APIFY_TOKEN = "{_knowledge/api-anahtarlari.md den alınır}"
ACTOR_ID = "kullanilacak~actor-id"  # ⚠️ DİKKAT: API'de slash (/) YERİNE tilde (~) kullan!

url = f"https://api.apify.com/v2/acts/{ACTOR_ID}/runs"
headers = {"Authorization": f"Bearer {APIFY_TOKEN}"}
payload = {
    # Aktöre özel input parametreleri (Örn: "searchStrings": ["dentist"], "maxPlaces": 10)
}

response = requests.post(url, headers=headers, json=payload)
run_data = response.json()
run_id = run_data["data"]["id"]
print(f"Görev başladı. Run ID: {run_id}")
```

### Adım 2: Durum Sorgulama (Polling)
```python
poll_url = f"https://api.apify.com/v2/actor-runs/{run_id}"

while True:
    status_response = requests.get(poll_url, headers=headers).json()
    status = status_response["data"]["status"]
    
    if status == "SUCCEEDED":
        default_dataset_id = status_response["data"]["defaultDatasetId"]
        break
    elif status in ["FAILED", "ABORTED", "TIMED-OUT"]:
        raise Exception(f"Hesaplama hatası! Durum: {status}")
        
    time.sleep(10) # 10 saniye bekle
```

### Adım 3: Sonuçları Çekme (Dataset)
```python
dataset_url = f"https://api.apify.com/v2/datasets/{default_dataset_id}/items"
results_response = requests.get(dataset_url, headers=headers)
results = results_response.json()
# Artık elinizde bir liste dictionary objesi var.
```

---

## 🚀 Uçtan Uca Pipeline'lar

Gelişmiş senaryolar için tek bir aktör yetmez, verilerin bir aktörden çıkıp (Örn: Google Maps Web Siteleri) diğerine girmesi (Örn: İletişim Zenginleştirme) gerekir. Bu adımları `pipelines/` dizinindeki dokümanlara göre uygula:
1. `pipelines/b2b-apollo-alternative.md` -> Şirket & Unvan bazlı E-posta bulma
2. `pipelines/local-business-maps.md` -> Niş İşletme (Maps) -> Web Adresi -> E-posta/Telefon/Sosyal zenginleştirme
3. `pipelines/community-skool.md` -> Eğitim platformlarındaki (Skool vb.) grup üyeleri
4. `pipelines/social-media-influencers.md` -> Sosyal platform içerik üreticileri

---

## 🔧 Bilinmeyen Senaryolar ve Esneklik Hazırlığı

İşletmeciler bazen çok niş veya farklı bir platformdan (örn: Eventbrite, özel bir emlak sitesi, Sarı Sayfalar vb.) veri isteyebilir. Bu durumda:

1. **Önce Hazır Aktör Ara**: Apify Store'da o platform için yapılmış özel aktör var mı kontrol et. (Eğer direkt bulamıyorsan Google'dan "*Apify actor platformadi*" gibi ara).
2. **Genel Scraper Kullan (Eğer Özel Yoksa)**: `apify/web-scraper` veya `apify/cheerio-scraper` ile genel CSS seçicileri yazarak veriyi kazı.
3. **LLM Destekli Ayıklama**: Alınan karmaşık metin/HTML verilerini doğrudan kendi analiz yeteneğinle parse edip (örneğin Regex veya LLM Extraction) JSON'a dönüştür. Yapıyı esnek tut.

---

## ❌ Hata Yönetimi

| Hata / Durum | Çözüm Adımı |
|---|---|
| Apify `402 Payment Required` VEYA Kredi Tükendi | `_knowledge/api-anahtarlari.md`'den **yedek hesabın API token'ına** geç. Aksi halde işlemi durdurup kullanıcıdan izin/yeni token iste. |
| Aktör Sonuç Döndürmedi (0 öğe) | Payload (input) parametreleri çok spesifik olabilir. Arama terimlerini genel tut veya aktörün input şemasını tekrar kontrol et. (Örnek: `maxResults` vs `resultsLimit` hatası). |
| `contact-info-scraper` çok yavaş | Sitelerin tam taranması zaman alır. Bütçe/kredi dostu olması için parametrelerde derinlik (`maxDepth`) veya limit (`maxPagesPerDomain`) kısıtlaması getir. |
| B2B Kişi Bulunamadı | (Fallback) Ancak o zaman Apify'ı bırakıp Hunter.io (domain bazlı e-posta tahmini) veya Apollo aramayı devreye sok. |

---

## 📁 Dosya ve Çıktı Standardizasyonu

Kullanıcıya her zaman kolay okunabilir bir format sunmalısın.

1. **Geçici Veriler (`.json`)**: Elde edilen tüm ham Apify dataset'leri `Projeler/` klasörü altında ilgili spesifik bir dizinde JSON olarak saklanmalıdır (Hata takibi için).
2. **Temizlenmiş Çıktı (`.csv` veya `.xlsx`)**: Kullanıcıya sunulacak liste, lüzumsuz key'lerden arındırılmalı. Sadece şu sütunlar (varsa) olmalıdır:
   `Name | Company | Role | Email | Web URL | Phone | LinkedIn | Instagram`
3. Bulunan lead sayısı, ne kadarına e-posta eklenebildiği (enrichment oranı) vb. başarı metriklerini raporla.
