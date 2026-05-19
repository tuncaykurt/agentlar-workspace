import json
import re
import httpx
from core.config import settings

class BaseAgent:
    def __init__(self, name: str, model: str = None):
        self.name = name
        self.model = model or settings.AI_FAST_MODEL
        self.api_key = (settings.OPENROUTER_API_KEY or "").strip()
        self.url = "https://openrouter.ai/api/v1/chat/completions"

    async def _call_llm(self, system_prompt: str, user_prompt: str, max_tokens: int = 1000) -> dict:
        if not self.api_key:
            raise Exception("OPENROUTER_API_KEY tanımlı değil")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://kriptobot.app",
            "X-Title": "KriptoBot Trading Platform",
            "Content-Type": "application/json",
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.1,
        }
        
        # Sadece destekleyen modellerde JSON formatını zorla
        if "deepseek" in self.model or "openai" in self.model:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(self.url, headers=headers, json=payload)

            if not r.is_success:
                try:
                    err_body = r.json()
                    raise Exception(f"HTTP {r.status_code}: {err_body}")
                except Exception:
                    raise Exception(f"HTTP {r.status_code}: {r.text[:300]}")

            resp = r.json()

            if "error" in resp:
                raise Exception(f"OpenRouter: {resp['error'].get('message', resp['error'])}")

            content = resp["choices"][0]["message"]["content"]
            
            return self._parse_json(content)

    def _parse_json(self, content: str) -> dict:
        # Markdown bloklarından temizle
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if match:
            content = match.group(1)
        else:
            match2 = re.search(r"\{.*\}", content, re.DOTALL)
            if match2:
                content = match2.group()

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise Exception(f"JSON parse hatası ({self.name}): {e} | İçerik: {content[:200]}")
