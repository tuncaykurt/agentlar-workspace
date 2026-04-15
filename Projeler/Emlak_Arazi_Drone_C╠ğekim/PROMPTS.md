# PROMPTS.md — AI Prompt Şablonları

Bu dosya, otomasyondaki her AI generation adımı için kullanılacak prompt şablonlarını içerir.
`{değişken}` formatındaki yerler, runtime'da gerçek değerlerle değiştirilmelidir.

---

## FRAME_1_DRONE_PERSPECTIVE

### Platform: Nano Banana Pro (Image-to-Image)

### Input Image
`satellite_image.png` — Google Maps uydu görseli (dikey, üstten bakış)

### Prompt
```
Transform this satellite/aerial top-down view into a realistic drone photography shot taken from a 45-degree angle looking down. The image should look like it was captured by a DJI Mavic 3 drone at approximately 150 meters altitude. Maintain the exact same landscape, terrain, roads, and buildings visible in the original image. The perspective should shift from directly overhead to a 45-degree oblique angle. Photorealistic quality, natural lighting with soft afternoon sun, slight atmospheric haze for depth. The terrain textures (grass, soil, trees, roads) should look hyper-realistic and three-dimensional. Vertical format, 9:16 aspect ratio.
```

### Negative Prompt (varsa)
```
cartoon, illustration, painting, unrealistic colors, distorted buildings, blurry, low quality, oversaturated, night time, dark, foggy
```

### Parametreler
- Strength/Denoising: 0.55-0.65 (orijinal görseli çok bozmadan perspektif değiştirmesi için)
- Guidance Scale: 7-9
- Steps: 30-50

### Notlar
- Eğer çıktı çok farklıysa (orijinal bölgeyi tanınmaz hale getiriyorsa), strength'i 0.45'e düşür
- Eğer perspektif yeterince değişmiyorsa, strength'i 0.70'e çıkar

---

## FRAME_2_GLOWING_BORDERS

### Platform: AI Image Generation (Flux, Midjourney, veya Nano Banana Pro)

### Yaklaşım A: Tamamen AI (Tercih Edilen — Anti-gravity için)

### Input Image
`frame_1_drone.png` — Drone perspective görseli

### Prompt
```
Take this drone photograph and add bright, glowing neon boundary lines that outline a specific land parcel in the center of the image. The glowing lines should be electric blue/cyan color (#00FFFF) with a soft luminous glow effect, approximately 3-4 meters wide in real-world scale. The lines should form a closed polygon shape marking the boundaries of an empty land parcel. The glow should cast subtle light on the surrounding ground. The rest of the image remains exactly the same — photorealistic drone shot. The boundary lines should look like they are projected onto the ground from above, like an AR (augmented reality) overlay. Vertical format 9:16.
```

### Alternatif Prompt (Eğer arsa şekli önemliyse)
```
This is a drone photograph looking down at a 45-degree angle. Add bright glowing neon cyan boundary lines (#00FFFF) on the ground that form a {polygon_shape_description} shape in the center of the image, marking a land parcel of approximately {parcel_area_m2} square meters. The glowing lines should have a soft luminous halo effect, casting light on the nearby ground. Lines should appear as if projected from the sky onto the earth surface. Everything else in the image stays photorealistic and unchanged. AR holographic overlay aesthetic.
```

Burada `{polygon_shape_description}` değişkeni parselin genel şeklini tarif eder:
- 4 köşeli ve yaklaşık kare → "roughly square"
- 4 köşeli ve dikdörtgen → "rectangular"
- Düzensiz → "irregular polygon with {n} corners"
- Üçgen → "triangular"

### Parametreler
- Strength/Denoising: 0.35-0.45 (drone görselini mümkün olduğunca koru, sadece glow ekle)
- Guidance Scale: 8-10

### Kalite Kontrol
- Arka plan (arazi, yollar, binalar) değişmemiş olmalı
- Glow çizgileri net ve keskin olmalı
- Çizgiler kapalı bir polygon oluşturmalı (açık kalmamalı)

---

## FRAME_3_AREA_TEXT

### Platform: AI Image Generation

### Input Image
`frame_2_glowing.png` — Işıklı sınırlı drone görseli

### Prompt
```
Take this drone photograph with glowing boundary lines and add a large, bold, three-dimensional floating text in the center of the marked land parcel that reads "{formatted_area}". The text should be massive, easily readable, and appear to float just above the ground surface. Style: bold 3D metallic white text with subtle gold edges, casting a soft shadow on the ground below. The text should be angled to match the 45-degree drone perspective — as if the text is lying flat on the ground but with 3D depth. The glowing boundary lines and everything else in the image remain unchanged. Cinematic quality.
```

### Değişkenler
- `{formatted_area}` = Türkiye formatında yüzölçümü, örn: "1.250 m²"

### Alternatif Metin Formatları (emlakçı tercihine göre)
- Sadece metrekare: "1.250 m²"
- Fiyatlı: "1.250 m² — ₺2.500.000"
- Dönümlü: "1.250 m² (1,25 dönüm)"

### Parametreler
- Strength/Denoising: 0.35-0.45
- Guidance Scale: 9-11 (text okunabilirliği için yüksek tut)

### Kalite Kontrol
- Text okunabilir olmalı — bu EN KRİTİK kontrol noktası
- Eğer AI text'i doğru yazamıyorsa (sık karşılaşılan sorun), bu frame'i programatik overlay ile üretmeyi düşün
- Text drone perspektifine uygun açıda olmalı

### Fallback: Programatik Text Overlay
Eğer AI metni doğru yazamıyorsa:
1. Frame 2'yi al
2. Python Pillow ile perspective-transformed text overlay ekle
3. Gölge ve 3D efekt ekle
Bu yaklaşım %100 tutarlı sonuç verir.

---

## FRAME_4_PROJECT_VISUALIZATION

### Platform: AI Image Generation (Flux Pro, Midjourney, veya benzeri)

### Input Image
`frame_1_drone.png` veya `frame_3_area.png`

### Prompt — Villa/Ev (< 2000 m²)
```
Transform this empty land parcel (visible in the drone photograph with glowing boundaries) into a completed modern luxury villa project. Replace the empty land with: a contemporary white-and-wood villa with large glass windows, a swimming pool, landscaped garden with mature trees, stone walkway, and outdoor living area. The villa should be architecturally realistic and proportional to the {parcel_area_m2} square meter land area. Maintain the same 45-degree drone camera angle and perspective. The surrounding area outside the parcel boundaries remains unchanged. Photorealistic architectural visualization quality, golden hour lighting.
```

### Prompt — Apartman/Rezidans (2000-10000 m²)
```
Transform this empty land parcel into a completed modern residential complex. Replace the empty land with: a {floor_count}-story contemporary residential building with balconies, ground-floor retail spaces, underground parking entrance, landscaped courtyard with fountain, and mature trees. The building should be architecturally realistic and proportional to the {parcel_area_m2} square meter land area. Maintain the same 45-degree drone camera angle. Surrounding area unchanged. Photorealistic architectural render quality.
```

### Prompt — Genel (proje tipi belirtilmemişse)
```
Transform this empty land parcel seen from a drone at 45-degree angle into a beautifully developed property. Based on the {parcel_area_m2} square meter area, create an appropriate modern development: if small create a luxury villa with pool, if medium create a boutique residential complex, if large create a premium mixed-use development. The architecture should be modern, Mediterranean-influenced, with white facades, natural stone accents, and lush landscaping. Maintain the exact same drone camera angle and perspective. Surrounding area outside the parcel stays unchanged. Photorealistic architectural visualization, golden hour warm lighting.
```

### Değişkenler
- `{parcel_area_m2}` — Yüzölçümü
- `{floor_count}` — Hesaplanan kat sayısı (opsiyonel):
  - 2000-5000 m²: 4-6 kat
  - 5000-10000 m²: 8-12 kat
  - 10000+ m²: 15+ kat veya site projesi

### Parametreler
- Strength/Denoising: 0.70-0.85 (büyük değişiklik gerekiyor)
- Guidance Scale: 8-10

### Kalite Kontrol
- Proje, arsanın sınırları içinde olmalı
- Çevre (arsanın dışı) mümkün olduğunca korunmalı
- Mimari oranlar gerçekçi olmalı
- Perspektif tutarlılığı (45 derece açı korunmalı)

---

## FRAME_5_EYE_LEVEL

### Platform: AI Image Generation

### Input Image
`frame_4_project.png` (referans) — Drone perspektifinden proje görseli

### Prompt — Villa
```
Based on the architectural project visible in the reference drone image, generate an eye-level street view of the same modern luxury villa. Camera position: standing at the entrance gate, looking at the front facade. The villa has the same architectural style as seen from above: contemporary white-and-wood design with large glass windows, swimming pool visible to the side, landscaped garden. Eye-level perspective, approximately 1.7 meters camera height. Same golden hour lighting. Photorealistic architectural photography quality. Vertical format 9:16.
```

### Prompt — Apartman/Rezidans
```
Based on the architectural project visible in the reference drone image, generate an eye-level street view of the same modern residential building. Camera position: standing across the street, looking at the main entrance and facade. The building has the same architectural style as seen from above: contemporary design with balconies, ground-floor features, landscaped entrance. Eye-level perspective, approximately 1.7 meters camera height. Same lighting conditions. Photorealistic architectural photography quality. Vertical format 9:16.
```

### Prompt — Genel
```
Generate a ground-level, eye-height perspective view of the modern architectural project that was shown from a drone angle in the reference image. Show the building's front facade with entrance, landscaping, and street-level details. The architectural style should match the aerial view exactly. Camera at human eye height (~1.7m), looking slightly upward at the building. Warm golden hour lighting, photorealistic quality. Vertical 9:16 format.
```

### Parametreler
- Bu tamamen yeni bir görsel üretimi, image-to-image değil
- Reference image olarak frame_4 kullanılabilir (IP-Adapter veya benzeri)
- Guidance Scale: 8-10

### Kalite Kontrol
- Mimari stil Frame 4 ile tutarlı olmalı
- Perspektif gerçekçi göz hizası olmalı
- Bina oranları mantıklı olmalı

---

## VIDEO_1: Drone Bakışı → Işıklı Sınırlar

### Platform: Kling (veya Runway Gen-3)

### Start Frame
`frame_1_drone.png`

### End Frame
`frame_2_glowing.png`

### Prompt
```
A cinematic drone shot looking down at a 45-degree angle over an empty land parcel. The camera remains mostly stationary with very subtle slow zoom. Gradually, bright cyan/blue glowing boundary lines appear on the ground, outlining the parcel borders. The glow lines materialize from left to right, as if being drawn by an invisible laser. The rest of the landscape remains still and photorealistic. Smooth, cinematic motion. 4-5 seconds duration.
```

### Parametreler
- Duration: 4-5 saniye
- Motion: Minimal (mostly static camera, glowing animation)
- Mode: Image-to-Video veya Start-End Frame interpolation

---

## VIDEO_2: Işıklı Sınırlar → Metrekare Yazısı

### Platform: Kling

### Start Frame
`frame_2_glowing.png`

### End Frame
`frame_3_area.png`

### Prompt
```
A drone shot of a land parcel with glowing cyan boundary lines on the ground. The camera slowly zooms in slightly toward the center of the parcel. A large, bold 3D text reading "{formatted_area}" gradually materializes and floats above the center of the parcel. The text appears with a subtle scale-up animation, becoming fully visible and readable. Glowing boundary lines remain stable. Photorealistic drone footage quality. 3-4 seconds.
```

---

## VIDEO_3: Metrekare Yazısı → Proje Görseli

### Platform: Kling

### Start Frame
`frame_3_area.png`

### End Frame
`frame_4_project.png`

### Prompt
```
A drone shot of a land parcel with glowing boundaries and area text. The text fades away and the empty land within the boundaries begins to transform — construction appears to fast-forward, and a modern architectural project gradually rises from the ground. The transformation is smooth and cinematic, like a time-lapse of construction compressed into seconds. The drone camera remains at the same 45-degree angle throughout. The surrounding area stays unchanged. 4-5 seconds.
```

### Önemli Not
Bu en zor video çünkü büyük bir morph/transition gerekiyor. Eğer Kling bunu tek seferde yapamıyorsa, ara frame'ler ekleyerek adımları küçült.

---

## VIDEO_4: Drone Bakışı → Göz Hizası

### Platform: Kling

### Start Frame
`frame_4_project.png`

### End Frame
`frame_5_eyelevel.png`

### Prompt
```
A cinematic camera movement starting from a 45-degree drone angle looking down at a modern architectural project, then smoothly descending and rotating to arrive at an eye-level street view of the same building. The camera descends from approximately 150 meters altitude to ground level (1.7 meters height), while rotating from looking-down to looking-forward. The building and surroundings remain consistent throughout the movement. Smooth, professional camera animation. 4-5 seconds.
```

### Alternatif: İki Parçaya Böl
Eğer tek video'da perspektif değişimi çok zor olursa:
- **Video 4A:** Drone'dan zoom in (yukarıdan, yaklaşma) — 2-3 saniye
- **Video 4B:** Yakın drone'dan göz hizasına geçiş — 2-3 saniye

---

## Prompt Optimizasyon Notları

### Genel İpuçları
1. Her prompt'un sonuna "vertical format, 9:16 aspect ratio" ekle
2. "Photorealistic" ve "cinematic" kelimeleri kaliteyi artırır
3. Lighting tutarlılığı için her prompt'ta "golden hour" veya "afternoon sun" belirt
4. Negatif prompt'larda "cartoon, illustration, painting, blurry, distorted" kullan

### Frame Tutarlılığı İçin
- Her frame bir öncekiyle aynı perspektif açısını korumalı
- Işık yönü ve renk sıcaklığı tüm frame'lerde aynı olmalı
- Çevre (arsanın dışındaki alan) mümkün olduğunca değişmemeli

### AI Text Üretimi Sorunu
AI'lar genellikle metin üretiminde zayıftır. "1.250 m²" gibi spesifik bir metin yazması gerekiyorsa:
- Prompt'ta metni tırnak içinde ver: reads exactly "1.250 m²"
- "Clearly legible, sharp text, correct spelling" ekle
- 2-3 deneme yapıp en iyisini seç
- Son çare: Programatik text overlay

### Video Prompt İpuçları
- "Smooth" ve "cinematic" kelimeleri kamera hareketini yumuşatır
- "The camera remains steady" diyerek gereksiz kamera sallanmasını engelle
- Duration belirt: "4-5 seconds" gibi
- Start ve end frame veriyorsan, prompt kısa ve net olsun
