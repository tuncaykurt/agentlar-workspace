---
description: Durum Kontrol — Tüm projelerin sağlık durumunu kontrol et, otomatik düzelt ve raporla (Coolify + Cron + Lokal)
---

# /durum-kontrol — Proje Sağlık Kontrolü + Self-Healing

Bu workflow, Antigravity ekosistemindeki tüm projelerin durumunu kontrol eder ve bilinen hataları otomatik düzeltir.

**İlgili Skill:** `_skills/analysis/servis-izleyici/`

## Modlar

| Mod | Komut | Kapsam |
|-----|-------|--------|
| 🩺 **Auto-Heal** | `--check-up --auto-heal` | Check-up + bilinen hataları otomatik düzelt |
| 🏥 **Genel Check-up** | `--check-up` | Coolify + log tarama + cron + lokal + temizlik |
| 🚂 **Hızlı Kontrol** | (parametresiz) | Sadece Coolify deployment durumu |
| ⏰ **Cron Kontrolü** | `--cron-only` | Sadece LaunchAgent/cron sağlığı |

## Adımlar

1. Servis izleyici skill'ini oku ve anla:
```
view_file: ~/Desktop/Antigravity/_skills/analysis/servis-izleyici/SKILL.md
```

2. **Genel check-up + otomatik iyileştirme** (varsayılan — kullanıcı "durum kontrol" derse bunu çalıştır):
// turbo
```bash
python3 ~/Desktop/Antigravity/_skills/analysis/servis-izleyici/scripts/health_check.py --check-up --auto-heal --dry-run
```

3. **Sadece Coolify kontrolü** (kullanıcı "Coolify'e bak" derse):
// turbo
```bash
python3 ~/Desktop/Antigravity/_skills/analysis/servis-izleyici/scripts/health_check.py --dry-run
```

4. **Sadece cron kontrolü** (kullanıcı "cron'ları kontrol et" derse):
// turbo
```bash
python3 ~/Desktop/Antigravity/_skills/analysis/servis-izleyici/scripts/health_check.py --cron-only --dry-run
```

5. Log dosyasının son çıktısını göster:
// turbo
```bash
tail -30 ~/Desktop/Antigravity/_skills/analysis/servis-izleyici/logs/health_check.log
```

6. Kullanıcıya sonucu raporla. Aşağıdaki bilgileri göster:
   - 🚂 Coolify servisleri: durum + son deploy + log hatası varsa göster
   - ⏰ Cron/LaunchAgent: aktif mi?, log dosyasında hata var mı?
   - 📁 Lokal projeler: klasör mevcut mu?
   - 🧹 Temizlik: eski/bozuk LaunchAgent var mı?
   - 🩺 Self-Heal: hangi sorunlar otomatik düzeltildi, hangileri düzeltilemedi
   - 📊 Özet: platform bazlı toplam/sağlıklı/sorunlu/düzeltildi sayılar

## Notlar
- Varsayılan olarak `--dry-run` ile çalıştırılır (e-posta göndermez + gerçek aksiyon almaz)
- LaunchAgent saatlik otomatik `--check-up --auto-heal` çalıştırır (gerçek aksiyon + e-posta)
- E-posta sadece sorun tespit edildiğinde ve `--dry-run` olmadan gönderilir
- Self-heal sonuçları ayrı bir e-posta ile raporlanır (düzeltilen/düzeltilemeyen ayrı)
- Tüm loglar `_skills/analysis/servis-izleyici/logs/health_check.log` dosyasında tutulur
- Coolify token'ı `_knowledge/credentials/master.env` dosyasından okunur
- Playbook: `_skills/analysis/servis-izleyici/scripts/healing_playbook.json`

