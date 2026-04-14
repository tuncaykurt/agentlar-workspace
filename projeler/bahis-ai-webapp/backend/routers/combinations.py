import itertools
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/combinations", tags=["combinations"])

class ComboRequest(BaseModel):
    analyses: list[dict]
    combo_size: int = 3
    min_probability: float = 0.60
    top_n: int = 5

def _parse_prob(raw) -> float:
    """Probability değerini güvenle float'a çevir. String, None veya >1 yüzde değerlerini normalize eder."""
    try:
        p = float(raw or 0)
    except (TypeError, ValueError):
        return 0.0
    if p > 1.5:          # AI bazen 72.0 gibi yüzde döndürür
        p = p / 100.0
    return round(p, 4)

@router.post("/build")
def build(req: ComboRequest):
    candidates = []
    for a in req.analyses:
        home = a.get("home", "?")
        away = a.get("away", "?")
        fid  = a.get("fixture_id")

        ai_obj = a.get("ai") or {}
        recs: list = []
        if ai_obj.get("success"):
            data = ai_obj.get("data") or {}
            recs = data.get("recommendations") or []

        # AI başarısızsa veya öneri boşsa istatistiksel fallback
        if not recs:
            p = (a.get("statistical") or {}).get("probabilities") or {}
            recs = _stat_fallback(p)

        for rec in recs:
            try:
                prob = _parse_prob(rec.get("probability", 0))
                if prob >= req.min_probability:
                    candidates.append({
                        "match":       f"{home} vs {away}",
                        "fixture_id":  fid,
                        "label":       rec.get("label") or rec.get("type") or "",
                        "probability": prob,
                        "confidence":  rec.get("confidence") or "medium",
                        "reason":      rec.get("reason") or "",
                    })
            except Exception:
                continue  # bozuk rec'i atla, devam et

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
