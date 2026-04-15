---
name: otomatik-yedekleme
description: Antigravity projesini otomatik olarak yedekleyen sistem. Haftalık crontab ile veya manuel olarak çalıştırılabilir. Gereksiz dosyaları hariç tutar, eski yedekleri temizler ve log tutar.
---

# 🗄️ Otomatik Yedekleme Sistemi

Antigravity projesinin tamamını düzenli aralıklarla yedekleyen, disk yönetimi yapan ve log tutan bir backup sistemidir.

## Özellikler

| Özellik | Açıklama |
|---------|----------|
| **Yedek Formatı** | `Antigravity_backup_YYYY-MM-DD.zip` |
| **Yedek Konumu** | `~/Desktop/_backups/` (Antigravity dışında) |
| **Zamanlama** | Her Pazar gece 03:00 (crontab) |
| **Hariç Tutulanlar** | `.git`, `node_modules`, `venv`, `.venv`, `__pycache__`, `.gemini`, `*.mp4`, `*.mov`, `.env` |
| **Retention** | Son 4 yedek korunur, eskiler otomatik silinir |
| **Log** | Her yedekleme `backup_log.txt` dosyasına yazılır |

## Dosya Yapısı

```
_skills/otomatik-yedekleme/
├── SKILL.md              # Bu dosya
├── scripts/
│   ├── backup.sh         # Ana yedekleme script'i
│   └── setup_cron.sh     # Crontab kurulum script'i
```

## Kullanım

### Manuel Yedekleme

Yedeklemeyi hemen çalıştırmak için:

```bash
bash ~/Desktop/Antigravity/_skills/otomatik-yedekleme/scripts/backup.sh
```

### Crontab Kurulumu

Haftalık otomatik yedeklemeyi aktif etmek için:

```bash
bash ~/Desktop/Antigravity/_skills/otomatik-yedekleme/scripts/setup_cron.sh
```

Bu komut crontab'a şu satırı ekler:
```
0 3 * * 0 /bin/bash ~/Desktop/Antigravity/_skills/otomatik-yedekleme/scripts/backup.sh
```

### Crontab'ı Kontrol Etme

```bash
crontab -l | grep backup
```

### Crontab'dan Kaldırma

```bash
crontab -l | grep -v "backup.sh" | crontab -
```

## Yedek Yapısı

```
~/Desktop/_backups/
├── Antigravity_backup_2026-03-09.zip
├── Antigravity_backup_2026-03-02.zip
├── Antigravity_backup_2026-02-23.zip
├── Antigravity_backup_2026-02-16.zip
└── backup_log.txt
```

> **Not:** `_backups/` klasörü Antigravity dışında tutulur. Paylaşıma ve Git'e dahil değildir.

## Log Örneği

```
[2026-03-09 03:00:01] ✅ Backup başarılı: Antigravity_backup_2026-03-09.zip (145MB) | Süre: 12s | Tutulan: 4 yedek
[2026-03-02 03:00:01] ✅ Backup başarılı: Antigravity_backup_2026-03-02.zip (142MB) | Süre: 11s | Tutulan: 4 yedek
```

## Hariç Tutulan Dosya/Klasörler

Yedekleme boyutunu minimize etmek için şunlar hariç tutulur:

- **`.git/`** — Git geçmişi (zaten remote'ta var)
- **`node_modules/`** — npm paketleri (package.json'dan yeniden kurulabilir)
- **`.venv/`, `venv/`** — Python sanal ortamları
- **`__pycache__/`** — Python derlenmiş dosyaları

- **`.gemini/`** — Gemini konuşma geçmişi
- **`*.mp4`, `*.mov`** — Büyük video dosyaları
- **`.env`** — Hassas ortam değişkenleri
- **`.DS_Store`** — macOS sistem dosyaları

## Sorun Giderme

### Crontab çalışmıyor
1. `crontab -l` ile kurulu olduğunu doğrula
2. macOS'ta `System Preferences > Security & Privacy > Full Disk Access` altında `cron`'a izin ver
3. Log dosyasını kontrol et: `cat ~/Desktop/_backups/backup_log.txt`

### Yedek çok büyük
- Hariç tutma listesine yeni pattern ekle (`backup.sh` içindeki zip exclude listesi)
- `du -sh ~/Desktop/Antigravity/` ile kaynak boyutunu kontrol et
