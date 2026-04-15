---
description: Hesaplama içerikli yatırım scripti üret — daire fiyatı, mortgage, kira geliri hesapları ile
---

# Hesaplama Scripti — Dubai Yatırım Hesabı

Yatırım hesaplamalı video script üretme adımları.

## Bağlam
- **Skill:** `Projeler/Dubai Emlak İçerik Yazarı/skills/icerik-yazari/SKILL.md`
- **Hesap Makinesi:** `Projeler/Dubai Emlak İçerik Yazarı/tools/calculator.py`
- **Kur Aracı:** `Projeler/Dubai Emlak İçerik Yazarı/tools/currency.py`
- **Referans Scriptler:** `Projeler/Dubai Emlak İçerik Yazarı/reference-scripts/yatirim_hesaplama_scriptleri.md`

## Sabit Hesaplama Metrikleri

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

2. **Hesapla**
   ```bash
   python "Projeler/Dubai Emlak İçerik Yazarı/tools/calculator.py"
   ```
   - Değer artışı, kira geliri, mortgage taksiti
   - Net yıllık getiri, toplam kazanç

3. **Döviz çevir** (TL karşılığı için)
   ```bash
   python "Projeler/Dubai Emlak İçerik Yazarı/tools/currency.py"
   ```

4. **Script yaz**
   - Hook: Hedef kitleye soru (\"Aylık 3000$ pasif gelir ister misin?\")
   - Tablo: Yıl / Ödeme / Kira / Değer
   - Net sonuç: \"Aylık net {X}$ kazanırsın\"
   - CTA

5. **Format kontrolü**
   - [ ] Hook hedef kitleye doğrudan hitap ediyor mu?
   - [ ] Tablo var mı?
   - [ ] TL karşılığı verildi mi?
   - [ ] Net sonuç cümlesi var mı?
   - [ ] CTA var mı?

## Tablo Şablonu

```
| Yıl | Daire Değeri | Kira Geliri | Mortgage | Net Kazanç |
|-----|-------------|-------------|----------|------------|
| 1   | $XXX,000    | $XX,000/yıl | $XX,000  | +$XX,000   |
| 5   | $XXX,000    | $XX,000/yıl | $XX,000  | +$XX,000   |
| 10  | $X,XXX,000  | $XX,000/yıl | $XX,000  | +$XX,000   |
```
