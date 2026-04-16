#!/usr/bin/env python3
"""
Annotation Pipeline v3 — High-quality, harmonious annotations
Key improvements:
1. 2x supersampling for crisp anti-aliased text
2. Consistent output dimensions (all same width)
3. Precise frame alignment via pixel-accurate coordinates
4. Color-harmonious callouts matching step theme
5. Step badge color matches step theme
6. Bottom caption bar for description text (blog harmony)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, json, math, copy
import requests
import base64
import sys # Added based on user's provided code edit, though not explicitly requested in instruction
import glob # Added based on user's provided code edit, though not explicitly requested in instruction

# Dynamically resolve directories based on the script location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_VIDEO_DIR = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(SCRIPT_DIR, "typeless5")
FRAMES_DIR = os.path.join(_VIDEO_DIR, "frames")
OUTPUT_DIR = os.path.join(_VIDEO_DIR, "annotated_v3")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── FINAL OUTPUT WIDTH (all images same width for blog harmony) ───
TARGET_WIDTH = 900

# ─── SCALE factor for supersampling (2x = crisp text) ───
SCALE = 2

# ===============================================
# DINAMIK API KEY OKUMA EKLENTISI
# ===============================================
def get_groq_api_key():
    from env_loader import get_env
    return get_env("GROQ_API_KEY", "")

GROQ_API_KEY = get_groq_api_key()
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
# Groq vision model currently accessible:
VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

# ─── SELF-REVIEW AUTO-FIX SETTINGS ───
MAX_FIX_ITERATIONS = 2      # Max auto-fix attempts before giving up
DEFAULT_SHIFT_PX = 20       # Default pixel shift when model doesn't specify
MAX_SHIFT_PX = 40           # Safety cap for maximum shift
MIN_SHIFT_PX = 5            # Minimum meaningful shift

# ─── COLOR PALETTE (harmonious, blog-ready) ───
COLORS = {
    "blue":   {"main": "#3B82F6", "dark": "#1E40AF", "light": "#DBEAFE"},
    "red":    {"main": "#EF4444", "dark": "#991B1B", "light": "#FEE2E2"},
    "amber":  {"main": "#F59E0B", "dark": "#92400E", "light": "#FEF3C7"},
    "green":  {"main": "#10B981", "dark": "#065F46", "light": "#D1FAE5"},
    "purple": {"main": "#8B5CF6", "dark": "#5B21B6", "light": "#EDE9FE"},
}

# ─── Font helper ───
def get_font(size):
    """Get font at scaled size for supersampling"""
    scaled_size = size * SCALE
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSText.ttf",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, scaled_size)
        except Exception:
            continue
    return ImageFont.load_default()

# ─── Drawing helpers (all work at SCALE multiplier) ───
def s(val):
    """Scale a coordinate value"""
    if isinstance(val, tuple):
        return tuple(v * SCALE for v in val)
    return val * SCALE

def draw_rounded_rect(draw, bbox, radius, fill=None, outline=None, width=1):
    """Anti-aliased rounded rectangle"""
    x1, y1, x2, y2 = bbox
    r = radius
    # Draw using Pillow's built-in rounded_rectangle
    draw.rounded_rectangle(bbox, radius=r, fill=fill, outline=outline, width=width)

def draw_callout(draw, x, y, text, theme_color, font_size=15, position="top"):
    """Premium callout label with rounded background"""
    font = get_font(font_size)
    sx, sy = s(x), s(y)
    
    # Measure text
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    
    pad_x = s(10)
    pad_y = s(5)
    
    bg_color = theme_color["main"]
    
    # Background rounded rect
    rx1 = sx - pad_x
    ry1 = sy - pad_y
    rx2 = sx + tw + pad_x
    ry2 = sy + th + pad_y
    
    # Shadow
    shadow_offset = s(2)
    draw.rounded_rectangle(
        [rx1 + shadow_offset, ry1 + shadow_offset, rx2 + shadow_offset, ry2 + shadow_offset],
        radius=s(6), fill="#00000040"
    )
    
    # Main background
    draw.rounded_rectangle(
        [rx1, ry1, rx2, ry2],
        radius=s(6), fill=bg_color, outline="white", width=s(1)
    )
    
    # Text (white, sharp)
    draw.text((sx, sy), text, fill="white", font=font)
    
    return tw + 2 * pad_x, th + 2 * pad_y

def draw_step_badge(draw, number, x, y, theme_color, radius=18):
    """Step number badge matching step theme"""
    sx, sy, sr = s(x), s(y), s(radius)
    
    # Shadow
    draw.ellipse([sx-sr+s(2), sy-sr+s(2), sx+sr+s(2), sy+sr+s(2)], fill="#00000050")
    
    # Main circle
    draw.ellipse([sx-sr, sy-sr, sx+sr, sy+sr], fill=theme_color["main"], outline="white", width=s(2))
    
    # Number
    font = get_font(18)
    text = str(number)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((sx - tw//2, sy - th//2 - s(1)), text, fill="white", font=font)

def draw_spotlight_highlight(draw, x, y, w, h, color, width=3, corner_marks=True, overlay_opacity=150):
    """Karanlık bir overlay üzerine, sadece x,y,w,h alanının aydınlık bırakıldığı Spotlight efekti."""
    sx, sy, sw, sh = s(x), s(y), s(w), s(h)
    swidth = s(width)
    
    # Tüm resmi karart, sadece hedefin (x,y,w,h) dışını karartmak için 4 dikdörtgen çiz
    im_w, im_h = draw.im.size
    overlay_fill = (0, 0, 0, overlay_opacity)
    
    # 1. Üst
    if sy > 0:
        draw.rectangle([0, 0, im_w, sy], fill=overlay_fill)
    # 2. Alt
    if sy + sh < im_h:
        draw.rectangle([0, sy + sh, im_w, im_h], fill=overlay_fill)
    # 3. Sol
    if sx > 0:
        draw.rectangle([0, sy, sx, sy + sh], fill=overlay_fill)
    # 4. Sağ
    if sx + sw < im_w:
        draw.rectangle([sx + sw, sy, im_w, sy + sh], fill=overlay_fill)
        
    if corner_marks:
        corner_len = max(min(sw, sh) // 4, s(10))
        corners = [
            [(sx, sy+corner_len), (sx, sy), (sx+corner_len, sy)],
            [(sx+sw-corner_len, sy), (sx+sw, sy), (sx+sw, sy+corner_len)],
            [(sx, sy+sh-corner_len), (sx, sy+sh), (sx+corner_len, sy+sh)],
            [(sx+sw-corner_len, sy+sh), (sx+sw, sy+sh), (sx+sw, sy+sh-corner_len)],
        ]
        for corner in corners:
            draw.line(corner, fill=color, width=swidth, joint="curve")
    else:
        for i in range(swidth):
            draw.rectangle([sx-i, sy-i, sx+sw+i, sy+sh+i], outline=color)

def draw_arrow(draw, start, end, color="#FF3333", width=3):
    """Arrow with proper head"""
    sx1, sy1 = s(start[0]), s(start[1])
    sx2, sy2 = s(end[0]), s(end[1])
    swidth = s(width)
    
    draw.line([(sx1, sy1), (sx2, sy2)], fill=color, width=swidth)
    
    angle = math.atan2(sy2 - sy1, sx2 - sx1)
    arrow_len = s(14)
    for sign in [-1, 1]:
        aa = angle + sign * math.pi / 5.5
        ax = sx2 - arrow_len * math.cos(aa)
        ay = sy2 - arrow_len * math.sin(aa)
        draw.line([(int(ax), int(ay)), (sx2, sy2)], fill=color, width=swidth)

def draw_caption_bar(img, draw, caption_text, theme_color, font_size=13):
    """Bottom caption bar for blog harmony"""
    w, h = img.size
    bar_height = s(36)
    font = get_font(font_size)
    
    # Semi-transparent dark bar
    bar_y = h - bar_height
    draw.rectangle([0, bar_y, w, h], fill="#1F2937E6")
    
    # Thin colored accent line at top of bar
    draw.rectangle([0, bar_y, w, bar_y + s(3)], fill=theme_color["main"])
    
    # Caption text
    bbox = draw.textbbox((0, 0), caption_text, font=font)
    tw = bbox[2] - bbox[0]
    tx = (w - tw) // 2
    ty = bar_y + s(10)
    draw.text((tx, ty), caption_text, fill="white", font=font)

# ─── ANNOTATION DEFINITIONS v3 ───
ANNOTATIONS = [
    {
        "step": 1,
        "title": "Orijinal Sözleşmeyi Açın",
        "frame_file": "frame_000_t0s.jpg",
        "caption": "Adım 1 — Orijinal hizmet sözleşmesini Google Docs'ta açın",
        "theme": "blue",
        "crop": (70, 190, 940, 810),  # Doküman alanı, Chrome bar yok
        "elements": [
            {"type": "callout", "x": 15, "y": 8, "text": "Orijinal Hizmet Sözleşmesi", "size": 15},
            {"type": "rect", "x": 250, "y": 45, "w": 510, "h": 565, "corner_marks": True},
        ]
    },
    {
        "step": 2,
        "title": "Metni Seçin ve Typeless'ı Başlatın",
        "frame_file": "frame_001_t6s.jpg",
        "caption": "Adım 2 — Tüm metni seçin, Typeless toolbar ile sesli komut verin",
        "theme": "red",
        "crop": (70, 190, 940, 830),  # Doküman + toolbar
        "elements": [
            {"type": "callout", "x": 15, "y": 25, "text": "Tüm metin seçili (mavi)", "size": 15},
            # Typeless toolbar vurgu
            {"type": "rect", "x": 500, "y": 605, "w": 120, "h": 38},
            {"type": "callout", "x": 380, "y": 585, "text": "Typeless Toolbar — Sesli komut verin", "size": 13},
            {"type": "arrow", "start": (495, 625), "end": (500, 625)},
        ]
    },
    {
        "step": 3,
        "title": "AI İşliyor — Thinking",
        "frame_file": "frame_005_t30s.jpg",
        "caption": "Adım 3 — AI sözleşmenizi analiz ediyor, birkaç saniye bekleyin",
        "theme": "amber",
        "crop": (250, 530, 950, 830),  # Alt kısım + Thinking
        "elements": [
            {"type": "callout", "x": 15, "y": 8, "text": "AI sözleşmeyi analiz ediyor...", "size": 15},
            # Thinking butonu: Koordinatları tam siyah alana oturacak şekilde ayarlandı
            {"type": "rect", "x": 380, "y": 265, "w": 95, "h": 32},
            {"type": "arrow", "start": (300, 281), "end": (360, 281)},
            {"type": "callout", "x": 190, "y": 267, "text": "Thinking", "size": 14},
        ]
    },
    {
        "step": 4,
        "title": "Sonuç: Sözleşme Özetlendi",
        "frame_file": "frame_010_t60s.jpg",
        "caption": "Adım 4 — Sayfalarca sözleşme tek sayfada özetlendi!",
        "theme": "green",
        "crop": (70, 240, 940, 640),  # Doküman alanı — özet görünsün
        "elements": [
            {"type": "callout", "x": 15, "y": 8, "text": "Sözleşme otomatik özetlendi!", "size": 15},
            # Başlık: Corner marks başlıgı tam sarması için optimize edildi
            {"type": "rect", "x": 310, "y": 57, "w": 170, "h": 24, "corner_marks": True},
            {"type": "callout", "x": 500, "y": 50, "text": "← Yeni başlık", "size": 13},
            # Bullet points: Doğru maddeyi göstersin
            {"type": "arrow", "start": (230, 142), "end": (270, 142)},
            {"type": "callout", "x": 135, "y": 130, "text": "Maddeler →", "size": 13},
        ]
    },
    {
        "step": 5,
        "title": "İkinci Komut Verin",
        "frame_file": "frame_015_t90s.jpg",
        "caption": "Adım 5 — İkinci sesli komut: 'Başlıkları kalın yap'",
        "theme": "purple",
        "crop": (280, 240, 870, 540),  # Başlıklar + mavi seçim
        "elements": [
            {"type": "callout", "x": 15, "y": 8, "text": "İkinci komut: 'Başlıkları kalın yap'", "size": 15},
            # Başlıklar: frame_015'te başlıklar orijinal y pozisyonları:
            # "Hizmet Sözleşmesi Özeti" ~280, "Hizmet ve Teslimat:" ~325, "Ödeme Koşulları:" ~365, "Karşılıklı Yük." ~405
            # crop (280,240) çıkarılır → y: 40, 85, 125, 165
            # Başlıklar hizalama (daha düzgün aralıklarla kalınlık alanları)
            {"type": "arrow", "start": (8, 48), "end": (55, 48)},
            {"type": "arrow", "start": (8, 92), "end": (55, 92)},
            {"type": "arrow", "start": (8, 137), "end": (55, 137)},
            {"type": "arrow", "start": (8, 185), "end": (55, 185)},
            {"type": "arrow", "start": (8, 235), "end": (55, 235)},
        ]
    },
    {
        "step": 6,
        "title": "Final: Profesyonel Sözleşme",
        "frame_file": "frame_020_t120s.jpg",
        "caption": "Adım 6 — İşlem tamamlandı! Profesyonel formatta sözleşme özeti",
        "theme": "green",
        "crop": (280, 240, 870, 660),  # Doküman içeriği
        "elements": [
            {"type": "callout", "x": 15, "y": 8, "text": "Final — Profesyonel formatta!", "size": 15},
            # Kalın başlıkları vurgula — frame_020 başlıklar:
            # "Taraflar ve Konu:" y~60, "Hizmet ve Teslimat:" y~105, "Ödeme Koşulları:" y~175, "Karşılıklı Yük." y~245, "Gizililik" y~315
            {"type": "rect", "x": 60, "y": 62, "w": 260, "h": 20, "corner_marks": True},
            {"type": "rect", "x": 60, "y": 108, "w": 155, "h": 20, "corner_marks": True},
            {"type": "rect", "x": 60, "y": 180, "w": 145, "h": 20, "corner_marks": True},
            {"type": "rect", "x": 60, "y": 248, "w": 185, "h": 20, "corner_marks": True},
            {"type": "rect", "x": 60, "y": 318, "w": 195, "h": 20, "corner_marks": True},
            {"type": "callout", "x": 400, "y": 100, "text": "← Kalın başlıklar", "size": 13},
        ]
    },
]


# ═══════════════════════════════════════════════════════════════
# DYNAMIC ANNOTATION BUILDER
# ═══════════════════════════════════════════════════════════════

def build_dynamic_annotations():
    """vision_analysis.json'dan dinamik ANNOTATIONS listesi oluştur.
    Yeni videolar (typeless5 dışı) için kullanılır."""
    analysis_path = os.path.join(FRAMES_DIR, "vision_analysis.json")
    if not os.path.exists(analysis_path):
        print(f"  ⚠️ vision_analysis.json bulunamadı: {analysis_path}")
        return None

    with open(analysis_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    results = data.get("results", [])
    blog_worthy = [r for r in results if isinstance(r, dict) and r.get("is_blog_worthy")]

    if not blog_worthy:
        print("  ⚠️ Blog'a uygun frame bulunamadı")
        return None

    # Referans frame boyutunu öğren
    ref_w, ref_h = 1280, 720  # Varsayılan
    for bw in blog_worthy:
        fname = f"frame_{bw.get('frame_index', 0):03d}_t{int(bw.get('timestamp_sec', 0))}s.jpg"
        fpath = os.path.join(FRAMES_DIR, fname)
        if os.path.exists(fpath):
            try:
                test_img = Image.open(fpath)
                ref_w, ref_h = test_img.size
            except Exception:
                pass
            break

    themes = list(COLORS.keys())
    annotations = []

    for i, bw in enumerate(blog_worthy):
        theme = themes[i % len(themes)]
        frame_idx = bw.get("frame_index", i)
        timestamp = int(bw.get("timestamp_sec", 0))

        # Frame dosyasını bul
        fname = f"frame_{frame_idx:03d}_t{timestamp}s.jpg"
        fpath = os.path.join(FRAMES_DIR, fname)

        # Tam eşleşme yoksa glob dene
        if not os.path.exists(fpath):
            candidates = glob.glob(os.path.join(FRAMES_DIR, f"frame_{frame_idx:03d}_*.jpg"))
            if candidates:
                fname = os.path.basename(candidates[0])
            else:
                print(f"  ⚠️ Frame bulunamadı: {fname} — atlanıyor")
                continue

        title = bw.get("blog_step_title") or f"Adım {i + 1}"
        caption = bw.get("blog_caption") or bw.get("description", "")[:80]

        elements = [
            {"type": "callout", "x": 15, "y": 8, "text": title[:40], "size": 15},
        ]

        # Highlight rect (yüzdesel → piksel dönüşümü)
        highlight = bw.get("highlight_area", {})
        if highlight and isinstance(highlight, dict):
            x = int(highlight.get("x_pct", 0) / 100 * ref_w)
            y = int(highlight.get("y_pct", 0) / 100 * ref_h)
            w = int(highlight.get("w_pct", 50) / 100 * ref_w)
            h = int(highlight.get("h_pct", 20) / 100 * ref_h)
            elements.append({
                "type": "rect",
                "x": x, "y": y, "w": max(w, 30), "h": max(h, 20),
                "corner_marks": True
            })

        annotations.append({
            "step": i + 1,
            "title": title[:40],
            "frame_file": fname,
            "caption": f"Adım {i + 1} — {caption}",
            "theme": theme,
            "elements": elements,
        })

    if not annotations:
        return None

    print(f"  🔄 Dinamik mod: {len(annotations)} adım vision_analysis.json'dan oluşturuldu")
    return annotations

def create_annotation(annot_def):
    """Create a single high-quality annotation"""
    step = annot_def["step"]
    title = annot_def["title"]
    theme = COLORS[annot_def["theme"]]
    frame_path = os.path.join(FRAMES_DIR, annot_def["frame_file"])
    
    if not os.path.exists(frame_path):
        print(f"  ⚠️ Frame yok: {frame_path}")
        return None
    
    # 1. Load and crop
    img = Image.open(frame_path).convert("RGB")
    if "crop" in annot_def:
        img = img.crop(annot_def["crop"])
    
    # 2. Resize to target width, maintaining aspect ratio
    orig_w, orig_h = img.size
    scale_factor = TARGET_WIDTH / orig_w
    new_h = int(orig_h * scale_factor)
    img = img.resize((TARGET_WIDTH, new_h), Image.LANCZOS)
    
    # 3. Add space for caption bar
    caption_height = 36
    canvas_h = new_h + caption_height
    canvas = Image.new("RGB", (TARGET_WIDTH, canvas_h), "#1F2937")
    canvas.paste(img, (0, 0))
    
    # 4. Scale up for supersampling
    big_w, big_h = TARGET_WIDTH * SCALE, canvas_h * SCALE
    big_canvas = canvas.resize((big_w, big_h), Image.LANCZOS).convert("RGBA")
    draw = ImageDraw.Draw(big_canvas, "RGBA")
    
    # 5. Draw annotations
    # Adjust coordinates for the resize (original crop → target width)
    crop_w = annot_def["crop"][2] - annot_def["crop"][0] if "crop" in annot_def else orig_w
    coord_scale = TARGET_WIDTH / crop_w
    
    for elem in annot_def.get("elements", []):
        # Scale coordinates from crop-relative to target-width-relative
        def cx(v): return int(v * coord_scale)
        def cy(v): return int(v * coord_scale)
        
        if elem["type"] == "rect":
            draw_spotlight_highlight(
                draw, cx(elem["x"]), cy(elem["y"]), cx(elem["w"]), cy(elem["h"]),
                color=theme["main"], width=3,
                corner_marks=elem.get("corner_marks", True)
            )
        elif elem["type"] == "callout":
            draw_callout(
                draw, cx(elem["x"]), cy(elem["y"]), elem["text"],
                theme_color=theme, font_size=elem.get("size", 14)
            )
        elif elem["type"] == "arrow":
            draw_arrow(
                draw, 
                (cx(elem["start"][0]), cy(elem["start"][1])),
                (cx(elem["end"][0]), cy(elem["end"][1])),
                color=theme["main"], width=3
            )
    
    # 6. Step badge (top-right)
    badge_x = TARGET_WIDTH - 30
    badge_y = 28
    draw_step_badge(draw, step, badge_x, badge_y, theme, radius=18)
    
    # 7. Caption bar
    big_canvas_draw = ImageDraw.Draw(big_canvas)
    draw_caption_bar(big_canvas, big_canvas_draw, annot_def.get("caption", ""), theme)
    
    # 8. Downsample (LANCZOS = high quality anti-aliasing)
    final = big_canvas.resize((TARGET_WIDTH, canvas_h), Image.LANCZOS).convert("RGB")
    
    # 9. Save
    safe_title = title.replace(" ", "_").replace(":", "").replace("—", "-").replace("'", "")[:40]
    output_path = os.path.join(OUTPUT_DIR, f"step_{step:02d}_{safe_title}.jpg")
    final.save(output_path, quality=93)
    
    print(f"  ✅ Adım {step}: {title} → {os.path.basename(output_path)} ({final.size[0]}x{final.size[1]})")
    return output_path

def encode_image(image_path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

# ═══════════════════════════════════════════════════════════════
# ITERATIVE SELF-REVIEW & AUTO-FIX SYSTEM
# ═══════════════════════════════════════════════════════════════
#
# Akış: render → review → fix → render → review → fix → review → log
# Max 2 fix iterasyonu. 3. review'da hâlâ hata varsa log'a yazar.
#
# Otomatik DÜZELTİLEMEYECEK durumlar:
#   - Crop alanı yanlışsa (farklı frame bölgesi seçmek insan kararı gerektirir)
#   - 3+ element aynı bölgede çakışıyorsa (hangi element taşınacak belirsiz)
#   - Element tamamen yanlış yerdeyse (boşluğu gösteriyor — semantik hata)
# ═══════════════════════════════════════════════════════════════

def build_element_description(elements):
    """Build a human-readable description of annotation elements for the LLM prompt."""
    lines = []
    for i, elem in enumerate(elements):
        if elem["type"] == "callout":
            lines.append(
                f'[Element {i}] callout at (x={elem["x"]}, y={elem["y"]}) '
                f'text="{elem["text"]}" font_size={elem.get("size", 14)}'
            )
        elif elem["type"] == "rect":
            style = "corner_marks" if elem.get("corner_marks") else "full_rect"
            lines.append(
                f'[Element {i}] rect ({style}) at (x={elem["x"]}, y={elem["y"]}) '
                f'size={elem["w"]}x{elem["h"]}'
            )
        elif elem["type"] == "arrow":
            lines.append(
                f'[Element {i}] arrow from ({elem["start"][0]},{elem["start"][1]}) '
                f'to ({elem["end"][0]},{elem["end"][1]})'
            )
    return "\n".join(lines)


def review_single_step(img_path, step, annot_def):
    """Review a single annotated image via Groq Vision.
    Returns a list of structured issue dicts, or empty list if clean."""
    if not GROQ_API_KEY:
        return []

    b64_image = encode_image(img_path)
    elements_desc = build_element_description(annot_def.get("elements", []))

    prompt = f'''You are a strict QA assistant for annotated educational screenshot images.
This is Step {step}: "{annot_def["title"]}"

The image has these overlay elements drawn on top of a screenshot:
{elements_desc}

Check for these specific issues:
1. OVERLAP: Any overlay element (callout bubble, rectangle frame, arrow) covers or obscures original text/content in the underlying screenshot, making it hard to read.
2. OUT_OF_BOUNDS: Any element extends beyond image edges or is visually clipped.
3. MISALIGNMENT: Any arrow points to empty space, or a rectangle highlights nothing meaningful.

IMPORTANT: Respond ONLY with valid JSON. No markdown fences, no explanation text, just the JSON object.

If NO issues found:
{{"has_issues": false, "issues": []}}

If issues found (example):
{{"has_issues": true, "issues": [{{"element_index": 0, "issue_type": "overlap", "description": "callout covers original text below", "suggested_fix": {{"action": "shift", "direction": "up", "pixels": 20}}}}]}}

Rules for suggested_fix:
- action "shift": move element. Include "direction" (up/down/left/right) and "pixels" (10-30).
- action "shrink": reduce element size. Include "percentage" (10-30).
- action "none": cannot be auto-fixed. Include "reason" string.

Only report REAL, clearly visible issues. Minor aesthetic preferences are NOT issues.'''

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"}}
                ]
            }
        ],
        "temperature": 0.1,
        "max_tokens": 1024
    }

    try:
        response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=45)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]

        # Clean JSON from potential markdown wrapping
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        review_data = json.loads(content.strip())

        if review_data.get("has_issues") and review_data.get("issues"):
            return review_data["issues"]
        return []

    except json.JSONDecodeError as e:
        print(f"    ⚠️ JSON parse hatası: {e}")
        return []
    except Exception as e:
        print(f"    ⚠️ Groq Vision API Hatası: {e}")
        return []


def apply_fixes(annot_def, issues):
    """Apply coordinate fixes to a deep copy of annot_def based on structured issues.
    Original annotation definition is NEVER modified.
    Returns (fixed_annot_def, applied_count)."""
    fixed = copy.deepcopy(annot_def)
    elements = fixed.get("elements", [])
    applied_count = 0

    for issue in issues:
        idx = issue.get("element_index")
        issue_type = issue.get("issue_type", "unknown")
        fix = issue.get("suggested_fix", {})
        action = fix.get("action", "none")

        # ── Validate element index ──
        if idx is None or not isinstance(idx, int) or idx < 0 or idx >= len(elements):
            print(f"      ⚠️ Geçersiz element_index: {idx} (toplam {len(elements)} element) — atlanıyor")
            continue

        # ── "none" action: cannot auto-fix ──
        if action == "none":
            reason = fix.get("reason", "belirtilmedi")
            print(f"      ℹ️ Element {idx} [{issue_type}]: otomatik düzeltilemez — {reason}")
            continue

        elem = elements[idx]

        # ── SHIFT action ──
        if action == "shift":
            direction = fix.get("direction", "up")
            pixels = fix.get("pixels", DEFAULT_SHIFT_PX)
            pixels = max(MIN_SHIFT_PX, min(int(pixels), MAX_SHIFT_PX))  # Clamp

            dx, dy = 0, 0
            if direction == "up":
                dy = -pixels
            elif direction == "down":
                dy = pixels
            elif direction == "left":
                dx = -pixels
            elif direction == "right":
                dx = pixels

            if elem["type"] == "callout":
                elem["x"] = max(5, elem["x"] + dx)
                elem["y"] = max(5, elem["y"] + dy)
                applied_count += 1
                print(f"      🔧 Element {idx} (callout \"{elem.get('text', '')[:20]}\"): "
                      f"{direction} {pixels}px → ({dx:+d}, {dy:+d})")

            elif elem["type"] == "rect":
                elem["x"] = max(0, elem["x"] + dx)
                elem["y"] = max(0, elem["y"] + dy)
                applied_count += 1
                print(f"      🔧 Element {idx} (rect {elem.get('w', '?')}x{elem.get('h', '?')}): "
                      f"{direction} {pixels}px → ({dx:+d}, {dy:+d})")

            elif elem["type"] == "arrow":
                elem["start"] = (elem["start"][0] + dx, elem["start"][1] + dy)
                elem["end"] = (elem["end"][0] + dx, elem["end"][1] + dy)
                applied_count += 1
                print(f"      🔧 Element {idx} (arrow): "
                      f"{direction} {pixels}px → ({dx:+d}, {dy:+d})")

        # ── SHRINK action ──
        elif action == "shrink":
            percentage = fix.get("percentage", 15)
            percentage = max(5, min(int(percentage), 30))  # Clamp 5-30%
            factor = 1 - (percentage / 100)

            if elem["type"] == "rect":
                old_w, old_h = elem["w"], elem["h"]
                elem["w"] = max(10, int(elem["w"] * factor))
                elem["h"] = max(10, int(elem["h"] * factor))
                applied_count += 1
                print(f"      🔧 Element {idx} (rect): %{percentage} küçültüldü "
                      f"({old_w}x{old_h} → {elem['w']}x{elem['h']})")

            elif elem["type"] == "callout" and "size" in elem:
                old_size = elem["size"]
                elem["size"] = max(10, int(elem["size"] * factor))
                applied_count += 1
                print(f"      🔧 Element {idx} (callout font): %{percentage} küçültüldü "
                      f"({old_size} → {elem['size']})")
            else:
                print(f"      ℹ️ Element {idx}: shrink bu tip için desteklenmiyor")

    if applied_count > 0:
        print(f"      📊 Toplam {applied_count} fix uygulandı")
    else:
        print(f"      ℹ️ Uygulanabilir fix bulunamadı")

    return fixed, applied_count


def log_unresolved_issues(step, title, issues, iteration):
    """Append unresolved issues to review_log.txt for manual review."""
    log_path = os.path.join(SCRIPT_DIR, "review_log.txt")
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"\n--- Çözülemeyen Sorunlar (iterasyon {iteration}): "
                    f"Adım {step} — {title} ---\n")
            for issue in issues:
                idx = issue.get('element_index', '?')
                itype = issue.get('issue_type', '?')
                desc = issue.get('description', '')
                f.write(f"  Element {idx} [{itype}]: {desc}\n")
                fix = issue.get('suggested_fix', {})
                if fix.get('action') == 'none':
                    f.write(f"    → Otomatik düzeltilemez: {fix.get('reason', '?')}\n")
                else:
                    f.write(f"    → Önerilen: {fix.get('action', '?')} "
                            f"{fix.get('direction', '')} {fix.get('pixels', '')}px\n")
            f.write("\n")
    except IOError as e:
        print(f"    ⚠️ Log dosyasına yazılamadı: {e}")


def process_step_with_review(annot_def):
    """Process a single annotation step with iterative self-review and auto-fix.

    Flow:
      render(original) → review
        → if clean: done ✅
        → if issues: apply_fix #1 → render → review
          → if clean: done ✅ (auto-fix başarılı)
          → if issues: apply_fix #2 → render → review
            → if clean: done ✅
            → if STILL issues: log to file, return last render ⚠️

    Returns result dict {step, title, caption, path} or None.
    """
    step = annot_def["step"]
    title = annot_def["title"]
    working_def = copy.deepcopy(annot_def)
    last_path = None

    for iteration in range(MAX_FIX_ITERATIONS + 1):
        iter_label = f"iter-{iteration}" if iteration > 0 else "orijinal"

        # ── Render ──
        path = create_annotation(working_def)
        if not path:
            return None
        last_path = path

        # ── Skip review if no API key ──
        if not GROQ_API_KEY:
            if iteration == 0:
                print(f"    ⚠️ GROQ_API_KEY bulunamadı — self-review atlanıyor")
            return {"step": step, "title": title,
                    "caption": annot_def.get("caption", ""), "path": path}

        # ── Review ──
        print(f"    🧐 Review [{iter_label}]: Adım {step} — {os.path.basename(path)}")
        issues = review_single_step(path, step, working_def)

        # ── Clean? ──
        if not issues:
            if iteration > 0:
                print(f"    ✅ Auto-fix uygulandı — görsel {iteration}. iterasyonda düzeltildi")
            else:
                print(f"    ✅ Düzeltme gerekli değil — görsel kusursuz")
            return {"step": step, "title": title,
                    "caption": annot_def.get("caption", ""), "path": path}

        # ── Log found issues ──
        for issue in issues:
            idx = issue.get('element_index', '?')
            itype = issue.get('issue_type', '?')
            desc = issue.get('description', '')
            print(f"    ❌ [{itype}] Element {idx}: {desc}")

        # ── Can we still fix? ──
        if iteration < MAX_FIX_ITERATIONS:
            print(f"    🔧 Auto-fix #{iteration + 1} uygulanıyor...")
            working_def, applied = apply_fixes(working_def, issues)
            if applied == 0:
                # Fixes couldn't be applied — no point in re-rendering
                print(f"    ⚠️ Fix uygulanamadı — sorunlar log'a yazılıyor")
                log_unresolved_issues(step, title, issues, iteration)
                return {"step": step, "title": title,
                        "caption": annot_def.get("caption", ""), "path": path}
        else:
            # Max iterations reached
            print(f"    ⚠️ Max iterasyon ({MAX_FIX_ITERATIONS}) aşıldı — "
                  f"kalan {len(issues)} sorun log'a yazıldı")
            log_unresolved_issues(step, title, issues, iteration)
            return {"step": step, "title": title,
                    "caption": annot_def.get("caption", ""), "path": path}

    # Fallback (should not reach here)
    return {"step": step, "title": title,
            "caption": annot_def.get("caption", ""), "path": last_path}


# ─── MAIN ───
def main():
    print("=" * 60)
    print("ANNOTATION v3 — Supersampled, harmonious, blog-ready")
    print(f"  + Iterative Self-Review & Auto-Fix (max {MAX_FIX_ITERATIONS} fix)")
    print(f"  Video dizini: {_VIDEO_DIR}")
    print("=" * 60)

    # ── Annotation kaynağını belirle ──
    is_typeless5 = os.path.basename(_VIDEO_DIR) == "typeless5"

    if is_typeless5:
        active_annotations = ANNOTATIONS
        print("  📌 Typeless 5 modu — hardcoded annotation'lar kullanılıyor")
    else:
        dynamic = build_dynamic_annotations()
        if dynamic:
            active_annotations = dynamic
        else:
            print("  ❌ Dinamik annotation oluşturulamadı ve typeless5 değil")
            print("     vision_analysis.json'ın frames/ klasöründe olduğundan emin olun")
            sys.exit(1)

    results = []
    total_reviewed = 0

    for annot_def in active_annotations:
        print(f"\n{'─'*50}")
        print(f"📌 Adım {annot_def['step']}: {annot_def['title']}")
        print(f"{'─'*50}")

        result = process_step_with_review(annot_def)
        if result:
            results.append(result)
            total_reviewed += 1

    # ── Summary ──
    print(f"\n{'='*60}")
    print(f"📊 SONUÇ RAPORU")
    print(f"{'='*60}")
    print(f"  Toplam annotation  : {len(results)}")
    print(f"  Boyut              : {TARGET_WIDTH}px genişlik (tutarlı)")
    print(f"  Supersampling      : {SCALE}x → anti-aliased, keskin metin")
    print(f"  Max fix iterasyonu : {MAX_FIX_ITERATIONS}")
    print(f"  Dizin              : {OUTPUT_DIR}")
    print(f"  Mod                : {'hardcoded' if is_typeless5 else 'dinamik'}")

    # Metadata
    meta_path = os.path.join(OUTPUT_DIR, "annotations_v3.json")
    try:
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"  Metadata           : {os.path.basename(meta_path)}")
    except (IOError, PermissionError) as e:
        print(f"  ⚠️ Metadata yazılamadı: {e}")


if __name__ == "__main__":
    main()
