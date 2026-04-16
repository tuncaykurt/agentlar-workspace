# 🚀 Antigravity — AI Agent Talimatları

Bu dosya, Antigravity projesiyle çalışan AI agent'ın her konuşmada bilmesi gereken temel kuralları içerir.

---

## 🔐 Google OAuth — Merkezi Token Sistemi

**Google API erişimi (Gmail, Drive, Sheets) için asla yeni token oluşturma, terminal URL yapıştırma veya tarayıcı açma!**

Tokenlar zaten merkezi depoda mevcut ve otomatik yenileniyor:

```
_knowledge/credentials/oauth/
├── google_auth.py              ← Bu modülü import et
└── gmail-token.json            ← [GMAIL_ADRESINIZ]
```

### Kullanım
```python
import sys, os
sys.path.insert(0, os.path.join(os.path.expanduser("~/Desktop/Antigravity"), "_knowledge/credentials/oauth"))
from google_auth import get_gmail_service, get_sheets_service, get_drive_service

# Ana hesap
gmail = get_gmail_service("outreach")
sheets = get_sheets_service("outreach")
drive = get_drive_service("outreach")
```

### Kurallar
1. **Yeni token oluşturma** — mevcut tokenlar `refresh_token` ile sonsuza kadar yenilenir
2. **Token dosyasını kopyalama veya taşıma** — merkezi depodaki dosyalar kullanılır
3. **Kullanıcıdan terminal etkileşimi isteme** — token yenileme otomatik
4. Sadece token tamamen bozulduysa: `cd _knowledge/credentials/oauth && python3 auth_helper.py status`

---

## 🔑 API Anahtarları — Merkezi .env Deposu

Tüm API anahtarları tek dosyada: `_knowledge/credentials/master.env`

Projelere bağlamak için `_skills/sifre-yonetici/` skill'ini kullan (detaylar `SKILL.md`'de).

---

## 🚀 Otonom Çalışma ve Terminal Kullanımı (ÇOK ÖNEMLİ)

**Sen (Antigravity), tam otonom bir AI asistansın. Kullanıcıdan manuel işlem yapmasını İSTEMEMELİSİN.**

1. **Terminal Komutları:** Bir terminal komutu çalıştırılması gerekiyorsa (bağımlılık yükleme, git komutları, dosya taşıma, script çalıştırma), kullanıcıya "Lütfen terminale gidip şu komutu yapıştırın" DEME. Bunun yerine `run_command` tool'unu kullanarak komutu bizzat ÇALIŞTIR. Kullanıcı çıkan pencereden sadece onaylayacaktır. Seçebiliyorsan 'SafeToAutoRun' argümanını gerektiği yerde kullanarak işlemleri hızlandır.
2. **GitHub İşlemleri:** GitHub commit, push, PR açma, branch oluşturma gibi işlemler için KESİNLİKLE GitHub MCP server tool'larını (`mcp_github-mcp-server_*`) veya terminal üzerinden `git` komutlarını (`run_command` ile) kullan. Kullanıcıdan GitHub'ta manuel işlem yapmasını ASLA isteme.
3. **Coolify Deployments:** Coolify ile ilgili bir işlem (deploy, ortam değişkeni ekleme/güncelleme) yapman gerekiyorsa, `master.env` dosyasındaki `COOLIFY_TOKEN` bilgisini `COOLIFY_TOKEN=... coolify ...` şeklinde kullanarak `run_command` üzerinden bizzat çalıştır.
4. **Dosya Değişiklikleri:** Olası tüm dosya okuma/yazma/düzenleme işlemlerini doğrudan tool'ları kullanarak (örn: `replace_file_content`, `write_to_file`) gerçekleştir.

Kısacası: **Elindeki yetkileri (Tool'ları, MCP'yi ve Terminali) kullan, kullanıcıdan senin yerine klavye/fare kullanmasını isteme.**

---

## 📁 Proje Yapısı

```
Antigravity/
├── _agents/          ← Orkestrasyon agent'ları + workflow'lar
├── _skills/          ← Atomik beceriler (lead bulma, mail atma, video üretimi vb.)
├── _knowledge/       ← Merkezi bilgi bankası + credentials deposu
└── Projeler/         ← Aktif projeler
```

---

## 📋 Sık Kullanılan Workflow'lar

| Komut | İşlev |
|-------|-------|
| `/mail-gonder` | Lead listesine mail gönder |
| `/lead-toplama` | Hedef profil ve e-posta listesi oluştur |
| `/marka-outreach` | Marka iş birliği outreach pipeline'ı |
| `/fatura-kes` | Invoice üret |
| `/durum-kontrol` | Coolify servislerinin sağlık durumu |
| `/yedekle` | Manuel yedekleme |
| `/sifre-bagla` | Projeye token/API anahtarı bağla |

