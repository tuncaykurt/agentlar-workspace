import random, os
from dotenv import load_dotenv
load_dotenv()
from autonomous_cover_agent import run_autonomous_generation, generate_cover_text_and_scene


def main():
    cutout_dir = 'assets/cutouts'
    cutouts = [f for f in os.listdir(cutout_dir) if f.endswith('.png')]
    cutout = os.path.join(cutout_dir, random.choice(cutouts))

    script_text = "Mustafa isimli müşterimizin bizimle çalışarak elde ettiği başarıyı ve memnuniyeti anlattığı testimonial/referans videosu."

    text_result = generate_cover_text_and_scene('YouTube Testimonial Mustafa', script_text)
    cover_text = text_result.get('cover_text', 'MÜŞTERİ YORUMU')
    scene_desc = text_result.get('scene_description', 'A cinematic, high-quality shot of a satisfied professional.')

    print(f'Metin: {cover_text}')
    print(f'Sahne: {scene_desc}')

    for variant in range(2, 4):
        output = f'/tmp/mustafa_kapak_v{variant}.png'
        print(f"\n--- Varyasyon {variant} Başlıyor ---")
        run_autonomous_generation(
            local_person_image_path=cutout,
            video_topic='Müşteri Başarı Hikayesi / Testimonial',
            main_text=cover_text,
            output_path=output,
            max_retries=2,
            variant_index=variant,
            script_text=script_text,
            scene_description=scene_desc
        )
        print(f'Varyasyon {variant} tamamlandı: {output}')


if __name__ == '__main__':
    main()
