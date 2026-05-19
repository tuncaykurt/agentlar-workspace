import os
import json
import requests

def analyze_competitor_data(target: str, module_name: str, raw_data: list):
    """
    Sends the collected raw data from a competitor to an LLM (Gemini or OpenAI)
    to generate a strategic 'Content Gap' Markdown report.
    """
    
    # Antigravity generally uses Gemini API as default
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        print("❌ Error: GEMINI_API_KEY is not set.")
        return None
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={gemini_api_key}"
    
    # Prepare the prompt
    system_prompt = f"""
    Sen uzman bir Dijital Pazarlama Stratejisti ve İçerik Üreticisisin.
    Hedefimiz, '{target}' adlı rakip hakkında '{module_name}' modülünden toplanan verileri analiz edip bize bir yol haritası sunman.
    
    Senden istenenler:
    1. **Genel Durum Özeti:** Rakip ne yapıyor? (Hangi formatlar, anahtar kelimeler)
    2. **En Çok Etkileşim Alan Konseptler (Winners):** Başarılı olan içerikleri/reklamları neler?
    3. **İçerik Boşlukları (Content Gap):** Rakibin değinmediği veya zayıf kaldığı, bizim üzerine giderek avantaj sağlayabileceğimiz alanlar neler?
    4. **Örnek İçerik/Reklam Fikirleri:** Bizim üretmemiz gereken 3 adet somut içerik fikri (başlık ve kısa senaryo).
    
    Dönüş formatın sadece saf Markdown olmalıdır.
    """
    
    data_str = json.dumps(raw_data, indent=2, ensure_ascii=False)
    # Truncate to avoid blowing up the context window if the data is massive
    if len(data_str) > 60000:
        data_str = data_str[:60000] + "\n... [TRUNCATED]"
    
    prompt = f"{system_prompt}\n\nİşte Toplanan Veri:\n```json\n{data_str}\n```"
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.7
        }
    }
    
    try:
        res = requests.post(url, json=payload)
        res.raise_for_status()
        result = res.json()
        
        candidates = result.get('candidates', [])
        if candidates and candidates[0].get('content', {}).get('parts'):
            markdown_report = candidates[0]['content']['parts'][0]['text']
            return markdown_report
        else:
            print("❌ Unexpected LLM response structure.")
            return None
            
    except Exception as e:
        print(f"❌ Error during LLM analysis: {e}")
        return None
