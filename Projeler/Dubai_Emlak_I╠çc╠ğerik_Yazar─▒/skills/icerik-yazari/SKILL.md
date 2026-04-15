---
name: Dubai Emlak İçerik Yazarı
description: [MÜŞTERİ_ADI] için Dubai gayrimenkul yatırımı konulu sosyal medya video scriptleri üretir.
---

# Dubai Emlak İçerik Yazarı Skill

## Kim İçin?

**[MÜŞTERİ_ADI]** — Türkiye'den Dubai'de gayrimenkul yatırımı yapmak isteyenler için yatırım danışmanlığı yapan kişi.

**Platformlar:** Instagram (@[MÜŞTERİ_SOSYAL_MEDYA]), TikTok (@[MÜŞTERİ_SOSYAL_MEDYA]), YouTube ([MÜŞTERİ_ADI])

**Hedef Kitle:** Türkiye'den Dubai'ye yatırım düşünen orta-üst gelir grubu.

---

## Konsept Kategorileri

### 1. Bölge Analizleri
**Referans:** `reference-scripts/bölgeler_scriptleri.md`

**Format:**
```
### Hook
(1-2 cümle — dikkat çekici, bölgenin riskini veya fırsatını vurgular)

### Script
(Akıcı paragraflar — artılar ve eksiler dengeli şekilde anlatılır)

### Tablolar
| ✅ | ❌ |
| --- | --- |
| Avantaj 1 | Dezavantaj 1 |
| Avantaj 2 | Dezavantaj 2 |
```

**Üslup kuralları:**
- Hook her zaman bir **uyarı** veya **merak** ile başlar
- Bölge hiçbir zaman sadece iyi veya sadece kötü gösterilmez — **denge** şart
- "Yatırımcı tarafında", "kira tarafında", "orta vadede" gibi teknik ama anlaşılır ifadeler
- Sonunda izleyiciye soru sorulur veya takip çağrısı yapılır
- Abartılı vaatler YASAKTIR

### 2. Gayrimenkul Yatırımı (Genel)
**Referans:** `reference-scripts/gayrimenkul_yatirimi_scriptleri.md`

**Format:**
```
## Script #XXX
# Başlık

(Direkt konuya giren, sohbet havasında metin)
```

**Üslup kuralları:**
- Soru-cevap formatı sık kullanılır ("SORU: ... ÇAĞRI: ...")
- Pratik bilgi verilir (web sitesi, uygulama, yasal süreç)
- Kısa ve öz — her paragraf 1-2 cümle
- Teknik terimler açıklanır (USDT, DDA, mortgage, property management)

### 3. Yatırım Hesaplama
**Referans:** `reference-scripts/yatirim_hesaplama_scriptleri.md`

**Format:**
```
### Script #XXX
#### Hook
(Hedef kitleye doğrudan hitap eden soru)

#### Script
(Adım adım hesaplama anlatımı + tablo)

#### Script ve Notlar
(Ek açıklamalar)
```

**Üslup kuralları:**
- Her zaman bir **hedef** ile başlar ("Ayda 3000 dolar pasif gelir", "Çocuğun üniversitesini finanse et")
- Rakamlar NET verilir — yuvarlak sayılar, dolar cinsinden
- **Tablo zorunlu** — yıl, ödeme tipi, tutar, toplam, daire değeri
- Mortgage detayları açık yazılır (vade, faiz, aylık taksit)
- TL karşılığı verilir (hedef kitle Türkiye'den)

---

## Hesaplama Metrikleri

| Metrik | Değer | Açıklama |
|--------|-------|----------|
| Değer artışı (ilk 3 yıl) | %8/yıl | İnşaat döneminde daha hızlı artış |
| Değer artışı (4+ yıl) | %7/yıl | Teslim sonrası stabil artış |
| Kira getirisi (ROI) | %7/yıl | İlgili yılın ev değerinin %7'si |
| Mortgage faizi | %4.5/yıl | Dubai ortalaması |
| Mortgage vadesi | 20 yıl | Varsayılan |
| Peşinat | %20 | Standart oran |

**Hesap makinesi:** `tools/calculator.py` ile çalıştırılır.

---

## Dil ve Ton Kuralları

1. **Samimi ama profesyonel** — "Şimdi dikkatli dinle" değil, "İşte bu bilgiye sahip olan, yatırımda her zaman öne geçer" tarzında
2. **Türkçe** — Hedef kitle Türk, ancak teknik terimler (mortgage, ROI, expat) olduğu gibi bırakılır
3. **Kısa cümleler** — Video için yazılıyor, her cümle nefes alınabilir uzunlukta
4. **Abartısız** — "Kesin kazanırsınız" YASAK. "Potansiyel var", "orta vadede fırsat" gibi ifadeler
5. **CTA (Call to Action)** — Her scriptin sonunda ya soru sorulur ya da iletişim çağrısı yapılır

## Hikaye Payoff Kuralları

- **Bölge analizi:** Payoff her zaman dengeli bir değerlendirmedir — izleyici hem artıyı hem eksiyi öğrenir
- **Gayrimenkul yatırımı:** Payoff pratik bir bilgi veya aksiyondur — izleyici ne yapacağını bilir
- **Hesaplama:** Payoff somut bir rakamdır — "Aylık net karınız $2,384" gibi net sonuç

---

## Yeni Script Üretirken Kontrol Listesi

- [ ] Referans dosyadan en az 3 benzer script okundu mu?
- [ ] Format doğru mu? (Hook/Script/Tablo yapısı)
- [ ] Üslup tutarlı mı? (Samimi, profesyonel, abartısız)
- [ ] Hesaplamalar doğru mu? (`calculator.py` ile doğrulandı mı?)
- [ ] Hikaye payoff'u var mı? (İzleyici ne öğreniyor?)
- [ ] CTA var mı? (Soru veya takip çağrısı)
- [ ] TL karşılığı verildi mi? (Hesaplama scriptlerinde)

---

## Rakipten İlham Alma Kuralları

Rakip emlakçıların videolarından ilham alırken:

### ✅ İlham Alınabilir
- Video konusu ve fikir (ör: "mortgage hesaplama videosu" fikri)
- İçerik yapısı (ör: soru-cevap formatı, before/after karşılaştırma)
- Hook stili (dikkat çekme tekniği)
- Veri ve istatistik kullanımı (ancak doğrulanmalı)

### ❌ Yasak
- Birebir çeviri veya kopyalama
- Aynı cümle yapılarını aynen kullanma
- Rakibin kişisel deneyimlerini sahiplenme
- Doğrulanmamış rakamları olduğu gibi alma

### İlham → Script Dönüşüm Süreci
1. Transkripti oku ve **konuyu** çıkar
2. [MÜŞTERİ_ADI] **nasıl anlatırdı** diye düşün
3. SKILL.md kurallarına uygun **orijinal script** yaz
4. Rakipten farklılaştığından emin ol
5. Sonuna ilham kaynağını not olarak ekle

**Transkript aracı:** `tools/transcript.py` (Supadata API)

---

## Veri ve Kaynak Kuralları (Yeni)

Rakam veya iddia içeren her scriptte mutlaka **kaynak linki** verilmelidir.

**Format:**
```
### Yapılacaklar / Editör Notu
- Kaynak 1: [Link](url) (Veri: %18 değer artışı)
- Kaynak 2: [Link](url) (Veri: %7 ROI)
```

## Lokalizasyon ve Terimler

**Para Birimi:**
- YouTube/Instagram Global içeriklerinde: **Dolar ($)** esastır.
- Türkiye odaklı içeriklerde: **TL karşılığı** parantez içinde veya ek bilgi olarak verilir.
- Araç: `tools/currency.py` ile güncel kurdan çeviri yapılır.

**Teknik Terim Sözlüğü:**
İngilizce terimler kullanılırken yanına Türkçesi veya kısa açıklaması eklenir:
- **Service Charge:** (Site aidatı / Yıllık bakım ücreti)
- **DLD Fee:** (Tapu harcı / Transfer ücreti)
- **Capital Appreciation:** (Değer artışı)
- **ROI:** (Yıllık kira getirisi)
- **Down Payment:** (Peşinat)
- **Handover:** (Teslim)
- **Off-plan:** (Projeden / Topraktan)
