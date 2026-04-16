---
description: İçerik otomasyon sistemi — Kie AI ile video üretim pipeline'ı başlat
---

# İçerik Üretimi — Kie AI Pipeline

> 🤖 **Agent:** Bu workflow `_agents/icerik-uretim/AGENT.md` agent'ının bir parçasıdır.
> Bağımsız olarak da çalışabilir (`/icerik-uretimi`), ancak tam pipeline için agent yönergesini takip et.
> Agent pipeline'ında bu, **son adımdır** — öncesinde araştırma ve script yazma adımları gelir.

Kie AI modelleri kullanarak video ve görsel içerik üretme adımları.

## Bağlam
- **Agent:** `_agents/icerik-uretim/AGENT.md`
- **Config:** `_agents/icerik-uretim/config/ornek-marka.yaml`
- **Skill:** `_skills/kie-ai-video-production/SKILL.md` → ÖNCE OKU
- **API:** `_knowledge/api-anahtarlari.md` → Kie AI bölümü
- **API Dökümanları:** `Projeler/İçerik Otomasyon Test/api-docs/`

## Pipeline Bağlantısı

Bu workflow, İçerik Üretim Agent'ının son adımıdır. Tam pipeline şu şekilde akar:

```
1. [Araştırma]     → _agents/icerik-uretim/workflows/arastirma-yap.md
2. [Script Yazma]  → _agents/icerik-uretim/workflows/script-yaz.md
   veya [İlham Al] → _agents/icerik-uretim/workflows/ilham-al.md
   veya [Hesaplama]→ _agents/icerik-uretim/workflows/hesaplama-scripti.md
3. [Video Üretim]  → BU WORKFLOW (icerik-uretimi.md)
```

## Adımlar

1. **SKILL.md dosyasını oku**
   - `_skills/kie-ai-video-production/SKILL.md`
   - Hangi model ne zaman kullanılır, HTTP akışı nasıl işler

2. **Script'ten video stratejisi belirle**
   - Hazır script varsa → script'e uygun görsel prompt hazırla
   - Script yoksa → doğrudan video prompt'u al

3. **Model seç** (SKILL.md'deki karar ağacını izle)
   | İhtiyaç | Model |
   |---|---|
   | Drone / sinematik video | Veo 3.1 veya Seedance 2.0 |
   | Kısa, hızlı video | Kling 3.0 |
   | Yüksek kalite sinematik | Veo 3.1 |
   | Ürün reklam videosu | Kling 3.0 |
   | Image-to-video (görselden video) | Seedance 2.0 (first_frame_url) |
   | Karakter tutarlılığı (çoklu sahne) | Seedance 2.0 (multimodal referans) |
   | Zincirleme sahne üretimi | Seedance 2.0 (return_last_frame) |
   | Görsel efekt / mockup | Nano Banana 2 |
   | Görsel düzenleme | Qwen Image Edit |
   | Çok sahneli hikaye | Sora 2 Pro Storyboard |

4. **Prompt hazırla**
   - Prompt rehberleri: `Projeler/İçerik Otomasyon Test/prompt-rehberleri/`
   - Açık, görsel, sinematik dil kullan
   - Config'deki marka kurallarına uy

5. **API çağrısı yap**
   - POST `/jobs/createTask` → taskId al
   - 15-30 saniye bekle
   - GET `/jobs/recordInfo?taskId=X` → durum sorgula

6. **Seslendirme ekle** (opsiyonel)
   - Script'in seslendirme gerektirip gerektirmediğini belirle
   - Gerekiyorsa: ElevenLabs ile Türkçe dış ses üret
   - FFmpeg ile video + ses birleştir
   - Detay: `_skills/kie-ai-video-production/pipelines/video-seslendirme.md`

7. **Sonucu al ve teslim et**
   - `state: success` → `resultJson` içinden URL'i parse et
   - Gerekirse Telegram botu üzerinden gönder
   - URL 14 gün geçerli — hemen indir

8. **Hata durumunda**
   - `state: failed` → `failMsg` oku, prompt'u sadeleştir
   - 500 hatası → 30 saniye bekle, tekrar dene
   - Kredi yoksa → `_knowledge/api-anahtarlari.md`'de yedek anahtar var mı kontrol et

## Çıktı Formatı

```markdown
## Video Üretim Sonucu — [Tarih]

| Alan | Değer |
|------|-------|
| Model | Kling 3.0 / Veo 3.1 / ... |
| Süre | X saniye |
| Çözünürlük | 1080p / 4K |
| URL | [İndir](url) |
| Geçerlilik | 14 gün |

### Kullanılan Prompt
> ...

### Seslendirme
- Eklendi mi: Evet/Hayır
- Voice ID: ...
```
