---
name: musteri-kazanim
description: |
  Müşteri Kazanım Agenti — Herhangi bir hedef kitle için uçtan uca lead bulma, 
  iletişim bilgisi çıkarma, kişiselleştirilmiş e-posta outreach ve akıllı takip 
  sürecini tek bir orkestratör olarak yönetir. Influencer (B2C), şirket (B2B) ve 
  topluluk (Community) senaryolarını aynı pipeline ile çalıştırır.
---

# 🤖 Müşteri Kazanım Agenti

> **Versiyon:** 1.0
> **Durum:** Aktif
> **Konum:** `_agents/musteri-kazanim/`

---

## 📌 Amaç ve Kapsam

Bu agent, **herhangi bir hedef kitle** için müşteri kazanım sürecini uçtan uca yönetir:

1. **Lead Bulma** — Sosyal medya, Google Maps, LinkedIn veya topluluk platformlarından hedef kitlenin profil bilgilerini toplar.
2. **İletişim Bilgisi Çıkarma** — Web sitesi, bio, Hunter.io, Apollo.io üzerinden e-posta ve telefon zenginleştirmesi (enrichment) yapar.
3. **Kişiselleştirme** — Her lead için bağlama uygun, doğal ve elle yazılmış hissi veren e-posta içeriği üretir.
4. **Gönderim** — Gmail API üzerinden kontrollü ve zamanlı outreach yapar.
5. **Takip & Sequence** — Açılma/cevaplama durumuna göre dallanmalı takip akışı yürütür.

### Bu Agent Kimin İçin?

| Senaryo | Örnek Kullanım |
|---------|---------------|
| 🎬 **Influencer Outreach** | Hedef sektördeki influencer'lara ulaşma |
| 🏢 **B2B Lead Gen** | Şirketlere cold email kampanyası |
| 🤝 **Marka İş Birliği** | Markalara influencer olarak iş birliği teklifi |
| 🎨 **Creator Sourcing** | UGC creator'larını bulma ve ulaşma |
| 📱 **Sosyal Medya Scraping** | Instagram/TikTok'tan toplu profil toplama |

---

## 🔧 Kullandığı Skill'ler

### 1. `_skills/lead-generation/` — Lead Bulma Motoru
**Neden:** Apify merkezli mimariyle tek API anahtarından 20+ farklı aktörle her platformdan lead toplar. Hunter/Apollo sadece fallback olarak devreye girer.

**Sağladığı yetenek:**
- Instagram, TikTok, YouTube profil tarama
- Google Maps işletme bulma
- LinkedIn profil zenginleştirme (cookie-less)
- Web sitesinden e-posta/telefon çıkarma (`contact-info-scraper`)
- Skool/topluluk üye tarama

### 2. `_skills/eposta-gonderim/` — E-posta Gönderim Motoru
**Neden:** Gmail API üzerinden kişiselleştirilmiş e-posta gönderir ve durumu CSV'de takip eder. Rate limiting, hata yönetimi ve doğal kişiselleştirme kuralları yerleşik.

**Sağladığı yetenek:**
- Gmail OAuth2 ile güvenli gönderim
- Satır bazlı CSV durum takibi
- Doğal Türkçe/İngilizce kişiselleştirme
- Günlük limit yönetimi (spam koruması)

---

## ⚙️ Kampanya Başlatma Parametreleri

Her yeni kampanya aşağıdaki parametrelerle tanımlanır. Bu parametreler `config/` altındaki YAML dosyalarında saklanır.

### Zorunlu Parametreler

| Parametre | Açıklama | Örnek |
|-----------|----------|-------|
| `kampanya_adi` | Kampanyanın benzersiz adı | `ornek-kampanya-2026` |
| `hedef_tip` | Lead tipi | `influencer` / `b2b_sirket` / `ugc_creator` / `yerel_isletme` |
| `platform` | Arama yapılacak platform(lar) | `[instagram, tiktok]` |
| `dil` | İletişim dili | `TR` / `EN` / `[TR, EN]` |
| `bolge` | Coğrafi hedef | `Türkiye` / `Global` |

### ICP (Ideal Customer Profile) Tanımı

```yaml
icp:
  # Influencer senaryosu
  minimum_takipci: 10000
  maksimum_takipci: 5000000
  nis: ["lifestyle", "teknoloji", "eğlence"]
  icerik_dili: ["TR"]
  
  # B2B senaryosu
  sirket_buyuklugu: "10-500"
  hedef_pozisyonlar: ["CEO", "CTO", "Marketing Director", "Growth Lead"]
  sektor: ["SaaS", "E-ticaret", "Fintech"]
  
  # UGC Creator senaryosu
  min_icerik_sayisi: 50
  icerik_turu: ["ugc", "product_review", "unboxing"]
```

### Opsiyonel Parametreler

| Parametre | Açıklama | Varsayılan |
|-----------|----------|------------|
| `arama_anahtar_kelimeleri` | Platform arama terimleri | `[]` |
| `hashtag_listesi` | Hashtag filtreleri | `[]` |
| `gunluk_gonderim_limiti` | Günlük max e-posta | `50` |
| `gonderim_saatleri` | Gönderim saat aralığı | `09:00-17:00` |
| `gonderim_gunleri` | Gönderim günleri | `[Pazartesi, Salı, Çarşamba, Perşembe, Cuma]` |
| `sablon_dili` | E-posta şablon dili | Kampanya diline göre otomatik |
| `dry_run` | Test modu (göndermeden önizleme) | `true` |
| `max_lead_sayisi` | Toplam hedef lead | `100` |

---

## 🔄 Orkestrasyon Akışı — 5 Adım

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MÜŞTERİ KAZANIM AGENTİ                        │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│  │ 1. LEAD  │───▶│ 2. EMAIL │───▶│ 3. KİŞİ- │───▶│ 4. GÖN-  │───▶│ 5. TAKİP │ │
│  │  BULMA   │    │  TOPLAMA │    │ SELLEŞTİR│    │  DERİM   │    │ & SEQU-  │ │
│  │          │    │          │    │  ME      │    │          │    │  ENCE    │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘ │
│       │               │               │               │               │      │
│  lead-generation  lead-generation   LLM Engine      outreach       outreach  │
│  SKILL            SKILL (enrichment)                SKILL          SKILL     │
└─────────────────────────────────────────────────────────────────────┘
```

### Adım 1-5 detayları için `AGENT.md` dosyasının tam versiyonunu okuyun.

> 💡 **İpucu:** Bu dosya kısaltılmış bir şablon versiyonudur. Tam orkestrasyon akışını görmek için kaynak Antigravity deposundaki `_agents/musteri-kazanim/AGENT.md` dosyasını referans alabilirsiniz.

---

## 📄 Config Dosya Formatı (YAML Şablon)

Yeni kampanya açarken `config/` altındaki `ornek-kampanya.yaml` dosyasını kopyalayın.

---

## 📁 Agent Dosya Yapısı

```
_agents/musteri-kazanim/
├── AGENT.md                         ← Bu dosya (ana yönerge — orkestrasyon mantığı)
├── config/
│   └── ornek-kampanya.yaml          ← Yeni kampanyalar için şablon
├── templates/
│   ├── email-tr.md                  ← Türkçe email şablonları
│   ├── email-en.md                  ← İngilizce email şablonları
│   └── sequence-profilleri.md       ← Sektöre göre sequence konfigürasyonları
├── data/                            ← Kampanya çıktıları (gitignore'da)
│   └── .gitkeep
└── scripts/
    ├── kampanya_baslat.py           ← Lead bulma + email toplama (birleşik)
    ├── outreach_gonder.py           ← Kişiselleştirme + gönderim
    └── takip_guncelle.py            ← Sequence takip + güncelleme
```

---

## 🚀 Kullanım — Hızlı Başlangıç

### Yeni Kampanya Oluştur

```
1. config/ornek-kampanya.yaml dosyasını kopyala
2. Kampanya parametrelerini doldur (ICP, platform, dil, bölge)
3. Şu komutla agent'ı çalıştır:
   → "/lead-toplama" ile lead topla
   → "/mail-gonder" ile mail at
```

---

## 🔗 İlişkili Kaynaklar

| Kaynak | Yol | Açıklama |
|--------|-----|----------|
| Lead Generation Skill | `_skills/lead-generation/SKILL.md` | Apify aktör kataloğu ve pipeline'lar |
| Outreach Skill | `_skills/eposta-gonderim/SKILL.md` | Gmail API gönderim motoru |
| Lead Toplama Workflow | `_agents/workflows/lead-toplama.md` | Bağımsız kullanılabilir workflow |
| Outreach Workflow | `_agents/workflows/mail-gonder.md` | Bağımsız kullanılabilir workflow |
| Marka Outreach Workflow | `_agents/workflows/marka-outreach.md` | Marka iş birliği özel pipeline |
| API Anahtarları | `_knowledge/api-anahtarlari.md` | Tüm servis credential'ları |

---

## ⚠️ Güvenlik & Kurallar

1. **API anahtarları HARDCODE EDİLMEZ** — Her zaman `_knowledge/api-anahtarlari.md` veya env variable kullan
2. **Spam yapma** — Her mail gerçek değer sunmalı, kişiselleştirme yüzeysel olmamalı
3. **SPF/DKIM/DMARC** — Gönderim domain'inin email authentication kayıtları doğru olmalı
4. **Günlük limit** — İlk 2 hafta 20/gün ile warm-up yap, kademeli artır
5. **Bounce takibi** — %2'yi geçerse gönderimi durdur
6. **Unsubscribe** — Her mailde çıkış seçeneği olmalı
7. **Veri gizliliği** — Toplanan kişisel veriler sadece kampanya amacıyla kullanılır
