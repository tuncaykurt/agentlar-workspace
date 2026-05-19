# Seedance 2.0 — Karar Alma ve Prompt Yazma Rehberi

Bu döküman, Seedance 2.0 ile video üretirken her case için doğru stratejiyi belirlemeye yardımcı olan kapsamlı bir rehberdir. Sadece prompt yazmayı değil; referans kullanım kararlarını, görsel üretim ihtiyacını, kamera/aydınlatma/stil seçimlerini ve hata önleme stratejilerini kapsar.

---

## 1. TEMEL KARAR AĞACI

Her video üretim talebi geldiğinde sırasıyla şu soruları sor:

### 1.1. Video Türü Nedir?

| Tür | Tanım | Referans Stratejisi |
|-----|--------|---------------------|
| **Dinamik/Aksiyon** | Dövüş, spor, patlama, hızlı hareket | Referans VERME. Sadece prompt yaz. Model serbest kalmalı. |
| **Ürün Tanıtımı** | Ürün gösterimi, unboxing, reklam | Ürün görseli referans olarak VER (@Image1). Prompt harekete odaklansın. |
| **Karakter Odaklı** | Belirli bir karakterin tutarlı görünmesi gereken sahneler | Karakter referans görseli VER (ön yüz, temiz arka plan). 3-5 farklı açıdan görsel ideal. |
| **Atmosferik/Mood** | Manzara, doğa, ambiyans, ASMR | Referans opsiyonel. Stil referansı (@Image ile renk paleti/aydınlatma) faydalı olabilir. |
| **UGC/Sosyal Medya** | Kısa, dikkat çekici, viral içerik | Genellikle referanssız text-to-video. Kısa ve net prompt. |
| **Stil Transferi** | Mevcut bir videoyu farklı stile dönüştürme | Video referansı VER. Prompt stil dönüşümünü tanımlasın. |

### 1.2. Referans Kullanmalı mıyım?

```
Case geldi
  │
  ├── Dinamik aksiyon sahnesi mi?
  │     ├── EVET → Referans VERME. Modeli serbest bırak. Prompt yeterli.
  │     └── HAYIR ↓
  │
  ├── Spesifik bir ürün/obje görünmeli mi?
  │     ├── EVET → Ürün görseli @Image1 olarak ver.
  │     │          Prompt'ta ürünün görünümünü tekrar tanımlama (görsel zaten sağlıyor).
  │     │          Prompt'u harekete ve kameraya odakla.
  │     └── HAYIR ↓
  │
  ├── Karakter tutarlılığı kritik mi? (çoklu sahne, seri içerik)
  │     ├── EVET → Karakter referans görseli ver.
  │     │          Temiz, ön yüz, basit arka plan, min 1024px.
  │     │          Her sahnede AYNI referansı kullan.
  │     └── HAYIR ↓
  │
  ├── Spesifik bir kamera hareketi kopyalanmalı mı?
  │     ├── EVET → Kısa video referansı ver (3-8 saniye).
  │     │          Tek sürekli çekim, kesme yok.
  │     │          Prompt'ta kamera hareketini de belirt (model kasıtlı olduğunu anlasın).
  │     └── HAYIR ↓
  │
  └── Hiçbiri → Referanssız, sadece text-to-video. Prompt yeterli.
```

### 1.3. Nano Banana'dan Görsel Üretmeli miyim?

```
Nano Banana kararı:
  │
  ├── Ürün tanıtımı ve gerçek ürün fotoğrafı VAR mı?
  │     ├── EVET → Nano Banana'ya GEREK YOK. Gerçek fotoğrafı kullan.
  │     └── HAYIR → Nano Banana ile ürün görseli üret.
  │
  ├── Fantastik/hayali bir karakter veya sahne mi?
  │     ├── EVET ama dinamik aksiyon isteniyor → Nano Banana KULLANMA.
  │     │     Modeli prompt ile serbest bırak, daha iyi sonuç verir.
  │     ├── EVET ve karakter tutarlılığı önemli → Nano Banana ile karakter görseli üret.
  │     │     Temiz, basit arka plan, net yüz detayları.
  │     └── HAYIR ↓
  │
  ├── Stil/atmosfer referansı mı lazım?
  │     ├── EVET → Nano Banana ile renk paleti/aydınlatma referansı üret.
  │     └── HAYIR → Nano Banana'ya gerek yok.
  │
  └── Genel kural: Referans görseli modeli KISITLAR.
      Dinamik sahnelerde bu kısıtlama zararlıdır.
      Tutarlılık gereken sahnelerde bu kısıtlama faydalıdır.
```

---

## 2. PROMPT YAZMA FORMÜLÜ

### 2.1. Altın Yapı (6 Adım)

Her prompt şu sırayla yazılmalıdır:

```
[1. ÖZNE] + [2. AKSİYON] + [3. ORTAM] + [4. KAMERA] + [5. STİL/AYDINLATMA] + [6. KISITLAMALAR]
```

**Hedef uzunluk:** 60-100 kelime (text-to-video için). Image-to-video için daha kısa olabilir (30-60 kelime).

#### Adım Adım Açıklama:

**1. ÖZNE:** Kim veya ne görünecek? Net ve spesifik ol.
- İyi: "A bearded chef in a white apron"
- Kötü: "A man"

**2. AKSİYON:** Ne yapıyor? Tek bir güçlü fiil, şimdiki zaman.
- İyi: "slowly raises a steaming cup of coffee to his lips"
- Kötü: "drinks coffee and looks around and waves"
- KURAL: Shot başına TEK AKSİYON. Birden fazla eylem drift yaratır.

**3. ORTAM:** Sahne nerede geçiyor?
- İyi: "in a dimly lit Italian café with exposed brick walls"
- Kötü: "in a café"

**4. KAMERA:** Nasıl çekiliyor?
- Çekim boyutu: wide / medium / close-up / extreme close-up
- Hareket: dolly-in / pan / orbit / tracking / locked-off / crane
- Açı: low-angle / high-angle / eye-level / over-shoulder
- KURAL: Tek bir birincil kamera talimatı ver.
- KURAL: Kamera hareketini ve özne hareketini AYRI tanımla.
  - DOĞRU: "The dancer spins slowly. Camera holds fixed framing."
  - YANLIŞ: "spinning camera around a dancing person"

**5. STİL/AYDINLATMA:**
- Aydınlatma tanımı, video kalitesi üzerinde EN BÜYÜK ETKİYE sahip tek öğedir.
- Promptuna ekleyebileceğin sadece tek bir şey varsa, aydınlatma ekle.
- İyi: "warm golden hour backlight with soft rim lighting"
- Kötü: "nice lighting" veya "cinematic" (tek başına anlamsız)
- Stil kısa yolları: "Wes Anderson symmetry", "Apple keynote style", "National Geographic documentary quality" gibi gerçek dünya referansları güçlü çapa görevi görür.

**6. KISITLAMALAR:**
- "no camera shake, maintain face consistency, stable motion"
- Artifakt önleme: "no text artifacts, no morphing, no extra fingers"
- Süre ve tempo: "6 seconds, gentle pacing"

### 2.2. Image-to-Video İçin Farklı Prompt Mantığı

Image-to-video'da öznenin görünümünü tanımlamana GEREK YOK (görsel zaten sağlıyor). Prompt'u şunlara odakla:
- Hareket/aksiyon
- Kamera hareketi
- "preserve composition and colors" ifadesini MUTLAKA ekle

Örnek:
```
Animate the provided image, preserve composition and colors,
add gentle wind motion to the hair, camera slowly pushes in,
warm consistent lighting, 6 seconds.
```

### 2.3. Dinamik Fiil Sözlüğü

Seedance hareket için optimize edilmiştir. Güçlü fiiller kullan:

| Zayıf | Güçlü Alternatif |
|-------|-------------------|
| flies | soars, dives, swoops, glides |
| walks | strides, trudges, marches, saunters |
| falls | tumbles, cascades, plummets, crumbles |
| moves | swirls, drifts, slides, surges |
| turns | pivots, spins, rotates, whips around |
| hits | slams, crashes, collides, smashes |

### 2.4. Kamera Hareketi Sözlüğü

| Hareket | Açıklama | En İyi Kullanım |
|---------|----------|-----------------|
| **Dolly-in** | Kamera özneye doğru fiziksel ilerleme | Ürün reveal, yakın plan geçiş |
| **Dolly-out** | Kamera özneden uzaklaşma | Sahne açılışı, bağlam gösterme |
| **Pan** | Yatay döndürme (sağa/sola) | Mekân tanıtımı, yatay reveal |
| **Tilt** | Dikey döndürme (yukarı/aşağı) | Bina, karakter boy gösterimi |
| **Orbit** | Özne etrafında dönme | Ürün 360°, dramatik karakter tanıtımı |
| **Tracking** | Özneyi takip eden kamera | Yürüyüş, koşu, araç takibi |
| **Crane** | Yukarıdan aşağıya veya aşağıdan yukarıya | Epik açılış, manzara |
| **Locked-off / Static** | Sabit kamera, hareket yok | Diyalog, ASMR, ürün stüdyo çekimi |
| **Handheld** | Hafif sallanma, doğal his | UGC, belgesel, otantik içerik |

**Tempo kelimeleri:** "slow," "smooth," "stable," "gradual," "gentle" — Seedance bu kelimelere teknik parametrelerden daha iyi yanıt verir. Ritmi bir editöre anlatır gibi tanımla.

---

## 3. KRİTİK KURALLAR VE TUZAKLAR

### 3.1. ASLA Yapma

| Hata | Neden Kötü | Çözüm |
|------|-----------|--------|
| "Fast" her yere yazmak | Hızlı kamera + hızlı kesim + yoğun sahne = garanti titreme ve artifakt | Hızlı tempo istiyorsan SADECE BİR öğeyi hızlı yap |
| Kamera ve özne hareketini karıştırmak | Kontrolsüz, titreyen video | İkisini ayrı cümlelerle tanımla |
| Tek shot'a birden fazla aksiyon sıkıştırmak | Drift, tutarsızlık | Shot başına tek aksiyon. Karmaşık sekansları ayrı üretimlerle yap. |
| Tutarsız referanslar yüklemek | Model ortalamasını alır → yüz morphing | Aynı aydınlatma, aynı kıyafet, aynı stil referansları kullan |
| "Cinematic" kelimesini tek başına kullanmak | Bağlam olmadan anlamsız | "Cinematic with warm golden hour backlighting, shallow depth of field" gibi detaylandır |
| Çelişkili referanslar vermek | Doygun görsel + düz aydınlatmalı video = yumuşak sonuç | Tek bir "patron" seç: ya görsel baskın olsun, ya hareket |
| Dinamik aksiyonda referans görsel/video vermek | Modelin yaratıcı alanını kısıtlar, dinamizm uçar | Referanssız, sadece prompt ile çalış |

### 3.2. HER ZAMAN Yap

| Uygulama | Neden |
|----------|-------|
| Aydınlatma tanımı ekle | Kalite üzerinde en yüksek kaldıraçlı tek öğe |
| Tempo kelimesi kullan (slow, smooth, stable) | Model teknik jargondan çok insan ritmi tanımlarını anlıyor |
| İterasyon yaparken tek değişken değiştir | Neyin işe yaradığını anlamak için |
| Önce düşük çözünürlükte test et, sonra yüksek çözünürlükte final üret | Kredi tasarrufu |
| Image-to-video'da "preserve composition and colors" yaz | Görsel tutarlılık için zorunlu |

---

## 4. SENARYO BAZLI ŞABLONLAR

### 4.1. Ürün Tanıtımı (Referanslı)

**Strateji:** Ürün görseli @Image1 olarak yükle. Prompt'ta ürünün görünümünü tekrar tanımlama.

```
@Image1 product on a clean white surface,
camera slowly orbits 180 degrees around the product,
soft studio lighting with high contrast,
shallow depth of field, luxury commercial quality,
smooth motion, 6 seconds,
no text artifacts, no logo distortion.
```

**Nano Banana kararı:** Gerçek ürün fotoğrafı varsa kullanma. Yoksa Nano Banana ile stüdyo kalitesinde ürün görseli üret (beyaz veya solid arka plan, net kenarlar).

### 4.2. Dinamik Aksiyon (Referanssız)

**Strateji:** HİÇBİR referans verme. Modeli tamamen serbest bırak.

```
Two armored warriors clash swords in a rain-soaked courtyard,
sparks fly on impact, cloaks billow in the wind.
Low-angle tracking shot following the swing arc.
Dramatic side lighting with volumetric rain,
cinematic action style, high contrast, 2K resolution.
Intense, powerful motion, 8 seconds.
```

**Nano Banana kararı:** KULLANMA. Referans görsel dinamizmi öldürür.

### 4.3. Karakter Tutarlılığı (Çoklu Sahne)

**Strateji:** Karakter referans görseli ver. Her sahnede AYNI referansı kullan.

```
@Image1 as the main character.
She walks through a crowded Tokyo street at night,
neon signs reflecting on wet pavement.
Medium tracking shot following from behind,
then slowly rotating to reveal her face.
Moody neon lighting, shallow depth of field,
cinematic film grain, 8 seconds.
```

**Nano Banana kararı:** Karakter görseli yoksa Nano Banana ile üret. Kurallar: ön yüz, net yüz detayları, basit arka plan, minimum 1024px, gölge yüzü gizlemesin.

### 4.4. Atmosferik / Manzara

**Strateji:** Referans opsiyonel. Stil referansı faydalı olabilir.

```
A misty mountain valley at sunrise,
golden light breaking through clouds,
casting long shadows across pine forests.
Sweeping drone shot ascending from valley floor,
slowly revealing the vast mountain range.
National Geographic documentary quality,
ultra-smooth camera movement, 8 seconds.
```

### 4.5. UGC / Sosyal Medya Hook

**Strateji:** Kısa, net, referanssız.

```
A young creator speaks directly to camera in a bright bedroom studio,
natural eye contact, subtle hand gestures,
ring light catchlight visible in eyes.
Medium close-up, locked-off camera,
warm natural lighting, authentic vibe,
5 seconds.
```

### 4.6. ASMR / Makro

**Strateji:** Detay ve ses odaklı. Yavaş ve kontrollü.

```
Extreme close-up of honey slowly pouring onto a wooden spoon,
thick golden liquid stretching and pooling.
Slow macro dolly-in, shallow depth of field,
warm backlight making honey glow,
soft ASMR audio of viscous liquid,
5 seconds, no fast motion.
```

### 4.7. Stil Transferi (Video Referanslı)

**Strateji:** Kaynak video referansı ver, prompt stil dönüşümünü tanımlasın.

```
Transform source clip to anime watercolor style,
preserve core motion and timing,
adjust color palette to pastel,
keep identity consistent,
avoid identity drift,
6 seconds.
```

---

## 5. REFERANS MATERYAL HAZIRLAMA KURALLARI

### 5.1. Referans Görsel

| Kriter | Minimum | İdeal |
|--------|---------|-------|
| Çözünürlük (kısa kenar) | 768px | 1024-1536px |
| Format | JPG, PNG, WebP | PNG (şeffaf arka plan ürünler için ideal) |
| Dosya boyutu | — | Max 20MB |
| Arka plan | Temiz, basit | Solid renk veya şeffaf |
| Aydınlatma | Tutarlı | Nihai videoda istenen aydınlatmayla eşleşen |
| Yüz (karakter referansı) | Görünür | Ön yüz, net çene/burun/göz detayları, gölge yüzü gizlemesin |

**Şeffaf PNG avantajı:** Arka plan kaldırılmış görseller en iyi sonucu verir. Model sadece özneye odaklanır, arka planı kendisi üretir.

**Birden fazla referans yükleme kuralı:** Tutarsız görseller yükleme. Farklı aydınlatma, farklı saç stili = model ortalamasını alır = yüz morphing. Az ama tutarlı referans > çok ama tutarsız referans.

### 5.2. Referans Video

| Kriter | Kural |
|--------|-------|
| Uzunluk | 3-8 saniye (sweet spot). <2s bulanık, >10s model kararsız. |
| Kesim | Tek sürekli çekim, jump cut YOK |
| Hareket | "Tek fikir genişliğinde" — ya özne hareket eder ya kamera, ikisi birden değil (zorunlu değilse) |
| Kamera | İstenmeyen el titremesi varsa sabitlenmiş kamera kullan |
| Baş/son | Hazırlık hareketlerini kes, aksiyon temiz başlasın |
| Format | MP4 veya MOV (H.264/H.265), max 150MB, min 360p |
| Arka plan | Basit, detaysız. Karmaşık arka planlar jitter üretir. |

### 5.3. @Tag Sistemi

Dosya yüklediğinde Seedance otomatik etiket atar: @Image1, @Video1, @Audio1 vb.

**Her dosyanın rolünü prompt içinde AÇIKÇA belirt:**
- `@Image1 as the first frame` → başlangıç karesi sabitle
- `@Image1 as the main character` → karakter kimliği sabitle
- `@Image2 as style reference` → renk/aydınlatma/stil sabitle
- `@Video1's camera tracking and dolly movement` → kamera hareketi transfer et
- `@Audio1 for rhythm and pacing` → tempo/ritim sabitle

**Dosya yükleyip rolünü belirtmemek = kameraya bir tomar fotoğraf verip "sen çöz" demek.**

**Hiyerarşi:**
1. @Audio → Ritim çapası (dudak senkronu, tempo eşleme)
2. @Video → Hareket çapası (kamera dili, hareket yörüngesi transferi)
3. @Image → Görsel çapa (yüz kimliği, kıyafet, genel stil)

---

## 6. İTERASYON VE KALİTE KONTROL

### 6.1. Dört Adımlı Döngü

1. **Temel Üretim:** Standart prompt ile 2-3 varyasyon üret.
2. **Tek Değişken Ayarla:** Sadece BİR öğeyi değiştir (kamera açısı, hareket yoğunluğu, veya stil).
3. **Kalite Puanla:** Tutarlılık, talimat uyumu ve kullanılabilirlik bazında değerlendir.
4. **Tekrarla.**

### 6.2. Sorun Giderme Tablosu

| Belirti | Olası Sebep | Çözüm |
|---------|-------------|--------|
| Titreme / jitter | "Fast" fazla kullanılmış, veya kamera + özne hareketi karışık | Tek bir öğeyi hızlı yap, diğerlerini yavaşlat. "avoid jitter" ekle. |
| Yüz morphing | Tutarsız referans görseller | Daha az, daha tutarlı referans kullan |
| Hareketsiz / durağan video | Referans görsel modeli kısıtlamış | Referansı kaldır, sadece prompt kullan |
| Stil kayması (drift) | Stil tanımı çok belirsiz | Stil'i checklist gibi yaz: aydınlatma + renk dengesi + materyal + arka plan |
| Logo/ürün bozulması | Düşük çözünürlük referans veya fazla hareket | Yüksek çözünürlük referans, hareket azalt, "no logo distortion" ekle |
| Kenarlar titriyor | Referans görselin kenarları pürüzlü | Arka planı temizle, kenarları kontrol et |
| Prompt'un yansımıyor | Prompt çok uzun ve çelişkili | 60-100 kelimeye indir, çelişkileri kaldır |

### 6.3. Kredi Optimizasyonu

- Önce 3 saniye veya düşük çözünürlükte test et, prompt'un çalıştığını doğrula.
- Final üretimini yüksek çözünürlükte (1080p) ve uzun sürede (8-15 saniye) yap.
- İyi bir frame yakaladığında screenshot al — image-to-video'da başlangıç karesi olarak kullanabilirsin.

---

## 7. SES / AUDIO STRATEJİSİ

Seedance 2.0 sesi video ile eş zamanlı üretir (Dual-Branch Diffusion Transformer).

**Prompt'ta ses ipuçları ver:**
- "metallic clink of a coin" → keskin, spesifik ses üretir
- "muffled footsteps on carpet" → ortam sesi yönlendirir
- "reverb in a large empty hall" → mekan akustiği oluşturur
- "no music" → müzik istemiyorsan belirt

**Ürün demoları için:** Genellikle sessiz veya hafif ambiyans ile üret, müziği post-production'da ekle.

**@Audio referansı:** Yüklediğin ses dosyası tempo, ruh hali değişimleri ve drop'lar aracılığıyla sahne ritmini ve kesim hızını etkiler.

---

## 8. ÖZET: HIZLI KONTROL LİSTESİ

Bir video üretim case'i geldiğinde şu sırayla ilerle:

```
□ Video türünü belirle (aksiyon/ürün/karakter/atmosfer/UGC/stil transferi)
□ Referans kararını ver (karar ağacını kullan)
□ Nano Banana gerekli mi değerlendir
□ 6 adımlı prompt formülünü uygula
□ Aydınlatma tanımı eklediğinden emin ol
□ "Fast" kelimesini kontrol et — gerçekten gerekli mi?
□ Kamera ve özne hareketi ayrı mı?
□ Shot başına tek aksiyon mı?
□ Referans kullanıyorsan: @tag rollerini belirttin mi?
□ Referans görseller tutarlı mı? (aydınlatma, stil, çözünürlük)
□ Önce düşük çözünürlükte test et
□ İterasyon yaparken tek değişken değiştir
```

---

## 9. PLATFORM NOTLARI (kie.ai)

- kie.ai playground üzerinden tüm modlar test edilebilir (text-to-video, image-to-video, referans sistemi).
- Referans dosyaları sürükle-bırak ile yüklenir.
- Üretim süreleri çözünürlüğe göre 60-180 saniye arası değişir.
- Aspect ratio (16:9, 9:16, 1:1) ve çözünürlük (720p, 1080p) üretim öncesi ayarlanır.

---

*Son güncelleme: Nisan 2026*
*Kaynaklar: Seedance 2.0 resmi prompt rehberi, topluluk testleri ve kişisel deneyimler.*
