# Dubai Emlak İçerik Yazarı — AI Agent

[MÜŞTERİ_ADI] için Dubai gayrimenkul yatırımı konulu sosyal medya video scriptleri üreten AI agent sistemi.

## Platformlar
- Instagram: [@[MÜŞTERİ_SOSYAL_MEDYA]](https://www.instagram.com/[MÜŞTERİ_SOSYAL_MEDYA]/)
- TikTok: [@[MÜŞTERİ_SOSYAL_MEDYA]](https://www.tiktok.com/@[MÜŞTERİ_SOSYAL_MEDYA]?lang=tr-TR)
- YouTube: [[MÜŞTERİ_ADI]](https://www.youtube.com/@[MÜŞTERİ_SOSYAL_MEDYA])

## Nasıl Kullanılır?

### Video Scripti Üret
1. Konsepti söyle: **bölge analizi**, **gayrimenkul yatırımı** veya **yatırım hesaplama**
2. Konuyu belirt (bölge adı, senaryo, hedef kitle)
3. AI agent referans scriptlere sadık kalarak scripti üretir

### Hesaplama İçerikli Script
1. Daire fiyatını ve parametreleri ver
2. Hesap makinesi otomatik tabloyu oluşturur
3. Script referans formatta hazırlanır

### Araştırma
1. Araştırma konusunu belirt
2. AI agent İngilizce kaynaklardan araştırma yapar
3. Sonuçlar Türkçe özetlenir

### Rakipten İlham Al
1. `rakipler.md` dosyasına beğendiğin emlakçıları ekle
2. Hangi rakipten ilham almak istediğini söyle
3. AI agent profilini inceler, video seçer, transkript çıkarır
4. [MÜŞTERİ_ADI] tarzında orijinal script üretir

## Proje Yapısı

```
├── .agent/workflows/          ← Workflow tanımları
│   ├── script-yaz.md          ← Ana script yazma
│   ├── hesaplama-scripti.md   ← Hesaplama scriptleri
│   ├── arastirma-yap.md      ← Araştırma
│   └── ilham-al.md            ← Rakipten ilham alma
├── skills/icerik-yazari/      ← Skill tanımı
│   └── SKILL.md               ← Üslup, format, ton rehberi
├── tools/                     ← Araçlar
│   ├── calculator.py          ← Yatırım hesap makinesi
│   └── transcript.py          ← Video transkript çıkarıcı (Supadata API)
├── rakipler.md                ← Rakip emlakçılar listesi
└── reference-scripts/         ← Referans script arşivi
    ├── bölgeler_scriptleri.md
    ├── gayrimenkul_yatirimi_scriptleri.md
    └── yatirim_hesaplama_scriptleri.md
```

## Hesaplama Metrikleri

| Metrik | Değer |
|--------|-------|
| Değer artışı (ilk 3 yıl) | %8/yıl |
| Değer artışı (4+ yıl) | %7/yıl |
| Kira getirisi (ROI) | %7/yıl |
| Mortgage faizi | %4.5/yıl |
| Peşinat | %20 |
