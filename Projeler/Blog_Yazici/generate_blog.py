#!/usr/bin/env python3
"""
Blog Generator Pipeline — Step 3: Write Blog
1. Reads annotated frames data from annotate_v3.py (annotations_v3.json)
2. Reads script text from <video_dir>/script.txt (if available)
3. Uses Gemini 2.5 Pro to generate a high-quality blog article
4. Saves the output to blog_draft.md
"""
import json
import os
import sys
import requests

# ─── Config ───
from env_loader import require_env

GEMINI_API_KEY = require_env("GEMINI_API_KEY")

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"

VIDEO_DIR = sys.argv[1] if len(sys.argv) > 1 else "ANTIGRAVITY_ROOT_BURAYA/Projeler/Blog_Yazici/typeless5"
OUTPUT_DIR = VIDEO_DIR
ANNOTATIONS_JSON = os.path.join(VIDEO_DIR, "annotated_v3", "annotations_v3.json")

def load_script(video_dir):
    """Video klasöründen script.txt oku. Yoksa None döndür."""
    script_path = os.path.join(video_dir, "script.txt")
    if os.path.exists(script_path):
        with open(script_path, "r", encoding="utf-8") as f:
            text = f.read().strip()
        print(f"  ✅ Script yüklendi: {script_path} ({len(text)} karakter)")
        return text
    else:
        print(f"  ⚠️  UYARI: script.txt bulunamadı ({script_path}). Scriptsiz devam edilecek.")
        print(f"  ℹ️  İpucu: Daha kaliteli blog için video klasörüne script.txt ekleyin.")
        return None

def generate_blog(annotations_data, script_text):
    """Gemini 2.5 Pro ile blog taslağı üret"""
    print(f"\n{'='*50}")
    print(f"ADIM 2/3: Blog Yazımı (Gemini 2.5 Pro)")
    
    # Adım listesini oluştur (annotate_v3'ten gelen verileri kullanarak)
    steps_description = "\n".join([
        f"Adım {a['step']}: {a['title']}\n  Görsel açıklama: {a['caption']}"
        for a in annotations_data
    ])
    
    # Script var/yok durumuna göre prompt oluştur
    if script_text:
        script_section = f"""## Instagram Script (Orijinal)
{script_text}

## Ekran Görüntüsü Adımları
{steps_description}"""
        context_note = "Aşağıda bir Instagram Reels videosunun scripti ve ekran görüntülerinin adım adım analizi var. Bunlardan profesyonel bir blog yazısı yaz."
        tool_rule = "6. Araç hakkında scriptteki bilgileri ve ekran görüntüsü açıklamalarını sentezleyerek detaylıca anlat"
    else:
        script_section = f"""## Ekran Görüntüsü Adımları
{steps_description}

⚠️ NOT: Bu video için orijinal script mevcut değil. Sadece ekran görüntüsü analizlerinden yola çıkarak blog yazısı üret."""
        context_note = "Aşağıda bir ekran kaydı videosunun frame'lerinin adım adım analizi var. Bu analizlerden profesyonel bir blog yazısı üret. Orijinal video scripti mevcut olmadığı için ekran görüntüsü açıklamalarından yola çıkarak aracın ne yaptığını, kimlere hitap ettiğini ve nasıl kullanıldığını çıkar."
        tool_rule = "6. Aracın ne olduğunu ve kimlere hitap ettiğini ekran görüntülerinden çıkarım yaparak detaylıca anlat"
    
    prompt = f"""Sen KISISEL_WEBSITE_BURAYA'nin kurucusu [İSİM SOYAD]'in blog yazılarını yazan bir teknoloji blog yazarısın. [İSİM], yapay zeka araçlarını tanıtan Türkiye'nin en büyük Instagram sayfalarından birini yönetiyor.

{context_note}

{script_section}

## Blog Yazısı Kuralları
1. SEO uyumlu başlık olsun (H1)
2. Blog girişinde aracı tanıt ve neden önemli olduğunu açıkla
3. "Adım adım rehber" formatı kullan — her adımda H2 başlığı
4. Her adımda "[Görsel X]" şeklinde görsel referansı ver — bu görseller sonra otomatik yerleştirilecek
5. Ses tonu: samimi, bilgili, heyecanlı ama profesyonel (AI tarafından yazıldığı belli olmasın)
{tool_rule}
7. Paragraflar kısa olsun (2-3 cümle max)
8. Blog sonunda "Sonuç" bölümü ekle
9. 1000-1500 kelime arası
10. Türkçe yaz
11. Meta description öner (160 karakter)
12. 5-7 adet SEO keyword öner

SADECE blog yazısını ver, başka bir şey ekleme. Markdown formatında yaz."""

    headers = {
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 4000
        }
    }
    
    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()
        
        # ── Defensive: Gemini boş/güvenlik-filtreli yanıt kontrolü ──
        candidates = result.get("candidates", [])
        if not candidates:
            block_reason = result.get("promptFeedback", {}).get("blockReason", "UNKNOWN")
            print(f"  ❌ Gemini boş yanıt döndü! blockReason: {block_reason}")
            print(f"  ℹ️  promptFeedback: {result.get('promptFeedback', {})}")
            return None, {}
        
        candidate = candidates[0]
        finish_reason = candidate.get("finishReason", "")
        if finish_reason == "SAFETY":
            safety_ratings = candidate.get("safetyRatings", [])
            print(f"  ❌ Gemini içerik güvenlik filtresine takıldı!")
            print(f"  ℹ️  safetyRatings: {safety_ratings}")
            return None, {}
        
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        if not parts or not parts[0].get("text"):
            print(f"  ❌ Gemini yanıtında metin bulunamadı! finishReason: {finish_reason}")
            return None, {}
        
        blog_text = parts[0]["text"]
        
        # Token kullanımı
        usage = result.get("usageMetadata", {})
        input_tokens = usage.get("promptTokenCount", 0)
        output_tokens = usage.get("candidatesTokenCount", 0)
        
        print(f"  Tokens — Input: {input_tokens}, Output: {output_tokens}")
        print(f"  Maliyet — ~${input_tokens * 0.30 / 1_000_000 + output_tokens * 2.50 / 1_000_000:.4f}")
        print(f"  Blog uzunluğu: {len(blog_text)} karakter, ~{len(blog_text.split())} kelime")
        
        return blog_text, usage
    
    except Exception as e:
        print(f"  ❌ Gemini hatası: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"  Response: {e.response.text[:500]}")
        return None, {}

def save_output(blog_text, output_dir):
    """Blog'u kaydet"""
    print(f"\n{'='*50}")
    print(f"ADIM 3/3: Çıktı Kaydediliyor")
    
    blog_path = os.path.join(output_dir, "blog_draft.md")
    with open(blog_path, "w", encoding="utf-8") as f:
        f.write(blog_text)
    print(f"  Blog draft: {blog_path}")
    
    return blog_path

def main():
    if not os.path.exists(ANNOTATIONS_JSON):
        print(f"❌ HATA: Annotation JSON dosyası bulunamadı ({ANNOTATIONS_JSON}). Lütfen önce annotate_v3.py'yi çalıştırın.")
        sys.exit(1)
        
    with open(ANNOTATIONS_JSON, "r", encoding="utf-8") as f:
        annotations_data = json.load(f)
    print(f"Adım 1/3: {len(annotations_data)} adım annotation verisi yüklendi.")
    
    # Script'i video klasöründen oku (yoksa None)
    script_text = load_script(VIDEO_DIR)
    
    blog_text, usage = generate_blog(annotations_data, script_text)
    
    if blog_text:
        blog_path = save_output(blog_text, OUTPUT_DIR)
        
        print(f"\n{'='*50}")
        print(f"✅ PIPELINE TAMAMLANDI: Blog Metni Hazır")
        print(f"  Kaydedildi: {blog_path}")
    else:
        print("❌ Blog üretilemedi!")
        sys.exit(1)

if __name__ == "__main__":
    main()

