---
description: Rakip emlakçıların videolarından ilham alarak [MÜŞTERİ_ADI] tarzında script üret
---

# İlham Al — Rakip Video Analizi

Rakip emlakçı videolarından ilham alarak orijinal script üretme adımları.

## Bağlam
- **Skill:** `Projeler/Dubai Emlak İçerik Yazarı/skills/icerik-yazari/SKILL.md`
- **Transcript Aracı:** `Projeler/Dubai Emlak İçerik Yazarı/tools/transcript.py` (Supadata API)
- **Rakipler:** `Projeler/Dubai Emlak İçerik Yazarı/rakipler.md`

## Adımlar

1. **Kaynak videoyu belirle**
   - `rakipler.md` dosyasındaki rakip listesinden seç
   - Veya yeni bir rakip YouTube/TikTok URL'si gir

2. **Transcript al**
   ```bash
   python Projeler/Dubai\ Emlak\ İçerik\ Yazarı/tools/transcript.py [VIDEO_URL]
   ```
   - Alternatif: URL'yi doğrudan ver, Supadata API ile çekerim

3. **Konuyu analiz et**
   - Ana mesaj nedir?
   - Hangi hook tekniği kullanılmış?
   - Hangi veriler/rakamlar var?
   - Yapı nasıl? (soru-cevap, anlatı, tablo, vb.)

4. **[MÜŞTERİ_ADI] versiyonunu yaz**
   - SKILL.md → "İlham Alma Kuralları" bölümüne bak
   - Konuyu al, anlatımı **tamamen yeniden yaz**
   - Çağrı'nın sesini ve dilini kullan
   - Gerekirse rakamları Türkiye perspektifinden güncelle

5. **Farklılaştırmayı doğrula**
   - Hiçbir cümle doğrudan kopya değil mi?
   - Kişisel deneyimler sahiplenilmedi mi?
   - Rakamlar doğrulandı mı?

6. **İlham kaynağını not et**
   ```
   > 💡 İlham: [Video başlığı] — [Kanal adı] — [URL]
   ```

## Yasak

- ❌ Birebir çeviri
- ❌ Aynı cümle yapısı
- ❌ Doğrulanmamış rakam
- ❌ Rakibin kişisel deneyimlerini sahiplenme
