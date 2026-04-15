# Topluluk (Skool) Pipeline

Skool.com, girişimciler, yatırımcılar veya özel eğitim gruplarından yüksek kaliteli ve niş lead toplamak için 2024 sonrasının en etkili platformlarındandır. Bu pipeline bir Skool grubundaki tüm üyeleri (Members) profil ve iletişim bilgileriyle ayıklamak için kullanılır.

## 🎯 Hedef
Skool.com üzerinde yer alan, spesifik ilgi alanları olan (örn: Real Estate Investing, B2B SaaS Founders vb.) Private veya Public bir gruptaki üyeleri kazımak ve sosyal medya hesaplarını bulmak.

## ⚙️ Kullanılacak Aktörler
- **Ana Aktör:** `memo23/skool-members-scraper` 
- *(Önemli Not: Belirtilen URL'deki Skool grubuna kullanıcının erişimi/üyeliği olması gerekebilir. Gerekli durumlarda Cookie session json'u istenmelidir.)*

---

## 🚀 Adım Adım İşleyiş (Agent Talimatları)

### Adım 1: Grup URL'si ve Parametrelerin Alınması
Kullanıcı "Skool'daki X grubunun üyelerini istiyorum" dediğinde hedef URL'yi (Örn: `https://www.skool.com/x-group`) belirle.

```python
payload_skool = {
    "startUrls": [{"url": "https://www.skool.com/x-group/about"}],
    "scrapeMembers": True,
    "scrapePosts": False, 
    "maxDepth": 1,
    "loginCookies": [] # Kapalı gruplar için bunu "_knowledge/skool-cookies.json" dan okumasını isteyebilirsin. (Eğer Skool Public bir grupsa Cookie Gerekmez).
}
```

### Adım 2: API İsteğini Gönder (Run Actor)
Skool scraper aktörünü standart Apify POST yöntemi ile tetikle.

### Adım 3: Sonucu Bekle (Polling)
Skool aramaları, grup büyüklüğüne göre değişir. (1.000 kişilik grup ortalama 3-5 dk sürebilir). 10 sn'lik poll mantığıyla bekle.

### Adım 4: Veriyi Çek ve Temizle (JSON Parse)
Skool platformu e-postayı nadiren doğrudan verir ancak kişilerin profillerini ve Facebook, Instagram, LinkedIn, X bağlarını verir. Amacımız bunları düzgün toplamaktır.

**Müşteriye Sunulacak Temiz Sütunlar:**
- Kişi Adı (`name`)
- Biyografi (`bio` / `headline`) -> Lead filtrelerken çok önemlidir. (Örn: "Founder at X")
- Topluluktaki Rolü (`admin` / `member`)
- Level/Puan (`level` / `points`) -> En aktif üyeleri (High Value Lead) bulmayı sağlar.
- **LinkedIn Linki** (Sosyal)
- **Instagram Linki** (Sosyal)
- **X / Twitter Linki** (Sosyal)
- Skool Profil Linki

### Adım 5: Gelişmiş Zenginleştirme (Optional Lead Scoring)
Elde edilen veride, eğer `Level > 5` (çok aktif kullanıcı) olanlar filtrelenir ve LinkedIn/Instagram linklerine sahip olanlar önceliklendirilerek müşteriye verilir. Veya direkt bir webhook/bot üzerinden müşterinin CRM'ine gönderilir.

### Adım 6: Excel/CSV Oluştur.
CSV dosyasını `Projeler/` altındaki klasöre kaydet. Yüksek Puanlı/Aktif üyeleri ayırmak için CSV'yi Level'a (Points) göre büyükten küçüğe doğru (descending) sırala.
