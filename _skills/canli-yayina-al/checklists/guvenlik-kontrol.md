# 🛡️ Pre-Deploy Güvenlik Kontrol Listesi

Bu listeyi her deploy öncesinde uygula. Tek bir madde bile atlanmamalı.

---

## 1. Kod İçi Gizli Bilgi Taraması

```bash
# Bu komutu proje klasöründe çalıştır:
grep -rn --include="*.py" --include="*.js" --include="*.ts" --include="*.env" \
  "sk-\|AIza\|ghp_\|gsk_\|apify_api_\|pplx-\|GOCSPX\|Bearer \|api_key\|apiKey\|API_KEY\|secret\|password\|token" .

# AYRICA: Fallback değer olarak gizlenmiş key'leri de tara:
grep -rn --include="*.py" "environ.get.*'[a-zA-Z0-9_-]\{10,\}'" .
```

**Eğer sonuç çıkarsa:**
- [ ] Her hardcoded key'i `os.environ.get('KEY_NAME')` ile değiştir
- [ ] `.env` dosyasına taşı
- [ ] Railway'de environment variable olarak ayarla

---

## 2. Dosya Güvenliği

- [ ] `.gitignore` dosyası mevcut ve güncel mi?
- [ ] `.env` dosyası `.gitignore`'da listelenmiş mi?
- [ ] `token.json` / `token.pickle` `.gitignore`'da mı?
- [ ] `credentials.json` `.gitignore`'da mı?
- [ ] `__pycache__/` ve `venv/` `.gitignore`'da mı?

---

## 3. Environment Variable Kontrolü

- [ ] Projenin çalışması için gereken tüm key/token'lar listelenmiş mi?
- [ ] Her biri Railway'de set edilecek mi?
- [ ] Kodda default/fallback değer olarak gerçek key kullanılmamış mı?

```python
# ❌ YANLIŞ
API_KEY = os.environ.get('API_KEY', 'sk-gercek-key-buraya')

# ✅ DOĞRU
API_KEY = os.environ.get('API_KEY')
if not API_KEY:
    raise ValueError("API_KEY environment variable is required")
```

---

## 4. Push Sonrası Kontrol

- [ ] GitHub repo'sundaki dosyalar kontrol edildi mi?
- [ ] Hassas dosya push edilmemiş mi?
- [ ] GitHub Secret Scanning uyarısı yok mu?
- [ ] Repo private mı? (hassas proje ise)

---

## 5. Railway Deploy Sonrası

- [ ] Loglar temiz mi?
- [ ] Servis başarıyla başladı mı?
- [ ] Environment variables doğru ayarlanmış mı?
- [ ] Restart policy aktif mi?

---

> ⚠️ **Bu kontrol listesini atlama.** Bir API key'in GitHub'a sızması, 
> servis sağlayıcılar tarafından otomatik tespit edilir ve key iptal edilebilir.
> Bu durum production servisin çökmesine neden olur.
