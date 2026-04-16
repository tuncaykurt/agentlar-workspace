#!/usr/bin/env python3
"""
Vision Analyzer — Groq Llama 4 Scout ile frame analizi
5'erli batch'ler halinde gönderir, her frame için adım açıklaması ve annotation koordinatları alır.
"""
import base64
import json
import os
import sys
import time
import requests
from io import BytesIO
from PIL import Image

from env_loader import require_env

GROQ_API_KEY = require_env("GROQ_API_KEY")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
MAX_IMAGES_PER_REQUEST = 5

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
        print(f"  ℹ️  İpucu: Daha kaliteli analiz için video klasörüne script.txt ekleyin.")
        return None

def encode_image(image_path):
    """Resmi hafızada (in-memory) max 1280px genişliğe küçült ve base64'e encode et"""
    with Image.open(image_path) as img:
        w, h = img.size
        # Groq payload boyutunu aşmamak için makul boyuta al
        if w > 1280:
            scale = 1280 / w
            new_w, new_h = 1280, int(h * scale)
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # Sadece LLM analizi için kalite 80
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=80)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

def analyze_batch(frames_batch, batch_idx, total_batches, script_text=None):
    """5'erli batch analizi"""
    print(f"\n--- Batch {batch_idx+1}/{total_batches} ({len(frames_batch)} frame) ---")
    
    # Her frame için image content oluştur
    image_contents = []
    frame_descriptions = []
    
    for frame in frames_batch:
        b64_image = encode_image(frame["filepath"])
        image_contents.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{b64_image}"
            }
        })
        frame_descriptions.append(f"Frame {frame['index']} (t={frame['timestamp_sec']}s): {frame['filename']}")
    
    frames_list = "\n".join(frame_descriptions)
    
    # Script var/yok durumuna göre prompt oluştur
    if script_text:
        context_intro = f"""Bu {len(frames_batch)} frame bir ekran kaydından alındı. Bu videonun orijinal scripti aşağıda verilmiştir.

Orijinal Instagram script'i:
{script_text}"""
    else:
        context_intro = f"""Bu {len(frames_batch)} frame bir ekran kaydından alındı. Bu video bir yapay zeka aracının ekran kaydını gösteriyor.

⚠️ NOT: Bu video için orijinal script mevcut değil. Ekran görüntülerinden yola çıkarak aracı ve adımları tanımla."""
    
    prompt = f"""{context_intro}

Frame listesi:
{frames_list}

Senden çok daha ince bir UX/UI analizi bekliyorum. Bu ekran kaydındaki eylemleri (butona tıklama, form doldurma vs.) tam olarak tespit etmelisin.

Görevlerin:

1. Her frame'i analiz et ve şunları mükemmel bir dille belirt:
   - Bu frame'de kullanıcı tam olarak ne yapıyor? Hangi UI elementine odaklanmış? (Insightful açıklama ver)
   - Bir önceki frame'e göre tam olarak hangi değişiklik oldu?
   - Bu frame blog yazısında kullanılmaya değer mi? (evet/hayır)

2. Blog'a değer frame'ler için:
   - Bu adımın blog'daki başlığı ne olmalı? (Net ve aksiyon odaklı olmalı)
   - Ekranda VURGULANACAK ALANIN YÜZDESEL KOORDİNATLARI: Bu çok kritik! Tam olarak tıklanan butonu, input alanını veya odaklanılan menüyü aydınlatacak spotlight efekti için kullanılacak. Koordinatlar (x_pct, y_pct, w_pct, h_pct) resmin tamamı 100 kabul edilerek verilmelidir. Yanılsama (hallucination) yapma, olabildiğince isabetli ve küçük/kesin alanları hedefle.
   - Blog'da bu görselin altına yazılacak teknik ve akıcı açıklama (okuyucuya ne yapması gerektiğini anlatan rehber metni).

3. Birbirine çok benzeyen (aksiyon olmayan) frame'leri "BENZER" olarak işaretle. (Menü açılmadıysa veya büyük bir form değişikliği yoksa BENZER olarak işaretleyip is_blog_worthy=false yap).

JSON formatında cevap ver. Markdown kullanma:
[
  {{
    "frame_index": 0,
    "timestamp_sec": 0,
    "description": "Kullanıcının tam eylemini anlatan detaylı açıklama.",
    "is_blog_worthy": true,
    "similar_to": null,
    "blog_step_title": "Adım başlığı (örn: Ayarlar Menüsü)",
    "highlight_area": {{"x_pct": 10, "y_pct": 20, "w_pct": 50, "h_pct": 10}},
    "blog_caption": "Bu adımı okuyucuya çok iyi anlatan bir kılavuz metni."
  }}
]"""

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                *image_contents
            ]
        }
    ]
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4000
    }
    
    try:
        response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        
        content = result["choices"][0]["message"]["content"]
        usage = result.get("usage", {})
        
        print(f"  Tokens — Input: {usage.get('prompt_tokens', '?')}, Output: {usage.get('completion_tokens', '?')}")
        print(f"  Maliyet — Input: ${usage.get('prompt_tokens', 0) * 0.11 / 1_000_000:.4f}, Output: ${usage.get('completion_tokens', 0) * 0.34 / 1_000_000:.4f}")
        
        # JSON parse et
        try:
            # Markdown code block temizle
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            parsed = json.loads(content.strip())
            return parsed, usage
        except json.JSONDecodeError:
            print(f"  ⚠️ JSON parse hatası, raw content kaydediliyor")
            return content, usage
    
    except requests.exceptions.RequestException as e:
        print(f"  ❌ API hatası: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"  Response: {e.response.text[:500]}")
        return None, {}

def main():
    frames_dir = sys.argv[1] if len(sys.argv) > 1 else "ANTIGRAVITY_ROOT_BURAYA/Projeler/Blog_Yazici/typeless5/frames"
    
    # Video klasörünü belirle (frames_dir'in parent'ı)
    video_dir = os.path.dirname(frames_dir) if os.path.basename(frames_dir) == "frames" else frames_dir
    
    # Script'i yükle
    script_text = load_script(video_dir)
    
    # Metadata yükle
    meta_path = os.path.join(frames_dir, "frames_metadata.json")
    with open(meta_path, "r") as f:
        metadata = json.load(f)
    
    frames = metadata["extracted_frames"]
    print(f"Toplam {len(frames)} frame analiz edilecek")
    print(f"Model: {MODEL}")
    print(f"Batch boyutu: {MAX_IMAGES_PER_REQUEST}")
    
    all_results = []
    total_input_tokens = 0
    total_output_tokens = 0
    
    # 5'erli batch'ler
    batches = [frames[i:i+MAX_IMAGES_PER_REQUEST] for i in range(0, len(frames), MAX_IMAGES_PER_REQUEST)]
    
    for batch_idx, batch in enumerate(batches):
        result, usage = analyze_batch(batch, batch_idx, len(batches), script_text=script_text)
        
        if result:
            if isinstance(result, list):
                all_results.extend(result)
            else:
                all_results.append({"raw_content": result, "batch_idx": batch_idx})
        
        total_input_tokens += usage.get("prompt_tokens", 0)
        total_output_tokens += usage.get("completion_tokens", 0)
        
        # Rate limit aşmamak için bekle
        if batch_idx < len(batches) - 1:
            print("  ⏳ Rate limit — 3 sn bekleniyor...")
            time.sleep(3)
    
    # Sonuçları kaydet
    output_path = os.path.join(frames_dir, "vision_analysis.json")
    analysis_data = {
        "model": MODEL,
        "total_frames_analyzed": len(frames),
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "estimated_cost_usd": round(total_input_tokens * 0.11 / 1_000_000 + total_output_tokens * 0.34 / 1_000_000, 4),
        "results": all_results
    }
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(analysis_data, f, indent=2, ensure_ascii=False)
    
    # Blog'a uygun frame'leri filtrele
    blog_worthy = [r for r in all_results if isinstance(r, dict) and r.get("is_blog_worthy")]
    
    print(f"\n{'='*50}")
    print(f"SONUÇ:")
    print(f"  Analiz edilen frame: {len(frames)}")
    print(f"  Blog'a uygun frame: {len(blog_worthy)}")
    print(f"  Toplam token: {total_input_tokens} input + {total_output_tokens} output")
    print(f"  Tahmini maliyet: ${analysis_data['estimated_cost_usd']:.4f}")
    print(f"  Sonuç dosyası: {output_path}")

if __name__ == "__main__":
    main()
