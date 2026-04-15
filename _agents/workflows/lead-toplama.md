---
description: Lead toplama — Apify, Hunter.io ve Apollo.io ile hedef profil ve e-posta listesi oluştur
---

# 🎯 Lead Toplama

> **Agent:** Bu workflow `_agents/musteri-kazanim/AGENT.md` agent'ının bir parçasıdır.
> Agent'ın 5 adımlı pipeline'ındaki **Adım 1 (Lead Bulma)** ve **Adım 2 (Email Toplama)** süreçlerini kapsar.
> Tek başına `/lead-toplama` komutuyla da çalıştırılabilir.

Instagram, TikTok, YouTube, LinkedIn, Google Maps ve topluluk platformlarından hedef profil toplama, ICP filtreleme, e-posta zenginleştirme ve CSV standardizasyonu.

---

## Gerekli Skill

`_skills/lead-generation/SKILL.md` → **ÖNCE OKU** — Apify aktör kataloğu, karar ağacı ve enrichment pipeline detayları burada.

## Gerekli Kaynaklar

| Kaynak | Yol | Açıklama |
|--------|-----|----------|
| Lead Generation Skill | `_skills/lead-generation/SKILL.md` | Apify aktörleri ve pipeline mantığı |
| API Anahtarları | `_knowledge/api-anahtarlari.md` | Apify, Hunter.io, Apollo.io tokenları |
| Agent Yönergesi | `_agents/musteri-kazanim/AGENT.md` | Orkestrasyon ve ICP detayları |
| Kampanya Config'leri | `_agents/musteri-kazanim/config/` | Hazır kampanya YAML'ları |
| Kampanya Başlatma Scripti | `_agents/musteri-kazanim/scripts/kampanya_baslat.py` | Lead bulma + email toplama birleşik script |

---

## Adımlar

### Adım 0: Kampanya Config Seçimi

> ℹ️ **Bağımsız kullanımda:** Config yoksa kullanıcıya ICP bilgilerini sor ve parametreleri manuel belirle.
> **Agent üzerinden çalışırken:** YAML config dosyası zaten mevcut olacaktır.

1. **Mevcut config var mı?**
   - EVET → `_agents/musteri-kazanim/config/` altından uygun YAML'ı seç:
     - `bugra-influencer.yaml` — Türk influencer araması
     - `sweatcoin-outreach.yaml` — Sweatcoin marka iş birliği
     - `creative-sourcing.yaml` — İtalyan UGC creator
     - `ornek-kampanya.yaml` — Yeni kampanya şablonu
   - HAYIR → Kullanıcıdan şu bilgileri al:
     - Hedef tip: `influencer` / `b2b_sirket` / `ugc_creator` / `yerel_isletme` / `topluluk`
     - Platform: Instagram / TikTok / YouTube / LinkedIn / Google Maps / Skool
     - Bölge ve dil
     - Min/max takipçi veya şirket büyüklüğü
     - Anahtar kelimeler / hashtag'ler

2. **Config'den parametreleri oku:**
   ```yaml
   kampanya_adi: "..."
   hedef_tip: "..."
   icp:
     platform: [...]
     bolge: "..."
     dil: [...]
     minimum_takipci: ...
     maksimum_takipci: ...
   arama:
     anahtar_kelimeler: [...]
     hashtag_listesi: [...]
     max_lead_sayisi: ...
   ```

---

### Adım 1: Platform Belirleme ve Apify Actor Seçimi

Hedef tipe ve platforma göre doğru Apify aktörünü seç:

| Hedef Tip | Platform | Apify Aktör | Kullanım |
|-----------|----------|-------------|----------|
| `influencer` | Instagram | `apify/instagram-profile-scraper` | Profil detayları (bio, followers, email) |
| `influencer` | Instagram | `apify/instagram-search-scraper` | Anahtar kelime / hashtag ile arama |
| `influencer` | TikTok | `clockworks/tiktok-user-search-scraper` | TikTok kullanıcı araması |
| `influencer` | YouTube | YouTube scraper aktörü | YouTube kanal araması |
| `b2b_sirket` | LinkedIn | `anchor/linkedin-profile-enrichment` | LinkedIn profil zenginleştirme |
| `b2b_sirket` | Web | `code_crafter/leads-finder` | Web tabanlı B2B lead bulma |
| `yerel_isletme` | Google Maps | `compass/crawler-google-places` | Yerel işletme tarama |
| `topluluk` | Skool | `memo23/skool-members-scraper` | Topluluk üye tarama |

**Karar mantığı:**
```
Config'den hedef_tip oku
  │
  ├─ influencer → platform'a bak → Instagram/TikTok/YouTube aktörü
  ├─ b2b_sirket → LinkedIn aktörü VEYA web leads-finder
  ├─ yerel_isletme → Google Maps aktörü
  └─ topluluk → Skool aktörü
```

**Aktör input'unu hazırla:**
- `arama_anahtar_kelimeleri` → aktör'ün `search` parametresine
- `hashtag_listesi` → aktör'ün `hashtags` parametresine
- `max_lead_sayisi` → aktör'ün `maxItems` parametresine
- `bolge` → varsa lokasyon filtresine

---

### Adım 2: Lead Toplama (Scraping)

1. **API anahtarını al:**
   - `_knowledge/api-anahtarlari.md` → Apify token
   - Birden fazla hesap varsa bakiye kontrolü yap

2. **Apify asenkron görev modelini kullan:**
   ```
   POST /v2/acts/{actorId}/runs → Başlat
   GET /v2/actor-runs/{runId} → Polling (RUNNING → SUCCEEDED)
   GET /v2/datasets/{datasetId}/items → Sonuçları çek
   ```

3. **Sonuçları kaydet:**
   - `_agents/musteri-kazanim/data/{kampanya_adi}_raw.json`
   - Bağımsız kullanımda: `data/leads_raw_{YYYY-MM-DD}.json`

4. **Hata yönetimi:**
   - `402 Payment Required` → Yedek Apify hesabına geç
   - 0 sonuç → Arama parametrelerini genişlet ve kullanıcıya bildir
   - Timeout → `maxPagesPerDomain` limitini düşür

---

### Adım 3: ICP Filtresi

Ham sonuçlardan ICP'ye uymayanları filtrele:

- **Takipçi filtresi:** `minimum_takipci` ≤ takipçi ≤ `maksimum_takipci`
- **Dil filtresi:** Bio dili `icerik_dili` listesinde mi?
- **Bölge filtresi:** Profil bölgesi `bolge` ile uyumlu mu?
- **Bot/fake kontrolü:** Şüpheli oran (çok yüksek takipçi, düşük etkileşim) → filtrele
- **Duplicate kontrolü:** Aynı handle veya profil URL → tek kayıta düşür

**Çıktı:** Filtrelenmiş lead listesi

---

### Adım 4: E-posta Zenginleştirme (Enrichment)

3 katmanlı waterfall stratejisi ile e-posta bulma:

```
Her lead için:
  │
  ├─ 1. BİO / BUTON EMAIL (ücretsiz, en hızlı)
  │     Instagram bio'sunda veya business butonunda email var mı?
  │     ├─ EVET → email_kaynagi: "bio" → sonraki lead'e geç
  │     └─ HAYIR ↓
  │
  ├─ 2. WEB SİTESİ ENRICHMENT (Apify — düşük maliyet)
  │     Profilin web sitesi var mı?
  │     ├─ EVET → `vdrmota/contact-info-scraper` ile tara
  │     │         ├─ Email bulundu → email_kaynagi: "website"
  │     │         └─ Email bulunamadı ↓
  │     └─ HAYIR ↓
  │
  ├─ 3a. HUNTER.IO (domain bazlı — fallback #1)
  │     API: `_knowledge/api-anahtarlari.md` → Hunter token
  │     ├─ deliverable → ✅ havuza
  │     ├─ risky → ⚠️ düşük öncelik
  │     ├─ undeliverable → ❌ listeden çıkar
  │     └─ Bulunamadı ↓
  │
  └─ 3b. APOLLO.IO (B2B kişi arama — fallback #2)
        API: `_knowledge/api-anahtarlari.md` → Apollo token
        ├─ Email bulundu → email_kaynagi: "apollo"
        └─ Bulunamadı → email_durumu: "not_found" → outreach'ten hariç tut
```

**Duplicate e-posta kontrolü:** Aynı e-posta adresi iki kez giremez.

---

### Adım 5: CSV Standardizasyonu ve Kayıt

Tüm lead verilerini standart formata dönüştür:

**Zorunlu sütunlar:**

| Sütun | Açıklama | Tip |
|-------|----------|-----|
| `lead_id` | Benzersiz ID | string |
| `ad` | Ad soyad / kullanıcı adı | string |
| `platform` | Instagram / TikTok / LinkedIn / Web | string |
| `profil_url` | Profil linki | url |
| `takipci` | Takipçi sayısı | integer |
| `email` | Bulunan e-posta | string |
| `email_kaynagi` | Bio / Website / Hunter / Apollo | string |
| `email_dogrulama` | deliverable / risky / undeliverable | string |
| `sirket` | Şirket/marka adı (varsa) | string |
| `dil` | İçerik dili | string |
| `bolge` | Bölge | string |
| `outreach_status` | Pending (başlangıç) | string |
| `notlar` | Serbest not | string |

**Dosya kayıt yolları:**

- **Agent üzerinden:** `_agents/musteri-kazanim/data/{kampanya_adi}_enriched.csv`
- **Bağımsız kullanımda:** Kullanıcının belirlediği yol veya `data/leads_{YYYY-MM-DD}.csv`

**Script ile çalıştırma (opsiyonel):**
```bash
python3 _agents/musteri-kazanim/scripts/kampanya_baslat.py \
  --config _agents/musteri-kazanim/config/{kampanya}.yaml
```

---

## Özet Kontrol Listesi

- [ ] Config seçildi veya parametreler belirlendi
- [ ] Platform ve Apify aktörü seçildi
- [ ] Ham lead'ler toplandı
- [ ] ICP filtresi uygulandı
- [ ] E-posta zenginleştirme tamamlandı (3 katmanlı waterfall)
- [ ] Duplicate kontrolü yapıldı
- [ ] CSV standart formatta kaydedildi
- [ ] Sonuç özeti kullanıcıya raporlandı:
  - Toplam ham lead sayısı
  - ICP'ye uyan sayısı
  - E-posta bulunan sayısı (kaynağa göre dağılım)
  - E-posta bulunamayan sayısı

---

## Sonraki Adım

Lead listesi hazırsa → `/mail-gonder` workflow'unu çalıştır veya agent'ın Adım 3-4-5'ine geç.
