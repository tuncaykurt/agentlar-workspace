"""
İstatistiksel maç analizi.

Her maç için şu olasılıkları hesaplar:
  - Maç sonucu (1/X/2)
  - BTTS (karşılıklı gol)
  - Over/Under 1.5, 2.5, 3.5
  - İlk yarı sonucu
  - Çifte şans

Yöntem: Poisson dağılımı + form faktörü + H2H ağırlıklandırması
"""
import math
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
#  POISSON YARDIMCI FONKSİYONLAR
# ─────────────────────────────────────────────

def poisson_prob(lam: float, k: int) -> float:
    """P(X=k) for Poisson(λ)"""
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return (lam ** k) * math.exp(-lam) / math.factorial(k)


def poisson_matrix(lam_home: float, lam_away: float, max_goals: int = 8) -> list[list[float]]:
    """Gol matrisi: matrix[i][j] = P(ev=i, dep=j)"""
    return [
        [poisson_prob(lam_home, i) * poisson_prob(lam_away, j)
         for j in range(max_goals + 1)]
        for i in range(max_goals + 1)
    ]


def extract_probs(matrix: list[list[float]]) -> dict:
    """Matristen tüm bahis türlerinin olasılıklarını çıkarır."""
    n = len(matrix)
    home_win = draw = away_win = 0.0
    btts = over_15 = over_25 = over_35 = 0.0
    home_iy = draw_iy = away_iy = 0.0  # İlk yarı (tahmin)

    for i in range(n):
        for j in range(n):
            p = matrix[i][j]
            total = i + j

            if i > j:   home_win += p
            elif i == j: draw    += p
            else:        away_win += p

            if i > 0 and j > 0: btts    += p
            if total > 1:        over_15 += p
            if total > 2:        over_25 += p
            if total > 3:        over_35 += p

    return {
        "home_win":  round(home_win, 4),
        "draw":      round(draw, 4),
        "away_win":  round(away_win, 4),
        "btts_yes":  round(btts, 4),
        "btts_no":   round(1 - btts, 4),
        "over_1_5":  round(over_15, 4),
        "under_1_5": round(1 - over_15, 4),
        "over_2_5":  round(over_25, 4),
        "under_2_5": round(1 - over_25, 4),
        "over_3_5":  round(over_35, 4),
        "under_3_5": round(1 - over_35, 4),
        "double_1x": round(home_win + draw, 4),
        "double_x2": round(draw + away_win, 4),
        "double_12": round(home_win + away_win, 4),
    }


# ─────────────────────────────────────────────
#  FORM HESAPLAMA
# ─────────────────────────────────────────────

def calculate_form_score(matches: list, team_id: int, last_n: int = 5) -> float:
    """
    Son N maçtan form puanı hesaplar (0-1 arası).
    Galibiyet=1, Beraberlik=0.4, Mağlubiyet=0
    Yakın maçlara daha yüksek ağırlık (üstel azalma).
    """
    results = []
    for m in matches[-last_n:]:
        teams   = m.get("teams", {})
        goals   = m.get("goals", {})
        home_id = teams.get("home", {}).get("id")
        is_home = (home_id == team_id)
        g_home  = goals.get("home") or 0
        g_away  = goals.get("away") or 0

        if is_home:
            if g_home > g_away:   results.append(1.0)
            elif g_home == g_away: results.append(0.4)
            else:                  results.append(0.0)
        else:
            if g_away > g_home:   results.append(1.0)
            elif g_away == g_home: results.append(0.4)
            else:                  results.append(0.0)

    if not results:
        return 0.5

    # Üstel ağırlık: en son maç en önemli
    weights = [0.5 ** (len(results) - 1 - i) for i in range(len(results))]
    total_w = sum(weights)
    return sum(r * w for r, w in zip(results, weights)) / total_w


def calculate_team_averages(matches: list, team_id: int) -> dict:
    """Takımın son maçlarından gol ortalamaları hesaplar."""
    scored = conceded = clean_sheets = btts_count = total = 0

    for m in matches:
        teams   = m.get("teams", {})
        goals   = m.get("goals", {})
        home_id = teams.get("home", {}).get("id")
        is_home = (home_id == team_id)
        g_home  = goals.get("home") or 0
        g_away  = goals.get("away") or 0

        if is_home:
            gf, ga = g_home, g_away
        else:
            gf, ga = g_away, g_home

        scored   += gf
        conceded += ga
        if ga == 0: clean_sheets += 1
        if gf > 0 and ga > 0: btts_count += 1
        total += 1

    if total == 0:
        return {"scored": 1.2, "conceded": 1.0, "clean_sheet_rate": 0.3, "btts_rate": 0.5, "total_matches": 0}

    return {
        "scored":           round(scored / total, 3),
        "conceded":         round(conceded / total, 3),
        "clean_sheet_rate": round(clean_sheets / total, 3),
        "btts_rate":        round(btts_count / total, 3),
        "total_matches":    total,
    }


def calculate_h2h_stats(h2h_matches: list, home_id: int) -> dict:
    """H2H maçlardan istatistikler çıkarır."""
    home_wins = draws = away_wins = total_goals = total = 0

    for m in h2h_matches:
        teams   = m.get("teams", {})
        goals   = m.get("goals", {})
        h_id    = teams.get("home", {}).get("id")
        g_home  = goals.get("home") or 0
        g_away  = goals.get("away") or 0

        if h_id == home_id:
            if g_home > g_away:   home_wins += 1
            elif g_home == g_away: draws     += 1
            else:                  away_wins += 1
        else:
            if g_away > g_home:   home_wins += 1
            elif g_away == g_home: draws     += 1
            else:                  away_wins += 1

        total_goals += g_home + g_away
        total += 1

    if total == 0:
        return {"home_win_rate": 0.4, "draw_rate": 0.28, "away_win_rate": 0.32, "avg_goals": 2.5, "total_h2h": 0}

    return {
        "home_win_rate": round(home_wins / total, 3),
        "draw_rate":     round(draws / total, 3),
        "away_win_rate": round(away_wins / total, 3),
        "avg_goals":     round(total_goals / total, 3),
        "total_h2h":     total,
    }


# ─────────────────────────────────────────────
#  ANA ANALİZ FONKSİYONU
# ─────────────────────────────────────────────

def analyze_match(
    home_recent: list,
    away_recent: list,
    h2h_matches: list,
    home_id: int,
    away_id: int,
    home_team_stats: dict = None,
    away_team_stats: dict = None,
) -> dict:
    """
    Tüm istatistiksel verileri birleştirerek maç analizi üretir.
    Döndürür: her bahis türü için olasılık + güven skoru + ham veriler.
    """
    # Takım ortalamaları
    home_avg = calculate_team_averages(home_recent, home_id)
    away_avg = calculate_team_averages(away_recent, away_id)
    h2h      = calculate_h2h_stats(h2h_matches, home_id)
    home_form = calculate_form_score(home_recent, home_id)
    away_form = calculate_form_score(away_recent, away_id)

    # Poisson lambda (beklenen gol)
    # Ev sahibi avantajı: +8% (istatistiksel ortalama)
    home_attack  = home_avg["scored"]
    home_defense = home_avg["conceded"]
    away_attack  = away_avg["scored"]
    away_defense = away_avg["conceded"]

    # Form faktörü: form 0-1 arası, 0.7 ortalama
    home_form_factor = 0.7 + (home_form - 0.5) * 0.4
    away_form_factor = 0.7 + (away_form - 0.5) * 0.4

    lam_home = max(0.3, home_attack * away_defense * home_form_factor * 1.08)
    lam_away = max(0.3, away_attack * home_defense * away_form_factor)

    # H2H ağırlıklandırması (%20)
    if h2h.get("total_h2h", 0) >= 3:
        lam_home = lam_home * 0.8 + h2h["avg_goals"] * 0.5 * 0.2
        lam_away = lam_away * 0.8 + h2h["avg_goals"] * 0.5 * 0.2

    # Poisson matrix → olasılıklar
    matrix = poisson_matrix(lam_home, lam_away)
    probs  = extract_probs(matrix)

    # Güven skoru: veri miktarına bağlı (0-1)
    data_quality = min(1.0, (
        min(home_avg["total_matches"], 10) / 10 * 0.4 +
        min(away_avg["total_matches"], 10) / 10 * 0.4 +
        min(h2h["total_h2h"], 5) / 5 * 0.2
    ))

    return {
        "probabilities": probs,
        "expected_goals": {
            "home": round(lam_home, 3),
            "away": round(lam_away, 3),
            "total": round(lam_home + lam_away, 3),
        },
        "form": {
            "home": round(home_form, 3),
            "away": round(away_form, 3),
        },
        "averages": {
            "home": home_avg,
            "away": away_avg,
        },
        "h2h": h2h,
        "confidence": round(data_quality, 3),
        "lam_home": round(lam_home, 3),
        "lam_away": round(lam_away, 3),
    }
