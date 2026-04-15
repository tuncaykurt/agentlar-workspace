import os
from autonomous_cover_agent import run_autonomous_generation

# Sadece yüzün tam çıktığı bilinen yüksek kaliteli tek bir açı kullanıyoruz (IMG_4188)
local_image = "assets/cutouts/cutout_IMG_4188.png"
topic = "Yapay Zeka ile Bedava İçerik Üretimi"
text = "0 TL CHATGPT"

print("Sabitlenmiş 1 görsel üzerinden (--cw 80 ile karakter korumalı) yeni kapaklar üretiliyor...\n")

for i in range(1, 4):
    output_path = f"outputs/chatgpt_0TL_sabit_V{i}.png"
    print(f"[{i}/3] Varyasyon üretimi başlıyor...")
    success = run_autonomous_generation(
        local_person_image_path=local_image,
        video_topic=topic,
        main_text=text,
        output_path=output_path,
        max_retries=2,
        variant_index=i,
        extra_cutout_paths=None # Ekstra referansları kapattık
    )
    if success:
        print(f"Varyasyon {i} başarıyla kaydedildi: {output_path}")
    else:
        print(f"Varyasyon {i} üretilemedi!")
