"""
OpenRouter AI servisi — tüm AI modellere tek noktadan erişim.
OpenAI-uyumlu API kullanır.
"""
import json, os, logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

AVAILABLE_MODELS = {
    "claude-opus":   "anthropic/claude-opus-4-5",
    "claude-sonnet": "anthropic/claude-sonnet-4-5",
    "gpt-4o":        "openai/gpt-4o",
    "gemini-pro":    "google/gemini-pro-1.5",
    "llama-70b":     "meta-llama/llama-3.3-70b-instruct",
    "deepseek":      "deepseek/deepseek-chat",
}

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "anthropic/claude-opus-4-5")

client = OpenAI(
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
)

SYSTEM_PROMPT = """Sen deneyimli bir futbol bahis analistisin. Sana bir maç için istatistiksel veriler verilecek.

DİL KURALLARI — ÇOK ÖNEMLİ:
- Teknik terim KULLANMA. Kullanıcılar bahis oynayan sıradan insanlar.
- "xG", "Poisson", "lambda", "model" gibi kelimeler yasak.
- Bunların yerine şunu kullan:
    xG 1.2  →  "Son maçlarda ortalama 1.2 gol atıyor"
    xG 0.6  →  "Gol bulmakta zorlanıyor, ortalama 0.6 gol"
    Form 0.8 →  "Son 6 maçta 5 galibiyet, formda"
    Form 0.2 →  "Son 6 maçta sadece 1 galibiyet, kötü formda"
    confidence 0.3 → "Veri az, tahmin güvenilir değil"
- Gerekçeler kısa, net, Türkçe olsun. "Toplam xG 1.15" değil, "Her iki takım da son maçlarda az gol atıyor".
- Sayıları yüzde olarak ver: 0.72 → "%72"

GÖREVİN:
1. Verileri yorumla, düşük güvenilirlik varsa belirt
2. Sahada ne olabilir, bunu sade Türkçe anlat
3. En güvenilir 3-5 bahis seçeneği belirle
4. Her seçenek için 1-2 cümle gerekçe yaz (teknik terim yok)
5. Riskli veya belirsiz durumları "avoid" listesine al

SADECE JSON DÖNDÜR:
{
  "summary": "Maç hakkında 2-3 cümle, sade Türkçe, teknik terim yok",
  "key_factors": ["önemli faktör 1", "önemli faktör 2", "önemli faktör 3"],
  "recommendations": [
    {
      "type": "over_2_5",
      "label": "Üst 2.5 Gol",
      "probability": 0.72,
      "confidence": "high",
      "reason": "Her iki takım da son 6 maçta 3 veya daha fazla gol yedi",
      "risk": "low"
    }
  ],
  "avoid": ["Bu maçta beraberlik riskli — ev sahibi çok güçlü"],
  "overall_confidence": 0.75
}"""


def analyze_match(prompt: str, model: str = None) -> dict:
    model_id = AVAILABLE_MODELS.get(model, model) or DEFAULT_MODEL
    try:
        resp = client.chat.completions.create(
            model=model_id,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            extra_headers={"HTTP-Referer": "https://bahis-ai.yapayzekaotomasyon.cloud"},
        )
        raw = resp.choices[0].message.content.strip()
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()
        return {"success": True, "data": json.loads(raw), "model": model_id}
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse hatası: {e}")
        return {"success": False, "error": "JSON parse hatası", "model": model_id}
    except Exception as e:
        logger.error(f"OpenRouter hatası: {e}")
        return {"success": False, "error": str(e), "model": model_id}


def get_available_models() -> list:
    return [{"id": k, "model": v} for k, v in AVAILABLE_MODELS.items()]
