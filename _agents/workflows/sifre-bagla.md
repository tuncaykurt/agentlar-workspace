---
description: Yeni projeye şifre bağla — merkezi token deposundan otomatik .env oluştur
---

# 🔐 Şifre Bağlama Workflow'u

Bu workflow, yeni bir projeye başlarken veya mevcut projeye token eklerken kullanılır.

## Adımlar

### 1. Projeyi Analiz Et
```bash
python3 _skills/sifre-yonetici/scripts/env_manager.py analyze Projeler/<PROJE_ADI>
```
Projenin kodunu tarayarak hangi servislere (OpenAI, Telegram, Kie AI vb.) ihtiyaç duyduğunu belirle.

### 2. .env Oluştur

**Seçenek A — Otomatik (önerilen):** Tespit edilen tüm servisler için .env oluştur:
```bash
python3 _skills/sifre-yonetici/scripts/env_manager.py generate Projeler/<PROJE_ADI>
```

**Seçenek B — Manuel:** Sadece belirli servisleri bağla:
```bash
python3 _skills/sifre-yonetici/scripts/env_manager.py generate Projeler/<PROJE_ADI> --services openai,telegram,kie
```

**Seçenek C — Symlink:** Tüm tokenlara erişim ver:
```bash
python3 _skills/sifre-yonetici/scripts/env_manager.py link Projeler/<PROJE_ADI>
```

### 3. Doğrula
```bash
python3 _skills/sifre-yonetici/scripts/env_manager.py verify Projeler/<PROJE_ADI>
```

### 4. (Opsiyonel) Genel Durum Kontrolü
```bash
python3 _skills/sifre-yonetici/scripts/env_manager.py status
```
