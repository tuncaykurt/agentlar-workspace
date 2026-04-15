---
description: Değişiklik Kontrol — Her proje değişikliğinden sonra çalıştırılacak kalite kontrol pipeline'ı
---

// turbo-all

# 🔍 Değişiklik Kontrol Pipeline'ı

Bu workflow, bir projede yapılan **HER değişiklikten sonra** otomatik olarak uygulanır.
Amacı: Push edilmemiş kod, güncel olmayan README, kırık import ve tutarsız deploy-registry'yi önlemek.

---

## Adım 1 — Değişen Dosyaları Tespit Et

```bash
cd <proje_dizini>
git status --porcelain
git diff --stat
```

Eğer değişen dosya yoksa → "✅ Değişiklik yok, kontrol tamamlandı" mesajı ver ve çık.

## Adım 2 — Syntax Kontrolü

Tüm Python dosyalarında syntax hatası olup olmadığını kontrol et:

```bash
find . -maxdepth 3 -name "*.py" -exec python3 -m py_compile {} \;
```

**Hata varsa → DURMA. Hatayı düzelt, tekrar kontrol et.**

## Adım 3 — Import Testi

Tüm top-level Python dosyalarının importlanabildiğini doğrula. Özellikle **silinen veya taşınan dosyaları** import eden başka dosya kalmadığından emin ol:

```bash
# Silinen dosyaları bul
git diff --name-only --diff-filter=D | grep '\.py$'

# Silinen dosya varsa, kalan dosyalarda import arama
grep -r "from <silinen_dosya> import\|import <silinen_dosya>" --include="*.py" .
```

**Kırık import varsa → DURMA. Import'u düzelt.**

## Adım 4 — README Güncelleme Kontrolü

Aşağıdaki kontrolleri yap:

1. **Yeni dosya eklendi mi?** → README'nin dosya yapısı bölümünde var mı?
2. **Dosya silindi mi?** → README'den de kaldırıldı mı?
3. **Dosya ismi/rolü değişti mi?** → README güncel mi?
4. **Yeni environment variable eklendi mi?** → README'deki env tablosunda var mı?
5. **Önemli davranış değişikliği var mı?** → README'deki açıklama güncel mi?

```bash
# README'de bahsedilen .py dosyaları
grep -oE '[a-zA-Z_]+\.py' README.md | sort -u

# Gerçekte var olan .py dosyaları
find . -maxdepth 2 -name "*.py" | xargs -I{} basename {} | sort -u

# Fark varsa README'yi güncelle
```

**README güncel değilse → Güncelle, sonra devam et.**

## Adım 5 — Bağımlı Proje Kontrolü

Bu değişiklik başka projeleri etkiliyor mu? Özellikle kontrol et:

| Değişiklik Tipi | Etkilenen Proje |
|-----------------|-----------------|
| Proje ismi değişti | Akilli_Watchdog (config.py izlenen projeler listesi) |
| Google Sheet tab ismi değişti | Tele_Satis_CRM, Tele_Satis_Notifier, Akilli_Watchdog |
| Notion DB yapısı değişti | Isbirligi_Tahsilat_Takip, Tele_Satis_CRM, Reels_Kapak |
| API key/token değişti | Tüm projeler (_knowledge/credentials/master.env) |

Etkilenen proje varsa → O projede de gerekli güncellemeyi yap ve push et.

## Adım 5.5 — i18n Kontrol (Ornek_AI_Website İçin ZORUNLU)

> Bu adım **sadece** `Ornek_AI_Website` projesinde metin değişikliği yapıldığında uygulanır.

1. **Locale dosyalarını kontrol et:** `src/i18n/locales/{tr,en,zh,es}.json` — değişen key'ler 4 dosyada da güncel mi?
2. **Yeni key eklendiyse** 4 locale'in tümünde mevcut mu?
3. **Key silindiyse** 4 locale'den de kaldırıldı mı?
4. **Tarayıcı testi:** `browser_subagent` ile localhost'ta 4 dili (TR/EN/ZH/ES) test et
5. **Kullanıcı sadece Türkçe denetler** — Antigravity EN/ZH/ES dillerini kendisi doğrular

**Key sayıları eşit değilse → DURMA. Eksik key'leri ekle.**

## Adım 6 — Git Push

```bash
cd <proje_dizini>
git add -A
git commit -m "<değişiklik açıklaması>"
git push origin main
```

## Adım 7 — Deploy Kontrolü (Eğer Coolify Projesi İse)

1. Deploy-registry.md'den proje ID'lerini al
2. Yeni deployment'ı bekle (Coolify otomatik deploy eder)
3. 60 saniye bekle
4. Deploy log'larını çek ve kontrol et:
   - `AttributeError` → Kırık referans
   - `ImportError` → Eksik/taşınmış modül
   - `SyntaxError` → Syntax hatası
   - `Traceback` → Runtime hatası

```bash
# Check Coolify logs via dashboard or API if configured
```


**Fatal error varsa → Düzelt, tekrar push et, tekrar kontrol et.**

## Adım 8 — Deploy Registry Güncelle

`_knowledge/deploy-registry.md` dosyasında:
- **Son Deploy** tarihini güncelle
- **Durum** açıklamasını güncelle (ne değişti)

## Adım 9 — Son Rapor

Kullanıcıya kısa rapor ver:

```
✅ Değişiklik Kontrol Tamamlandı
- Syntax: ✅ Hatasız
- Import: ✅ Tüm modüller yüklenebilir
- README: ✅ Güncel
- i18n: ✅ 4 dil güncel (Ornek_AI_Website ise)
- Git Push: ✅ main branch'e push edildi
- Deploy: ✅ Coolify'de çalışıyor (sorunsuz)
- Registry: ✅ deploy-registry.md güncellendi
- Bağımlı Projeler: ✅ Etkilenen proje yok / güncellendi
```
