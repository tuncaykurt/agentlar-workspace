"""
Claude AI analiz motoru.
İstatistiksel sonuçları + ham verileri Claude'a gönderir,
doğal dil yorum + final olasılık önerileri alır.
"""
import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logger.warning("anthropic paketi yüklü değil.")


SYSTEM_PROMPT = """Sen dünyanın en iyi spor bahis analisti ve istatistikçisisin.
Sana bir futbol maçı için istatistiksel veriler ve olasılık hesaplamaları verilecek.
Görevin:
1. Bu verileri derinlemesine analiz etmek
2. Her bahis türü için güncellemiş olasılık tahmini vermek (0.00-1.00 arası)
3. En güvenilir 3-5 bahis seçeneğini belirlemek
4. Her seçenek için kısa ama net gerekçe sunmak
5. Dikkat edilmesi gereken riskleri belirtmek

ÇIKTI FORMATI (JSON):
{
  "analysis_summary": "Kısa maç özeti (2-3 cümle)",
  "key_factors": ["faktör1", "faktör2", "faktör3"],
  "bet_recommendations": [
    {
      "bet_type": "over_2_5",
      "selection": "Üst 2.5",
      "probability": 0.72,
      "confidence": "yüksek",
      "reasoning": "Her iki takım da son 5 maçta ortalama 2.8 gol attı...",
      "risk": "düşük"
    }
  ],
  "avoid": ["kaçınılacak bahis türleri ve nedenleri"],
  "overall_confidence": 0.75
}

Sadece JSON döndür, başka metin ekleme."""


class ClaudeAnalyzer:
    def __init__(self, api_key: str = None):
        self._api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        self._client = None

        if ANTHROPIC_AVAILABLE and self._api_key:
            self._client = anthropic.Anthropic(api_key=self._api_key)
            logger.info("Claude AI analizi aktif.")
        else:
            logger.info("Claude API anahtarı yok — istatistiksel analiz kullanılacak.")

    @property
    def is_available(self) -> bool:
        return self._client is not None

    def analyze(
        self,
        home_team: str,
        away_team: str,
        statistical_result: dict,
        home_recent_summary: str,
        away_recent_summary: str,
        h2h_summary: str,
        league: str = "",
    ) -> dict:
        """
        Maç analizini Claude'a yaptırır.
        Claude yoksa istatistiksel sonuçtan otomatik öneri üretir.
        """
        if not self._client:
            return self._fallback_analysis(statistical_result)

        prompt = self._build_prompt(
            home_team, away_team, statistical_result,
            home_recent_summary, away_recent_summary, h2h_summary, league
        )

        try:
            response = self._client.messages.create(
                model="claude-opus-4-6",
                max_tokens=2000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            # JSON bloğu varsa çıkar
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()

            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"Claude JSON parse hatası: {e}")
            return self._fallback_analysis(statistical_result)
        except Exception as e:
            logger.error(f"Claude API hatası: {e}")
            return self._fallback_analysis(statistical_result)

    def _build_prompt(
        self, home_team, away_team, stat_result,
        home_summary, away_summary, h2h_summary, league
    ) -> str:
        probs = stat_result.get("probabilities", {})
        xg    = stat_result.get("expected_goals", {})
        form  = stat_result.get("form", {})
        h2h   = stat_result.get("h2h", {})

        return f"""
Maç: {home_team} vs {away_team}
Lig: {league}

=== İSTATİSTİKSEL ANALİZ SONUÇLARI ===
Beklenen Gol: Ev={xg.get('home')}, Dep={xg.get('away')}, Toplam={xg.get('total')}

Form Puanları (0-1):
- {home_team}: {form.get('home')}
- {away_team}: {form.get('away')}

Poisson Olasılıkları:
- Ev Sahibi Kazanır: %{round(probs.get('home_win',0)*100,1)}
- Beraberlik:        %{round(probs.get('draw',0)*100,1)}
- Deplasman Kazanır: %{round(probs.get('away_win',0)*100,1)}
- Karşılıklı Gol:   %{round(probs.get('btts_yes',0)*100,1)}
- Üst 1.5:          %{round(probs.get('over_1_5',0)*100,1)}
- Üst 2.5:          %{round(probs.get('over_2_5',0)*100,1)}
- Üst 3.5:          %{round(probs.get('over_3_5',0)*100,1)}
- Çifte Şans 1X:    %{round(probs.get('double_1x',0)*100,1)}
- Çifte Şans X2:    %{round(probs.get('double_x2',0)*100,1)}

H2H (Son Karşılaşmalar):
{h2h_summary}

{home_team} Son Maçlar:
{home_summary}

{away_team} Son Maçlar:
{away_summary}

Güven Skoru: {stat_result.get('confidence', 0)}

Bu verileri analiz et ve JSON formatında önerilerini sun.
"""

    def _fallback_analysis(self, stat_result: dict) -> dict:
        """Claude yoksa istatistiksel sonuçtan otomatik öneri üretir."""
        probs = stat_result.get("probabilities", {})
        recommendations = []

        # En yüksek olasılıklı seçenekleri sırala
        candidates = [
            ("match_result_home", "Ev Sahibi Kazanır", probs.get("home_win", 0)),
            ("match_result_draw", "Beraberlik",         probs.get("draw", 0)),
            ("match_result_away", "Deplasman Kazanır",  probs.get("away_win", 0)),
            ("btts_yes",          "Karşılıklı Gol Var", probs.get("btts_yes", 0)),
            ("btts_no",           "Karşılıklı Gol Yok", probs.get("btts_no", 0)),
            ("over_2_5",          "Üst 2.5 Gol",        probs.get("over_2_5", 0)),
            ("under_2_5",         "Alt 2.5 Gol",        probs.get("under_2_5", 0)),
            ("over_1_5",          "Üst 1.5 Gol",        probs.get("over_1_5", 0)),
            ("double_1x",         "Çifte Şans 1X",      probs.get("double_1x", 0)),
            ("double_x2",         "Çifte Şans X2",      probs.get("double_x2", 0)),
        ]

        candidates.sort(key=lambda x: x[2], reverse=True)

        for bet_type, selection, prob in candidates[:5]:
            if prob >= 0.55:
                confidence = "yüksek" if prob >= 0.70 else "orta"
                recommendations.append({
                    "bet_type":   bet_type,
                    "selection":  selection,
                    "probability": round(prob, 4),
                    "confidence": confidence,
                    "reasoning":  f"İstatistiksel model olasılığı: %{round(prob*100,1)}",
                    "risk":       "düşük" if prob >= 0.70 else "orta",
                })

        return {
            "analysis_summary": "İstatistiksel model analizi (Claude AI mevcut değil)",
            "key_factors": ["Form analizi", "H2H istatistikleri", "Poisson modeli"],
            "bet_recommendations": recommendations,
            "avoid": [],
            "overall_confidence": stat_result.get("confidence", 0.5),
            "source": "statistical",
        }
