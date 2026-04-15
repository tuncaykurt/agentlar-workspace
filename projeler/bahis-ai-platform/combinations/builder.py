"""
Kombinasyon oluşturucu.
Günlük maçların analizlerinden istenen boyutta
en yüksek beklenen değerli kombinasyonları seçer.
"""
import itertools
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def build_combinations(
    match_analyses: list[dict],
    combo_size: int = 3,
    min_probability: float = 0.60,
    top_n: int = 5,
) -> list[dict]:
    """
    Parametreler:
      match_analyses : Her maç için analiz sonucu listesi
      combo_size     : Kombinasyon büyüklüğü (2, 3, 4, 5 ...)
      min_probability: Bir seçeneğin dahil edilebilmesi için min olasılık
      top_n          : Kaç kombinasyon döndürülsün

    Döndürür: En iyi top_n kombinasyon (toplam olasılık ve EV ile)
    """
    # Her maçtan en iyi 1 seçeneği al (olasılık >= min_prob)
    candidates = []
    for analysis in match_analyses:
        fixture   = analysis.get("fixture", {})
        home      = fixture.get("home_team", "?")
        away      = fixture.get("away_team", "?")
        ai_result = analysis.get("ai_analysis", {})
        recs      = ai_result.get("bet_recommendations", [])

        for rec in recs:
            prob = rec.get("probability", 0)
            if prob >= min_probability:
                candidates.append({
                    "match":      f"{home} vs {away}",
                    "fixture_id": fixture.get("id"),
                    "bet_type":   rec["bet_type"],
                    "selection":  rec["selection"],
                    "probability": prob,
                    "confidence": rec.get("confidence", "orta"),
                    "reasoning":  rec.get("reasoning", ""),
                })

    if len(candidates) < combo_size:
        logger.warning(f"Yeterli aday yok: {len(candidates)} < {combo_size}")
        # Mevcut adaylarla mümkün olan en büyük komboyu yap
        if not candidates:
            return []
        combo_size = min(combo_size, len(candidates))

    # Kombinasyonlar oluştur (aynı maçtan 2 seçenek alma)
    combos = []
    for combo in itertools.combinations(candidates, combo_size):
        # Aynı maçtan birden fazla seçenek varsa atla
        match_names = [c["match"] for c in combo]
        if len(match_names) != len(set(match_names)):
            continue

        # Toplam olasılık (bağımsız varsayım)
        total_prob = 1.0
        for c in combo:
            total_prob *= c["probability"]

        # Beklenen değer skoru (olasılık × güven faktörü)
        confidence_factor = sum(
            1.2 if c["confidence"] == "yüksek" else 1.0
            for c in combo
        ) / len(combo)

        ev_score = total_prob * confidence_factor

        combos.append({
            "selections":   list(combo),
            "combo_size":   combo_size,
            "total_probability": round(total_prob, 6),
            "ev_score":     round(ev_score, 6),
            "min_prob":     round(min(c["probability"] for c in combo), 4),
            "summary":      " + ".join(
                f"{c['match'].split(' vs ')[0][:10]}({c['selection']})"
                for c in combo
            ),
        })

    # EV skoruna göre sırala
    combos.sort(key=lambda x: x["ev_score"], reverse=True)
    return combos[:top_n]


def format_combo_output(combo: dict, index: int) -> str:
    """Kombinasyonu okunabilir formatta döndürür."""
    lines = [f"\n{'='*50}", f"KOMBİNASYON #{index+1}"]
    lines.append(f"Toplam Olasılık: %{combo['total_probability']*100:.2f}")
    lines.append(f"EV Skoru: {combo['ev_score']:.4f}")
    lines.append(f"\nSeçimler:")
    for i, sel in enumerate(combo["selections"], 1):
        lines.append(
            f"  {i}. {sel['match']}\n"
            f"     → {sel['selection']} (Olasılık: %{sel['probability']*100:.1f})\n"
            f"     → {sel['reasoning'][:80]}..."
        )
    return "\n".join(lines)
