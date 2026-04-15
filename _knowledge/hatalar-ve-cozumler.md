# Hatalar ve Çözümler Günlüğü

Geçmişte karşılaşılan hatalar ve çözümleri. Aynı sorunu iki kez çözmemek için bu dosyayı güncelliyoruz.

**Format:** Her hata bloğu aşağıdaki yapıyı takip eder.

---

## Kie AI

### Sora 2 Pro Storyboard — Model adı ve format hataları
- **Sorun:** Model adı `sora-2-pro` değil, tam olarak `sora-2-pro-storyboard` olmalı
- **Sorun:** `shots` alanı içinde `Scene` büyük S ile yazılmalı
- **Sorun:** `n_frames` ve `aspect_ratio` zorunlu alan — eksik olunca 422 hatası
- **Çözüm:**
  ```json
  {
    "model": "sora-2-pro-storyboard",
    "input": {
      "n_frames": 150,
      "aspect_ratio": "16:9",
      "shots": [{ "Scene": "...", "image_urls": [] }]
    }
  }
  ```
- **Tarih:** Şubat 2026

### Kie AI — Eski API anahtarları (ÇÖZÜLDÜ)
- **Sorun:** Eskiden birden fazla key dolaşıyordu (`47b22662...`, `97d226c568...`)
- **Çözüm:** ✅ Tek aktif key: `KIE_AI_API_KEY_BURAYA` — tüm dosyalar bununla güncellendi (Mart 2026)
- **Tarih:** Mart 2026

### Video üretimi sonrası URL gelmeme
- **Sorun:** `resultJson` alanı string olarak geliyor, JSON parse edilmeli
- **Çözüm:** `json.loads(data["resultJson"])["resultUrls"][0]`
- **Tarih:** Şubat 2026

---

## Gmail / Outreach

### Gmail MCP — Draft (Taslak) Oluşturma Aracı YOK (KRİTİK)
- **Sorun:** Kullanıcı "maili drafta yaz" dediğinde `send_gmail_message` kullanıldı → mail placeholder içeriğiyle doğrudan gönderildi.
- **Kök Neden:** Google Workspace MCP araçları arasında `create_draft` fonksiyonu bulunmuyor. Mevcut araçlar: `send_gmail_message` (gönderir), `search_gmail_messages` (arar), `get_gmail_message_content` (okur).
- **Çözüm/Kural:**
  1. Kullanıcı "drafta yaz" veya "taslak oluştur" dediğinde **ASLA `send_gmail_message` kullanma** — bu doğrudan gönderir!
  2. Bunun yerine mail içeriğini Antigravity artifact'a yaz → kullanıcıya göster → kullanıcı kopyalayıp Gmail'de kendisi draft oluştursun.
  3. Veya kullanıcıya "Gmail MCP'de draft aracı yok, doğrudan göndermemi ister misin?" diye sor.
- **Tarih:** Mart 2026

### OAuth Token Hatası (`invalid_grant`)
- **Sorun:** `token.json` süresi dolmuş veya bozulmuş
- **Çözüm:** `token.json` dosyasını sil → scripti tekrar çalıştır → tarayıcıda yeniden onayla
- **Tarih:** —

---

## Apify

### Boş sonuç / Actor başlamıyor
- **Sorun:** Çok kısıtlayıcı filtreler veya hatalı Actor ID
- **Çözüm:** Actor ID'yi Apify konsolundan kopyala, filtreleri genişlet
- **Tarih:** —

### Kredi tükenmesi
- **Çözüm:** `_knowledge/api-anahtarlari.md` → Apify Hesap 2 (yedek) kullan
- **Tarih:** —

---

## Telegram Bot

### Markdown parse hatası
- **Sorun:** GPT yanıtındaki özel karakterler Telegram'da hata veriyor
- **Çözüm:** Yanıtı göndermeden önce `escape_markdown()` ile temizle
- **Tarih:** Şubat 2026

### Telegram Conflict — Aynı anda iki bot instance (Coolify)
- **Sorun:** `telegram.error.Conflict: terminated by other getUpdates request` — Coolify deploy sırasında eski container henüz durmadan yenisi başlıyor, iki polling çakışıyor
- **Ek Sorun:** python-telegram-bot "No error handlers are registered" diye ERROR logluyor → self-healer bunu "unknown" sorun olarak algılıyor → sürekli yanlış alarm (false positive)
- **Çözüm (3 katman):**
  1. `bot.py` → `error_handler()` fonksiyonu eklendi: Conflict hatalarını INFO, ağ hatalarını WARNING olarak loglar. ERROR çıkmaz.
  2. `healing_playbook.json` → `telegram_conflict` ve `telegram_no_error_handler` pattern'ları eklendi: `ignore_transient` olarak sınıflandırılır.
  3. `health_check.py` → `FALSE_POSITIVE_PATTERNS` listesine eklendi: Log taramasında Conflict hataları artık hata sayılmaz.
- **Kural:** Deploy sonrası oluşan Conflict hatası geçicidir, yeni instance çalışır çalışmaz kendi kendine düzelir. Ayrıca `run_polling(stop_signals=None)` kullanılmalıdır.
- **Tarih:** Mart 2026

---

## Google Sheets / API Bağlantı Kopmaları

### SSL EOF Hatası — Geçici Ağ Kopması (Tekrarlayan Pattern)
- **Sorun:** `EOF occurred in violation of protocol (_ssl.c)` — Coolify container'larında uzun süre yaşayan bağlantı objeleri bayatlıyor. Google Sheets, Fal AI gibi servislerde tekrarlayan pattern.
- **Kök neden:** `service` objesi bir kez oluşturulup sonsuza dek kullanılıyor. SSL bağlantısı kopunca retry yok, tüm döngü başarısız oluyor.
- **Çözüm (Sürdürülebilir retry pattern):**
  1. Hata mesajında geçici ağ anahtar kelimeleri ara: `eof`, `ssl`, `broken pipe`, `connection reset`, `timeout`, `connection aborted`
  2. Eşleşirse: `service = None` → `authenticate()` → tekrar dene
  3. Max 3 deneme, exponential backoff (2s, 4s)
  4. Geçici değilse doğrudan raise et
- **Uygulanan dosya:** `Tele_Satis_CRM/sheets_reader.py` → `get_all_rows()` metodu
- **Kural:** Uzun süre çalışan servislerde (polling loop, webhook listener) dış API çağrılarına **mutlaka** retry + reconnect ekle
- **Tarih:** Mart 2026

---

## Antigravity Chat — Tarayıcı Fallback Sorunu

### GEMINI.md Boş → Agent Tarayıcıya Düşüyor (KRİTİK)
- **Sorun:** Agent, Notion/Coolify/GitHub gibi servislere erişirken MCP/API yerine `browser_subagent` kullanarak tarayıcı açıyordu. Kullanıcı "token'ın var" dediğinde düzeliyordu ama her seferinde hatırlatma gerekiyordu.
- **Kök Neden:** `~/.gemini/GEMINI.md` dosyası **tamamen boştu** (0 byte). Bu dosya her konuşma başında okunur ve servis yönlendirme kurallarını içermesi gerekir. Boş olduğunda agent hangi araçla hangi servise bağlanacağını bilemiyor ve default olarak tarayıcıya düşüyor.
- **Çözüm:** `GEMINI.md` dosyasına tam servis yönlendirme tablosu eklendi (GitHub → MCP, Notion → API, Coolify → GraphQL, Google → MCP vb.). Bu tablo `user_global` kurallarındakiyle aynı ama ek bir güvenlik katmanı sağlıyor.
- **Kural:** `GEMINI.md` dosyasının **asla boş bırakılmaması** gerekir. Periyodik olarak kontrol et.
- **Tarih:** Mart 2026

### Gmail OAuth Scope Uyumsuzluğu — `invalid_scope: Bad Request`
- **Sorun:** `marka-is-birligi` projesinde `gmail_sender.py` → `SCOPES` listesi `gmail.readonly` istiyordu ama OAuth token `gmail.modify` scope'uyla oluşturulmuştu. Google OAuth kütüphanesi scope eşleşmediği için `invalid_scope: Bad Request` hatası verdi.
- **Kök Neden:** Token oluşturulurken `gmail.modify` (okuma+yazma) scope'u verildi ama kod daha sonra `gmail.readonly` (sadece okuma) isteyecek şekilde değiştirildi. Token scope'ları ⊃ istenen scope'lar olsa bile, eşleşme kontrolü strict.
- **Çözüm:** `gmail_sender.py` → SCOPES'ta `gmail.readonly` → `gmail.modify` olarak değiştirildi (token'daki scope ile eşleşecek şekilde).
- **Kural:** OAuth token oluşturulduktan sonra koddaki SCOPES listesi DEĞİŞTİRİLMEMELİ. Değiştirilirse token yeniden oluşturulmalı.
- **Tarih:** Mart 2026

---

## Gemini API

### Gemini Model Deprecated — `404 models/gemini-1.5-pro-latest is not found`
- **Sorun:** `[proje-adi]-reels-kapak` projesinde `autonomous_cover_agent.py` ve `revision_engine.py` dosyalarında `gemini-1.5-pro-latest` model adı kullanılıyordu. Google bu modeli deprecate etti ve API 404 dönmeye başladı.
- **Etki:** Kapak üretim pipeline'ı Gemini Vision değerlendirmesi yapamıyordu. Evaluation hep `score: 0` dönüyordu.
- **Çözüm:** Tüm `gemini-1.5-pro-latest` referansları `gemini-2.0-flash` ile değiştirildi (6 yerde: 4x autonomous_cover_agent.py, 2x revision_engine.py).
- **Kural:** Gemini model adları deprecate olabilir. Üretim kodunda `-latest` suffix'li model adı KULLANMA — spesifik versiyon kullan. Deprecation durumunda `gemini-2.0-flash` veya `gemini-2.5-pro` gibi güncel modellere geçiş yap.
- **Tarih:** Mart 2026

> *(Yeni hata karşılaşıldığında bu dosyaya ekle)*

---

## Kod-Repo Senkronizasyon Hataları

### Config.DEDUP_WINDOW_DAYS AttributeError — Lokal ↔ Production Uyumsuzluğu (KRİTİK)
- **Sorun:** `notion_writer.py` → `Config.DEDUP_WINDOW_DAYS` kullanıyordu ama `config.py`'da bu attribute henüz tanımlanmamıştı. Lokal'de güncellenmiş ama ayrı GitHub repo'suna (`[GITHUB_KULLANICI]/tele-satis-crm`) push edilmemişti. Coolify eski commit (12a9d2b) üzerinden çalışıyordu.
- **Etki:** 1 gün boyunca lead'ler Notion'a yazılamadı → ciddi maddi kayıp
- **Kök Neden (3 katman):**
  1. Lokal kod değiştirildi ama ayrı repo'ya push edilmedi
  2. Deploy workflow'unda "push öncesi import testi" adımı yoktu → `AttributeError` deploy edilmeden yakalanamadı
  3. Health check sadece deployment status'e bakıyordu → SUCCESS durumundaki runtime error'ları tespit edemiyordu
- **Çözüm (3 katmanlı savunma eklendi):**
  1. `/canli-yayina-al` workflow'una **zorunlu pre-push kod sağlık kontrolü** eklendi (import zinciri testi + unit test çalıştırma)
  2. `/canli-yayina-al` workflow'una **zorunlu post-deploy smoke test** eklendi (log'lardan fatal error tarama)
  3. `healing_playbook.json`'a `runtime_code_error` pattern'i eklendi (AttributeError, ImportError → alert_only, redeploy yapma)
- **Kural:** Her push'tan önce `python3 -c "import modül"` ile tüm modüllerin import edilebilmesi doğrulanmalı. Her deploy sonrası loglar smoke test ile taranmalı.
- **Tarih:** Mart 2026

### MİMARİ DEÐİŞİKLİK — Native Mono-Repo Geçişi (Lokal ↔ GitHub ↔ Coolify)
- **Eski Sorun:** Tüm projeler lokal'de `[REPO_ADI]` mono-repo'sunun içinde yaşıyor (`Projeler/XXX/`). Ama geçmişte Coolify her proje için ayrı bir GitHub reposu izliyordu (`[GITHUB_KULLANICI]/tele-satis-crm` vb.). Bu yüzden `/tmp/` dizinine klonlayıp dosyaları `cp` ile kopyaladığımız tehlikeli bir senkronizasyon workaround'umuz vardı. Bu durum `AttributeError` gibi cross-repo bağımlılık çöküşlerine ve veri kayıplarına (silinen dosyaların production'da silinmemesi) yol açıyordu.
- **Etki:** Güvenilmez deploys, git conflictleri ve çakışan history'ler.
- **Kök Neden:** Sistemin "Mono-repo" geliştirme yapıp "Multi-repo" production beklemesi.
- **ÇÖZÜM (YENİ MİMARİ): Native Mono-Repo Mimarisi**
  1. **Artık hiçbir projeyi dışarı taşıyıp ayrı repoya push KESİNLİKLE YAPILMIYOR.** Tamamen iptal edildi.
  2. Tüm projenin ana omurgası `[GITHUB_KULLANICI]/[REPO_ADI]` adlı **tek bir GitHub reposudur**.
  3. Yeni bir Coolify projesi/servisi kurulduğunda veya güncellendiğinde, bu TEK repo (`[GITHUB_KULLANICI]/[REPO_ADI]`) Coolify'e bağlanır.
  4. Coolify üzerindeki ilgili servisin ayarlarından **"Root Directory"** parametresi ilgili proje klasörü (örn: `Projeler/Tele_Satis_CRM`) olarak ayarlanır.
  5. Gereksiz trigger'ları (diğer projelerin de deploy edilmesini) engellemek için Watch Paths özelliğinde sadece o dizine izin verilir (`/Projeler/Tele_Satis_CRM/**`).
- **Kural:** Herhangi bir proje için kod deploylanacaksa sadece `git push origin main` yapılır. Kopya `cp` scriptleri ASLA kullanılmaz.
- **Tarih:** Mart 2026

### macOS Sandbox EPERM & npm Cache Hataları (Lokal Build)
- **Sorun:** Projede `npm run build` veya `npm install` denerken `npm error code EPERM` / `lstat` veya `operation not permitted` tarzı Terminal hataları ile karşılaşılıyor. Bağımlılıklar yüklenemiyor veya klasörler silinemiyor.
- **Kök Neden:** macOS üzerindeki Cursor Sandbox ortamı veya iCloud kilitleri `.DS_Store`, `node_modules` vs. dosyalara donanımsal yetki kilitleri koyuyor. Bu sistem seviyesi bir kısıtlamadır; **koddaki veya paketteki bir bozukluk değildir**.
- **Etki:** Bilgisiz bir LLM/Agent, uygulamanın çalışmadığını sanıp kodu downgrade etmeye teşebbüs edebilir veya Vite vb. eski mimarilere (rollback) dönmek için kod tabanını mahvedebilir.
- **Çözüm / Kural:** 
  1. Hata görüldüğünde koda (`package.json`, klasör yapılanması vb.) **KESİNLİKLE MÜDAHALE ETME**, package sürümleriyle veya import yollarıyla OYNAMA.
  2. Mimariyi veya kodun stabilité durumunu, lokal build hatalarından değil sadece remote (Netlify vb.) Deployment Log'larından yorumla. Kod dışarıda çalışıyorsa sorun yoktur.
  3. Silemediğin eski kilitli klasör kalıntılarına rastlarsan zorla silmek yerine `mv` komutuyla `_arsiv/` dizinine taşı.
- **Tarih:** Mart 2026

---

## Coolify Deploy

### Sandbox, Shell Script'ten Dosya Okumasını Engeller
- **Sorun:** `cat`, `grep` gibi komutlarla `_knowledge/api-anahtarlari.md` veya herhangi bir dosyadan token okunamıyor. `Operation not permitted` hatası veriyor.
- **Neden:** Antigravity sandbox ortamında çalışıyor. Sandbox, güvenlik nedeniyle shell komutlarının dosya okuma yetkisini kısıtlıyor.
- **Yanlış Çözümler (Çalışmayan):**
  - Shell script ile `cat dosya.txt` → ❌ İzin hatası
  - Gizli dosya `.coolify-token` oluşturma → ❌ Gizli dosyalar ekstra kısıtlı
  - Farklı klasörlere token dosyası koyma → ❌ Tüm klasörler kısıtlı
- **Doğru Çözüm:** Antigravity'nin kendi `view_file` tool'unu kullanarak dosyayı oku, sonra token'ı komutu çalıştırırken `COOLIFY_TOKEN="okunan_token"` olarak enjekte et.
- **Kural:** Token gereken her işlemde `view_file` → `_knowledge/api-anahtarlari.md` → Token'ı oku → Komuta prefix olarak ekle.
- **Tarih:** Mart 2026

### Coolify CLI "Unauthorized" ama GraphQL API Çalışıyor
- **Sorun:** `coolify whoami`, `coolify list` gibi CLI komutları `Unauthorized` hatası veriyor ama aynı token ile Coolify GraphQL API'ye `curl` ile istek atınca sorunsuz çalışıyor.
- **Neden:** Coolify CLI'ın eski versiyonu (veya workspace-scoped token'lar) bazı CLI komutlarıyla uyumsuz olabiliyor. CLI dahili olarak farklı bir auth endpoint kullanıyor.
- **Çözüm:** CLI çalışmazsa **GraphQL API fallback** kullan:
  ```bash
  curl -s -X POST https://backboard.coolify.app/graphql/v2 \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer TOKEN" \
    -d '{"query": "{ projects { edges { node { id name } } } }"}'
  ```
- **Tarih:** Mart 2026

### Yeni Coolify Token Propagation Gecikmesi
- **Sorun:** Yeni oluşturulan Coolify token'ı ilk dakikalarda `Invalid COOLIFY_TOKEN` hatası verebilir.
- **Çözüm:** 3-5 dakika bekleyip tekrar dene. Token sonunda aktif olur.
- **Tarih:** Mart 2026

### BASH_SOURCE Sandbox'ta Boş Dönüyor
- **Sorun:** `bash script.sh` ile çalıştırılan script'lerde `${BASH_SOURCE[0]}` boş dönüyor. Bu da `SCRIPT_DIR` doğru hesaplanamıyor.
- **Çözüm:** `BASH_SOURCE` yerine sabit yol (hardcoded path) kullan.
- **Tarih:** Mart 2026

### Path.parents IndexError — Coolify Container Crash
- **Sorun:** `pathlib.Path.parents[2]` Coolify'de `IndexError: 2` fırlatıyor. `/app/shared/dosya.py` yolunun sadece 2 parent'i var (`/app/shared/`, `/app/`). `parents[2]` mevcut değil.
- **Kök Neden:** Modül seviyesinde (top-level) `try-except` olmadan parent dizin aranıyordu. Lokal'de yol derin (`/Users/.../Projeler/Swc_Email_Responder/shared/`) olduğu için çalışıyordu, Coolify'de kısa yol (`/app/shared/`) crash etti.
- **Çözüm:** `parents[N]` yerine `[p for i, p in enumerate(Path.parents) if i < 4]` ile güvenli erişim kullan. IndexError riskini ortadan kaldırır.
- **Kural:** Coolify container'larında dosya yolu `/app/` altındadır. `Path.parents` index erişimlerinde **mutlaka** uzunluk kontrolü yap veya enumerate ile güvenli eriş.
- **Tarih:** Mart 2026

### ⚠️ API İsteklerinde Timeout Eksikliği — Sonsuz Bekleme (Hang) (KRİTİK)
- **Sorun:** Pipeline (örn. Blog Yazıcı, Kapak Üretici) Notion, ImgBB, GitHub veya Kie AI'a `requests.get()` veya `requests.post()` atıyor ancak `timeout` parametresi verilmemiş. Coolify ağında geçici bir kopukluk veya hedefin yanıt vermemesi durumunda container **sonsuza kadar** o satırda asılı kalıyor (hang). Cron job'ların CPU süresini tüketip kilitlenmesine neden oluyor.
- **Kök Neden:** Python `requests` kütüphanesi varsayılan olarak timeout'suz (sonsuz bekleme) çalışır.
- **Çözüm:** Tüm dış API çağrılarına zorunlu olarak `timeout=30` (veya `60`) eklendi.
  ```python
  resp = requests.post("https://api.github.com/...", headers=headers, json=data, timeout=30)
  ```
- **Kural:** Herhangi bir dış servise istek atan her fonksiyona **istisnasız** `timeout` parametresi ekle.
- **Tarih:** Mart 2026

---

## MCP Bağlantı Sorunları

### GitHub MCP Server Bağlanmıyor — Docker Daemon + macOS Sandbox
- **Sorun:** GitHub MCP, `mcp_config.json`'da Docker container olarak yapılandırılmıştı (`ghcr.io/github/github-mcp-server`). Docker Desktop kapalı olduğunda MCP asla başlatılamıyordu. Tüm `mcp_github-mcp-server_*` araçları devre dışı kalıyordu.
- **Ek Sorun:** `~/.npm` klasöründe macOS'un `com.apple.provenance` extended attribute'u vardı. Bu, sandbox ortamından çalışan npm süreçlerinin yeni paket indirmesini engelliyordu (EPERM hatası).
- **Çözüm (2 adım):**
  1. Terminal'den `sudo chown -R $(whoami) ~/.npm && xattr -dr com.apple.provenance ~/.npm` çalıştırıldı
  2. `mcp_config.json`'da GitHub MCP, Docker'dan npx tabanlıya geçirildi: `"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"]`
  3. Sandbox npm cache sorunu için `"npm_config_cache": "/tmp/npm-cache"` env değişkeni eklendi
- **Kural:** MCP sunucularını mümkünse Docker yerine npx/uvx ile çalıştır — Docker Desktop bağımlılığını ortadan kaldırır.
- **Tarih:** Mart 2026

### Notion MCP — Sayfa/Veritabanı 404 Hatası (ERİŞİM İZNİ EKSİK)
- **Sorun:** Notion MCP bağlantısı (`API-get-self`) başarılı dönüyor ama belirli sayfa veya veritabanına erişmeye çalışınca `404 Not Found` veya `Could not find ...` hatası alınıyor.
- **Kök Neden:** Notion entegrasyonları (örn. "antigravity" botu) **sadece kendilerine açıkça paylaşılmış** sayfalara erişebilir. Workspace'teki tüm sayfaları otomatik göremez. Kullanıcı yeni bir sayfa oluşturduğunda veya mevcut bir sayfayı paylaşmak istediğinde, o sayfayı entegrasyonla paylaşmamış olabilir.
- **Belirtiler:**
  - `API-get-self` başarılı (bot bilgisi döner) ama `API-retrieve-a-page`, `API-query-data-source` hata verir
  - `API-post-search` ile aratıldığında sayfa sonuçlarda çıkmaz
  - Aynı workspace'teki bazı sayfalar çalışır, bazıları 404 verir
- **Çözüm (Kullanıcı Tarafında — 30 saniye):**
  1. Notion'da ilgili sayfaya git
  2. Sağ üst köşede `...` (üç nokta) menüsüne tıkla
  3. **"Connections"** (veya "Bağlantılar") seçeneğini bul
  4. **"antigravity"** entegrasyonunu ekle (ara ve seç)
  5. Eğer sayfa bir inline database içeriyorsa, **üst sayfa (parent page)** paylaşılmalı — sadece inline DB paylaşılamaz
  6. Alt sayfalar (child pages) otomatik olarak üst sayfanın iznini miras alır
- **Tanı Prosedürü (AI Tarafında):**
  1. Önce `API-get-self` ile bağlantı sağlığını doğrula
  2. Sonra `API-post-search` ile sayfayı ada göre arat
  3. Arama sonucu boşsa → paylaşım eksik → kullanıcıya Connection ekleme talimatı ver
  4. Arama sonucu varsa → dönen `id` ile doğrudan erişmeyi dene
- **Önleme:** Yeni bir Notion sayfası/veritabanı ile çalışılacağında, **ilk iş** sayfanın "antigravity" entegrasyonuyla paylaşılıp paylaşılmadığını `API-post-search` ile kontrol et. Bulunamazsa kullanıcıya hemen sor — saatlerce 404 debug etme.
- **Tarih:** Mart 2026

### Notion MCP — Çift Workspace (İki Farklı Token) Karışıklığı
- **Sorun:** Antigravity sisteminde iki ayrı Notion workspace var. MCP `notion-mcp-server` sadece **bir** workspace'e bağlı olabilir. Yanlış workspace'teki sayfaya erişmeye çalışınca 404 alınır.
- **Mevcut MCP Bağlantısı:** `[İSİM SOYAD]'s Notion` workspace'i (antigravity botu)
- **Diğer Workspace:** `NOTION_SOCIAL_TOKEN` ile erişilen sosyal medya workspace'i (örn: İzleme Botları, Video İçerik Akışları vb.)
- **Çözüm:** MCP ile erişilemeyen workspace'teki verilere `curl` + `NOTION_SOCIAL_TOKEN` ile ulaş (Python script veya `run_command`). MCP sadece antigravity botunun bağlı olduğu workspace'i görür.
- **Kural:** `calisma-kurallari.md`'deki Notion Workspace Yapısı tablosuna bak — hangi DB'nin hangi workspace'te olduğunu kontrol et.
- **Tarih:** Mart 2026

---

## Coolify — SMTP Port Engellemesi (KRİTİK)

### `[Errno 101] Network is unreachable` — SMTP Email Gönderimi
- **Sorun:** Coolify container'larında `smtplib.SMTP_SSL("smtp.gmail.com", 465)` çağrısı `[Errno 101] Network is unreachable` hatası veriyor. Bu hata `Isbirligi_Tahsilat_Takip` ve `Akilli_Watchdog` projelerinde e-posta gönderimini haftalarca engelledi.
- **Kök Neden:** Coolify, abuse önleme nedeniyle SMTP portlarını (25, 465, 587) engeller. `smtplib` ile e-posta göndermek mümkün değil.
- **Etki:** `Isbirligi_Tahsilat_Takip` 7+ gün boyunca 17 markaya ödeme hatırlatması gönderemedi. `Akilli_Watchdog` sağlık raporu e-postaları hiç ulaşmadı.
- **Çözüm:** `smtplib` tamamen kaldırıldı → Gmail API (OAuth2) ile değiştirildi:
  1. `GOOGLE_OUTREACH_TOKEN_JSON` env variable'ı Coolify'e eklendi
  2. `google.oauth2.credentials.Credentials.from_authorized_user_info()` ile token parse
  3. `googleapiclient.discovery.build('gmail', 'v1')` ile service oluştur
  4. `base64.urlsafe_b64encode()` ile email encode → `users().messages().send()` 
- **Kural:** Coolify'de **ASLA** `smtplib` kullanma. Email göndermek için **Gmail API (OAuth2)** kullan. `Lead_Notifier_Bot` referans implementasyon.
- **Dikkat:** `variableUpsert` mutation'ı ile JSON env variable eklerken çift-escape sorunu olabilir. Token'ı her zaman doğrudan `json.dumps(token_string)` ile escape et, ek escape YAPMA.
- **Tarih:** Mart 2026

### markalar.csv Kalıcılık Sorunu — Coolify Ephemeral Filesystem
- **Sorun:** `Marka_Is_Birligi` projesinde `data/markalar.csv` dosyası `.gitignore`'da olduğu için Coolify'e deploy edilmiyordu. Her deploy sonrası `[FOLLOWUP] markalar.csv bulunamadı!` hatası.
- **Kök Neden:** Coolify container'ları ephemeral (geçici) dosya sistemi kullanır. `.gitignore` ile hariç tutulan dosyalar deploy'dan sonra mevcut olmaz.
- **Çözüm:** `ensure_csv_exists()` fonksiyonu eklendi — modül yüklendiğinde `data/` klasörü ve `markalar.csv` header-only olarak otomatik oluşturulur.
- **Kural:** Coolify'de runtime'da oluşturulan/güncellenen veri dosyaları **deploy sonrası kaybolur**. Ya otomatik oluşturma mekanizması ekle, ya da harici storage (Google Drive, DB) kullan.
- **Tarih:** Mart 2026

---

## Servis İzleyici — Self-Healer

### Cron Job'lar "unknown" Olarak Raporlanıyor
- **Sorun:** `[proje-adi]-reels-kapak` ve `revizyon-cron` servisleri Coolify Cron Job'a geçirilmişti ama `deploy-registry.md`'deki platform bilgisi `coolify` olarak kalmıştı. `health_check.py` sadece `platform == "coolify"` olan servisleri kontrol ediyordu → `coolify-cron` platformundaki servisler atlanıyordu → self-healer bunları "unknown" olarak raporluyordu.
- **Kök Neden:** Coolify Cron geçişi sırasında deploy-registry platformu güncellenmemiş + health_check.py filtresinde `coolify-cron` eksikti.
- **Çözüm (2 adım):**
  1. `deploy-registry.md` → `[proje-adi]-reels-kapak` ve `revizyon-cron` platformları `coolify` → `coolify-cron` olarak güncellendi
  2. `health_check.py` → satır 681: `p.get("platform") == "coolify"` → `p.get("platform") in ("coolify", "coolify-cron")` olarak genişletildi
- **Kural:** Bir servisi Coolify Cron Job'a taşırken **mutlaka** `deploy-registry.md`'deki platform bilgisini `coolify-cron` olarak güncelle.
- **Tarih:** Mart 2026

---

## Coolify — Nixpacks vs Aptfile/apt.txt Uyumsuzluğu (KRİTİK SİSTEMİK HATA)

### `FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'` — Sistem Bağımlılıkları Yüklenmiyor
- **Sorun:** `LinkedIn_Video_Paylasim` ve `Twitter_Video_Paylasim` projelerinde video pipeline her çalıştığında `FileNotFoundError: ffmpeg` hatası alıyordu. Projede `Aptfile` ve `apt.txt` dosyaları `ffmpeg` satırıyla mevcut olmasına rağmen Coolify `ffmpeg`'i yüklemiyordu.
- **Kök Neden:** Coolify, **Nixpacks builder** kullanır. Nixpacks, Heroku buildpack'lerine özgü `Aptfile` ve `apt.txt` dosyalarını **tamamen yoksayar**. Bu dosyaların projede bulunması "ayar yapılmış" yanılgısı yaratır (false confidence) ama aslında hiçbir işe yaramaz.
- **Etki:** Video pipeline günlerce çalışamadı. Aynı hata tekrar tekrar yapıldı çünkü yanıltıcı dosyalar "zaten ayarlanmış" hissi veriyordu.
- **Çözüm (6 Katmanlı Savunma):**
  1. **Legacy temizlik:** Tüm `Aptfile` ve `apt.txt` dosyaları silindi
  2. **nixpacks.toml:** Doğru yapılandırma dosyası `[phases.setup] nixPkgs = ["ffmpeg"]` ile oluşturuldu
  3. **Fail-fast:** `config.py`'da `shutil.which("ffmpeg")` kontrolü eklendi — uygulama başlarken binary yoksa anında çöker
  4. **V2 Starter Template:** `_check_system_deps()` metodu ve `nixpacks.toml` şablonu eklendi
  5. **Deploy Workflow:** Adım 2.5.7 Nixpacks-farkındalıklı sistem bağımlılığı kontrolü olarak güncellendi
  6. **Healing Playbook:** `missing_ffmpeg` pattern'i düzeltildi (eski yanlış tavsiye kaldırıldı)
- **Kurallar (KALICI):**
  1. Coolify'de sistem paketi yüklemek için **SADECE** `nixpacks.toml` kullanılır
  2. `Aptfile` ve `apt.txt` dosyaları oluşturulmaz — bulunursa silinir
  3. Sistem bağımlılığı gerektiren her projede `config.py`'da `_check_system_deps()` ile fail-fast kontrolü ZORUNLUDUR
  4. Deploy workflow'unda (Adım 2.5.7) nixpacks.toml varlığı ve legacy dosya kontrolü yapılır
- **Tarih:** Nisan 2026

### Nixpacks ffmpeg PATH Kaybı — `shutil.which` Bulur Ama `subprocess.run` Bulamaz (ALT SORUN)
- **Sorun:** `nixpacks.toml` doğru, build SUCCESS, `config.py`'deki `shutil.which("ffmpeg")` fail-fast kontrolü **geçiyor** (BOOT ERROR yok), AMA `video_processor.py`'deki `subprocess.run(["ffmpeg", ...])` çağrısı `FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'` hatası veriyor.
- **Kök Neden:** Nixpacks, ffmpeg'i `/root/.nix-profile/bin/` altına kuruyor. Ana Python process bu PATH'i görüyor (`shutil.which` başarılı), ama `subprocess.run` child process spawn ederken bazı durumlarda nix PATH'i miras alamıyor.
- **Çözüm:** `video_processor.py`'de bare `"ffmpeg"` string'i yerine modül load sırasında `shutil.which("ffmpeg")` ile resolve edilen **absolute path** kullanılır:
  ```python
  import shutil
  _FFMPEG_BIN = shutil.which("ffmpeg") or "ffmpeg"
  # subprocess.run([_FFMPEG_BIN, "-y", "-i", ...])
  ```
- **Etkilenen Projeler:** `Twitter_Video_Paylasim`, `LinkedIn_Video_Paylasim`
- **Kural:** Coolify/Nixpacks'ta sistem binary'leri (`ffmpeg`, `imagemagick` vb.) her zaman `shutil.which()` ile resolve edilmiş absolute path ile çağrılmalı. Bare binary adı kullanma.
- **Tarih:** 5 Nisan 2026


