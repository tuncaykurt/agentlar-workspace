---
description: Video scripti üret — bölge analizi, gayrimenkul yatırımı veya hesaplama konseptlerinde
---

# Script Yaz — Dubai Gayrimenkul Video

> 🤖 **Agent:** Bu workflow `_agents/icerik-uretim/AGENT.md` agent'ının bir parçasıdır.
> Bağımsız olarak da çalışabilir (`/script-yaz`), ancak tam pipeline için agent yönergesini takip et.

[MÜŞTERİ_ADI] için sosyal medya video scripti üretme adımları.

## Bağlam
- **Agent:** `_agents/icerik-uretim/AGENT.md`
- **Config:** `_agents/icerik-uretim/config/ornek-marka.yaml`
- **Skill:** `Projeler/Dubai Emlak İçerik Yazarı/skills/icerik-yazari/SKILL.md` → ÖNCE OKU
- **Referans Scriptler:** `Projeler/Dubai Emlak İçerik Yazarı/reference-scripts/`
- **Hesaplama:** `Projeler/Dubai Emlak İçerik Yazarı/tools/calculator.py`

## Adımlar

1. **SKILL.md dosyasını oku**
   - `Projeler/Dubai Emlak İçerik Yazarı/skills/icerik-yazari/SKILL.md`
   - Üslup kurallarını, format şablonlarını ve yasak ifadeleri öğren

2. **Config'den marka ayarlarını çek**
   - `_agents/icerik-uretim/config/ornek-marka.yaml`
   - Ton, hedef kitle, yasak ifadeler ve format yapısını doğrula

3. **Script türünü belirle**
   - `bölge_analizi` → Hook + Tablo formatı
   - `gayrimenkul_yatirimi` → Soru-cevap formatı  
   - `hesaplama` → Hook + Tablo + Net rakam formatı
   - `ilham` → Rakip scriptten uyarlama

4. **Referans scriptleri oku** (en az 3 tane)
   - İlgili klasördeki referans dosyasını aç
   - Ton, ritim ve format tutarlılığını yakala

5. **Gerekirse hesaplama yap**
   - `tools/calculator.py` ile gerçek rakamları doğrula
   - Hesaplama scriptlerinde tablo ZORUNLU

6. **Scripti yaz**
   - SKILL.md kurallarına uy
   - Hook → Script → Tablo → CTA yapısını koru
   - TL karşılığı ekle (hedef kitle Türkiye'den)

7. **Kontrol listesi**
   - [ ] Format doğru mu?
   - [ ] Üslup tutarlı mı?
   - [ ] Abartılı ifade yok mu?
   - [ ] CTA var mı?
   - [ ] Kaynak linki var mı? (rakam içeriyorsa)

8. **Bir sonraki adım** (agent pipeline'da)
   - Script hazırsa video üretimi için `_agents/workflows/icerik-uretimi.md` workflow'una geç

## Script Formatları

### Bölge Analizi
```
### Hook
(1-2 cümle — bölgenin riski veya fırsatını vurgular)

### Script
(Dengeli artı/eksi analizi)

### Tablo
| ✅ Avantaj | ❌ Dezavantaj |
|---|---|
```

### Hesaplama
```
#### Hook
(Hedef kitleye doğrudan soru)

#### Script
(Adım adım hesap + tablo)

| Yıl | Ödeme | Kira | Değer |
|-----|-------|------|-------|
```
