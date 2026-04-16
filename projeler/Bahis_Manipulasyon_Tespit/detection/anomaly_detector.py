"""
River tabanlı online anomali tespit motoru.

Model: HalfSpaceTrees — düşük gecikme, gerçek zamanlı, konsept drift'e dayanıklı.
Her (event_id, bookmaker) çifti için ayrı model tutar (bağlamsal izolasyon).
"""
import logging
from collections import defaultdict
from typing import Optional

from river import anomaly, preprocessing

from config import ANOMALY_THRESHOLD, CRITICAL_THRESHOLD, ALERT_LEVELS
from detection.features import FeatureEngine

logger = logging.getLogger(__name__)


def _make_model():
    """Pipeline: MinMax normalizasyon → HalfSpaceTrees (küçük pencere)."""
    return (
        preprocessing.MinMaxScaler()
        | anomaly.HalfSpaceTrees(
            n_trees=10,
            height=6,
            window_size=30,   # per-model küçük tutuyoruz
            seed=42,
        )
    )


def _get_alert_level(score: float) -> str:
    for level, (lo, hi) in ALERT_LEVELS.items():
        if lo <= score < hi:
            return level
    return "critical"


class AnomalyDetector:
    """
    Her tick'i alır:
      1. Feature engine'den vektör çıkarır
      2. (event_id, bookmaker) bazlı River modeline besler
      3. Anomali skoru + seviyesi döner
    """

    def __init__(self):
        self._models: dict[tuple, object] = defaultdict(_make_model)
        self._feature_engine = FeatureEngine(window_size=30)
        self._alert_count = defaultdict(int)

    def process_tick(self, tick: dict) -> Optional[dict]:
        """
        Tek bir oran tick'ini işler.
        Sonuç dict'i döner; yeterli veri yoksa None.
        """
        features = self._feature_engine.update_and_extract(tick)
        if features is None:
            return None

        key = (tick["event_id"], tick["bookmaker"])
        model = self._models[key]

        # River pipeline: score → learn
        ml_score = model.score_one(features)
        model.learn_one(features)

        # İstatistiksel skor: pct_change + market_deviation kombinasyonu
        # Bu sayede model warm-up olmadan da anlamlı sonuç üretir
        stat_score = min(1.0, (
            abs(features["pct_change"]) * 4.0          # %10 spike → 0.40
            + min(1.0, abs(features["market_deviation"]) / 2.0) * 0.35
            + features["is_spike"] * 0.35               # %5+ → +0.35
        ))

        # Ağırlıklı birleştirme adaptif:
        # ML modeli sıfıra yakınsa stat skora tam ağırlık ver
        ml_weight = min(0.6, ml_score * 2.0)  # ML ısındıkça ağırlık artar
        stat_weight = 1.0 - ml_weight
        score = ml_weight * ml_score + stat_weight * stat_score

        # Context'e göre hafif yumuşatma (meşru spike'ları bastır)
        adjusted_score = max(0.0, score - features["context_score"] * 0.1)

        level = _get_alert_level(adjusted_score)

        if adjusted_score >= ANOMALY_THRESHOLD:
            self._alert_count[tick["event_id"]] += 1

        return {
            "event_id": tick["event_id"],
            "home_team": tick["home_team"],
            "away_team": tick["away_team"],
            "bookmaker": tick["bookmaker"],
            "odds_home": tick["odds_home"],
            "odds_away": tick.get("odds_away", 0),
            "score_home": tick.get("score_home", 0),
            "score_away": tick.get("score_away", 0),
            "quarter": tick.get("quarter", 0),
            "time_remaining": tick.get("time_remaining", 0),
            "anomaly_score": round(adjusted_score, 4),
            "alert_level": level,
            "is_alert": adjusted_score >= ANOMALY_THRESHOLD,
            "is_critical": adjusted_score >= CRITICAL_THRESHOLD,
            "pct_change": round(features["pct_change"] * 100, 2),
            "market_deviation": round(features["market_deviation"], 3),
            "timestamp": tick["timestamp"],
            "scenario": tick.get("scenario", "real"),  # mock'ta bilgi amaçlı
        }

    def process_batch(self, ticks: list[dict]) -> list[dict]:
        """Bir batch tick'i işler, sadece sonuç olanları döner."""
        results = []
        for tick in ticks:
            result = self.process_tick(tick)
            if result is not None:
                results.append(result)
        return results

    def get_alert_summary(self) -> dict:
        """Event bazlı toplam alarm sayısı."""
        return dict(self._alert_count)
