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

SYSTEM_PROMPT = """Sen dünyanın en iyi spor bahis analisti ve veri bilimcisin.
Sana bir futbol maçı için istatistiksel veriler verilecek.

GÖREVİN:
1. Poisson modelinin ürettiği olasılıkları yorumla ve gerekiyorsa düzelt
2. Form, H2H ve bağlamsal faktörleri değerlendir
3. Her bahis türü için güncellemiş olasılık ver (0.00-1.00)
4. En güvenilir 3-5 seçeneği belirle
5. Her seçenek için NET gerekçe yaz (1-2 cümle)

SADECE JSON DÖNDÜR — başka metin ekleme:
{
  "summary": "2-3 cümle maç özeti",
  "key_factors": ["faktör1", "faktör2", "faktör3"],
  "recommendations": [
    {
      "type": "over_2_5",
      "label": "Üst 2.5 Gol",
      "probability": 0.72,
      "confidence": "high",
      "reason": "Her iki takım da son 6 maçta 3+ gol yedi",
      "risk": "low"
    }
  ],
  "avoid": ["kaçınılacak seçenekler"],
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
