# Sweatcoin Email Automation — Multi-Agent Sistem

## Proje Amacı
Sweatcoin influencer pazarlama operasyonlarını (özellikle Roblox ve Fortnite/V-bucks gibi oyun kanallarına yönelik affiliate programlarını) **otonom bir AI agent sistemi** ile yönetir.

Gelen e-postaları akıllı bir şekilde sınıflandırır, doğru agent'a yönlendirir ve **otomatik draft** oluşturur. Ayrıca Google Sheets üzerinden outreach email gönderimi, statü takibi ve günlük raporlama yapar.

**⚠️ Hiçbir email otomatik gönderilmez — tüm yanıtlar DRAFT olarak oluşturulur, [İSİM] onaylayıp gönderir.**

---

## Mimari

```
📬 Gmail Inbox (EMAIL_ADRESI_BURAYA)
     │
  🧭 Router (Dispatcher)
     ├── Sistem/Bot filtre
     ├── Transactional filtre (MailSuite vb.)
     ├── LLM İlgi analizi (Payment/Business/Irrelevant)
     ├── Thread analizi (biz mi başlattık?)
     ├── LLM Cold outreach tespiti (UGC/Cold/Genuine)
     └── Agent yönlendirme
         │
    ┌────┴────┐
    │         │
 🎬 CS      📱 IP
 Agent      Agent
    │         │
 3 Aşama:  3 Aşama:
 Intent →  Intent →
 Draft →   Draft →
 Review    Review
    │         │
    └────┬────┘
         │
      📝 Gmail Draft
```

Her agent kendi bilgi tabanı, template'leri ve LLM prompt'ları ile çalışır. LLM (Groq API) yoksa rule-based fallback otomatik devreye girer.

---

## Modül Yapısı

```
Swc_Email_Responder/
├── main.py                      # Ana giriş noktası — tüm fonksiyonları orkestre eder
├── railway_scheduler.py         # Railway scheduler — zamanlanmış görevler
├── railway.json                 # Railway deploy konfigürasyonu
├── feedback_engine.py           # AI Backtesting — agent performans ölçümü
│
├── router/                      # Email yönlendirme katmanı
│   ├── dispatcher.py            # Ana dispatcher — 5 adımlı akıllı filtre + agent yönlendirme
│   └── filters.py               # Sistem/bot/cold email filtre fonksiyonları
│
├── agents/                      # AI Agent'lar
│   ├── base_agent.py            # Ortak agent arayüzü
│   ├── creative_sourcing_agent.py  # 🎬 CS Agent — video/içerik iş birliği iletişimi
│   └── influencer_program_agent.py # 📱 IP Agent — affiliate program iletişimi
│
├── outreach/                    # Outreach email pipeline
│   ├── data_fetcher.py          # Kaynak sheet'ten hedef sheet'e veri aktarımı
│   ├── sheet_mailer.py          # Pending kontaklara outreach email gönderimi
│   ├── status_syncer.py         # Gmail thread statülerini Sheet'te güncelleme
│   └── daily_reporter.py       # Günlük outreach raporu (email ile)
│
├── shared/                      # Ortak utility modülleri
│   ├── google_auth.py           # 🔐 Merkezi OAuth — 3 hesap (outreach, swc, [isim]_ai)
│   ├── gmail_client.py          # Gmail API istemcisi (unread, draft, mark_as_read)
│   ├── sheets_client.py         # Google Sheets API istemcisi
│   ├── llm_client.py            # Groq LLM API istemcisi (4 fonksiyon, retry mekanizmalı)
│   ├── notifier.py              # Hata bildirimi (Email + Telegram fallback)
│   ├── credential_health_checker.py  # Credential sağlık kontrolü
│   ├── email_utils.py           # Email yardımcı fonksiyonları
│   └── api_utils.py             # Genel API yardımcıları
│
├── Sweatcoin_Email_Playbook.md  # İş kuralları ve karar akışı dokümanı
├── requirements.txt             # Python bağımlılıkları
├── .env.example                 # Gerekli environment variable şablonu
└── Makefile                     # Yardımcı komutlar (sync-auth vb.)
```

---

## Karar Akışı (Email Responder)

Dispatcher her okunmamış emaili şu sırayla değerlendirir:

| Adım | Kontrol | Aksiyon |
|:-----|:--------|:--------|
| 1 | **Takım üyesi** (`@[ŞİRKET_DOMAIN]`) | IGNORE — UNREAD bırak (manuel yanıtlanacak) |
| 2 | **Sistem/Bot** (Notion, Google, Apify vb.) | Mark as read |
| 2.5 | **Transactional** (MailSuite Daily Report vb.) | Mark as read |
| 2.7 | **LLM İlgi Analizi** — Email [İSİM]'ın işi mi? | PAYMENT_COMPLAINT / BUSINESS_PARTNER / IRRELEVANT → Mark as read |
| 3 | **Thread başlangıcı** — Biz mi başlattık? | Thread'in ilk mesajını kontrol et |
| 4a | **Onlar başlattıysa** → LLM Cold Outreach tespiti | UGC_COLD / COLD_EMAIL → Mark as read |
| 4b | **Onlar başlattıysa** → GENUINE | Agent'a yönlendir |
| 5 | **Biz başlattıysak** → Thread tipi belirle (3 katman) | CS Agent veya IP Agent'a yönlendir |

---

## Agent İşlem Süreci (Her İki Agent İçin)

Her agent aynı 3 aşamalı pipeline'ı takip eder:

1. **Intent Tespiti:** LLM ile yanıtın niyetini analiz et (INTERESTED, PAID_ONLY, NOT_INTERESTED, AUTO_REPLY, BOUNCE, vb.)
2. **Draft Üretimi:** Bilgi tabanı + template hint ile bağlama uygun draft üret
3. **Draft Review:** Düşük confidence'lı draft'ları LLM ile review edip iyileştir

**Sonuç:** Gmail'de DRAFT oluşturulur, email UNREAD kalır → [İSİM] kontrol edip gönderir.

---

## Outreach Pipeline

| Görev | Açıklama | Fonksiyon |
|:------|:---------|:----------|
| **Data Fetch** | Kaynak sheet'ten (`E-mail Çekme`) 100 yeni satırı hedef sheet'e (`YouTube Email Data`) aktar | `main.fetch_daily_emails()` |
| **Outreach Mailer** | Dünkü fetch verilerine outreach email gönder (Sheet'teki `Email Copies` sekmesinden template) | `main.process_outreach_emails()` |
| **Status Syncer** | Gmail thread'lerini kontrol edip Sheet statülerini güncelle (`email sent` → `replied` / `bounced`) | `main.sync_outreach_status()` |
| **Daily Reporter** | Günün mailer + syncer istatistiklerini email olarak gönder | `main.send_daily_report()` |

---

## Scheduler (Railway Cron Job)

Railway üzerinde **Native Cron Job** olarak çalışır. Eskiden sürekli açık kalarak tetiklenen sistem, artık sadece tanımlanan saatlerde uyanır. `railway_scheduler.py` UTC saatini okuyarak hangi işlemlerin yapılması gerektiğine karar verir ve ardından kapanır.

| Görev | TR Saati | UTC Saati | Açıklama |
|:------|:---------|:----------|:---------|
| 🏥 Health Check | 10:00 | 07:00 | Tüm token/API sağlık kontrolü (Sadece günde ilk çalışmada) |
| 📧 Email Responder | 10:00, 14:00, 18:00 | 07:00, 11:00, 15:00 | Inbox'taki emaillere draft oluştur |
| 📥 Data Fetch | 10:00 | 07:00 | Kaynak sheet'ten yeni veri aktar |
| 📨 Outreach + Sync + Rapor | 10:00 | 07:00 | Outreach email gönder + statü güncelle + rapor |

*Not: Hafta sonları görevler çalışmaz. (Railway Cron Expression: `0 7,11,15 * * 1-5`)*

### Sistem Kapanışı
Scriptler işlemleri tamamlar tamamlamaz `sys.exit(0)` ile kendini kapatır (`restartPolicyType: NEVER` zorunludur). Bu sayede sunucu 24 saat fatura yazmaz, maliyet sıfıra yaklaşır.

---

## LLM Entegrasyonu (Groq API)

`shared/llm_client.py` üzerinden **4 LLM fonksiyonu**:

| Fonksiyon | Amaç |
|:----------|:------|
| `classify_thread_type()` | Thread Creative Sourcing mi, Influencer Program mı? |
| `classify_email_relevance()` | Email [İSİM]'ın sorumluluğunda mı? (Payment/Business/Irrelevant) |
| `classify_cold_outreach()` | Inbound email genuine mi, cold pitch mi? |
| `analyze_reply_intent()` | Yanıtın niyeti ne? (INTERESTED, PAID_ONLY, vb.) |
| `generate_draft()` | Bağlama uygun draft email üret |
| `review_and_improve_draft()` | Draft'ı kalite kontrolünden geçir |

**Retry mekanizması:** 3 deneme, exponential backoff, prompt truncation, timeout artırımı.
**Fallback:** LLM çökerse rule-based keyword filtreleri devreye girer.

---

## Feedback Engine (Backtesting)

`feedback_engine.py` — AI agent'ın performansını ölçen offline backtesting sistemi:

1. Gmail'den gerçek thread çiftlerini çeker (creator → [İSİM] yanıtı)
2. AI agent'ı aynı mesaja draft yazması için simüle eder
3. AI draft'ını [İSİM]'ın gerçek yanıtıyla LLM ile karşılaştırır
4. Puan, feedback ve iyileştirme önerisi üretir

Sonuçlar `feedback_results.json` ve `learned_patterns.json`'a kaydedilir.

```bash
python feedback_engine.py               # Son 30 güne bak
python feedback_engine.py --days 60     # Son 60 güne bak
python feedback_engine.py --limit 5     # Sadece 5 thread test et
```

---

## Bildirim Sistemi

`shared/notifier.py` — Kritik hatalarda otomatik bildirim:
- **Öncelik 1:** Email (SMTP)
- **Öncelik 2:** Telegram (Email başarısız olursa)

Bildirimler şu durumlarda gönderilir:
- Görev çöktüğünde (Email Responder, Outreach, Data Fetch)
- Scheduler'da ardışık 3+ hata olduğunda
- LLM 3 retry sonrası çöktüğünde (atlanmış email bildirimi)
- Credential sağlık sorunlarında

---

## Google Hesapları

| Hesap | Kullanım | Token Env Var |
|:------|:---------|:--------------|
| `EMAIL_ADRESI_BURAYA` (swc) | Email Responder — inbox okuma, draft oluşturma | `GOOGLE_SWC_TOKEN_JSON` |
| `EMAIL_ADRESI_BURAYA` (outreach) | Outreach email gönderimi, Sheets okuma/yazma | `GOOGLE_OUTREACH_TOKEN_JSON` |

Auth: `shared/google_auth.py` merkezi modülü ile yönetilir. Lokal'de `_knowledge/credentials/oauth/` dizinindeki token dosyaları, Railway'de environment variable'lar kullanılır.

---

## Deploy

- **Platform:** Railway (Native Cron Job)
- **Start Command:** `python railway_scheduler.py`
- **Cron Schedule:** `0 7,11,15 * * 1-5`
- **Restart Policy:** `NEVER`

---

*Antigravity ile oluşturulmuş ve optimize edilmiştir.*
