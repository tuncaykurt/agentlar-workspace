# Çalışma Kuralları ve Tercihler

Bu dosya, Antigravity ile çalışırken birikmesi gereken kişisel tercihlerini ve kuralları içerir.
**Son güncelleme:** _(İlk kurulumda güncelleyin)_

---

## Genel Çalışma Tarzı

- **Dil:** Her zaman Türkçe, samimi ama profesyonel ton
- **Mod:** Agent-driven — karmaşık işleri kendi başına hallet, sonucu göster
- **Açıklama:** Teknik detay yerine mantığı ve faydayı sade dille özetle
- **Hata yönetimi:** Önce kendi başına çöz, aşamazsan onay iste
- **Proje Dizini:** Tüm projeler `Projeler/` altında
- **Kısa ve net:** Uzun açıklamalar yerine madde madde özetler tercih edilir

## Proje Yapısı

```
Antigravity/
├── _agents/              → Agent'lar ve Workflow'lar
│   ├── musteri-kazanim/  → Lead + Outreach orkestratörü
│   ├── icerik-uretim/    → İçerik pipeline orkestratörü
│   ├── yayinla-paylas/   → Deploy + Export orkestratörü
│   └── workflows/        → Slash command workflow'ları
├── _skills/              → Kalıcı yetkinlikler (skill'ler)
├── _knowledge/           → Bu klasör (manuel hafıza)
│   └── credentials/      → 🔐 Merkezi şifre/token deposu
├── Projeler/             → Tüm proje klasörleri
└── Paylasilan_Projeler/  → Dışarıyla paylaşıma hazırlanan paketler
```

## Aktif Projeler

| Proje | Açıklama | Durum | Deploy |
|---|---|---|---|
| Gayrimenkul_Platform | Emlak CRM + Otomasyon Dashboard (Next.js + Supabase) | 🟢 Canlı | Coolify (auto-deploy) |

### 🔄 Gayrimenkul Platform — Git Push & Deploy Akışı

Bu proje **Agentlar** mono-repo'sunun parçasıdır. Coolify GitHub webhook ile otomatik deploy yapar.

```
Antigravity/Projeler/Gayrimenkul_Platform/  ← Burada düzenle
        ↓ (robocopy senkronizasyon)
Agentlar/projeler/gayrimenkul-platform/     ← Git root burada
        ↓ (git add + commit + push)
GitHub: tuncaykurt/agentlar-workspace       ← Remote repo
        ↓ (webhook)
Coolify → otomatik build + deploy           ← Canlıya yansır
```

**Push komutu (tek satır):**
```powershell
robocopy "Antigravity\Projeler\Gayrimenkul_Platform" "Agentlar\projeler\gayrimenkul-platform" /E /XD node_modules .next .git __pycache__ /XF *.pyc /NFL /NDL /NJH /NJS /NC /NS /NP; cd Agentlar; git add -A; git commit -m "mesaj"; git push origin main
```

## 🔐 Şifre/Token Yönetim Kuralları (OTOMATİK)

### Otomatik Tetikleme
- ✅ Yeni proje oluşturulduğunda → `sifre-yonetici` skill'ini oku ve çalıştır
- ✅ Bir projeye API kullanan kod eklendiğinde → ihtiyaç analizi yap
- ✅ Kullanıcı yeni API/token verdiğinde → önce `master.env`'e ekle, sonra projelere dağıt
- ✅ Deploy öncesinde → `.env` ve Service Account bağlantılarını doğrula

### 📁 Proje Değişikliği Kuralları (OTOMATİK)

Yeni proje oluşturulduğunda, arşive taşındığında veya silindiğinde şu dosyalar **mutlaka** güncellenir:

1. **Bu dosyadaki Aktif Projeler tablosu** → `_knowledge/calisma-kurallari.md`
2. **Deploy registry** → `_knowledge/deploy-registry.md` (Railway/cron varsa)
3. **Skills README** → `_skills/README.md` (yeni skill oluşturulduysa)
4. **API anahtarları** → `_knowledge/api-anahtarlari.md` + `master.env` (yeni servis eklendiyse)

### Merkezi Depo
- **Tokenlar:** `_knowledge/credentials/master.env`
- **Google Service Account:** `_knowledge/credentials/google-service-account.json`
- **OAuth Dosyaları:** `_knowledge/credentials/oauth/`
- **Skill:** `_skills/dev/sifre-yonetici/SKILL.md`
- **Workflow:** `/sifre-bagla`

### Token Güncellemesi
Kullanıcı yeni bir token verdiğinde:
1. `master.env`'deki ilgili satırı güncelle
2. `_knowledge/api-anahtarlari.md`'yi senkronize et
3. Etkilenen projeleri bildir

## Kesinlikle Yapılmaması Gerekenler

- API anahtarlarını hardcode etme — her zaman `master.env` veya env variable kullan
- Skill dosyalarını gereksiz yere değiştirme — skill'ler atomik ve kararlıdır
- `_knowledge/credentials/` klasöründeki dosyaları GitHub'a push etme
- Google Service Account JSON dosyasını kod içine gömme
- **Kod sağlık kontrolü yapmadan GitHub'a push etme** — import testi + testler ZORUNLU
- **Smoke test yapmadan deploy'u tamamlanmış sayma** — deploy sonrası log kontrolü ZORUNLU
- **README güncellemeden değişiklik push etme** — dosya ekleme/silme/rename sonrası README ZORUNLU

## 🔄 Post-Change Kontrol Kuralı (ZORUNLU)

> **Her proje değişikliğinden sonra `/degisiklik-kontrol` workflow'u uygulanır.**

Bu workflow, syntax/import kontrolü, README güncelliği, git sync, deploy smoke test ve bağımlı proje kontrolünü kapsar. Detaylar: `_agents/workflows/degisiklik-kontrol.md`

## 🏗️ Mimari ve Deploy Yaklaşımı (Native Mono-Repo)

- **Tek Bağımsız Repo:** Tüm platform tek bir GitHub reposu içerisinde barındırılır (Native Mono-Repo).
- **Railway Ayarları:** Railway'e bir proje deploy edileceği zaman ana repo bağlanır. Sadece o projenin çalışması için **Root Directory** ve **Watch Paths** ayarları ilgili proje klasörüne yönlendirilir.

### Self-Hosting Altyapısı
- **Coolify** → Projeleri deploy ve yönetmek için ana platform
- **VPS** → Kendi sunucularında barındırma (n8n, Supabase, Redis, Metabase)
- **Supabase** → Proje bazlı (her projenin kendi Supabase instance'ı, key'ler proje `.env`'ine yazılır)
- **Redis** → Proje bazlı (bağlantı bilgisi projeye özel)
- **Metabase** → Self-hosted analiz dashboard'u

### Deploy Stratejisi — Ne Zaman Hangisi?
| Durum | Çözüm |
|---|---|
| Basit otomasyon (API → sonuç → bildirim) | **Script + Coolify** — hafif ve hızlı |
| Karmaşık multi-step otomasyon | **n8n** (yapayzekaotomasyon.cloud) |
| Web uygulaması / dashboard / CRM | **Uygulama + Coolify** |
| AI asistan / chatbot | **Uygulama + Coolify** |

### Antigravity + Coolify Akışı
```
Antigravity kod yazar → GitHub'a push → Coolify'da deploy → 7/24 çalışır
```
n8n her iş için şart değil — basit işlerde direkt Coolify deploy daha esnek ve ucuz.

## 🚀 Deploy Güvenlik Kuralları (ZORUNLU)

> Bu kurallar `/canli-yayina-al` workflow'u çağrılmasa bile geçerlidir.

### Push Öncesi (Mono-Repo):
1. `python3 -m py_compile *.py` — syntax kontrolü
2. Tüm .py dosyalarını import testi ile doğrula
3. `tests/` veya `run_test.py` varsa çalıştır
4. Hata varsa → ❌ PUSH YAPMA

### Deploy Sonrası:
1. SUCCESS olduktan sonra 60 saniye bekle
2. Logları çek ve kontrol et
3. `AttributeError`, `ImportError`, `SyntaxError`, `Traceback` ara
4. Fatal error varsa → düzelt, tekrar push, tekrar deploy

## 🔧 Railway Sistem Bağımlılıkları Kuralı (ZORUNLU)

> **Railway, Nixpacks builder kullanır. `Aptfile` ve `apt.txt` dosyaları YOKSAYILIR!**

| Durum | Doğru Çözüm |
|---|---|
| Sistem paketi gerekiyor (ffmpeg, chromium vb.) | `nixpacks.toml` → `[phases.setup] nixPkgs = ["ffmpeg"]` |
| `Aptfile` veya `apt.txt` bulunuyor | ❌ SİL — yanıltıcı, Nixpacks bunları yoksayar |
| Sistem binary'si kontrolü | `config.py` → `self._check_system_deps(["ffmpeg"])` (fail-fast) |

## Tekrarlayan Talepler & Öğrenilen Bilgiler

- **Sahibinden.com:** Bot koruması (Cloudflare 403) var — direkt HTTP/tarayıcı ile erişilemiyor. **Apify** (`clearpath/sahibinden-scraper-pro`) ile veri çekilebilir. Görüntülenme/favori istatistikleri sadece hesap panelinden görünür.
- **AI Modeller:** OpenRouter üzerinden tek key ile tüm modellere erişim (Claude, GPT-4, Gemini, Llama). Projeye göre model seçilir.
- **MCP:** Şu an sadece GitHub MCP bağlı. İleride Supabase, Notion gibi MCP'ler eklenebilir.
- **Proje Hafızası:** Emlak (Bursa/CB Ambiance), Bilal Şengüloğlu Baklava, Trading (SMC/Pine Script), Oto Mobil Uygulama, Emlak CRM arasında bağlam korunmalı.
