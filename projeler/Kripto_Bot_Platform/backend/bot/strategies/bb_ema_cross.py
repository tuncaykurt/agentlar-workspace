"""
Bollinger Band Orta Çizgi + EMA Kesişim Stratejisi (BB-EMA Cross)

Strateji Mantığı:
─────────────────
AŞAMA 1 — BB Orta Çizgi Kesişimi (Kurulum):
  · Fiyat BB orta çizgisini mum kapanışı ile yukarı keser → Bullish setup
  · Fiyat BB orta çizgisini mum kapanışı ile aşağı keser → Bearish setup

AŞAMA 2 — EMA Çapraz Onayı (İlk Giriş):
  · Bullish setup sonrası: EMA_fast VE EMA_slow ikisi birden BB ortasını geçince → LONG
  · Bearish setup sonrası: EMA_fast VE EMA_slow ikisi birden BB ortasının altına geçince → SHORT

AŞAMA 3 — EMA Dokunuş (Tekrar Giriş):
  · Fiyat BB ortasının üzerinde + bantlar içinde + EMA_slow'a dokunulunca → LONG
  · Fiyat BB ortasının altında + bantlar içinde + EMA_slow'a dokunulunca → SHORT

AŞAMA 4 — Çıkış:
  · LONG: Fiyat BB üst bandını kapanışla geçince → ÇIKIŞ (sell sinyali)
  · SHORT: Fiyat BB alt bandını kapanışla geçince → ÇIKIŞ (buy sinyali)
  · Çıkış sonrası aynı koşullar yeniden oluşursa tekrar giriş yapılır.

Ayarlanabilir Parametreler:
────────────────────────────
  bb_period      : Bollinger Band SMA periyodu (varsayılan: 20)
  bb_std         : Standart sapma katsayısı (varsayılan: 2.0)
  ema_fast       : Hızlı EMA periyodu (varsayılan: 5)
  ema_slow       : Yavaş EMA periyodu — dokunuş referans çizgisi (varsayılan: 13)
  touch_pct      : EMA'ya % yaklaşım mesafesi; 0 = yalnızca wick dokunuşu (varsayılan: 0.3)
  setup_lookback : BB orta kesişimi için geriye bakış mum sayısı (varsayılan: 5)
  direction      : İşlem yönü — "long", "short", "both" (varsayılan: "both")
  exit_at_bands  : True → BB bantlarında çıkış sinyali üret (varsayılan: True)
"""
import pandas as pd


class BBEMACrossStrategy:
    def __init__(
        self,
        bb_period: int = 20,
        bb_std: float = 2.0,
        ema_fast: int = 5,
        ema_slow: int = 13,
        touch_pct: float = 0.3,
        setup_lookback: int = 5,
        direction: str = "both",
        exit_at_bands: bool = True,
    ):
        self.bb_period = bb_period
        self.bb_std = bb_std
        self.ema_fast = ema_fast
        self.ema_slow = ema_slow
        self.touch_pct = touch_pct
        self.setup_lookback = setup_lookback
        self.direction = direction
        self.exit_at_bands = exit_at_bands

    def calculate(self, ohlcv: list) -> dict:
        min_candles = max(self.bb_period, self.ema_slow) + self.setup_lookback + 5
        if len(ohlcv) < min_candles:
            return {"signal": None}

        df = pd.DataFrame(ohlcv, columns=["ts", "open", "high", "low", "close", "volume"])

        # ── İndikatörler ──────────────────────────────────────────────────────
        sma = df["close"].rolling(self.bb_period).mean()
        std = df["close"].rolling(self.bb_period).std()
        df["bb_mid"]   = sma
        df["bb_upper"] = sma + (std * self.bb_std)
        df["bb_lower"] = sma - (std * self.bb_std)
        df["ema_f"]    = df["close"].ewm(span=self.ema_fast, adjust=False).mean()
        df["ema_s"]    = df["close"].ewm(span=self.ema_slow, adjust=False).mean()

        curr = df.iloc[-1]
        prev = df.iloc[-2]

        # ── AŞAMA 1: ÇIKIŞ KONTROLÜ (en yüksek öncelik) ─────────────────────
        if self.exit_at_bands:
            # Long çıkış: önceki mum bant içindeydi, şimdiki üst bandı kapanışla aştı
            if self.direction in ("long", "both"):
                if float(prev["close"]) < float(prev["bb_upper"]) and \
                   float(curr["close"]) >= float(curr["bb_upper"]):
                    return self._result(
                        "sell", f"BB üst bandı kırıldı — LONG çıkış", curr, prev
                    )

            # Short çıkış: önceki mum bant içindeydi, şimdiki alt bandı kapanışla kırdı
            if self.direction in ("short", "both"):
                if float(prev["close"]) > float(prev["bb_lower"]) and \
                   float(curr["close"]) <= float(curr["bb_lower"]):
                    return self._result(
                        "buy", f"BB alt bandı kırıldı — SHORT çıkış", curr, prev
                    )

        # ── AŞAMA 2: GİRİŞ A — BB Orta Çizgi Kesişimi + EMA Onayı ───────────
        # Son setup_lookback kapalı mum içinde BB ortası geçildi mi?
        lookback_df = df.iloc[-(self.setup_lookback + 2):-1]

        bb_cross_up = any(
            float(lookback_df.iloc[i - 1]["close"]) < float(lookback_df.iloc[i - 1]["bb_mid"])
            and float(lookback_df.iloc[i]["close"]) > float(lookback_df.iloc[i]["bb_mid"])
            for i in range(1, len(lookback_df))
        )

        bb_cross_down = any(
            float(lookback_df.iloc[i - 1]["close"]) > float(lookback_df.iloc[i - 1]["bb_mid"])
            and float(lookback_df.iloc[i]["close"]) < float(lookback_df.iloc[i]["bb_mid"])
            for i in range(1, len(lookback_df))
        )

        # EMA çaprazı: önceki mumda en az biri BB ortasının altında/üstündeydi,
        # şimdiki mumda ikisi de geçti
        ema_cross_up = (
            (float(prev["ema_f"]) <= float(prev["bb_mid"]) or
             float(prev["ema_s"]) <= float(prev["bb_mid"]))
            and float(curr["ema_f"]) > float(curr["bb_mid"])
            and float(curr["ema_s"]) > float(curr["bb_mid"])
        )

        ema_cross_down = (
            (float(prev["ema_f"]) >= float(prev["bb_mid"]) or
             float(prev["ema_s"]) >= float(prev["bb_mid"]))
            and float(curr["ema_f"]) < float(curr["bb_mid"])
            and float(curr["ema_s"]) < float(curr["bb_mid"])
        )

        if bb_cross_up and ema_cross_up and self.direction in ("long", "both"):
            return self._result(
                "buy",
                f"BB orta ↑ kesişim + EMA{self.ema_fast}/EMA{self.ema_slow} onayı — LONG",
                curr, prev,
            )

        if bb_cross_down and ema_cross_down and self.direction in ("short", "both"):
            return self._result(
                "sell",
                f"BB orta ↓ kesişim + EMA{self.ema_fast}/EMA{self.ema_slow} onayı — SHORT",
                curr, prev,
            )

        # ── AŞAMA 3: GİRİŞ B — EMA Dokunuş (Tekrar Giriş) ───────────────────
        # LONG tekrar giriş: BB ortasının üzerinde, bantlar içinde, EMA_slow'a geri çekilme
        if self.direction in ("long", "both"):
            above_mid  = float(curr["close"]) > float(curr["bb_mid"])
            below_upper = float(curr["close"]) < float(curr["bb_upper"])
            if above_mid and below_upper:
                ema_touched = float(curr["low"]) <= float(curr["ema_s"]) <= float(curr["high"])
                if self.touch_pct > 0:
                    dist_pct = (
                        abs(float(curr["close"]) - float(curr["ema_s"]))
                        / float(curr["ema_s"]) * 100
                    )
                    close_enough = dist_pct <= self.touch_pct
                else:
                    close_enough = ema_touched

                # Geri çekilme doğrulaması: önceki kapanış bu kapanıştan yüksekte
                pullback = float(prev["close"]) >= float(curr["close"])

                if close_enough and pullback:
                    return self._result(
                        "buy",
                        f"EMA{self.ema_slow} dokunuşu — LONG tekrar giriş",
                        curr, prev,
                    )

        # SHORT tekrar giriş: BB ortasının altında, bantlar içinde, EMA_slow'a geri sekme
        if self.direction in ("short", "both"):
            below_mid  = float(curr["close"]) < float(curr["bb_mid"])
            above_lower = float(curr["close"]) > float(curr["bb_lower"])
            if below_mid and above_lower:
                ema_touched = float(curr["low"]) <= float(curr["ema_s"]) <= float(curr["high"])
                if self.touch_pct > 0:
                    dist_pct = (
                        abs(float(curr["close"]) - float(curr["ema_s"]))
                        / float(curr["ema_s"]) * 100
                    )
                    close_enough = dist_pct <= self.touch_pct
                else:
                    close_enough = ema_touched

                # Geri sekme doğrulaması: önceki kapanış bu kapanıştan alçakta
                bounce = float(prev["close"]) <= float(curr["close"])

                if close_enough and bounce:
                    return self._result(
                        "sell",
                        f"EMA{self.ema_slow} dokunuşu — SHORT tekrar giriş",
                        curr, prev,
                    )

        return self._result(None, None, curr, prev)

    def _result(self, signal, reason, curr, prev) -> dict:
        return {
            "signal": signal,
            "reason": reason,
            "bb_upper": round(float(curr["bb_upper"]), 4),
            "bb_mid":   round(float(curr["bb_mid"]),   4),
            "bb_lower": round(float(curr["bb_lower"]), 4),
            "ema_fast": round(float(curr["ema_f"]),    4),
            "ema_slow": round(float(curr["ema_s"]),    4),
            "close":    round(float(curr["close"]),    4),
            "prev_close": round(float(prev["close"]),  4),
        }
