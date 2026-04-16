#!/usr/bin/env python3
import os
import random
import sys
from PIL import Image
import glob

def make_16_9_crop(image_path, output_path):
    """Görseli merkezden 16:9 olacak şekilde keser"""
    try:
        img = Image.open(image_path)
        img_width, img_height = img.size

        # Hedeflenen oran 16:9
        target_ratio = 16 / 9
        current_ratio = img_width / img_height

        if current_ratio > target_ratio:
            # Görsel hedeften daha geniş, sağ ve soldan kesilecek
            new_width = int(img_height * target_ratio)
            offset = (img_width - new_width) / 2
            crop_box = (offset, 0, img_width - offset, img_height)
        else:
            # Görsel hedeften daha uzun/kare, alt ve üstten kesilecek
            new_height = int(img_width / target_ratio)
            offset = (img_height - new_height) / 2
            crop_box = (0, offset, img_width, img_height - offset)

        cropped_img = img.crop(crop_box)
        
        # Optimize edip .webp olarak kaydet
        if not output_path.endswith('.webp'):
            output_path += '.webp'
            
        cropped_img.save(output_path, "WEBP", quality=85)
        print(f"✅ Görsel başarıyla 16:9 formatına kırpıldı: {output_path}")
        return True

    except Exception as e:
        print(f"❌ Görsel işleme sırasında hata: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Kullanım: python fetch_and_resize_cover.py <orijinal_klasor_veya_dosya> <hedef_dosya>")
        sys.exit(1)
        
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if os.path.isdir(input_path):
        import glob
        files = []
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            files.extend(glob.glob(os.path.join(input_path, ext)))
            files.extend(glob.glob(os.path.join(input_path, ext.upper())))
            
        if not files:
            print(f"❌ {input_path} klasöründe uygun görsel bulunamadı.")
            sys.exit(1)
            
        chosen_file = random.choice(files)
        print(f"🎲 Rastgele kapak seçildi: {os.path.basename(chosen_file)}")
        make_16_9_crop(chosen_file, output_path)
    else:
        if not os.path.exists(input_path):
            print(f"❌ Dosya bulunamadı: {input_path}")
            sys.exit(1)
        make_16_9_crop(input_path, output_path)

if __name__ == '__main__':
    main()
