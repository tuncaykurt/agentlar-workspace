# 🛡️ GitHub Güvenlik Kontrol Listesi

Bu dosya, herhangi bir projeyi GitHub'a push etmeden ÖNCE kontrol edilmesi gereken güvenlik adımlarını tanımlar.
Hem Antigravity sahibi ([İSİM]) hem de starter kit alanlar için geçerlidir.

---

## ⚠️ KURAL: API anahtarları ASLA GitHub'a push edilmez

API anahtarları sadece lokal `_knowledge/api-anahtarlari.md` dosyasında tutulur.
Bu dosya `.gitignore` ile otomatik olarak hariç tutulmalıdır.

---

## GitHub'a Push Öncesi Kontrol Listesi

### 1. `.gitignore` Kontrolü
- [ ] Repo kök dizininde `.gitignore` dosyası var mı?
- [ ] `.env`, `.env.*`, `credentials.env` hariç tutuluyor mu?
- [ ] `token.json`, `credentials.json` hariç tutuluyor mu?
- [ ] `.DS_Store` hariç tutuluyor mu?
- [ ] `__pycache__/`, `venv/`, `node_modules/` hariç tutuluyor mu?

### 2. API Key Taraması
Aşağıdaki komutlarla push öncesi tarama yap:

```bash
# Tüm bilinen API key desenlerini tara
grep -rn "sk-proj-\|sk-[A-Za-z0-9]\{20,\}\|apify_api_\|gsk_\|pplx-\|AIza\|sd_[a-f0-9]\{10,\}" . \
  --include="*.md" --include="*.py" --include="*.js" --include="*.json" \
  --include="*.html" --include="*.env" --include="*.yaml" --include="*.yml" \
  --exclude-dir=.git --exclude-dir=venv --exclude-dir=node_modules --exclude-dir=__pycache__

# Telegram bot token'ları
grep -rn "[0-9]\{8,10\}:AA[A-Za-z0-9_-]\{33\}" . \
  --exclude-dir=.git --exclude-dir=venv
```

Eğer bu komutlar çıktı veriyorsa, **o dosyalardaki gerçek key'leri placeholder'a çevir.**

### 3. Hassas Dosya Kontrolü
```bash
# Bu dosya türleri varsa dikkat et
find . -name "*.env" -not -name ".env.example" -not -path "./.git/*"
find . -name "token.json" -not -path "./.git/*"
find . -name "credentials.json" -not -path "./.git/*"
```

### 4. Git Cache Kontrolü
Eğer `.gitignore`'u sonradan eklediysen, eski dosyalar hâlâ cache'de olabilir:
```bash
# Cache'de takip edilen hassas dosyaları kontrol et
git ls-files --cached | grep -iE '\.env$|credentials|token\.json|\.DS_Store'

# Temizlemek için:
# git rm --cached <dosya-yolu>
```

---

## .gitignore Şablonu (Minimum Gerekli)

```gitignore
# API Key ve Credential dosyaları
.env
.env.*
!.env.example
credentials.env
token.json
credentials.json

# macOS
.DS_Store

# Python
__pycache__/
*.pyc
venv/
.venv/

# Node.js
node_modules/

# IDE
.cursor/
.vscode/
```

---

## Alıcılar İçin Ek Kurallar

Eğer bu repo'yu başka biriyle paylaşıyorsanız:

1. **Alıcıya `_knowledge/api-anahtarlari.md` dosyasını GitHub'a ASLA push etmemesini söyleyin**
2. **Alıcının kendi repo'sunda `.gitignore` olduğundan emin olun** (starter kit zaten içeriyor)
3. **`BASLANGIÇ_REHBERI.md`'de güvenlik uyarısı ekleyin** (zaten ekli)
4. **Alıcıya kendi API anahtarlarını üretmesini söyleyin** — sizin anahtarlarınızı paylaşmayın
