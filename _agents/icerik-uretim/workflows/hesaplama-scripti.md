---
description: Hesaplama içerikli yatırım scripti üret — daire fiyatı, mortgage, kira geliri hesapları ile
---

# Hesaplama Scripti — Dubai Yatırım Hesabı

> 🤖 **Agent:** Bu workflow `_agents/icerik-uretim/AGENT.md` agent'ının bir parçasıdır.
> Bağımsız olarak da çalışabilir (`/hesaplama-scripti`), ancak tam pipeline için agent yönergesini takip et.

Yatırım hesaplamalı video script üretme adımları.

## Bağlam
- **Agent:** `_agents/icerik-uretim/AGENT.md`
- **Config:** `_agents/icerik-uretim/config/ornek-marka.yaml`
- **Skill:** `Projeler/Dubai Emlak İçerik Yazarı/skills/icerik-yazari/SKILL.md`
- **Hesap Makinesi:** `Projeler/Dubai Emlak İçerik Yazarı/tools/calculator.py`
- **Kur Aracı:** `Projeler/Dubai Emlak İçerik Yazarı/tools/currency.py`
- **Referans Scriptler:** `Projeler/Dubai Emlak İçerik Yazarı/reference-scripts/yatirim_hesaplama_scriptleri.md`

## Sabit Hesaplama Metrikleri

> 📌 Bu değerler `_agents/icerik-uretim/config/ornek-marka.yaml` → `hesaplama_metrikleri` bölümünden alınır.

| Metrik | Değer |
|--------|-------|
| Değer artışı (ilk 3 yıl) | %8/yıl |
| Değer artışı (4+ yıl) | %7/yıl |
| Kira ROI | %7/yıl |
| Mortgage faizi | %4.5/yıl |
| Mortgage vadesi | 20 yıl |
| Peşinat | %20 |

## Adımlar

1. **Senaryo belirle**
   - Daire fiyatı nedir? (USD cinsinden)
   - Kaç yıllık projeksiyon? (5, 10, 20 yıl)
   - Mortgage var mı?
   - Kira geliri dahil mi?

2. **Config'den metrikleri doğrula**
   - `_agents/icerik-uretim/config/ornek-marka.yaml` → `hesaplama_metrikleri`
   - Güncel değerler burada merkezi olarak yönetilir

3. **Hesapla**
   ```bash
   python "Projeler/Dubai Emlak İçerik Yazarı/tools/calculator.py"
   ```
   - Değer artışı, kira geliri, mortgage taksiti
   - Net yıllık getiri, toplam kazanç

4. **Döviz çevir** (TL karşılığı için)
   ```bash
   python "Projeler/Dubai Emlak İçerik Yazarı/tools/currency.py"
   ```

5. **Script yaz**
   - Hook: Hedef kitleye soru ("Aylık 3000$ pasif gelir ister misin?")
   - Tablo: Yıl / Ödeme / Kira / Değer
   - Net sonuç: "Aylık net {X}$ kazanırsın"
   - CTA

6. **Format kontrolü**
   - [ ] Hook hedef kitleye doğrudan hitap ediyor mu?
   - [ ] Tablo var mı?
   - [ ] TL karşılığı verildi mi?
   - [ ] Net sonuç cümlesi var mı?
   - [ ] CTA var mı?

7. **Bir sonraki adım** (agent pipeline'da)
   - Script hazırsa video üretimi için `_agents/workflows/icerik-uretimi.md` workflow'una geç

## Tablo Şablonu

```
| Yıl | Daire Değeri | Kira Geliri | Mortgage | Net Kazanç |
|-----|-------------|-------------|----------|------------|
| 1   | $XXX,000    | $XX,000/yıl | $XX,000  | +$XX,000   |
| 5   | $XXX,000    | $XX,000/yıl | $XX,000  | +$XX,000   |
| 10  | $X,XXX,000  | $XX,000/yıl | $XX,000  | +$XX,000   |
```
