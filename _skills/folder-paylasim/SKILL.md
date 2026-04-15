---
name: Paylaşım (Skill, Proje & Starter Kit)
description: |
  Antigravity içindeki skill'leri, projeleri veya tüm Antigravity yapısını 
  başkalarının güvenle kullanabileceği formata dönüştürür. 
  API anahtarlarını temizler, bağımlılıkları çözer, kurulum rehberi üretir.
  Bu skill'i dosya/proje/skill paylaşma, dışa aktarma (export) veya 
  starter kit hazırlama istendiğinde kullan.
---

# 📦 Paylaşım — Kapsamlı Dışa Aktarım Skill'i

Bu skill, Antigravity içeriğini **başkalarının alıp doğrudan kullanabileceği** formata dönüştürür.
Üç farklı mod destekler:

| Mod | Ne Zaman? | Çıktı |
|-----|-----------|-------|
| **Skill Export** | Tek bir skill paylaşılacaksa | `Paylasima_Hazir/Skilller/[skill-adi]/` |
| **Proje Export** | Tek bir proje paylaşılacaksa | `Paylasima_Hazir/Projeler/[proje-adi]_Taslak/` |
| **Starter Kit** | Tüm Antigravity yapısı paylaşılacaksa | `Paylasima_Hazir/Starter_Kit/Antigravity/` |

---

## 🔐 Güvenlik ve Temizlik Çerçevesi (Tüm Modlar İçin Geçerli)

### Kesinlikle Temizlenmesi Gerekenler

Bu desenlere uyan her şey tespit edilip placeholder ile değiştirilmeli:

| Desen | Açıklama | Placeholder |
|-------|----------|-------------|
| `sk-proj-...` / `sk-...` | OpenAI API Key | `OPENAI_API_KEY_BURAYA` |
| `apify_api_...` | Apify API Key | `APIFY_API_KEY_BURAYA` |
| `gsk_...` | Groq API Key | `GROQ_API_KEY_BURAYA` |
| `pplx-...` | Perplexity API Key | `PERPLEXITY_API_KEY_BURAYA` |
| `AIza...` | Google API Key | `GOOGLE_API_KEY_BURAYA` |
| `sd_...` | Supadata API Key | `SUPADATA_API_KEY_BURAYA` |
| 32-40 char hex string (API key bağlamında) | Kie AI / Hunter / Apollo / ImgBB | `SERVIS_ADI_API_KEY_BURAYA` |
| `xi-api-key` değeri | ElevenLabs Key | `ELEVENLABS_API_KEY_BURAYA` |
| Bot Token (`\d{10}:AA...`) | Telegram Bot Token | `TELEGRAM_BOT_TOKEN_BURAYA` |
| `client_id`, `client_secret` | OAuth credentials | `OAUTH_CLIENT_ID_BURAYA` |
| E-posta adresleri (kişisel) | Gmail, iş e-postaları | `EMAIL_ADRESI_BURAYA` |
| Kişisel URL'ler ([SOSYAL_MEDYA_KULLANICI].com vb.) | Kişisel siteler | `KISISEL_WEBSITE_BURAYA` |

### Kesinlikle Dahil Edilmemesi Gereken Dosyalar

Kopyalama sırasında şunlar **atlanmalı**:
- `.git/` — versiyon geçmişi
- `.venv/` / `venv/` / `env/` — sanal ortam
- `__pycache__/` — Python cache
- `.DS_Store` — macOS metadata
- `node_modules/` — Node.js bağımlılıkları
- `.env` — gerçek environment dosyası (`.env.example` oluşturulacak)
- `token.json` — OAuth token (süresi dolmuş olabilir, her durumda kişisel)
- `credentials.json` (içi dolu OAuth credentials ise) — kişisel
- `*.pyc` — derlenmiş Python dosyaları
- `.cursor/` / `.vscode/` — editör ayarları

### Korunması Gereken Dosyalar

- `.env.example` — zaten placeholder'lı
- `requirements.txt` — bağımlılık listesi
- `README.md` / `SKILL.md` — dökümantasyon
- Tüm kaynak kodlar (`.py`, `.js`, `.sh`, `.md`)
- Konfigürasyon şablonları

---

## 📋 MOD 1: Skill Export

**Tetiklenme:** Kullanıcı tek bir skill paylaşmak istediğinde.

### Adımlar

1. **Kaynak Tespiti**
   - Kaynak: `_skills/[skill-adi]/`
   - Hedef: `Paylasima_Hazir/Skilller/[skill-adi]/`

2. **Kopyalama**
   - Skill klasörünün tamamını hedefe kopyala
   - Hariç tutulan dosyaları atla (yukarıdaki listeye bak)

3. **Güvenlik Taraması**
   - Kopyalanan tüm dosyaları tara
   - Hardcoded API key, token veya kişisel bilgi varsa placeholder'a çevir
   - ⚠️ **Dikkat:** Skill'lerin çoğu API key'i `_knowledge/api-anahtarlari.md` üzerinden alıyor — bu **referanslar korunmalı**, sadece gerçek key değerleri temizlenmeli

4. **Bağımlılık Analizi**
   - SKILL.md dosyasını oku
   - Hangi API servisleri gerekli? (API key'ler, base URL'ler)
   - Hangi harici araçlar gerekli? (FFmpeg, Python 3.x, vs.)
   - Başka skill'lere referans var mı?

5. **Gereksinimler Dosyası Oluşturma**
   - Skill klasörünün içine `GEREKSINIMLER.md` ekle
   - Şablon: `templates/GEREKSINIMLER_SKILL.md`
   - İçerik:
     - Skill'in ne yaptığı (1-2 cümle)
     - Gerekli API servisleri ve anahtarları
     - `_knowledge/api-anahtarlari.md` dosyasına eklenmesi gereken bölüm bloğu (kopyala-yapıştır hazır)
     - Kurulum adımları (skill klasörünü `_skills/` altına koyun)
     - Varsa ek gereksinimler (FFmpeg, Python kütüphaneleri)

6. **Workflow Dosyası Ekleme (Opsiyonel)**
   - Skill'in ilişkili bir workflow dosyası varsa (`_agents/workflows/` altında)
   - Bu workflow dosyasını da skill klasörünün içine `workflow/` alt klasörüne kopyala
   - `GEREKSINIMLER.md` içinde workflow'un `_agents/workflows/` altına koyulması gerektiğini belirt

### Çıktı

```
Paylasima_Hazir/Skilller/[skill-adi]/
├── SKILL.md                  ← Orijinal (temizlenmiş)
├── GEREKSINIMLER.md          ← YENİ: Kurulum rehberi
├── models/                   ← Orijinal (varsa)
├── pipelines/                ← Orijinal (varsa)
├── scripts/                  ← Orijinal (varsa)
└── workflow/                 ← İlişkili workflow (varsa)
    └── ilgili-workflow.md
```

---

## 📋 MOD 2: Proje Export

**Tetiklenme:** Kullanıcı tek bir proje paylaşmak istediğinde.

### Adımlar

1. **Kaynak Tespiti**
   - Kaynak: `Projeler/[Proje Adı]`
   - Hedef: `Paylasima_Hazir/Projeler/[Proje Adı]_Taslak/`

2. **Kopyalama**
   - Proje klasörünü hedefe kopyala
   - Hariç tutulan dosyalar: `.env`, `.git`, `.venv`, `venv`, `__pycache__`, `.DS_Store`, `node_modules`, `token.json`, `*.pyc`

3. **Güvenlik Taraması**
   - Kopyalanan tüm dosyalarda API key taraması yap
   - Tespit edilen her key'i uygun placeholder ile değiştir
   - `credentials.json` içinde gerçek OAuth client bilgisi varsa boşalt veya sil
   - Kişisel veri içeren CSV/JSON dosyaları varsa temizle veya örnek veri ile değiştir

4. **Dependency (Bağımlılık) Kontrolü**
   
   **a) Python Bağımlılıkları:**
   - Proje içi `.py` dosyalardaki `import` ve `from ... import` ifadelerini tara
   - Proje klasörü dışına çıkan import'ları tespit et:
     - `sys.path.append("../")` kalıpları
     - `from ../../utils import` gibi parent directory referansları
   - Dış dosyaları proje içine (`utils/` alt klasörüne) kopyala
   - Import yollarını güncelle
   
   **b) Skill Bağımlılıkları:**
   - Proje dosyalarını (README, Instruction.md, workflow dosyaları) tara
   - `_skills/` referanslarını tespit et 
   - Hangi skill'lerin gerekli olduğunu listele
   - **Kullanıcıya sor:** Bağımlı skill'ler de paketlensin mi?
     - **Evet →** Skill klasörlerini `bagli_skilller/` alt klasörüne kopyala + temizle
     - **Hayır →** Sadece `KURULUM_REHBERI.md` içinde gerekli skill'leri listele

5. **requirements.txt Oluşturma/Güncelleme**
   - Python dosyalarındaki `import` ifadelerinden üçüncü parti paketleri tespit et
   - Standart kütüphane modüllerini hariç tut
   - Güncel bir `requirements.txt` oluştur

6. **.env.example Oluşturma**
   - Projede kullanılan tüm environment variable'ları tespit et
   - Açıklayıcı placeholder'larla `.env.example` oluştur

7. **Kurulum Rehberi Oluşturma**
   - Şablon: `templates/KURULUM_REHBERI_PROJE.md`
   - İçerik:
     - Projenin ne yaptığı
     - Gerekli API servisleri
     - Antigravity'ye verilecek hazır başlangıç prompt'u
     - Bağımlı skill'ler listesi (varsa)
     - Klasörün nereye konulacağı

### Çıktı

```
Paylasima_Hazir/Projeler/[ProjeAdi]_Taslak/
├── KURULUM_REHBERI.md        ← YENİ: Hazır prompt + talimatlar
├── .env.example              ← YENİ: API key placeholders
├── requirements.txt          ← Güncel bağımlılıklar
├── src/                      ← Temizlenmiş kaynak kod
├── utils/                    ← Dışarıdan içeri çekilen dosyalar (varsa)
└── bagli_skilller/           ← Bağımlı skill'ler (opsiyonel, kullanıcı isterse)
    ├── [skill-1]/
    └── [skill-2]/
```

---

## 📋 MOD 3: Starter Kit (Tam Antigravity Paketi)

**Tetiklenme:** Kullanıcı bütün Antigravity yapısını paylaşmak istediğinde.

### Adımlar

1. **Hedef Klasör Oluşturma**
   - Hedef: `Paylasima_Hazir/Starter_Kit/Antigravity/`
   - Tüm ana yapıyı oluştur

2. **_knowledge/ Şablonlaştırma**

   **a) `profil.md` → Şablona çevir:**
   ```
   Kişisel isimler → [İSİM SOYAD]
   Website URL'leri → [WEB SİTESİ]
   Sosyal medya linkleri → [INSTAGRAM], [TIKTOK], [YOUTUBE]
   İş açıklamaları → genel şablon metni
   Gelir kalemleri → [GELİR KALEMİ 1], [GELİR KALEMİ 2]
   ```
   
   **b) `api-anahtarlari.md` → Tüm key'leri temizle:**
   - Her servisin API key satırını `BURAYA_KENDI_ANAHTARINIZI_YAZIN` yap
   - Servis açıklamalarını koru (kullanıcı hangi servisi ne için kullanacağını görsün)
   - Kişisel e-posta adreslerini `EMAIL_ADRESI_BURAYA` yap
   
   **c) `calisma-kurallari.md` → Genelleştir:**
   - Proje yapısı kısmını koru
   - Aktif projeler tablosunu boşalt veya örnek olarak bırak
   - Kişisel tercihler kısmını temizle
   
   **d) `hatalar-ve-cozumler.md` → Olduğu gibi koru:**
   - Bu dosya genel teknik bilgi içeriyor, kişisel değil
   - Alıcı için de faydalı

3. **_skills/ Kopyalama**
   - Tüm skill klasörlerini olduğu gibi kopyala
   - ⚠️ **Önemli:** Skill'ler zaten `_knowledge/api-anahtarlari.md` referansı kullanıyor
   - `_knowledge/` temizlenince skill'ler otomatik olarak "kendi key'ini gir" moduna geçiyor
   - Skill içindeki hardcoded key varsa (örn. ImgBB key) placeholder'a çevir
   - `paylasim` skill'inin kendisini de dahil et (alıcı da paylaşım yapabilsin)

4. **Projeler/ Kopyalama**
   - Her projeyi ayrı ayrı temizle (Mod 2 kuralları)
   - `.env` → `.env.example`
   - Hardcoded key'ler → placeholder
   - `.git`, `.venv`, `__pycache__`, `.DS_Store` → hariç tut

5. **_agents/workflows/ Kopyalama**
   - Tüm workflow dosyalarını olduğu gibi kopyala
   - Eğer workflow içinde kişisel referans varsa temizle

6. **Paylasima_Hazir/ → Dahil Etme**
   - Bu klasör senin paylaşımları sakladığın yerdir, starter kit'e eklenmez

7. **Başlangıç Rehberi Oluşturma**
   - Root'a `BASLANGIÇ_REHBERI.md` ekle
   - Şablon: `templates/BASLANGIÇ_REHBERI.md`
   - İçerik:
     - Antigravity nedir, nasıl çalışır (kısa)
     - İlk adım: `_knowledge/profil.md` dosyasını doldur
     - İkinci adım: `_knowledge/api-anahtarlari.md` dosyasına kendi key'lerini gir
     - Skill'ler nasıl çalışır? (dokunma, sadece API key'leri tanımla)
     - Projeler nasıl çalışır?
     - Yeni skill/proje nasıl eklenir?

8. **`.gitignore` Ekleme (ZORUNLU)**
   - Starter Kit'e root dizine `.gitignore` dosyası **mutlaka** eklenmeli
   - Bu dosya `.env`, `credentials.env`, `token.json`, `credentials.json`, `.DS_Store`, `__pycache__/`, `venv/`, `node_modules/` kalıplarını içermeli
   - Referans: `checklists/github-guvenlik.md` içindeki `.gitignore` şablonu
   - **Neden:** Alıcı projeyi GitHub'a push ederse kendi API anahtarlarının sızmasını engellemek için

### Çıktı

```
Paylasima_Hazir/Starter_Kit/Antigravity/
├── BASLANGIÇ_REHBERI.md          ← YENİ: İlk adımlar + güvenlik uyarısı
├── .gitignore                    ← YENİ: API key koruma (ZORUNLU)
├── _agents/
│   └── workflows/                ← Tüm workflow'lar
├── _knowledge/
│   ├── README.md                 ← Orijinal
│   ├── profil.md                 ← ŞABLONLAŞTIRILMIŞ
│   ├── api-anahtarlari.md        ← TEMİZLENMİŞ (placeholder'lı)
│   ├── calisma-kurallari.md      ← GENELLEŞTİRİLMİŞ
│   └── hatalar-ve-cozumler.md    ← Orijinal
├── _skills/
│   ├── kie-ai-video-production/  ← Orijinal (hardcoded key temizlenmiş)
│   ├── lead-generation/          ← Orijinal
│   ├── outreach/                 ← Orijinal
│   ├── egitim-gorselleri/        ← Orijinal
│   └── paylasim/                 ← Bu skill de dahil
└── Projeler/
    ├── B2B_Outreach/             ← Temizlenmiş
    ├── Chat_Asistanı/            ← Temizlenmiş
    └── ...                       ← Diğer projeler
```

---

## 📊 Sonuç Raporu Formatı

Her export işlemi sonunda Antigravity şu raporu verir:

```
📦 PAYLASIM RAPORU
━━━━━━━━━━━━━━━━━━━━━━
📂 Mod: [Skill Export / Proje Export / Starter Kit]
📁 Hedef Klasör: [tam yol]

🔐 Güvenlik:
   ✅ Temizlenen API key'ler: [liste]
   ✅ Silinen hassas dosyalar: [liste]
   ✅ Oluşturulan .env.example: [evet/hayır]

📎 Bağımlılıklar:
   ✅ İçeri çekilen harici dosyalar: [liste veya "yok"]
   ✅ Gerekli skill'ler: [liste veya "yok"]
   ✅ requirements.txt: [oluşturuldu/güncellendi/yok]

📄 Oluşturulan Belgeler:
   ✅ [GEREKSINIMLER.md / KURULUM_REHBERI.md / BASLANGIÇ_REHBERI.md]

⚠️ Manuel Kontrol Gerekli:
   [varsa kontrol edilmesi gereken dosyalar]
```
