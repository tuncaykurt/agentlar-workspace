# 🤝 Marka İş Birliği — Otomatik Outreach Sistemi

Markalarla iş birliği kurma, kişiselleştirilmiş outreach gönderimi ve follow-up yönetim sistemi.

**Repo:** [github.com/[GITHUB_KULLANICI]/marka-is-birligi](https://github.com/[GITHUB_KULLANICI]/marka-is-birligi)

---

## 📌 Amaç

[İSİM SOYAD]'in influencer olarak AI/teknoloji markalarıyla iş birliği kurmak için kullandığı **tam otomatik outreach pipeline'ıdır**. Rakip influencer'ların reels'lerini analiz ederek yeni markaları keşfeder, iletişim bilgilerini bulur, GPT-4.1 ile kişiselleştirilmiş email üretir ve 3 adımlı email sequence ile takip eder.

## 🔄 Pipeline Akışı

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  1. Scrape    │ →  │  2. Analyze   │ →  │  3. Find Contacts │ →  │  4. Personalize   │ →  │  5. Send Email    │
│  (Apify)      │    │  (AI Brand    │    │  (Apollo + Hunter) │    │  (GPT-4.1-nano)   │    │  (Gmail API)      │
│               │    │   Detection)  │    │                    │    │                    │    │                    │
└──────────────┘    └──────────────┘    └──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Detaylı Adımlar

1. **Scrape** (`scraper.py`) — Apify ile rakip influencer'ların son reels'lerini çeker
2. **Analyze** (`analyzer.py`) — Caption + mention analiziyle yeni AI markaları keşfeder, false positive/bilinen marka filtresi uygular
3. **Find Contacts** (`contact_finder.py`) — 5 adımlı pipeline:
   - Apollo.io → influencer/partnerships/marketing pozisyonundaki kişiyi bul
   - Hunter.io Email Finder → kişinin emailini bul
   - Hunter.io Domain Search → fallback olarak domain genelinde ara
   - Hunter.io Email Verify → emaili doğrula (sadece `deliverable`/`accept_all` kabul)
   - Doğrulanamayan email → gönderilmez
4. **Personalize** (`personalizer.py`) — GPT-4.1-nano ile markaya özel email üretir, profesyonel signature ekler
5. **Send** (`outreach.py`) — Gmail API ile gönderim, günlük 20 email limiti, CSV'ye kayıt

### 3 Adımlı Email Sequence

| Adım | Zamanlama | Modül | Açıklama |
|------|-----------|-------|----------|
| **İlk Outreach** | Pazartesi 10:00 TR | `outreach.py` | Kişiselleştirilmiş iş birliği teklifi |
| **Follow-up 1** | +5 gün | `followup.py` | Markanın son paylaşımlarına referans veren takip |
| **Follow-up 2** | +5 gün daha | `followup.py` | Nazik kapanış, cevap yoksa `Not_Interested` |

### Ek Mekanizmalar

- **Response Checker** (`response_checker.py`) — Her pipeline/follow-up çalışmadan önce outreach thread'lerini tarar, gelen yanıtları ve bounce'ları tespit eder
- **Reporter** (`reporter.py`) — Haftalık Telegram raporu (outreach sayısı, follow-up, response istatistikleri)

---

## 📂 Proje Yapısı

```
Marka_Is_Birligi/
├── README.md                          ← Bu dosya
├── railway_scheduler.py               ← Railway üzerinde çalışan zamanlayıcı
├── railway.json                       ← Railway deploy konfigürasyonu
├── requirements.txt                   ← Python bağımlılıkları
├── .gitignore                         ← data/ klasörü gitignore'da (hassas veri)
│
├── src/                               ← Ana kaynak kodlar
│   ├── __init__.py
│   ├── scraper.py                     ← Apify ile rakip reels scraping
│   ├── analyzer.py                    ← AI marka keşfi + mention analizi
│   ├── contact_finder.py              ← Apollo.io + Hunter.io iletişim bulma (5 adımlı pipeline)
│   ├── personalizer.py                ← GPT-4.1-nano ile email kişiselleştirme
│   ├── outreach.py                    ← İlk outreach gönderimi + pipeline orkestrasyon
│   ├── followup.py                    ← 3 adımlı follow-up sequence (5+5 gün)
│   ├── response_checker.py            ← Yanıt/bounce tespiti
│   ├── gmail_sender.py                ← Gmail API gönderim + reply-in-thread desteği
│   ├── reporter.py                    ← Haftalık Telegram raporu
│   └── mail_sender.py                 ← ⚠️ LEGACY — kullanılmıyor
│
├── config/
│   ├── kampanya.yaml                  ← Kampanya konfigürasyonu
│   ├── rakipler.csv                   ← Takip edilen rakip influencer listesi
│   └── settings.py                    ← ⚠️ LEGACY — referans amaçlı
│
├── data/                              ← 🔒 .gitignore'da (hassas/dinamik veri)
│   ├── markalar.csv                   ← Ana veritabanı: marka listesi + outreach durumları
│   └── calisan_markalar.json          ← Zaten çalışılan markaların listesi (dedup için)
│
├── mail_templates/
│   ├── collaboration_tr.html          ← Türkçe HTML şablonu (fallback)
│   ├── collaboration_en.html          ← İngilizce HTML şablonu (fallback)
│   ├── followup_en.html               ← Follow-up şablonu (fallback)
│   └── ornekler/                      ← Örnek email'ler
│
├── markalar/
│   ├── eski-markalar                  ← Geçmiş marka listesi
│   └── marka-isimleri                 ← Aktif marka isimleri
│
└── [isim]-tanitim                    ← Influencer tanıtım dosyası
```

---

## ⏰ Railway Zamanlama

Proje Railway üzerinde 7/24 çalışan bir scheduler servisi olarak deploy edilmiştir.

| Gün | Saat (TR) | Görev |
|-----|-----------|-------|
| **Pazartesi** | 10:00 | Haftalık Pipeline (scrape → analyze → contact → outreach) |
| **Perşembe** | 10:00 | Follow-Up kontrolü (5+ gün cevapsız markalara reply) |
| **Cuma** | 10:00 | Haftalık rapor (Telegram özeti) |

> Her pipeline ve follow-up çalışmasından **önce** otomatik olarak Response Check yapılır (yanıt/bounce tespiti).

### Deploy Konfigürasyonu

```json
{
  "deploy": {
    "startCommand": "python railway_scheduler.py",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Health Check

Railway health check endpoint'i `GET /` üzerinden JSON durum bilgisi döndürür:
- Uptime, son çalışma sonucu, bir sonraki çalışma zamanı, toplam hata sayısı

---

## 🔑 Gerekli API Anahtarları

| Servis | Env Variable | Kullanım |
|--------|-------------|----------|
| **Apify** | `APIFY_TOKEN` | Rakip reels scraping |
| **Apollo.io** | `APOLLO_API_KEY` | Kişi arama (pozisyon bazlı) |
| **Hunter.io** | `HUNTER_API_KEY` | Email bulma + doğrulama |
| **OpenAI** | `OPENAI_API_KEY` | GPT-4.1-nano ile kişiselleştirme |
| **Gmail OAuth** | `GOOGLE_OUTREACH_TOKEN_JSON` | Email gönderim (Railway'de base64 encoded) |
| **Telegram** | `TELEGRAM_BOT_TOKEN` | Haftalık rapor bildirimi |

> Token'lar merkezi depoda: `_knowledge/credentials/master.env`

---

## 🔗 Antigravity Entegrasyonu

Bu proje Antigravity ekosisteminin bir parçasıdır:

| Bileşen | Yol | İlişki |
|---------|-----|--------|
| **Müşteri Kazanım Agenti** | `_agents/musteri-kazanim/AGENT.md` | Orkestrasyon |
| **Lead Generation Skill** | `_skills/lead-generation/SKILL.md` | Marka bulma |
| **E-posta Gönderim Skill** | `_skills/eposta-gonderim/SKILL.md` | Mail gönderim motoru |
| **API Anahtarları** | `_knowledge/api-anahtarlari.md` | Credential'lar |
| **Şifre Yönetici** | `_skills/sifre-yonetici/SKILL.md` | Token yönetimi |

### Slash Command'lar

- **`/marka-outreach`** — Tam pipeline: lead bulma + kişiselleştirme + gönderim
- **`/lead-toplama`** — Sadece marka lead toplama
- **`/mail-gonder`** — Sadece mail gönderme

---

## 📊 CSV Veri Modeli (`data/markalar.csv`)

Her satır bir markayı temsil eder. Önemli sütunlar:

| Sütun | Açıklama |
|-------|----------|
| `lead_id` | Benzersiz ID (MIB-001, MIB-002...) |
| `marka_adi` | Marka adı |
| `instagram_handle` | Instagram kullanıcı adı |
| `email` | Doğrulanmış iletişim emaili |
| `email_status` | `verified`, `not_found`, `bounced`, `failed_verification:*` |
| `outreach_status` | `New` → `Sent` → `Replied` / `Bounced` / `Not_Interested` |
| `outreach_thread_id` | Gmail thread ID (reply chain için) |
| `followup_status` | Follow-up 1 durumu |
| `followup2_status` | Follow-up 2 durumu |

---

## ⚠️ Legacy Dosyalar

Aşağıdaki dosyalar eski bağımsız yapıdan kalmadır ve **aktif olarak kullanılmaz**:

- `config/settings.py` — Eski konfigürasyon
- `src/mail_sender.py` — Eski mail gönderim modülü (yerini `gmail_sender.py` + `outreach.py` aldı)
