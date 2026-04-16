---
description: Rakip emlakçıların videolarından ilham alarak [MÜŞTERİ_ADI] tarzında script üret
---

# İlham Al — Rakip Video Analizi

> 🤖 **Agent:** Bu workflow `_agents/icerik-uretim/AGENT.md` agent'ının bir parçasıdır.
> Bağımsız olarak da çalışabilir (`/ilham-al`), ancak tam pipeline için agent yönergesini takip et.

Rakip emlakçı videolarından ilham alarak orijinal script üretme adımları.

## Bağlam
- **Agent:** `_agents/icerik-uretim/AGENT.md`
- **Config:** `_agents/icerik-uretim/config/ornek-marka.yaml`
- **Skill:** `Projeler/Dubai Emlak İçerik Yazarı/skills/icerik-yazari/SKILL.md`
- **Rakip Analiz Skill:** `_skills/rakip-analiz/SKILL.md`
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

4. **Config'den marka ayarlarını çek**
   - `_agents/icerik-uretim/config/ornek-marka.yaml`
   - [MÜŞTERİ_ADI] tonunu ve yasak ifadeleri doğrula

5. **[MÜŞTERİ_ADI] versiyonunu yaz**
   - SKILL.md → "İlham Alma Kuralları" bölümüne bak
   - Konuyu al, anlatımı **tamamen yeniden yaz**
   - Çağrı'nın sesini ve dilini kullan
   - Gerekirse rakamları Türkiye perspektifinden güncelle

6. **Farklılaştırmayı doğrula**
   - Hiçbir cümle doğrudan kopya değil mi?
   - Kişisel deneyimler sahiplenilmedi mi?
   - Rakamlar doğrulandı mı?

7. **İlham kaynağını not et**
   ```
   > 💡 İlham: [Video başlığı] — [Kanal adı] — [URL]
   ```

8. **Bir sonraki adım** (agent pipeline'da)
   - Script hazırsa video üretimi için `_agents/workflows/icerik-uretimi.md` workflow'una geç

## Yasak

- ❌ Birebir çeviri
- ❌ Aynı cümle yapısı
- ❌ Doğrulanmamış rakam
- ❌ Rakibin kişisel deneyimlerini sahiplenme
