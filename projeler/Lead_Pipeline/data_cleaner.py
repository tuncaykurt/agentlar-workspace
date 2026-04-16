"""
Lead Pipeline — Veri Temizleme Modülü
Mevcut form bağımlılıklarından kurtulmak için LLM tabanlı (Groq) veri çıkarma ve temizleme.
Toplu (bulk) işleme destekler.
"""
import os
import json
import logging
from typing import List, Dict

from config import Config

logger = logging.getLogger(__name__)

# LLM Client (Lazy initialization)
_groq_client = None

def get_groq_client():
    global _groq_client
    if _groq_client is None:
        from groq import Groq
        api_key = Config.GROQ_API_KEY
        if not api_key:
            raise ValueError("GROQ_API_KEY bulunamadı! LLM Parsing çalışamaz.")
        _groq_client = Groq(api_key=api_key)
    return _groq_client

def clean_leads_bulk(raw_data_list: List[Dict]) -> List[Dict]:
    """Birden fazla lead verisini TEK SEFERDE LLM kullanarak temizler."""
    if not raw_data_list:
        return []

    # Her satıra bir ID ver ki LLM yanıtını eşleştirebilelim
    indexed_data = {str(i): row for i, row in enumerate(raw_data_list)}
    raw_str = json.dumps(indexed_data, ensure_ascii=False)
    
    prompt = f"""Ekteki JSON objesi, anahtarları (key) ID olan ve değerleri de kullanıcılardan gelen ham form verilerinden oluşan bir listedir.
Görevin, her bir form verisini analiz edip, belirtilen kurallara göre standartlaştırmak ve SADECE aşağıdaki JSON formatında bir yanıt dönmektir.

Kurallar (TÜM KAYITLAR İÇİN UYGULANACAK):
1. İsim ("clean_name"): Baş harfleri büyük metin (örn: "Ali Veli"). Yoksa boş string "".
2. Telefon ("clean_phone"): +90 formatında temizlenmiş TR numarası (örn: "+90 555 123 4567"). Yoksa "".
3. E-posta ("clean_email"): Tamamen küçük harfli ve boşluksuz. Yoksa "".
4. Bütçe ("clean_budget"): SADECE şunlardan biri: "$0 - $20", "$20 - $50", "$50 - $150", "$150+". Yoksa "".
5. Ulaşma Zamanı ("clean_timing"): SADECE şunlardan biri: "Akşam 6'dan sonra", "Gün içinde", "Haftasonu", "Aramayın mesaj atın". Yoksa "".

Beklenen Çıktı Formatı (SADECE BU YAPIYI DÖNDÜR, ek metin kullanma):
{{
  "0": {{
    "clean_name": "...",
    "clean_phone": "...",
    "clean_email": "...",
    "clean_budget": "...",
    "clean_timing": "..."
  }},
  "1": {{ ... }}
}}

Ham Veri:
{raw_str}
    """

    try:
        client = get_groq_client()
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "Sen sadece JSON döndüren bir veri temizleme asistanısın. Markdown kullanma, sadece saf JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0,
            response_format={"type": "json_object"}
        )
        
        result_text = response.choices[0].message.content.strip()
        cleaned_map = json.loads(result_text)
        
        cleaned_list = []
        for str_i, raw_row in indexed_data.items():
            parsed = cleaned_map.get(str_i, {})
            # Eksik alanları tamamla ve raw'u ekle
            final_lead = {
                "clean_name": parsed.get("clean_name", ""),
                "clean_phone": parsed.get("clean_phone", ""),
                "clean_email": parsed.get("clean_email", ""),
                "clean_budget": parsed.get("clean_budget", ""),
                "clean_timing": parsed.get("clean_timing", ""),
                "raw": raw_row
            }
            # _source_tab koruması (varsa aktar)
            if "_source_tab" in raw_row:
                final_lead["_source_tab"] = raw_row["_source_tab"]

            cleaned_list.append(final_lead)
            logger.debug(f"LLM Temizlendi: {final_lead['clean_name']} | {final_lead['clean_phone']}")
            
        return cleaned_list

    except Exception as e:
        logger.error(f"❌ LLM Bulk Veri temizleme hatası: {e}", exc_info=True)
        # ⚠️ GÜVENLIK: LLM çalışmazsa BOŞ DÖNDER — aksi halde boş alanlarla
        # duplikasyon kontrolü çalışmaz ve her 10 dakikada aynı lead'ler
        # "İsimsiz Lead" olarak Notion'a tekrar tekrar eklenir (spam loop).
        logger.error("🚨 LLM Parsing tamamen başarısız! Hiçbir lead işlenmeyecek. GROQ_API_KEY kontrol edin!")
        return []
