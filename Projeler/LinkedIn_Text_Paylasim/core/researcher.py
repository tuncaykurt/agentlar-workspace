"""
Perplexity API ile güncel AI haberleri araştırması.
n8n'deki "AI Haberleri" node'unun birebir karşılığı.
"""
import logging
import requests
from datetime import datetime

from config import settings


class Researcher:
    """Perplexity API kullanarak güncel AI haberleri/tipsler araştırır."""

    def __init__(self):
        self.api_key = settings.PERPLEXITY_API_KEY
        self.base_url = settings.PERPLEXITY_BASE_URL

    def research_weekly_news(self) -> str:
        """
        Haftanın AI haberlerini araştırır.
        n8n Workflow 1 (LinkedIn Automation) — "AI Haberleri" node'u.
        """
        current_date = datetime.now().strftime("%Y-%m-%d")

        prompt = (
            f"Find the latest AI news of this week. Make sure that these events "
            f"belong to this month. Summarize what's happening.\n\n"
            f"Current Date: {current_date}"
        )

        return self._query_perplexity(prompt)

    def research_weekly_tip(self) -> str:
        """
        Haftanın AI tavsiyesini araştırır.
        n8n Workflow 2 (LinkedIn AI Tips) — "AI Haberleri" node'u.
        """
        current_date = datetime.now().strftime("%Y-%m-%d")

        prompt = (
            f"You are a research assistant for a LinkedIn post writer.\n\n"
            f"Find the latest AI tip of this week. Make sure this is non-technical "
            f"everyday tip that anyone can use. Use your gut feeling to make sure "
            f"this is not a tip that every single person would know, so we can "
            f"actually provide them something valuable. Make sure tips are not "
            f"extremely easy because people already know the basics, such as "
            f"providing as much context as possible to the AI. That's a known thing.\n\n"
            f"Instead, focus on more advanced topics such as:\n"
            f"1. Using DeepResearch functionality on ChatGPT or Claude Code\n"
            f"2. Using Kimi for great presentations\n"
            f"3. Why Claude is so popular\n\n"
            f"These three examples mentioned above are just examples. Do not copy "
            f"them, but let them inspire you.\n\n"
            f"Current Date: {current_date}"
        )

        return self._query_perplexity(prompt)

    def _query_perplexity(self, prompt: str) -> str:
        """Perplexity API'ye sorgu gönderir ve sonucu döndürür."""
        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Perplexity sorgusu atlanıyor. Prompt: {prompt[:100]}...")
            return "[DRY-RUN] Bu hafta AI dünyasında önemli gelişmeler yaşandı. OpenAI yeni modelini tanıttı."

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "sonar",
            "messages": [
                {"role": "user", "content": prompt}
            ]
        }

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            logging.info(f"Perplexity araştırması tamamlandı ({len(content)} karakter)")
            return content
        except Exception as e:
            logging.error(f"Perplexity API hatası: {e}", exc_info=True)
            raise
