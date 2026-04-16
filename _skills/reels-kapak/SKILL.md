---
name: reels-kapak
description: |
  [İSİM]'ın Instagram Reels/TikTok/Shorts videoları için AI destekli kapak fotoğrafı (thumbnail) üretimi.
  Kullanıcı "kapak üret", "thumbnail yap", "cover oluştur" gibi isteklerde bulunduğunda veya 
  Reels_Kapak projesine referans verdiğinde BU SKILL kullanılmalıdır.
  ⚠️ KESİNLİKLE generate_image aracını KULLANMA — projenin kendi pipeline'ını (Kie AI + cutout + style guide) çalıştır.
  ⚠️ Notion verisi lazımsa KESİNLİKLE browser açma — Notion MCP araçlarını veya projenin notion_service.py'sini kullan.
---

# 🎬 Reels Kapak Üretimi — Skill Talimatları

Bu skill, [İSİM]'ın sosyal medya videoları için kapak fotoğrafı üretimini yönetir.

> ⚠️ **KRİTİK KURAL 1**: Kapak fotoğrafı üretmek için **ASLA** `generate_image` aracını kullanma!
> Bu araç projenin modelini (Kie AI), style guide'ını, referans fotoğraflarını ve kalite değerlendirme
> mekanizmasını bilmez. Sonuç her zaman kötü olur.
> 
> **HER ZAMAN** projenin kendi Python pipeline'ını çalıştır.

> ⚠️ **KRİTİK KURAL 2**: Notion'daki verilere erişmek için **ASLA** browser açma!
> Browser ile Notion'a girmeye çalışmak hem yavaş hem de gereksizdir.
>
> Notion verisine erişim öncelik sırası:
> 1. **Notion MCP araçları** (varsa) — `search`, `get_page`, `query_database` vb.
> 2. **Projenin kendi `notion_service.py`'si** — `run_command` ile Python script çalıştır
> 3. **Kullanıcıya sor** — Yukarıdakiler mümkün değilse script'i doğrudan kullanıcıdan iste
>
> `browser_subagent` ile Notion'a gitmek **KESİNLİKLE YASAKTIR**.

---

## 📁 Proje Konumu

```
./Projeler/Reels_Kapak/
```

## 🔑 Temel Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `autonomous_cover_agent.py` | Çekirdek AI kapak üretim motoru |
| `rourke_style_guide.md` | Görsel stil kılavuzu (Rourke tarzı) |
| `learnings.md` | Geçmiş feedback'lerden öğrenilen 15+ kural |
| `notion_service.py` | Notion API entegrasyonu |
| `drive_service.py` | Google Drive yükleme |
| `main.py` | Otomatik cron pipeline (deploy için) |
| `assets/cutouts/` | [İSİM]'ın arka planı kaldırılmış referans fotoğrafları (23 adet) |

| `revision_engine.py` | Kapak revizyon motoru (feedback → analiz → revize üretim) |

---

## 🧠 Nasıl Çalışır — Pipeline (Multi-Theme)

**Varsayılan mod: 3 Tema × 2 Varyasyon = 6 Kapak per video**

```
1. Gemini ile 3 FARKLI yaratıcı tema üretilir:
   - Tema 1: SHOCK / PROVOCATIVE angle
   - Tema 2: CURIOSITY / MYSTERY angle
   - Tema 3: EMPOWERMENT / BENEFIT angle
   Her tema kendi cover_text + scene_description'a sahip.
2. Her tema için 2 varyasyon üretilir (toplam 6 kapak):
   a. Cutout fotoğraf seçilir (assets/cutouts/ klasöründen)
   b. ImgBB'ye yüklenir → URL elde edilir
   c. Kie AI (Nano Banana Pro) ile kapak görseli üretilir:
      - Cutout referans (--cref ile yüz tutarlılığı)
      - rourke_style_guide.md kuralları prompt'a gömülü
      - learnings.md kuralları prompt'a gömülü
   d. Gemini Vision ile değerlendirme (score 0-10)
      - Score < 8 → yeniden üretim (max retries)
   e. En iyi kapak dosyaya kaydedilir
3. Toplamda 6 kapak Drive'a yüklenir
```

---

## 🎯 Kullanım Senaryoları

### Senaryo 1: Kullanıcı Notion'daki bir video için kapak istiyor

**Kullanıcı der ki:** *"Notion'daki X videosu için kapak üret"*

**Adımlar:**

**Adım 1 — Notion'dan scripti al (⚠️ BROWSER AÇMA!):**
- **Yöntem A (Tercih edilen):** Notion MCP araçlarını kullan:
  - Önce `search` ile videoyu bul
  - Sonra `get_page` veya `get_block_children` ile sayfa içeriğini (script) oku
- **Yöntem B:** Projenin `notion_service.py`'sini çalıştır:
  ```bash
  cd ./Projeler/Reels_Kapak
  source venv/bin/activate
  python3 -c "from notion_service import get_page_content; print(get_page_content('PAGE_ID'))"
  ```
- **Yöntem C (Son çare):** Kullanıcıya sor: *"Script içeriğini yapıştırabilir misin?"*

**Adım 2 — Script içeriğini analiz et:**
- Videonun değer önerisini anla (izleyici ne kazanacak?)

**Adım 3 — Pipeline'ı çalıştır (3 Tema × 2 Varyasyon = 6 Kapak):**

```bash
cd ./Projeler/Reels_Kapak
source venv/bin/activate
python3 -c "
import random, os
from autonomous_cover_agent import run_autonomous_generation, generate_three_themes

# Cutout klasörü
cutout_dir = 'assets/cutouts'
cutouts = [f for f in os.listdir(cutout_dir) if f.endswith('.png')]

# Script içeriği
script_text = '''BURAYA VİDEONUN SCRİPT İÇERİĞİ'''

# 3 tema üret
themes = generate_three_themes('VIDEO_ADI', script_text)

for t_idx, theme in enumerate(themes, 1):
    cover_text = theme['cover_text']
    scene_desc = theme['scene_description']
    theme_name = theme['theme_name']
    print(f'\nTema {t_idx}: {theme_name} → {cover_text}')
    
    # Her temadan 2 varyasyon
    for v_idx in range(1, 3):
        cutout = os.path.join(cutout_dir, random.choice(cutouts))
        output = f'outputs/kapak_T{t_idx}_{theme_name}_V{v_idx}.png'
        run_autonomous_generation(
            local_person_image_path=cutout,
            video_topic='VIDEO_KONUSU',
            main_text=cover_text,
            output_path=output,
            max_retries=2,
            variant_index=v_idx,
            script_text=script_text,
            scene_description=scene_desc
        )
        print(f'  Varyasyon {v_idx} tamamlandı: {output}')
"
```

### Senaryo 2: Kullanıcı kendi belirlediği metin ve sahne ile kapak istiyor

**Kullanıcı der ki:** *"'SEKRETERİNİ KOV' yazılı, dramatik bir sahne ile kapak üret"*

**Adımlar:**
1. Kullanıcının verdiği metin ve sahne açıklamasını kullan
2. Yine 2 varyasyon üret (tek tema, kullanıcı tanımlı)

```bash
cd ./Projeler/Reels_Kapak
source venv/bin/activate
python3 -c "
import random, os
from autonomous_cover_agent import run_autonomous_generation

cutout_dir = 'assets/cutouts'
cutouts = [f for f in os.listdir(cutout_dir) if f.endswith('.png')]

for v_idx in range(1, 3):
    cutout = os.path.join(cutout_dir, random.choice(cutouts))
    run_autonomous_generation(
        local_person_image_path=cutout,
        video_topic='KONU',
        main_text='KULLANICININ BELİRLEDİĞİ METİN',
        output_path=f'outputs/kapak_ozel_V{v_idx}.png',
        max_retries=2,
        variant_index=v_idx,
        script_text='VARSA SCRİPT',
        scene_description='KULLANICININ VEYA SENİN BELİRLEDİĞİN SAHNE AÇIKLAMASI'
    )
"
```

> **Not:** Senaryo 2'de kullanıcı kendi metni ve sahnesini belirlediği için multi-theme uygulanmaz.
> Tek tema, 2 varyasyon üretilir.

---

### Senaryo 4: Kapak Revizesi (Kullanıcı feedback verdi)

**Kullanıcı der ki:** *"Şu kapakları revize et"* veya *"Notion'daki feedback'lere göre kapakları güncelle"*

**Arka Plan:**
- Kapak üretimi sonrası Notion sayfasına otomatik bir "📸 KAPAK REVİZYON PANELİ" eklenir
- Her tema için Drive linkleri ve boş "✏️ Revize:" satırları bulunur
- Kullanıcı istediği temaya feedback yazar (ör: "Metni büyüt", "Sahneyi karanlık yap")

**Adımlar:**

**Adım 1 — Feedback'leri oku:**
- Notion MCP ile sayfadaki blokları tara
- Veya projenin `revision_engine.py`'sini çalıştır:

```bash
cd ./Projeler/Reels_Kapak
source venv/bin/activate
python3 revision_engine.py PAGE_ID [DRIVE_FOLDER_URL]
```

**Adım 2 — revision_engine.py ne yapar:**
1. Notion sayfasından "✏️ Revize:" satırlarını okur
2. Orijinal kapağı Drive'dan indirir
3. Gemini Vision ile orijinal kapağı detaylı analiz eder (poz, ışık, renk, kıyafet, metin stili)
4. Feedback + orijinal analiz birleştirilerek minimal değişiklik prompt'u oluşturulur
5. Orijinal görsel Kie AI'a **style reference** olarak verilir
6. Yeni kapak üretilir → Drive'a "REV" suffixi ile yüklenir
7. Notion'daki feedback satırı "✅ Revize tamamlandı" olarak güncellenir

**Kritik:** Orijinal görsel bozulmamalı! `revision_engine.py` orijinali referans alarak minimal değişiklik yapar.

---

## ⚠️ Kritik Kurallar (Kısaltma — detay: learnings.md)

1. **Video adı ≠ Kapak metni** — "Typeless 5" gibi isimler dahili isimdir, kapak metni değil
2. **Metin SADECE Türkçe** — İngilizce kelime = başarısız
3. **Metin tekrarı yasak** — Aynı metin 2x render edilirse başarısız
4. **Instagram 4:5 safe zone** — Metin görselin %25-%75 dikey alanında olmalı
5. **Metin çok BÜYÜK olmalı** — Görselin genişliğinin %60-80'ini kaplamalı
6. **Klişelerden kaçın** — "Bilgisayar başında oturan kişi" yapmayın
7. **Fiziksel metafor kullan** — Patlayan objeler, dev klavyeler, dramatik sahneler
8. **Kişi her zaman öne çıkmalı** — Arka plan dramatik ama kişi baskın

---

## 📎 Beklenen Parametre Kaynakları

| Parametre | Nereden Alınır |
|-----------|---------------|
| `script_text` | Notion sayfasından (kullanıcı verir veya Notion API'den çekilir) |
| `video_topic` | Video konusu (kullanıcı açıklar) |
| `main_text` | Gemini üretir VEYA kullanıcı belirler |
| `scene_description` | Gemini üretir VEYA kullanıcı belirler |
| `local_person_image_path` | `assets/cutouts/` klasöründen rastgele seçilir |
| `variant_index` | 1=candid/action, 2=mystery/moody (her temadan 2 varyasyon) |
| `max_retries` | Varsayılan 2 (kalite değerlendirme retry'ı) |

---

## 🔧 Ortam Gereksinimleri

- **Python venv**: `./Projeler/Reels_Kapak/venv`
- **Env dosyası**: `.env` dosyasındaki API key'ler (GEMINI_API_KEY, KIE_API_KEY, IMGBB_API_KEY, NOTION_TOKEN)
- **Google OAuth**: `credentials.json` + `token.json` (Drive erişimi için)

---

## ⏱️ Bekleme Süreleri

Kie AI'da görsel üretimi **anlık değildir**:
- Normal: 30-60 saniye
- Yoğun saatler: 5-30 dakika queue bekleme
- Script otomatik polling yapar, sabırlı ol

---

## 📤 Çıktı

Üretilen kapaklar şuraya kaydedilir:
```
./Projeler/Reels_Kapak/outputs/
```

İsteğe bağlı olarak Google Drive'a da yüklenebilir (`drive_service.py` ile).
