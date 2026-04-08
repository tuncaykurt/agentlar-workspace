import itertools
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/combinations", tags=["combinations"])

class ComboRequest(BaseModel):
    analyses: list[dict]
    combo_size: int = 3
    min_probability: float = 0.60
    top_n: int = 5

@router.post("/build")
def build(req: ComboRequest):
    candidates = []
    for a in req.analyses:
        home = a.get("home", "?")
        away = a.get("away", "?")
        fid  = a.get("fixture_id")
        recs = a.get("ai", {}).get("data", {}).get("recommendations", []) if a.get("ai", {}).get("success") else []

        # AI başarısızsa istatistiksel fallback
        if not recs:
            p = a.get("statistical", {}).get("probabilities", {})
            recs = _stat_fallback(p)

        for rec in recs:
            prob = rec.get("probability", 0)
            if prob >= req.min_probability:
                candidates.append({
                    "match":       f"{home} vs {away}",
                    "fixture_id":  fid,
                    "label":       rec.get("label", rec.get("type", "")),
                    "probability": prob,
                    "confidence":  rec.get("confidence", "medium"),
                    "reason":      rec.get("reason", ""),
                })

    if len(candidates) < req.combo_size:
        return {"combos": [], "message": f"Yeterli aday yok ({len(candidates)} < {req.combo_size})"}

    combos = []
    for combo in itertools.combinations(candidates, req.combo_size):
        matches = [c["match"] for c in combo]
        if len(matches) != len(set(matches)):
            continue
        total = 1.0
        for c in combo: total *= c["probability"]
        cf = sum(1.2 if c["confidence"]=="high" else 1.0 for c in combo) / len(combo)
        combos.append({
            "selections":  list(combo),
            "size":        req.combo_size,
            "total_prob":  round(total, 6),
            "ev_score":    round(total * cf, 6),
            "min_single":  round(min(c["probability"] for c in combo), 4),
        })

    combos.sort(key=lambda x: x["ev_score"], reverse=True)
    return {"combos": combos[:req.top_n], "total_candidates": len(candidates)}

def _stat_fallback(probs: dict) -> list:
    mapping = [
        ("home_win",  "Ev Sahibi Kazanır"),
        ("draw",      "Beraberlik"),
        ("away_win",  "Deplasman Kazanır"),
        ("btts",      "Karşılıklı Gol"),
        ("over_2_5",  "Üst 2.5 Gol"),
        ("under_2_5", "Alt 2.5 Gol"),
        ("over_1_5",  "Üst 1.5 Gol"),
        ("double_1x", "Çifte Şans 1X"),
        ("double_x2", "Çifte Şans X2"),
    ]
    result = []
    for key, label in mapping:
        prob = probs.get(key, 0)
        if prob >= 0.55:
            result.append({
                "type": key, "label": label, "probability": prob,
                "confidence": "high" if prob >= 0.70 else "medium",
                "reason": f"İstatistiksel model: %{prob*100:.1f}",
            })
    result.sort(key=lambda x: x["probability"], reverse=True)
    return result[:3]
