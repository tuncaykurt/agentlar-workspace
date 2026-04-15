---
name: servis-izleyici
description: |
  Antigravity ekosistemindeki tüm projelerin sağlık durumunu kontrol eder ve
  bilinen hataları otomatik düzeltir (self-healing).
  Railway servisleri (deployment durumu + log tarama), cron/LaunchAgent sağlığı,
  lokal proje envanteri ve eski LaunchAgent tespiti yapar.
  Sorun tespit edilirse önce otomatik iyileştirme dener, başarısız olursa e-posta gönderir.
---

# 🏥 Servis İzleyici Skill — v3 (Self-Healing)

Antigravity ekosistemindeki TÜM projelerin sağlık durumunu izler ve bilinen hataları **otomatik düzeltir**.

## Mimari

```
_skills/servis-izleyici/
├── SKILL.md                                      ← Bu dosya
├── scripts/
│   ├── health_check.py                           ← Ana izleme scripti (v3)
│   ├── self_healer.py                            ← 🩺 Otomatik iyileştirme motoru
│   ├── healing_playbook.json                     ← Bilinen hata kalıpları ve çözümleri
│   └── setup_cron.sh                             ← Otomatik kurulum
├── com.antigravity.servis-izleyici.plist          ← macOS LaunchAgent (auto-heal aktif)
├── logs/
│   └── health_check.log                          ← (otomatik oluşur)
└── templates/
    ├── alert_email.html                          ← Alarm e-posta şablonu
    └── healing_report.html                       ← Self-heal rapor şablonu
```

## Kontrol Katmanları

| Katman | Ne Kontrol Eder? | Kaynak |
|--------|-----------------|--------|
| 🚂 Railway | Deployment durumu (SUCCESS/FAILED/CRASHED) + son 24 saat deployment logları | Railway GraphQL API |
| ⏰ Cron | LaunchAgent yüklü mü?, çalışıyor mu?, log dosyasında hata var mı? | `launchctl` + log dosyası |
| 📁 Lokal | Proje klasörü mevcut mu? | Dosya sistemi |
| 🧹 Temizlik | Eski/bozuk plist dosyaları (yanlış yola işaret eden) | ~/Library/LaunchAgents/ taraması |

## 🩺 Self-Healing (Otomatik İyileştirme)

### Nasıl Çalışır?
1. `health_check.py` sorun tespit eder
2. `self_healer.py` sorunu `healing_playbook.json`'daki kalıplarla eşleştirir
3. Eşleşme varsa → belirlenen aksiyonu otomatik uygular
4. Raporu e-posta ile gönderir (düzeltilen + düzeltilemeyen ayrı gösterilir)

### Playbook Kalıpları

| Kalıp | Aksiyon | Güvenlik |
|-------|---------|----------|
| Railway CRASHED/FAILED | Otomatik redeploy | Max 2/saat, 5/gün |
| SSL/Bağlantı hatası | Geçici — bekleme | Aksiyon almaz |
| LaunchAgent NOT_LOADED | `launchctl load` | Max 3/saat |
| LaunchAgent EXIT_ERROR | Unload + load | Max 3/saat |
| OOMKilled | Redeploy | Max 1/saat |
| Rate limit (429) | Geçici — bekleme | Aksiyon almaz |
| OAuth invalid_grant | Sadece alarm | Manuel müdahale |
| Bilinmeyen hata | Sadece alarm | Dokunmaz |

### Güvenlik Sınırları
- ⛔ **Rate limiting:** Saatte max 2 redeploy, günde max 5
- ⏳ **Cooldown:** Aynı proje için 30dk bekleme
- 🔒 **Sadece bilinen kalıplar:** Bilinmeyen hatalara dokunmaz
- 📧 **Her durumda bilgilendirme:** Düzeltse de düzeltemese de rapor gönderir
- ❌ **Asla kod yazmaz/push etmez**

## 🔑 Token Yönetimi

Token bilgileri şu kaynaklardan okunur (öncelik sırasına göre):

1. **Environment variables** — `RAILWAY_TOKEN`, `SMTP_USER`, `SMTP_APP_PASSWORD`
2. **JSON Cache** — `/tmp/antigravity_env.json` (macOS izin kısıtlamalarını aşar)
3. **master.env** — `_knowledge/credentials/master.env`

> **Not:** macOS "Full Disk Access" kısıtlaması nedeniyle script doğrudan `master.env`'e erişemeyebilir. Bu durumda `setup_cron.sh` çalıştırarak tokenlar `/tmp/antigravity_env.json` Cache dosyasına aktarılır.

## 🚀 Nasıl Çalıştırılır

### Genel Check-Up + Otomatik İyileştirme (ÖNERİLEN)
```bash
python3 ~/Desktop/Antigravity/_skills/servis-izleyici/scripts/health_check.py --check-up --auto-heal
```

### Genel Check-Up (sadece tespit, düzeltme yok)
```bash
python3 ~/Desktop/Antigravity/_skills/servis-izleyici/scripts/health_check.py --check-up
```

### Ne Yapacağını Göster (Dry Run)
```bash
python3 ~/Desktop/Antigravity/_skills/servis-izleyici/scripts/health_check.py --check-up --auto-heal --dry-run
```

### Hızlı Railway Kontrolü
```bash
python3 ~/Desktop/Antigravity/_skills/servis-izleyici/scripts/health_check.py
```

### Sadece Cron/LaunchAgent Kontrolü
```bash
python3 ~/Desktop/Antigravity/_skills/servis-izleyici/scripts/health_check.py --cron-only
```

### Belirli Bir Projeyi Kontrol
```bash
python3 ~/Desktop/Antigravity/_skills/servis-izleyici/scripts/health_check.py --project shorts-demo-bot --auto-heal
```

### Otomatik Çalışma (LaunchAgent — Saatlik + Auto-Heal)
```bash
# Durum kontrolü:
launchctl list com.antigravity.servis-izleyici

# Durdurmak:
launchctl unload ~/Library/LaunchAgents/com.antigravity.servis-izleyici.plist

# Tekrar başlatmak:
launchctl load ~/Library/LaunchAgents/com.antigravity.servis-izleyici.plist
```

## ❌ Hata Yönetimi

| Durum | Ne Yapılmalı? |
|-------|---------------|
| `RAILWAY_TOKEN` geçersiz | `master.env` dosyasındaki token'ı güncelle |
| Gmail SMTP hatası | App Password'ü kontrol et |
| `deploy-registry.md` parse hatası | Dosya formatının doğru olduğundan emin ol |
| GraphQL rate limit | Script otomatik 1 sn bekler, cron aralığını saatlikten daha sık yapma |
| LaunchAgent yüklenemiyor | `launchctl load ~/Library/LaunchAgents/<plist>` |
| Playbook'ta eşleşme yok | Yeni kalıp ekle: `healing_playbook.json` |

## Playbook Genişletme

Yeni bir hata kalıbı eklemek için `scripts/healing_playbook.json` dosyasını düzenle:

```json
{
  "id": "yeni_kalip",
  "match": "regex_pattern",
  "context": "railway_status|railway_log|launch_agent",
  "action": "redeploy|reload_agent|restart_agent|ignore_transient|alert_only",
  "description": "Açıklama",
  "max_retries": 2,
  "cooldown_minutes": 30
}
```

## Workflow Entegrasyonu

Bu skill `/durum-kontrol` workflow'u ile çağrılır:
```
_agents/workflows/durum-kontrol.md
```
