import os
import sys
from autonomous_cover_agent import generate_cover_text_and_scene, run_autonomous_generation
from drive_service import upload_cover_to_drive

# User's provided Google Drive Folder ID
DRIVE_URL = "https://drive.google.com/drive/folders/1zy5nhR8w0Nyc8LT_QT9b-9CPqbUBkGts"

# Cutout reference image
cutout_img = "cutout_temp.png"

# =============================================================================
# VIDEO DEFINITIONS
# =============================================================================
# Each video now has multiple CONCEPTS, each with multiple VARIATIONS.
# Naming: Konsept_1A = Concept 1, Variation A
#         Konsept_1B = Concept 1, Variation B
#         Konsept_2A = Concept 2, Variation A ... etc.
# =============================================================================

VIDEOS = [
    {
        "name": "Dzine",
        "script": """keşfeti ele geçiren bu akımı yapması aslında çok kolay
hemen anlatıyorum
ilk olarak Dzine ai'ya giriyorum
image to image a tıklıyorum ve nano banana pro'yu seçiyorum
referans görselimi yükledikten sonra dönüştürmek istediğim ülke ve stilini tarif ediyorum.
her ülke için tekrarladıktan sonra Image to Video'ya geçiyorum
sırasıyla oluşturduğum görselleri ilk ve son sahne olarak ekliyorum ve ardından videom hazır
INSTAGRAM CLOSING : hemen denemen için YOLLA yaz sana gönderiyim
TIKTOK/ SHORTS CLOSING: hemen denemen için uygulamanın adı DZINE AI.""",
        "concepts": [
            {
                "name": "Konsept_1",
                "cover_text": "1 FOTO 10 ÜLKE",
                "scene_descriptions": [
                    # Variation A: Dramatic portal with cultural elements
                    "A cinematic scene: the person stands at the center of a dramatic swirling portal made of cultural elements from 10 different countries (torii gates, pyramids, Eiffel tower, etc). The elements spiral around the person like a dimensional gateway. Dark moody background, the person is clearly the focal point.",
                    # Variation B: Grid transformation showcase
                    "A sleek modern scene: the person stands on the left side, and on the right side there is a futuristic digital grid showing the same person transformed into 6 different cultural styles (samurai, pharaoh, cowboy, bollywood star, viking, mariachi). Like digital mirrors or AI screens floating around. Dark minimal background with neon accents."
                ]
            },
            {
                "name": "Konsept_2",
                "cover_text": "VİRAL VİDEO FORMÜLÜ",
                "scene_descriptions": [
                    # Variation A: Bursting out of phone
                    "A dramatic scene: the person bursts out of a giant smartphone screen, breaking through the glass. The screen shows explosive viral metrics (3.5M views, 850K likes). Behind, dramatic light rays and digital particles explode outward. The person looks excited and energetic.",
                    # Variation B: Director's chair
                    "A cinematic scene: the person sits in a director's chair surrounded by floating film strips and holographic editing interfaces showing various country scenes. Backlighting creates a dramatic rim light effect. Powerful, confident pose with one hand gesturing forward."
                ]
            }
        ]
    },
    {
        "name": "Viral Spider Icecream",
        "script": """Böyle mide bulandırıcı videolar yapıp nasıl milyonlarca izlenirsin
Hemen gösteriyorum. Öncelikle 2 tane görsel oluşturman gerekiyor.
ChatGPT den simsiyah bir dondurma ve simsiyah bir örümcek çizmesini istedim.
Daha sonra klingai.com isimli siteye gittim. Bu arada site ücretsiz.
Görsellerimi ekledim ve dondurmayı örümceğe dönüştür yazdım.
Bu arada siteyi ve detayları almak için yorumlara dondurma yaz.
Ve işte sonuç.""",
        "concepts": [
            {
                "name": "Konsept_1",
                "cover_text": "MİDE BULANDIRAN İÇERİK",
                "scene_descriptions": [
                    # Variation A: Disgusting transformation
                    "A dramatic dark scene: a giant black ice cream cone that is morphing into a creepy black spider. The transformation is in mid-process, half ice cream half spider. The person watches in shock/disgust with wide eyes. Dark moody lighting, horror movie aesthetic.",
                    # Variation B: Viral factory
                    "A cinematic scene: the person holds a phone showing disgusting viral content, while millions of eye emojis and view count numbers rain down around them like confetti. Dark background, neon green/purple accents suggesting something gross but viral."
                ]
            },
            {
                "name": "Konsept_2",
                "cover_text": "MİLYONLAR İZLEDİ",
                "scene_descriptions": [
                    # Variation A: Explosion of views
                    "A dramatic scene: the person stands confidently while behind them a giant glowing number '10M+' towers like a monument. Digital particles and small spider/ice cream elements float around. Dark cinematic atmosphere with dramatic rim lighting.",
                    # Variation B: Dark creation
                    "A moody scene: the person sits at a desk with dual monitors showing AI generation interfaces. From the screens, a giant spider and a black ice cream emerge into reality, growing to enormous size. The person has a mischievous, knowing grin. Dark, dramatic lighting."
                ]
            }
        ]
    }
]


def process_video_concepts(video_config, output_base_dir):
    """Process a video with multiple concepts and variations."""
    video_name = video_config["name"]
    script = video_config["script"]
    concepts = video_config["concepts"]
    
    print(f"\n{'='*60}")
    print(f"🎬 VIDEO: {video_name}")
    print(f"📝 Konsept sayısı: {len(concepts)}")
    print(f"{'='*60}")
    
    video_dir = os.path.join(output_base_dir, video_name.replace(" ", "_"))
    os.makedirs(video_dir, exist_ok=True)
    
    results = []
    
    for concept in concepts:
        concept_name = concept["name"]
        cover_text = concept["cover_text"]
        scene_descriptions = concept["scene_descriptions"]
        
        concept_dir = os.path.join(video_dir, concept_name)
        os.makedirs(concept_dir, exist_ok=True)
        
        print(f"\n{'─'*40}")
        print(f"📌 {concept_name}: \"{cover_text}\"")
        print(f"   Varyasyon sayısı: {len(scene_descriptions)}")
        print(f"{'─'*40}")
        
        for var_idx, scene_desc in enumerate(scene_descriptions):
            var_letter = chr(65 + var_idx)  # A, B, C...
            var_name = f"{concept_name[len('Konsept_'):]}{var_letter}"  # "1A", "1B", etc.
            output_path = os.path.join(concept_dir, f"Kapak_{var_name}.png")
            
            print(f"\n>> Varyasyon {var_name} deneniyor...")
            print(f"   Sahne: {scene_desc[:100]}...")
            
            # Use variant_index to get different camera angles/styles
            variant_index = var_idx + 1
            
            success = run_autonomous_generation(
                local_person_image_path=cutout_img,
                video_topic=f"{video_name} - {cover_text}",
                main_text=cover_text,
                output_path=output_path,
                max_retries=2,
                variant_index=variant_index,
                script_text=script,
                scene_description=scene_desc
            )
            
            result = {
                "video": video_name,
                "concept": concept_name,
                "variation": var_name,
                "text": cover_text,
                "output": output_path,
                "success": success
            }
            results.append(result)
            
            if success:
                print(f"\n✅ KAPAK ONAYLANDI: {var_name} → {output_path}")
                
                # Upload to Drive
                drive_file_name = f"{video_name} Kapak {var_name}.png"
                print(f"☁️ Google Drive'a Yükleniyor: {drive_file_name}")
                upload_ok = upload_cover_to_drive(output_path, DRIVE_URL, file_name=drive_file_name)
                if upload_ok:
                    print("🎉 Drive yüklemesi başarılı!")
                else:
                    print("❌ Drive yüklemesi başarısız oldu.")
            else:
                print(f"\n❌ Kapak üretilemedi: {var_name}")
    
    return results


if __name__ == "__main__":
    output_base = "outputs"
    if not os.path.exists(output_base):
        os.makedirs(output_base)
    
    print(f"Script çalışıyor... Referans görsel: {cutout_img}")
    if not os.path.exists(cutout_img):
        print(f"HATA: Resim dosyası okunamıyor veya bulunamadı: {cutout_img}")
        print("Terminalinizin Full Disk Access (veya Desktop) okuma izni verilmiş mi kontrol edin.")
        sys.exit(1)
    
    all_results = []
    for video in VIDEOS:
        results = process_video_concepts(video, output_base)
        all_results.extend(results)
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 ÖZET RAPOR")
    print(f"{'='*60}")
    
    success_count = sum(1 for r in all_results if r["success"])
    total_count = len(all_results)
    
    print(f"Toplam: {total_count} kapak | Başarılı: {success_count} | Başarısız: {total_count - success_count}")
    print()
    
    for r in all_results:
        status = "✅" if r["success"] else "❌"
        print(f"  {status} {r['video']} / {r['concept']} / {r['variation']} → \"{r['text']}\"")
    
    print(f"\n✅ Tümü tamamlandı.")
