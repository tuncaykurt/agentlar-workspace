---
description: Manuel yedekleme — Antigravity projesini anında yedekle ve sonucu raporla
---

# /yedekle — Manuel Yedekleme Workflow'u

Bu workflow, Antigravity projesinin anlık yedeğini alır.

**İlgili Skill:** `_skills/otomatik-yedekleme/`

## Adımlar

1. Yedekleme skill'ini oku ve anla:
```
view_file: ~/Desktop/Antigravity/_skills/otomatik-yedekleme/SKILL.md
```

2. Yedekleme script'ini çalıştır:
// turbo
```bash
bash ~/Desktop/Antigravity/_skills/otomatik-yedekleme/scripts/backup.sh
```

3. Yedekleme sonucunu doğrula — mevcut yedekleri listele:
// turbo
```bash
ls -lh ~/Desktop/_backups/Antigravity_backup_*.zip
```

4. Log dosyasının son satırlarını göster:
// turbo
```bash
tail -5 ~/Desktop/_backups/backup_log.txt
```

5. Kullanıcıya sonucu raporla. Aşağıdaki bilgileri göster:
   - ✅ Yedek dosya adı ve boyutu
   - 📊 Toplam yedek sayısı (max 4)
   - 🚫 Hariç tutulan dosya tipleri (.git, node_modules, venv, mp4, mov, .env)
   - ⏰ Bir sonraki otomatik yedekleme: Pazar 03:00

## Notlar
- Bu workflow crontab'tan bağımsız çalışır
- Aynı gün içinde birden fazla çalıştırılırsa aynı tarihli yedeği üzerine yazar
- Son 4 yedek tutulur, eskiler otomatik silinir
- Yedekler `~/Desktop/_backups/` klasöründedir (Antigravity dışında, paylaşıma dahil değildir)
