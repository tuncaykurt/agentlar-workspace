# B2B Lead Bulma Pipeline

Acente müşterileri, yazılım firmaları veya belirli bir unvandaki karar vericileri (CEO, Kurucu vb.) bulmak gerektiğinde bu pipeline kullanılır.

## 🎯 Hedef
Dünya genelindeki veya belirli bir lokasyondaki B2B şirketleri ve bu şirketlerde çalışan hedef karar vericileri (Profil, Deneyim, Şirket bilgileri) ile birlikte liste halinde sunmak.

## ⚙️ Kullanılacak Aktörler (Test Edilmiş, Doğrulanmış)

| Aktör | API Erişimi | Cookie | Not |
|---|---|---|---|
| **`anchor/linkedin-profile-enrichment`** | ✅ Free plan | ❌ Gerekmez | **BİRİNCİL AKTÖR.** LinkedIn profil URL'lerinden zengin kişi verisi çeker. |
| `harvestapi/linkedin-profile-search-scraper-no-cookies` | ✅ Free plan | ❌ Gerekmez | LinkedIn'de anahtar kelime ile profil arama. |
| `code_crafter/leads-finder` | ⚠️ Sadece ücretli plan | ❌ Gerekmez | Apollo alternatifi. Free planda API'den çalışmaz, sadece Apify web UI'den çalışır. |
| `vdrmota/contact-info-scraper` | ✅ Free plan | ❌ Gerekmez | Şirket web sitelerinden e-posta/telefon/sosyal medya çeker (Zenginleştirme). |

---

## 🚀 Adım Adım İşleyiş (Agent Talimatları)

### YOL A: LinkedIn Profil URL'leri Varsa (En Hızlı Yol) ✅ TEST EDİLDİ

#### Adım 1: Profil URL Listesini Topla
İşletmeci sana "Bu 10 kişinin bilgilerini çek" veya LinkedIn arama sonuçlarından URL listesi verdiğinde:

```python
import requests, time

APIFY_TOKEN = "{_knowledge/api-anahtarlari.md den alınır}"
ACTOR_ID = "anchor~linkedin-profile-enrichment"  # Tilde (~) kullan!

payload = {
    "profileUrls": [
        "https://www.linkedin.com/in/hedef-kisi-1/",
        "https://www.linkedin.com/in/hedef-kisi-2/"
    ],
    "cookie": ""  # Cookie GEREKMEZ
}

url = f"https://api.apify.com/v2/acts/{ACTOR_ID}/runs"
headers = {"Authorization": f"Bearer {APIFY_TOKEN}", "Content-Type": "application/json"}
response = requests.post(url, headers=headers, json=payload).json()
run_id = response["data"]["id"]
```

#### Adım 2: Sonucu Bekle (Polling)
Standart Apify polling mantığı ile 10 saniyede bir `SUCCEEDED` bekle. Genelde 10-30 saniye sürer.

#### Adım 3: Veriyi Çek ve Temizle
**Dönen JSON Formatı (✅ Gerçek Test Sonucu):**
```json
{
  "full_name": "Kişi Adı",
  "first_name": "Ad",
  "last_name": "Soyad",
  "headline": "Unvan",
  "summary": "Özet",
  "country": "Ülke",
  "city": "Şehir",
  "experiences": [{"title": "CEO", "company": "Şirket", "starts_at": "2020"}],
  "education": [{"school": "Üniversite"}],
  "company_name": "Mevcut Şirket",
  "company_industry": "Sektör",
  "company_website": "https://...",
  "company_size": "11-50",
  "url": "https://linkedin.com/in/..."
}
```

**Saklanacak (Formatlanacak) Alanlar:**
- Kişi Adı (`full_name`)
- Unvan (`headline`)
- Şirket Adı (`company_name`)
- Sektör (`company_industry`)
- Şirket Web Sitesi (`company_website`)
- Şirket Büyüklüğü (`company_size`)
- LinkedIn URL (`url`)

### YOL B: Şirket Web Siteleri Varsa (Enrichment Yolu)

Eğer elinde sadece şirket web siteleri varsa (Google Maps'ten veya başka bir kaynaktan):

1. Web sitesi listesini `vdrmota~contact-info-scraper`'a gönder
2. E-posta, telefon ve sosyal medya hesaplarını çek
3. (Bu akış `pipelines/local-business-maps.md` ile aynı zenginleştirme mantığını kullanır)

### YOL C: Sıfırdan B2B Arama (Ücretli Plan veya Apify UI)

Eğer ücretli Apify planı varsa `code_crafter~leads-finder` kullanılabilir:
```python
ACTOR_ID = "code_crafter~leads-finder"
payload = {
    "jobTitles": ["Founder", "CEO"],
    "locations": ["Dubai"],
    "industries": ["Real Estate"],
    "maxResults": 100
}
```
⚠️ **Free planda bu aktör API üzerinden çalışmaz.** Alternatif olarak Apify web arayüzünden manuel çalıştırılabilir.

---

## 💡 Fallback (İkinci Plan) — Eğer Apify Yetersiz Kalırsa?

1. **Hunter.io API**: Şirket domain'i üzerinden e-posta tahmini yapabilir. (`_knowledge/api-anahtarlari.md`'den API key al)
2. **Apollo.io API**: B2B kişi ve şirket arama. (`_knowledge/api-anahtarlari.md`'den API key al)

Bu araçlar ücretlidir ve sadece Apify çözüm üretemediğinde devreye girer.
