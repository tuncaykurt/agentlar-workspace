---
description: Deploy sonrası kapsamlı stabilizasyon — projenin tüm potansiyel buglarını tek seferde tespit et, düzelt ve doğrula
---

# 🛡️ /stabilize — Production Stabilizasyon Pipeline'ı

> Bu workflow, bir proje **deploy edildikten sonra** çalıştırılır.
> Amacı: 3-4 iterasyon yerine **tek seferde** tüm potansiyel bugları tespit edip düzeltmek.
> Platform bağımsızdır — Coolify, Netlify, GitHub Pages veya herhangi bir ortam için geçerlidir.

// turbo-all

---

## Kullanım

```
/stabilize <PROJE_ADI>
```

Örnek:
```
/stabilize Blog_Yazici
/stabilize Reels_Kapak
/stabilize Marka_Isbirligi
```

---

## ADIM 0 — Proje Keşfi ve Bağlam Yükleme

1. Proje klasörünü bul:
   ```
   ls ~/Desktop/Antigravity/Projeler/<PROJE_ADI>/
   ```
2. Tüm `.py`, `.js`, `.ts` dosyalarını listele ve **her birini oku** (view_file):
   - `main.py`, `app.py`, `worker.py` gibi entry point'ler → ÖNCELİKLİ
   - Tüm modülleri oku, hiçbirini atlama
3. Eğer varsa oku:
   - `README.md` → projenin ne yaptığını anla
   - `Dockerfile` → build sürecini anla
   - `requirements.txt` / `package.json` → bağımlılıkları anla
   - `.env.example` veya env referanslarını anla
   - `railway.json` / `netlify.toml` / `Procfile` → deploy config'i anla
4. `_knowledge/deploy-registry.md` → proje nerede deploy edilmiş, ID'leri ne?
5. Eğer Coolify projesi ise → son deploy loglarını çek (GraphQL API ile)

**⚠️ BU ADIMI ATLAMA. Projenin KODUNU OKUMADAN analize başlama. Her dosyayı okumalısın.**

---

## ADIM 1 — Statik Analiz (Kod Okumadan Bulunabilecek Buglar)

### 1.1 — Syntax Kontrolü
```bash
cd ~/Desktop/Antigravity/Projeler/<PROJE_ADI>
find . -maxdepth 3 -name "*.py" -exec python3 -m py_compile {} \;
```

### 1.2 — Import Zinciri Testi
```bash
cd ~/Desktop/Antigravity/Projeler/<PROJE_ADI>
python3 -c "
import sys, os, importlib
sys.path.insert(0, '.')
errors = []
for f in os.listdir('.'):
    if f.endswith('.py') and f != 'setup.py':
        mod = f[:-3]
        try:
            importlib.import_module(mod)
        except Exception as e:
            errors.append(f'{mod}: {type(e).__name__}: {e}')
if errors:
    print('❌ IMPORT HATALARI:')
    for e in errors: print(f'  - {e}')
    sys.exit(1)
else:
    print('✅ Tüm modüller başarıyla import edildi')
"
```

### 1.3 — Dependency Audit (requirements.txt vs Gerçek Import'lar)
```bash
cd ~/Desktop/Antigravity/Projeler/<PROJE_ADI>

# Kullanılan import'ları çıkar
grep -rh "^import \|^from " *.py 2>/dev/null | sed 's/from \([a-zA-Z_]*\).*/\1/' | sed 's/import \([a-zA-Z_]*\).*/\1/' | sort -u > /tmp/used_imports.txt

# requirements.txt'deki paketleri çıkar
cat requirements.txt 2>/dev/null | grep -v "^#" | grep -v "^$" | sed 's/[>=<].*//' | sed 's/_/-/g' | tr '[:upper:]' '[:lower:]' | sort -u > /tmp/declared_deps.txt

echo "=== Kullanılan import'lar ==="
cat /tmp/used_imports.txt
echo ""
echo "=== Bildirilen bağımlılıklar ==="
cat /tmp/declared_deps.txt
```

Bu çıktıyı analiz et:
- **Kullanılan ama requirements.txt'de olmayan** 3rd party paketler → ❌ KRİTİK: Runtime'da `ModuleNotFoundError` verir
- **requirements.txt'de olan ama kullanılmayan** paketler → ⚠️ Uyarı (gereksiz bağımlılık, ama tehlikeli değil)

### 1.4 — Hardcoded Secret/Token Tarama
```bash
cd ~/Desktop/Antigravity/Projeler/<PROJE_ADI>
grep -rnE "(sk-|AIza|ghp_|ghs_|xoxb-|Bearer [A-Za-z0-9]|api[_-]?key\s*=\s*['\"][A-Za-z0-9])" --include="*.py" --include="*.js" .
grep -rnE "password\s*=\s*['\"][^'\"]+['\"]" --include="*.py" --include="*.js" .
```

### 1.5 — .gitignore Kontrolü
```bash
cd ~/Desktop/Antigravity/Projeler/<PROJE_ADI>
# Bu dosyaların .gitignore'da OLDUĞUNDAN emin ol:
for f in ".env" "token.json" "credentials.json" "__pycache__" "*.pyc" "venv" ".venv"; do
  if grep -q "$f" .gitignore 2>/dev/null; then
    echo "✅ $f → .gitignore'da var"
  else
    echo "⚠️ $f → .gitignore'da YOK"
  fi
done
```

### 1.6 — Akıllı Dependency Matching (Pip Adı ≠ Import Adı)

> **Bu kontrol KRİTİK.** `google-genai` vs `google-generativeai`, `python-telegram-bot` vs `telegram`,
> `Pillow` vs `PIL` gibi pip-import uyumsuzlukları seni defalarca yakmıştır.

Aşağıdaki **bilinen pip↔import eşleşme tablosunu** kullanarak, kodda import edilen paketlerin
requirements.txt'de DOĞRU pip adıyla bulunup bulunmadığını kontrol et:

| Import Adı | Doğru Pip Adı | Yanlış/Eski Pip Adı |
|------------|---------------|---------------------|
| `google.genai` | `google-genai` | `google-generativeai` (eski SDK) |
| `google.generativeai` | `google-generativeai` | `google-genai` (yeni SDK) |
| `telegram` / `telegram.ext` | `python-telegram-bot` | `telegram` |
| `PIL` / `PIL.Image` | `Pillow` | `PIL` |
| `cv2` | `opencv-python` | `cv2` |
| `yaml` | `PyYAML` | `yaml` |
| `bs4` | `beautifulsoup4` | `bs4` |
| `dotenv` | `python-dotenv` | `dotenv` |
| `google.oauth2` | `google-auth` | — |
| `googleapiclient` | `google-api-python-client` | — |
| `google.auth.transport` | `google-auth-httplib2` | — |
| `notion_client` | `notion-client` | — |
| `apify_client` | `apify-client` | — |
| `openai` | `openai` | — |
| `fal_client` | `fal-client` | `fal` |
| `sklearn` | `scikit-learn` | `sklearn` |

**Kontrol adımları:**
1. Koddan tüm 3rd party import'ları çıkar
2. Tablodaki eşleşmeyi kullanarak beklenen pip adını bul
3. `requirements.txt`'de bu pip adını ara
4. Eşleşme YOKSA → ❌ KRİTİK: Docker build'de `ModuleNotFoundError` verecek

**Ayrıca SDK çakışmasını kontrol et:**
- Aynı projede HEM `google-genai` HEM `google-generativeai` varsa → ❌ Çakışma
- `google.genai` import ediliyorsa → `google-genai` olmalı (yeni SDK)
- `google.generativeai` import ediliyorsa → `google-generativeai` olmalı (eski SDK)

### 1.7 — Version Pinning Kontrolü
```bash
cd ~/Desktop/Antigravity/Projeler/<PROJE_ADI>
echo "=== Version Pinning Kontrolü ==="
while IFS= read -r line; do
  # Boş satır ve yorum atla
  [[ -z "$line" || "$line" == \#* ]] && continue
  if echo "$line" | grep -qE "=="; then
    echo "✅ Pinned: $line"
  else
    echo "⚠️ UNPINNED: $line → Rebuild'de farklı versiyon gelebilir!"
  fi
done < requirements.txt
```

Unpinned paket varsa:
- **Kritik paketler** (`google-genai`, `openai`, `python-telegram-bot` vb.) → ❌ Pin'le
- **Utility paketler** (`requests`, `python-dotenv` vb.) → ⚠️ Uyar, sor

### 1.8 — Bilinen Anti-Pattern Cross-Check (hatalar-ve-cozumler.md)

> Bu adım, `_knowledge/hatalar-ve-cozumler.md` dosyasındaki bilinen hataların bu projede de mevcut olup olmadığını kontrol eder.

Projenin kodunu aşağıdaki anti-pattern'ler için tara:

| Anti-Pattern | Aranacak İz | Referans |
|---|---|---|
| Coolify'de smtplib kullanımı | `import smtplib` veya `smtplib.SMTP` | Coolify SMTP portlarını engeller → Gmail API kullan |
| Deprecated Gemini model adı | `gemini-1.5-pro-latest`, `gemini-pro-vision` | Model deprecate olmuş → `gemini-2.0-flash` veya `gemini-2.5-pro` kullan |
| `except: pass` (sessiz hata yutma) | `except:` ardından `pass`, `continue` | Hata gizlenir → en azından logla |
| `Path.parents[N]` güvensiz erişim | `parents[2]`, `parents[3]` vb. | Coolify'de IndexError → uzunluk kontrolü ekle |
| OAuth scope uyumsuzluğu | `SCOPES = [` listesini kontrol et | Token scope'u ile kod scope'u eşleşmeli |
| hardcoded path (`/Users/`) | `/Users/[isim]`, `/home/` | Docker'da çalışmaz → relative path veya env var kullan |
| `.gitignore`'da olup runtime'da lazım olan dosya | Kodda okunan ama `.gitignore`'da olan dosyalar | Coolify ephemeral FS → auto-create mekanizması ekle |
| SSL/Connection retry eksikliği | `requests.get(` veya `requests.post(` without retry | Coolify'de SSL kopması yaygın → retry + reconnect ekle |

---

## ADIM 2 — Semantik Analiz (Kodu Okuyarak Bulunabilecek Buglar)

> Bu adım **her kaynak dosyayı okumuş olmanı** gerektirir (Adım 0).

### 2.1 — Entry Point Akış Analizi
Ana dosyayı (main.py, worker.py, app.py vb.) oku ve aşağıdaki akışı takip et:
1. Program başladığında ilk ne çalışıyor?
2. Hangi fonksiyonlar hangi sırayla çağrılıyor?
3. Try/except blokları var mı? Hatalar yutulup sessizce geçiliyor mu?
4. `if __name__ == "__main__"` bloğu var mı?

### 2.2 — Environment Variable Kontrolü
Kodda kullanılan TÜM `os.getenv()`, `os.environ[]`, `os.environ.get()` çağrılarını listele.
Her biri için:
- Default değer verilmiş mi? (Verilmemişse ve env yoksa → `None` döner → potansiyel `TypeError`)
- Coolify/Netlify'da bu env var'lar tanımlı mı? (`deploy-registry.md` veya Coolify API ile kontrol et)
- Var olmayan bir env var kullanılıyorsa → ❌ KRİTİK

### 2.3 — API Çağrıları ve Hata Yönetimi
Tüm dış API çağrılarını (requests.get/post, googleapiclient, openai, vb.) tara:
- Her API çağrısı try/except içinde mi?
- Timeout parametresi var mı? (Yoksa → ⚠️ Sonsuz bekleme riski)
- HTTP hata kodları kontrol ediliyor mu? (`response.raise_for_status()` veya status_code kontrolü)
- Rate limit / retry mekanizması var mı?

### 2.4 — Dosya Yolu ve I/O Kontrolleri
- Hardcoded dosya yolları var mı? (Docker'da farklı yol olabilir)
- `/tmp/` kullanılıyorsa, Docker container'da erişilebilir mi?
- Dosya yazma/okuma işlemlerinde hata yönetimi var mı?

### 2.5 — Edge Case ve Race Condition Analizi
- Boş veri gelirse ne olur? (Notion'da hiç kayıt yoksa, Sheet boşsa, API boş response dönerse)
- Aynı kayıt iki kere işlenirse ne olur? (Idempotency kontrolü var mı?)
- Network timeout olursa ne olur? (Retry var mı, yoksa sessizce mi çöker?)
- Büyük veri gelirse ne olur? (Memory limiti aşılabilir mi?)

### 2.6 — Dockerfile Analizi (Varsa)
- Base image doğru mu? (python:3.x-slim vs python:3.x)
- `COPY` path'leri dosya yapısıyla uyumlu mu?
- `WORKDIR` doğru ayarlanmış mı?
- `CMD` veya `ENTRYPOINT` doğru dosyayı mı çalıştırıyor?
- Multi-stage build gerekli mi?
- requirements.txt install ediliyor mu ve `--no-cache-dir` var mı?

### 2.7 — Schedule/Cron Doğrulaması (Varsa)
- Cron expression doğru mu? (Coolify schedule format'ı)
- Timezone hesaplanmış mı?
- Çakışma riski var mı? (Bir önceki çalışma bitmeden yenisi başlayabilir mi?)

### 2.8 — Docker Sistem Bağımlılıkları Kontrolü (Varsa)

> Python paketlerinin bazıları C kütüphanelerine bağımlıdır. Docker'da bunlar `apt-get install` ile yüklenmezse
> `ImportError` veya `pip install` sırasında build hatası alırsın.

Projede kullanılan paketleri aşağıdaki tabloyla karşılaştır ve Dockerfile'da gerekli `apt-get` komutlarının olduğundan emin ol:

| Python Paketi | Gereken Sistem Paketi | Dockerfile Komutu |
|---|---|---|
| `Pillow` | `libjpeg-dev`, `zlib1g-dev`, `libpng-dev` | `apt-get install -y libjpeg-dev zlib1g-dev` |
| `pydub` / ses işleme | `ffmpeg` | `apt-get install -y ffmpeg` |
| `opencv-python` | `libgl1-mesa-glx`, `libglib2.0-0` | `apt-get install -y libgl1-mesa-glx libglib2.0-0` |
| `cryptography` | `libffi-dev`, `libssl-dev` | `apt-get install -y libffi-dev libssl-dev` |
| `lxml` | `libxml2-dev`, `libxslt1-dev` | `apt-get install -y libxml2-dev libxslt1-dev` |
| `matplotlib` (font rendering) | `fonts-liberation` veya custom font | `COPY fonts/ /usr/share/fonts/` |
| `cairosvg` | `libcairo2` | `apt-get install -y libcairo2` |

Eşleşme varsa ve Dockerfile'da eksikse → ❌ Docker build veya runtime'da çökecek

### 2.9 — Harici Servis Şema Doğrulaması

> Kodun referans ettiği Notion property'leri, Google Sheet tab/kolon adları veya API endpoint'leri
> gerçekten var mı? Şema değişikliği en sinsi bug türüdür — hata sessizce oluşur.

**Notion kullanan projeler için:**
1. Kodda kullanılan tüm Notion property adlarını çıkar (`properties["Durum"]`, `properties["URL"]` vb.)
2. Notion MCP ile ilgili database'i çek (`mcp_notion-mcp-server_API-retrieve-a-database`)
3. Koddaki property adlarının database schema'sında VAR OLDUĞUNU doğrula
4. Tip uyumsuzluğu kontrol et (kod `rich_text` bekliyor ama property `title` tipinde mi?)

**Google Sheets kullanan projeler için:**
1. Kodda kullanılan tab adlarını ve kolon referanslarını çıkar
2. `mcp_google-workspace-mcp_read_sheet_values` ile gerçek tab/kolon yapısını çek
3. Koddaki referansların gerçek yapıyla eşleştiğini doğrula

**API endpoint'leri için:**
1. Kodda kullanılan base URL'leri listele
2. Basit bir `curl -I <URL>` ile erişilebilirlik testi yap (200/301 → ✅, 404/500 → ❌)

---

## ADIM 3 — Runtime Doğrulaması (Gerçek Ortamda Kontrol)

### 3.1 — Coolify Log Analizi (Coolify projeleri için)
```bash
# Trigger redeploy via Coolify webhook or API
```

### 6.2 — Çalıştırma Sonrası Log İzleme
1. **90 saniye bekle** (cron job'un tüm pipeline'ı çalıştırması için)
2. Logları çek (Adım 3.1'deki komutla)
3. **Başarı pattern'leri ara:**
   - `Pipeline completed`, `Successfully processed`, `✅` gibi pozitif loglar
   - Projenin kendi başarı mesajları (README'den öğren)
4. **Hata pattern'leri ara** (Adım 3.1'deki fatal pattern listesiyle)

### 6.3 — Gerçek Çıktı Doğrulaması
Pipeline bir çıktı üretiyorsa (GitHub commit, Notion güncelleme, e-posta, vb.):
- **Blog Yazıcı** → GitHub'da yeni blog post commit edildi mi? (`mcp_github-mcp-server_list_commits`)
- **Lead Pipeline** → Notion'da yeni lead eklendi mi? (`mcp_notion-mcp-server_API-query-data-source`)
- **[İSİM] Reels Kapak** → Notion'da kapak URL'si güncellendi mi?
- **Marka İş Birliği** → CSV veya Notion'da outreach kaydı oluştu mu?
- **Akilli Watchdog** → Sağlık raporu e-postası gönderildi mi?

Çıktı üretilmediyse → ⚠️ Pipeline sessizce başarısız olmuş olabilir (hata yutulmuş)

---

## ADIM 7 — Bilgi Bankası Otomatik Güncelleme

> Stabilize sırasında bulunan her YENİ bug tipi, `hatalar-ve-cozumler.md`'ye eklenmeli.
> Böylece aynı bug başka projede çıktığında workflow onu otomatik yakalar (Adım 1.8).

### 7.1 — Yeni Bug Tespiti
Stabilize sırasında fix yapılan her sorun için:
1. Bu sorun tipi `hatalar-ve-cozumler.md`'de zaten var mı?
2. Yoksa → bu **yeni bir pattern** demektir

### 7.2 — Otomatik Ekleme
Yeni pattern bulunduysa, `_knowledge/hatalar-ve-cozumler.md` dosyasına ekle:
```markdown
### [Hata Başlığı] — [Proje Adı]
- **Sorun:** [Kısa açıklama]
- **Kök Neden:** [Neden ortaya çıktı]
- **Çözüm:** [Nasıl düzeltildi]
- **Kural:** [Gelecekte bunu önlemek için kural]
- **Tarih:** [Tarih]
```

### 7.3 — Anti-Pattern Tablosunu Güncelle
Eğer yeni bug stabilize workflow'undaki 1.8 anti-pattern tablosuna da eklenmeliyse → `/stabilize.md`'yi de güncelle. Böylece feedback loop kapanır:

```
Bug bulundu → Fix yapıldı → hatalar-ve-cozumler.md güncellendi → stabilize.md anti-pattern tablosu güncellendi
→ Sonraki projede aynı bug otomatik yakalanır
```

---

## ADIM 8 — Düzeltme Sonrası Doğrulama

Fix yaptıysan → aşağıdaki döngüyü çalıştır:

1. Syntax kontrolü tekrar (Adım 1.1)
2. Import testi tekrar (Adım 1.2)
3. Coolify/Netlify ise → push et, deploy ol, logları kontrol et
4. Cron projesi ise → Adım 6'yı tekrar çalıştır (manuel tetikleme + çıktı doğrulama)
5. Eğer hala hata varsa → düzelt ve bu adıma DÖN

**Bu döngü SIFIR hata olana kadar devam eder.**

---

## ADIM 9 — Proje Dokümantasyonu (README) Güncellemesi

> Stabilize işlemi sırasında kodda yapılan değişiklikleri, düzeltilen kritik bug'ları ve eklenen koruma mekanizmalarını kalıcı hale getirmek için projenin kendi belgelerini güncellemelisin.

1. Proje dizinindeki `README.md` dosyasını `view_file` ile oku. Yoksa oluştur (`write_to_file`).
2. `README.md`'nin sonuna (veya "Değişiklik Kaydı" / "Changelog" / "Stabilizasyon Notları" bölümüne) şu formata benzer bir ekleme yap:
   ```markdown
   ## 🛡️ Stabilizasyon ve Hata Giderme (<BUGÜNÜN_TARİHİ>)
   - **Fix 1:** [Sorun] çözüldü, [Çözüm] uygulandı.
   - **Fix 2:** Edge case yakalandı, timeout eklendi vb.
   ```
3. Eğer `/stabilize` projenin dependency'lerini (requirements.txt vb.) değiştirdi veya sabitlediyse, `README.md` içindeki Kurulum veya Dependency bölümünü de güncelle.
4. Yaptığın güncellemeleri dosyaya kaydet (`multi_replace_file_content` veya `replace_file_content`).
5. Yapılan doküman değişikliklerini GitHub'a ayrıca pushla (Örn: `mcp_github-mcp-server_create_or_update_file` veya git commit komutlarıyla).

---

## ADIM 10 — Stabilizasyon Raporu

Tüm süreç bittiğinde kullanıcıya detaylı rapor ver:

```markdown
# 🛡️ Stabilizasyon Raporu — <PROJE_ADI>

## Tarih: <TARİH>
## Platform: Coolify / Netlify / Diğer

### 📊 Özet
| Kategori | Bulunan | Düzeltilen | Kalan |
|----------|---------|------------|-------|
| 🔴 Kritik | X | X | 0 |
| 🟡 Yüksek | X | X | 0 |
| 🟢 Düşük | X | X | X |

### 🔍 Bulunan ve Düzeltilen Sorunlar
1. [Sorun açıklaması] → [Nasıl düzeltildi]
2. [Sorun açıklaması] → [Nasıl düzeltildi]
...

### ✅ Doğrulama Sonuçları
- Syntax: ✅
- Import Chain: ✅
- Dependencies (pip↔import): ✅
- Version Pinning: ✅
- Anti-Pattern Scan: ✅
- Docker System Deps: ✅
- Env Variables: ✅
- Harici Servis Şemaları: ✅
- Deploy Logs: ✅ (Temiz)
- Cron İlk Çalıştırma: ✅ (Gerçek çıktı üretildi)
- Bilgi Bankası: ✅ (X yeni pattern eklendi)
- README / Dokümantasyon: ✅ (Gelişmeler projeye işlendi)

### 🏁 Sonuç
✅ Proje stabil durumda — production-ready
```

---

## Önemli Notlar

1. **Bu workflow sadece deploy SONRASI çalışır.** Deploy öncesi kontroller `/canli-yayina-al` workflow'undadır.
2. **Her dosyayı oku.** Dosya okumadan analiz yapma — gözden kaçan tek bir satır bile production bug'a dönüşür.
3. **Sıfır hata hedefi.** Kritik ve Yüksek severity'deki sorunların HEPSI düzeltilmelidir.
4. **Sessiz hatalar en tehlikeli olanlardır.** `except: pass` veya `except Exception: continue` gibi hata yutan blokları özellikle ara.
5. **Platform bağımsız çalış.** Coolify, Netlify, GitHub Pages — platform ne olursa olsun aynı kalitede denetim yap.
6. **Düzeltme sonrası mutlaka doğrula.** Fix yaptıysan, fix'in kendisinin yeni bug üretmediğinden emin ol.
7. **Cron projelerini MUTLAKA hemen tetikle.** Ertesi günü bekleme — Adım 6 ile hemen test et.
8. **Bilgi bankasını güncelle.** Yeni bir bug pattern'i keşfettiysen `hatalar-ve-cozumler.md`'ye ekle. Feedback loop kapanmalı.

---

## `/canli-yayina-al` Entegrasyonu

> `/canli-yayina-al` workflow'u tamamlandığında, Adım 8 (Kayıt ve Rapor) sonrasında
> aşağıdaki mesajı **her zaman** kullanıcıya göster:

```
⚠️ Deploy tamamlandı. Kapsamlı stabilizasyon için `/stabilize <PROJE_ADI>` çalıştırmanızı öneriyorum.
```

> Kullanıcı onaylarsa → bu workflow'u hemen başlat.
> Stabilize çalıştırılmadan deploy tam anlamıyla "tamamlanmış" SAYILMAZ.

