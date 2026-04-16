"""
Her gelen oran tick'i için anomali tespitine girecek feature vektörünü üretir.

Özellikler:
  - odds_change       : son değerden fark
  - odds_velocity     : birim zamanda değişim hızı
  - market_deviation  : tüm büro ortalamasından sapma (z-skoru)
  - bookmaker_spread  : max - min oran (arbitraj göstergesi)
  - context_score     : skor + süre bazlı bağlam düzeltmesi
"""
from collections import defaultdict, deque
from typing import Optional
import math


class FeatureEngine:
    """
    Her (event_id, bookmaker) çifti için tarihsel pencere tutar
    ve güncel tick'in feature vektörünü hesaplar.
    """

    def __init__(self, window_size: int = 30):
        self.window_size = window_size
        # (event_id, bookmaker) → son N oran değeri
        self._history: dict[tuple, deque] = defaultdict(
            lambda: deque(maxlen=window_size)
        )
        # event_id → tüm bürolar arasında son oran (piyasa ortalaması için)
        self._market: dict[str, list[float]] = defaultdict(list)

    def update_and_extract(self, tick: dict) -> Optional[dict]:
        """
        Tick verisini alır, history'yi günceller, feature dict döner.
        İlk 3 tick'te None döner (yeterli pencere yok).
        """
        eid = tick["event_id"]
        bm = tick["bookmaker"]
        odds = tick.get("odds_home", 0)
        if odds <= 0:
            return None

        key = (eid, bm)
        history = self._history[key]
        history.append(odds)

        # Piyasa ortalaması güncelle
        self._market[eid].append(odds)
        if len(self._market[eid]) > 50 * len(self._market):  # bellek sınırı
            self._market[eid] = self._market[eid][-100:]

        if len(history) < 3:
            return None

        prev_odds = history[-2]
        old_odds = history[-3]

        # --- Feature hesaplamaları ---

        # 1. Mutlak değişim
        odds_change = odds - prev_odds

        # 2. Değişim hızı (ivme: farkın farkı)
        prev_change = prev_odds - old_odds
        odds_velocity = odds_change - prev_change

        # 3. Piyasa ortalamasından sapma (z-skoru)
        market_odds = self._market[eid]
        if len(market_odds) >= 5:
            mean = sum(market_odds) / len(market_odds)
            variance = sum((x - mean) ** 2 for x in market_odds) / len(market_odds)
            std = math.sqrt(variance) if variance > 0 else 1e-9
            market_deviation = (odds - mean) / std
        else:
            market_deviation = 0.0

        # 4. Spread (max - min) sadece bu event'teki tüm büro geçmişinden
        all_odds_for_event = self._market[eid]
        if all_odds_for_event:
            bookmaker_spread = max(all_odds_for_event) - min(all_odds_for_event)
        else:
            bookmaker_spread = 0.0

        # 5. Bağlamsal düzeltme: skor farkı ve kalan sürenin normalize değeri
        score_diff = abs(tick.get("score_home", 0) - tick.get("score_away", 0))
        time_remaining = tick.get("time_remaining", 360)
        # Kritik anlarda (az süre kaldı, yüksek fark) normal oynamalar da büyük.
        # Bu katsayı anomali eşiğini biraz gevşetir.
        context_factor = (score_diff / 30.0) * (1 - time_remaining / 2880.0)
        context_score = min(1.0, context_factor)

        # 6. Büyük ani spike: tek tick'te %5+ hareket
        pct_change = abs(odds_change / prev_odds) if prev_odds > 0 else 0
        is_spike = float(pct_change > 0.05)

        return {
            "odds_change": odds_change,
            "odds_velocity": odds_velocity,
            "market_deviation": market_deviation,
            "bookmaker_spread": bookmaker_spread,
            "context_score": context_score,
            "pct_change": pct_change,
            "is_spike": is_spike,
            # Ham değerler (dashboard için)
            "odds": odds,
            "prev_odds": prev_odds,
        }
