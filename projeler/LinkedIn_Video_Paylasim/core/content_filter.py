import logging
import json
import requests

from config import settings


class ContentFilter:
    """
    LLM-based content filter and caption adapter for LinkedIn.
    Uses Groq (llama-3.3-70b-versatile) for:
    1. Deciding if a TikTok video is appropriate for LinkedIn
    2. Adapting the caption to a professional LinkedIn tone
    """

    STRICTNESS_PROMPTS = {
        "relaxed": "Sadece açıkça uygunsuz içerikleri reddet (küfür, nefret söylemi, cinsel içerik). Eğlendirici veya günlük hayat içerikleri kabul edilebilir.",
        "moderate": "LinkedIn profesyonel bir platform. Gayrimenkul, yatırım, iş dünyası, motivasyon, eğitim, teknoloji ve kariyer ile ilgili içerikleri kabul et. Çok casual olan eğlence, meme, dans, komedi veya tamamen kişisel/günlük hayat içeriklerini reddet. Bir konunun iş dünyasıyla uzaktan bile bağlantısı varsa kabul et.",
        "strict": "Sadece doğrudan iş dünyası, gayrimenkul, finans, yatırım, kariyer gelişimi veya profesyonel eğitim içeriklerini kabul et. Diğer her şeyi reddet."
    }

    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.base_url = settings.GROQ_BASE_URL
        self.model = settings.GROQ_MODEL
        self.strictness = settings.LINKEDIN_FILTER_STRICTNESS

    def _call_groq(self, system_prompt: str, user_prompt: str) -> str:
        """Makes a chat completion call to Groq API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 1024
        }

        try:
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            logging.error(f"Groq API call failed: {e}", exc_info=True)
            return None

    def evaluate_content(self, video_title: str, video_description: str = "") -> dict:
        """
        Evaluates whether a TikTok video is appropriate for LinkedIn.
        
        Returns dict:
            {
                "decision": "APPROVE" or "REJECT",
                "reason": "...",
                "confidence": 0.0-1.0
            }
        """
        strictness_instruction = self.STRICTNESS_PROMPTS.get(self.strictness, self.STRICTNESS_PROMPTS["moderate"])

        system_prompt = f"""Sen bir içerik moderatörüsün. Bir TikTok videosunun LinkedIn'de paylaşılıp paylaşılmaması gerektiğine karar veriyorsun.

Profil: [İSİM SOYAD] — Dubai'de gayrimenkul danışmanı, yatırımcı, girişimci.

Filtreleme kuralı:
{strictness_instruction}

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{{"decision": "APPROVE" veya "REJECT", "reason": "kısa açıklama", "confidence": 0.0-1.0}}"""

        user_prompt = f"Video başlığı: {video_title}"
        if video_description:
            user_prompt += f"\nVideo açıklaması: {video_description}"

        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would evaluate content: '{video_title[:50]}...'")
            return {"decision": "APPROVE", "reason": "Dry-run mode", "confidence": 1.0}

        raw_response = self._call_groq(system_prompt, user_prompt)
        if not raw_response:
            logging.warning("LLM evaluation failed — defaulting to REJECT for safety.")
            return {"decision": "REJECT", "reason": "LLM API çağrısı başarısız", "confidence": 0.0}

        try:
            # Try to parse JSON from response
            # Sometimes LLM wraps in ```json ... ```
            clean = raw_response.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
                clean = clean.rsplit("```", 1)[0]
            result = json.loads(clean.strip())

            decision = result.get("decision", "REJECT").upper()
            if decision not in ("APPROVE", "REJECT"):
                decision = "REJECT"

            return {
                "decision": decision,
                "reason": result.get("reason", "Bilinmeyen sebep"),
                "confidence": float(result.get("confidence", 0.5))
            }
        except (json.JSONDecodeError, ValueError) as e:
            logging.error(f"Failed to parse LLM filter response: {raw_response[:200]}. Error: {e}")
            return {"decision": "REJECT", "reason": f"JSON parse hatası: {raw_response[:100]}", "confidence": 0.0}

    def adapt_caption_for_linkedin(self, original_caption: str) -> str:
        """
        Takes a TikTok caption and adapts it to a professional LinkedIn tone.
        Uses Groq LLM to rewrite the caption.
        """
        if not original_caption or not original_caption.strip():
            return "Siz bu konuda ne düşünüyorsunuz? 💬"

        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would adapt caption: '{original_caption[:50]}...'")
            return f"[LinkedIn Adapted] {original_caption}"

        system_prompt = """Sen bir LinkedIn içerik uzmanısın. [İSİM SOYAD] adlı Dubai merkezli bir gayrimenkul danışmanı ve girişimcinin TikTok'ta paylaştığı videonun caption'ını LinkedIn'e uyarlaman isteniyor.

Kurallar:
1. Profesyonel ama samimi bir ton kullan (çok kurumsal olma, çok casual da olma)
2. TikTok tarzı hashtag'leri kaldır, LinkedIn'e uygun 2-3 hashtag ekle (sondaki satırda)
3. Metin 200 karakteri geçmesin (hashtag'ler hariç)
4. Emoji kullanabilirsin ama abartma (1-2 tane yeterli)
5. Okuyucuya bir soru sor veya düşünmeye davet et (engagement)
6. Türkçe yaz
7. Sadece caption metnini döndür, başka açıklama yapma"""

        user_prompt = f"Orijinal TikTok caption'ı:\n{original_caption}"

        adapted = self._call_groq(system_prompt, user_prompt)
        if not adapted:
            logging.warning("Caption adaptation failed — using cleaned original.")
            # Fallback: basic cleanup
            words = original_caption.split()
            clean_words = [w for w in words if not w.startswith("#")]
            return " ".join(clean_words).strip()

        return adapted.strip()
