import os
import textwrap
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter

def compose_cover(bg_path: str, person_path: str, output_path: str, main_text: str):
    """
    Composites the 9:16 cover photo.
    - Scales the 1024x1792 DALL-E background to 1080x1920
    - Places the person at the bottom center
    - Customizes the lighting
    - Adds text in the 2:3 safe zone
    """
    print("Starting composition...")
    
    # 1. Background Setup
    try:
        bg = Image.open(bg_path).convert("RGBA")
    except Exception as e:
        print(f"Could not load background: {e}. Creating a solid dark background as fallback.")
        bg = Image.new("RGBA", (1080, 1920), (20, 20, 25, 255))
        
    # Resize and crop to 1080x1920
    target_ratio = 1080 / 1920
    bg_ratio = bg.width / bg.height
    
    if bg_ratio > target_ratio:
        # BG is wider, crop horizontally
        new_width = int(bg.height * target_ratio)
        offset = (bg.width - new_width) // 2
        bg = bg.crop((offset, 0, bg.width - offset, bg.height))
    else:
        # BG is taller, crop vertically
        new_height = int(bg.width / target_ratio)
        offset = (bg.height - new_height) // 2
        bg = bg.crop((0, offset, bg.width, bg.height - offset))
        
    bg = bg.resize((1080, 1920), Image.Resampling.LANCZOS)
    
    # Optional: Darken background slightly for subject pop
    enhancer = ImageEnhance.Brightness(bg)
    bg = enhancer.enhance(0.7)
    
    # 2. Add Person
    if os.path.exists(person_path):
        person = Image.open(person_path).convert("RGBA")
        
        # Scale person to take up good portion of the bottom
        # Typically the subject should fill around 60-70% of the height
        target_person_height = int(1920 * 0.7)
        person_ratio = person.width / person.height
        target_person_width = int(target_person_height * person_ratio)
        
        person = person.resize((target_person_width, target_person_height), Image.Resampling.LANCZOS)
        
        # Add a slight drop shadow behind the person to make them pop
        shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
        shadow.paste(person, ((1080 - target_person_width) // 2, 1920 - target_person_height), person)
        shadow_arr = shadow.split()[-1] # get alpha
        shadow_mask = Image.eval(shadow_arr, lambda a: 200 if a > 0 else 0)
        shadow_base = Image.new("RGBA", bg.size, (0, 0, 0, 255))
        shadow_base.putalpha(shadow_mask)
        shadow_base = shadow_base.filter(ImageFilter.GaussianBlur(25))
        
        bg = Image.alpha_composite(bg, shadow_base)
        
        # Paste person (centered horizontally, bottom aligned)
        x_pos = (1080 - target_person_width) // 2
        y_pos = 1920 - target_person_height
        bg.paste(person, (x_pos, y_pos), person)
    else:
        print("Warning: Person cutout image not found.")

    # 3. Add Text
    draw = ImageDraw.Draw(bg)
    
    # Try to load a nice font, fallback to default if not found
    try:
        # The user's system likely has Impact or Arial.
        # Ideally, we should provide a custom font file in a 'fonts' folder like 'LeagueGothic' or 'Montserrat'
        # Fallback for mac
        font_path = "/System/Library/Fonts/Supplemental/Impact.ttf"
        title_font = ImageFont.truetype(font_path, 120)
    except IOError:
        print("Impact font not found, falling back to default.")
        title_font = ImageFont.load_default()

    # Wrap text if it's too long
    # Usually Instagram Reels UI covers bottom & right sides, and title covers top 1/3
    text_color = "white"
    stroke_color = "black"
    stroke_width = 8
    
    wrapped_text = textwrap.fill(main_text, width=15)
    
    # Determine text size and position to place it in 2:3 safe zone (top half)
    # The 2:3 vertical safe zone is roughly the middle 1080x1620
    # Let's put text right around y=300
    
    # In Pillow >= 10.0, use textbbox instead of textsize
    bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=title_font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    text_x = (1080 - text_width) // 2
    text_y = 250 # Safe top margin
    
    # Draw drop shadow for text
    draw.multiline_text((text_x + 10, text_y + 10), wrapped_text, font=title_font, fill="black", align="center")
    
    # Draw text with stroke (if supported, otherwise draw 4 sides)
    try:
        draw.multiline_text((text_x, text_y), wrapped_text, font=title_font, fill=text_color, 
                            stroke_width=stroke_width, stroke_fill=stroke_color, align="center")
    except TypeError:
        # Fallback for older pillow
        draw.multiline_text((text_x, text_y), wrapped_text, font=title_font, fill=text_color, align="center")

    bg = bg.convert("RGB") # Remove alpha for saving as jpg/standard png
    bg.save(output_path, "PNG")
    print(f"Composition saved to {output_path}")
    return True

if __name__ == "__main__":
    compose_cover("outputs/test_bg.png", "outputs/IMG_4188_nobg.png", "outputs/final_cover.png", "YAPAY ZEKA İLE\nPARA KAZAN")
