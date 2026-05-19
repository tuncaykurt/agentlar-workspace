# Dinamik Çoklu Video Üretimi (Multi-Shot Fallback)

Antigravity, Kie AI üzerindeki bazı modellerin (örn. Kling multi_shots veya Sora 2 Pro) çoklu sahnelerde sıklıkla `500 Server Error` verdiğini veya kararsızlaştığını tespit etmiştir. 

Ancak **sadece 5 saniyelik bir AI videosu reel, TikTok veya reklam filmi için yeterli değildir.** Videoları dinamik hale getirmek için 3-4 farklı sahne (shot) kurgulanmalı ve ayrı ayrı üretilip birleştirilmelidir.

Bu pipeline, bu sorunu aşmak için **ayrı klipler üretip FFmpeg ile birleştirme** stratejisini açıklar.

---

## Aşama 1: Sahnelerin (Shot) Planlanması

Proje hedefine göre 3-4 sahnelik bir senaryo planla. Her sahne için güçlü, spesifik bir prompt oluştur. 

**Örnek Senaryo (Kahve Reklamı):**
- **Log 1:** "Extreme close up of roasted coffee beans dropping into a grinder, cinematic lighting, 4k."
- **Log 2:** "Steam rising from a freshly poured espresso shot in a glass cup, morning light, macro."
- **Log 3:** "A smiling woman holding a coffee cup, looking out of a window in a modern cafe."

---

## Aşama 2: Klipleri Ayrı Ayrı Üretme (Paralel İşlem)

Bu sahneleri her biri ayrı bir `taskId` alacak şekilde, en stabil olan **Kling 3.0** veya **Veo 3.1** üzerinden gönder. Ayrı ayrı istek atmak çok daha güvenlidir.

`Veo 3.1` (veo3_fast) düz JSON payload'u:
```bash
# Model: veo3_fast (Kling de kullanılabilir)
curl -X POST "https://api.kie.ai/api/v1/veo/generate" \
  ...
```

Veya `Kling 3.0` (`mode: "pro"`, `duration: "5"`) kullanarak sırayla görevleri başlat. Antigravity olarak script yazıp bu görevleri asenkron olarak arka planda bekleyebilirsin.

---

## Aşama 3: Klipleri İndirme

Tümü "success" (başarılı) olduktan sonra klipleri bilgisayara (`/tmp/` klasörüne vs.) indir:

```bash
curl -o /tmp/scene1.mp4 "https://tempfile.aiquickdraw.com/...1.mp4"
curl -o /tmp/scene2.mp4 "https://tempfile.aiquickdraw.com/...2.mp4"
curl -o /tmp/scene3.mp4 "https://tempfile.aiquickdraw.com/...3.mp4"
```

---

## Aşama 4: Format Eşitleme ve Birleştirme (FFmpeg)

Yapay zeka modelleri bazen video bitrate'ini, saniye başına düşen kare sayısını (fps), kalitesini ya da tam aspect ratio çözünürlüğünü farklı döndürebilir (Örn: biri 1920x1080 çıkarken öbürü 1920x1088 çıkabilir). Bu FFmpeg birleştirme (concat) işlemlerinde hata yaratır.

### Doğru Birleştirme Tekniği
Önce tüm klipleri eşit çözünürlük, eşit fps ve eşit formata getiren bir filtreyle birleştirmelisin.

`list.txt` oluştur:
```txt
file '/tmp/scene1.mp4'
file '/tmp/scene2.mp4'
file '/tmp/scene3.mp4'
```

Alternatif olarak, filter_complex ile garantili birleştirme (Kliplerin çözünürlüğünde uyuşmazlık çıkabileceğinden en garantili yöntem budur):

```bash
ffmpeg -y -i /tmp/scene1.mp4 -i /tmp/scene2.mp4 -i /tmp/scene3.mp4 \
-filter_complex "[0:v:0]scale=1920:1080,setdar=16/9[v0]; \
                 [1:v:0]scale=1920:1080,setdar=16/9[v1]; \
                 [2:v:0]scale=1920:1080,setdar=16/9[v2]; \
                 [v0][v1][v2]concat=n=3:v=1:a=0[outv]" \
-map "[outv]" -c:v libx264 -pix_fmt yuv420p /tmp/final_dynamic_ad.mp4
```

> 💡 **Not:** Yukarıdaki işlem a=0 (audio yok) olarak ayarlanmıştır. Üzerine müzik veya ElevenLabs seslendirmesi eklemek istersen, oluşan nihai `final_dynamic_ad.mp4` dosyası üzerinden ikinci bir işlem planla (Detay için `pipelines/video-seslendirme.md`'ye bak).

---

## Kullanım Alanları ve Strateji

Bu metodu şuralarda kullanmalıyız:
- Tek bir modelin tek seferlik kısıtlı prompt limitinde anlatılamayacak kadar *uzun ve detaylı klipler* istendiğinde.
- Reklam, tanıtım videosu veya fragman kurguları yapıldığında.
- Sora veya Kling "multi_shots" özelliği error döndürüp takıldığında, görevi asla yarım bırakmayıp **manual birleştirme ile fallback'e geç.** 
