"""
Generate Printify 9 — Lokal çalıştırma script'i.
Environment variable'ları .env dosyasından veya ortam değişkenlerinden okur.
"""
import os
import random
import time
from autonomous_cover_agent import run_autonomous_generation, generate_three_themes

# Env var'lar ortamdan gelmelidir — hardcoded key YASAK
required_vars = ["NOTION_TOKEN", "NOTION_DATABASE_ID", "KIE_API_KEY", "IMGBB_API_KEY", "GEMINI_API_KEY"]
missing = [v for v in required_vars if not os.environ.get(v)]
if missing:
    print(f"❌ Eksik environment variable'lar: {', '.join(missing)}")
    print("💡 Önce değişkenleri ayarlayın: export NOTION_TOKEN=xxx")
    exit(1)

cutout_dir = 'assets/cutouts'
cutouts = [f for f in os.listdir(cutout_dir) if f.endswith('.png')]

script_text = '''🚀 Hızla para kazanmak ister misin? Printify ile hemen ürün çıkarmaya başlayabilirsin!

Printify, tasarımını yükleyerek ya da hazır tasarımlardan birini seçerek ürünlerini oluşturmanı sağlıyor. Sipariş geldiğinde, ürünler otomatik olarak hazırlanıp kargolanıyor. Önceden stoklama yapmana ya da yüksek maliyetler ödemen gerekmiyor.

Detaylı bilgi için videomuzda nasıl yapıldığını gösteriyorum. Hadi denemek için yorumlara "GÖNDER" yaz, linki hemen paylaşayım!'''

print("Generating themes based on script content...")
themes = generate_three_themes('Printify 9', script_text)

# Same cutouts for all variants to preserve face identity
selected_cutout_files = random.sample(cutouts, min(3, len(cutouts)))
primary_cutout = os.path.join(cutout_dir, selected_cutout_files[0])
extra_cutouts = [os.path.join(cutout_dir, f) for f in selected_cutout_files[1:]]

for t_idx, theme in enumerate(themes, 1):
    cover_text = theme['cover_text']
    scene_desc = theme['scene_description']
    theme_name = theme.get('theme_name', f"T{t_idx}")
    print(f'\nTheme {t_idx}: {theme_name} -> {cover_text}')
    
    for v_idx in range(1, 3):
        output = f'outputs/kapak_T{t_idx}_{theme_name}_V{v_idx}.png'
        print(f"Generating variation {v_idx}...")
        success = run_autonomous_generation(
            local_person_image_path=primary_cutout,
            video_topic='Printify ile stoksuz ticaret',
            main_text=cover_text,
            output_path=output,
            max_retries=2,
            variant_index=v_idx,
            script_text=script_text,
            scene_description=scene_desc,
            extra_cutout_paths=extra_cutouts
        )
        if success:
             print(f"Successfully generated: {output}")
        else:
             print(f"Failed to generate: {output}")
        time.sleep(2)
