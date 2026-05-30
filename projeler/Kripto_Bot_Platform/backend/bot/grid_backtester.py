import pandas as pd
import numpy as np

class GridBacktestEngine:
    def __init__(self, config: dict):
        self.config = config
        self.grid_mode = config.get("grid_mode", "bollinger")
        self.grid_direction = config.get("grid_direction", "auto")
        self.grid_count = int(config.get("grid_count", 20))
        self.initial_balance = float(config.get("initial_balance", 10000))
        self.order_size = float(config.get("order_size", 100)) # Toplam bütçe
        self.leverage = int(config.get("leverage", 10))
        self.maker_fee_pct = 0.0  # MEXC Maker Fee 0%
        self.taker_fee_pct = float(config.get("fee_pct", 0.02)) / 100  # MEXC Taker Fee 0.02%
        self.maintenance_margin_rate = 0.005  # MEXC maintenance margin rate (0.5%)

        self.bb_period = int(config.get("bb_period", 20))
        self.bb_std = float(config.get("bb_std_dev", 2.0))
        self.filters = config.get("filters", {})

        # Her kademenin marjini = toplam bütçe / kademe sayısı
        self.margin_per_level = self.order_size / self.grid_count

        # Trend Score parametreleri
        self.ts_entry_threshold = int(config.get("ts_entry_threshold", 4))
        self.ts_exit_threshold = int(config.get("ts_exit_threshold", 1))
        self.ts_adx_period = int(config.get("ts_adx_period", 14))
        self.ts_adx_min = int(config.get("ts_adx_min", 20))
        self.ts_supertrend_period = int(config.get("ts_supertrend_period", 10))
        self.ts_supertrend_mult = float(config.get("ts_supertrend_mult", 3.0))
        self.ts_divergence_lookback = int(config.get("ts_divergence_lookback", 14))

    def _compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Tüm göstergeleri hesapla — tüm modlar için ortak."""
        # BB
        df["sma"] = df["close"].rolling(self.bb_period).mean()
        df["std"] = df["close"].rolling(self.bb_period).std()
        df["bb_upper"] = df["sma"] + self.bb_std * df["std"]
        df["bb_lower"] = df["sma"] - self.bb_std * df["std"]

        # Squeeze
        df["kc_mid"] = df["sma"]
        df["tr"] = np.maximum(df["high"] - df["low"],
                              np.maximum(abs(df["high"] - df["close"].shift(1)),
                                         abs(df["low"] - df["close"].shift(1))))
        df["atr"] = df["tr"].rolling(self.bb_period).mean()
        df["kc_upper"] = df["kc_mid"] + 1.5 * df["atr"]
        df["kc_lower"] = df["kc_mid"] - 1.5 * df["atr"]
        df["is_squeeze"] = (df["bb_upper"] < df["kc_upper"]) & (df["bb_lower"] > df["kc_lower"])

        # RSI
        delta = df["close"].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df["rsi"] = 100 - (100 / (1 + rs))

        # EMAs (mevcut stratejiler için)
        df["ema6"] = df["close"].ewm(span=6, adjust=False).mean()
        df["ema14"] = df["close"].ewm(span=14, adjust=False).mean()
        df["ema50"] = df["close"].ewm(span=50, adjust=False).mean()
        df["ema200"] = df["close"].ewm(span=200, adjust=False).mean()

        # ── Trend Score göstergeleri ──
        if self.grid_mode == "trend_score":
            # EMA 21/55 (50 ve 200 zaten var)
            df["ema21"] = df["close"].ewm(span=21, adjust=False).mean()
            df["ema55"] = df["close"].ewm(span=55, adjust=False).mean()

            # ADX + DI
            adx_p = self.ts_adx_period
            high_diff = df["high"].diff()
            low_diff = -df["low"].diff()
            plus_dm = np.where((high_diff > low_diff) & (high_diff > 0), high_diff, 0)
            minus_dm = np.where((low_diff > high_diff) & (low_diff > 0), low_diff, 0)
            atr_adx = df["tr"].rolling(adx_p).mean()
            plus_di = 100 * pd.Series(plus_dm, index=df.index).rolling(adx_p).mean() / atr_adx.replace(0, np.nan)
            minus_di = 100 * pd.Series(minus_dm, index=df.index).rolling(adx_p).mean() / atr_adx.replace(0, np.nan)
            dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, np.nan)
            df["adx"] = dx.rolling(adx_p).mean()
            df["plus_di"] = plus_di
            df["minus_di"] = minus_di

            # MACD
            ema12 = df["close"].ewm(span=12, adjust=False).mean()
            ema26 = df["close"].ewm(span=26, adjust=False).mean()
            df["macd_line"] = ema12 - ema26
            df["macd_signal"] = df["macd_line"].ewm(span=9, adjust=False).mean()
            df["macd_hist"] = df["macd_line"] - df["macd_signal"]

            # Supertrend
            st_p = self.ts_supertrend_period
            st_m = self.ts_supertrend_mult
            st_atr = df["tr"].rolling(st_p).mean()
            hl2 = (df["high"] + df["low"]) / 2
            upper_band = hl2 + st_m * st_atr
            lower_band = hl2 - st_m * st_atr

            supertrend = pd.Series(np.nan, index=df.index)
            st_dir = pd.Series(1, index=df.index)  # 1 = long, -1 = short
            for j in range(1, len(df)):
                if pd.isna(upper_band.iloc[j]) or pd.isna(lower_band.iloc[j]):
                    continue
                # Lower band: sadece yukarı hareket edebilir
                if lower_band.iloc[j] < lower_band.iloc[j-1] and df["close"].iloc[j-1] > lower_band.iloc[j-1]:
                    lower_band.iloc[j] = lower_band.iloc[j-1]
                # Upper band: sadece aşağı hareket edebilir
                if upper_band.iloc[j] > upper_band.iloc[j-1] and df["close"].iloc[j-1] < upper_band.iloc[j-1]:
                    upper_band.iloc[j] = upper_band.iloc[j-1]

                if st_dir.iloc[j-1] == 1:
                    if df["close"].iloc[j] < lower_band.iloc[j]:
                        st_dir.iloc[j] = -1
                        supertrend.iloc[j] = upper_band.iloc[j]
                    else:
                        st_dir.iloc[j] = 1
                        supertrend.iloc[j] = lower_band.iloc[j]
                else:
                    if df["close"].iloc[j] > upper_band.iloc[j]:
                        st_dir.iloc[j] = 1
                        supertrend.iloc[j] = lower_band.iloc[j]
                    else:
                        st_dir.iloc[j] = -1
                        supertrend.iloc[j] = upper_band.iloc[j]

            df["supertrend"] = supertrend
            df["st_dir"] = st_dir

        return df

    def _calc_trend_score(self, row, prev_row, df, i) -> int:
        """Trend puanı hesapla: -10 ile +10 arası."""
        score = 0
        price = float(row["close"])

        # ── 1. EMA Dizilimi (max ±3) ──
        ema21 = float(row["ema21"])
        ema55 = float(row["ema55"])
        ema200 = float(row["ema200"])

        if ema21 > ema55 > ema200:
            score += 3  # Tam long dizilim
        elif ema21 > ema55:
            score += 1  # Kısmi long
        elif ema21 < ema55 < ema200:
            score -= 3  # Tam short dizilim
        elif ema21 < ema55:
            score -= 1  # Kısmi short

        # ── 2. ADX + DI (max ±2) ──
        adx = float(row["adx"]) if not pd.isna(row["adx"]) else 0
        plus_di = float(row["plus_di"]) if not pd.isna(row["plus_di"]) else 0
        minus_di = float(row["minus_di"]) if not pd.isna(row["minus_di"]) else 0

        if adx >= self.ts_adx_min:
            if plus_di > minus_di:
                score += 2
            else:
                score -= 2

        # ── 3. MACD Histogram (max ±2) ──
        macd_hist = float(row["macd_hist"]) if not pd.isna(row["macd_hist"]) else 0
        prev_macd_hist = float(prev_row["macd_hist"]) if not pd.isna(prev_row["macd_hist"]) else 0

        if macd_hist > 0:
            score += 1
            if macd_hist > prev_macd_hist:  # İvme artıyor
                score += 1
        elif macd_hist < 0:
            score -= 1
            if macd_hist < prev_macd_hist:  # İvme artıyor (short yönde)
                score -= 1

        # ── 4. Supertrend (max ±1) ──
        st_dir = int(row["st_dir"]) if not pd.isna(row["st_dir"]) else 0
        if st_dir == 1:
            score += 1
        elif st_dir == -1:
            score -= 1

        # ── 5. RSI Divergence (max ±2) ──
        lookback = self.ts_divergence_lookback
        if i >= lookback + 1:
            prices_window = df["close"].iloc[i-lookback:i+1].values
            rsi_window = df["rsi"].iloc[i-lookback:i+1].values

            # Bullish divergence: fiyat düşük yapıyor ama RSI yükseliyor
            if prices_window[-1] < prices_window[0] and rsi_window[-1] > rsi_window[0]:
                score += 2
            # Bearish divergence: fiyat yüksek yapıyor ama RSI düşüyor
            elif prices_window[-1] > prices_window[0] and rsi_window[-1] < rsi_window[0]:
                score -= 2

        return max(-10, min(10, score))

    def run(self, ohlcv: list) -> dict:
        warmup = max(self.bb_period, 200, self.ts_adx_period * 3 if self.grid_mode == "trend_score" else 0)
        if len(ohlcv) < warmup + 10:
            return {"error": "Yetersiz veri", "candle_count": len(ohlcv)}

        # DataFrame oluştur
        df = pd.DataFrame(ohlcv, columns=["time", "open", "high", "low", "close", "volume"])
        df = self._compute_indicators(df)

        trades = []
        equity_curve = []
        balance = self.initial_balance
        score_line = []  # Trend score grafiği

        state = {
            "upper": 0, "lower": 0, "step": 0, "levels": [],
            "margin_per_level": self.margin_per_level,
            "filled": set(), "entry_prices": {}, "qtys": {}, "entry_times": {},
            "last_level": -1,
            "bb_dir_paused": False, "bb_dir_wait_cross": self.grid_mode == "bb_direction",
            "bb_dir_last_mid": "",
            "ema_paused": False, "ema_wait_cross": self.grid_mode == "ema_trend",
            "active_direction": "long",
            "band_exited": False, "band_exit_side": None,
            # Trend Score state
            "ts_active": False, "ts_direction": None, "ts_prev_score": 0,
        }

        grid_upper_line = []
        grid_lower_line = []

        start_idx = warmup
        for i in range(start_idx, len(df)):
            row = df.iloc[i]
            prev_row = df.iloc[i-1]
            ts = int(row["time"])
            price = float(row["close"])
            high = float(row["high"])
            low = float(row["low"])

            bb_upper = float(row["bb_upper"]) if not pd.isna(row["bb_upper"]) else price
            bb_lower = float(row["bb_lower"]) if not pd.isna(row["bb_lower"]) else price
            bb_mid = float(row["sma"]) if not pd.isna(row["sma"]) else price
            rsi = float(row["rsi"]) if not pd.isna(row["rsi"]) else 50
            is_squeeze = bool(row["is_squeeze"]) if not pd.isna(row["is_squeeze"]) else False
            above_mid = price > bb_mid

            # Active direction
            if self.grid_mode == "trend_score":
                active_dir = state["active_direction"]
            elif self.grid_mode == "ema_trend":
                active_dir = state["active_direction"]
            else:
                active_dir = self.grid_direction
                if self.grid_mode == "bb_direction" or self.grid_direction == "auto":
                    active_dir = "long" if above_mid else "short"

            skip_buy = False
            skip_sell = False

            # ══════════════════════════════════════════════════════
            # ═══  TREND SCORE MODU  ═══
            # ══════════════════════════════════════════════════════
            if self.grid_mode == "trend_score":
                trend_score = self._calc_trend_score(row, prev_row, df, i)
                state["ts_prev_score"] = trend_score

                # Grafik için score kaydet
                score_line.append({"time": ts // 1000, "value": trend_score})

                entry_th = self.ts_entry_threshold
                exit_th = self.ts_exit_threshold

                if not state["ts_active"]:
                    # ── Grid açık değil: yeni sinyal bekle ──
                    new_dir = None
                    if trend_score >= entry_th:
                        new_dir = "long"
                    elif trend_score <= -entry_th:
                        new_dir = "short"

                    if new_dir:
                        state["ts_active"] = True
                        state["ts_direction"] = new_dir
                        state["active_direction"] = new_dir
                        active_dir = new_dir

                        # Grid sınırlarını BB spread'e göre kur
                        spread_pct = float(self.config.get("spread_pct", 1.5))
                        # BB spread varsa onu kullan, yoksa sabit spread
                        if bb_upper > bb_lower and bb_mid > 0:
                            bb_spread = (bb_upper - bb_lower) / bb_mid * 100
                            spread_pct = max(spread_pct, bb_spread)

                        state["upper"] = price * (1 + spread_pct / 200)
                        state["lower"] = price * (1 - spread_pct / 200)
                        state["step"] = (state["upper"] - state["lower"]) / self.grid_count
                        state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                        if self.config.get("budget_mode") == "percent":
                            state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                        else:
                            state["margin_per_level"] = self.margin_per_level
                        trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})

                        state["filled"] = set()
                        state["entry_prices"] = {}
                        state["qtys"] = {}
                        state["entry_times"] = {}
                        state["last_level"] = -1
                    continue  # Sinyal yoksa veya grid yeni açıldıysa sonraki muma geç
                else:
                    # ── Grid açık: çıkış veya yön değiştirme kontrolü ──
                    cur_dir = state["ts_direction"]
                    should_exit = False
                    should_reverse = False
                    new_dir = None

                    # Çıkış: puan eşiğin altına düştü
                    if cur_dir == "long" and trend_score <= exit_th:
                        should_exit = True
                    elif cur_dir == "short" and trend_score >= -exit_th:
                        should_exit = True

                    # Ters yön: puan karşı eşiği geçti → direkt yön değiştir
                    if cur_dir == "long" and trend_score <= -entry_th:
                        should_reverse = True
                        new_dir = "short"
                    elif cur_dir == "short" and trend_score >= entry_th:
                        should_reverse = True
                        new_dir = "long"

                    if should_exit or should_reverse:
                        # Tüm açık pozisyonları kapat
                        margin_used = state["margin_per_level"]
                        pos_val = margin_used * self.leverage
                        qty = pos_val / price if price > 0 else 0
                        for lvl in list(state["filled"]):
                            state["filled"].discard(lvl)
                            ep = state["entry_prices"].pop(lvl, price)
                            lvl_qty = state["qtys"].pop(lvl, qty)
                            entry_ts = state["entry_times"].pop(lvl, ts)
                            if cur_dir == "long":
                                gross = (price - ep) * lvl_qty
                            else:
                                gross = (ep - price) * lvl_qty
                            fee = lvl_qty * price * self.taker_fee_pct
                            net_pnl = gross - fee
                            balance += net_pnl
                            entry_margin = state["margin_per_level"]
                            entry_pos_val = lvl_qty * ep
                            pnl_pct = (net_pnl / entry_margin * 100) if entry_margin > 0 else 0
                            exit_reason = "score_reverse" if should_reverse else "score_exit"
                            trades.append({"entry_ts": entry_ts, "exit_ts": ts, "side": cur_dir, "entry": ep, "exit": price, "pnl": round(net_pnl, 4), "fee": round(fee, 4), "status": "closed", "lvl": lvl, "qty": lvl_qty, "margin": round(entry_margin, 2), "position_value": round(entry_pos_val, 2), "pnl_pct": round(pnl_pct, 2), "exit_reason": exit_reason})
                        trades.append({"entry_ts": ts, "side": "grid_end", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})

                        # Grid sıfırla
                        state["upper"] = 0
                        state["lower"] = 0
                        state["levels"] = []
                        state["filled"] = set()
                        state["entry_prices"] = {}
                        state["qtys"] = {}
                        state["entry_times"] = {}
                        state["last_level"] = -1

                        if should_reverse and new_dir:
                            # Hemen ters yönde yeni grid aç
                            state["ts_direction"] = new_dir
                            state["active_direction"] = new_dir
                            active_dir = new_dir

                            spread_pct = float(self.config.get("spread_pct", 1.5))
                            if bb_upper > bb_lower and bb_mid > 0:
                                bb_spread = (bb_upper - bb_lower) / bb_mid * 100
                                spread_pct = max(spread_pct, bb_spread)

                            state["upper"] = price * (1 + spread_pct / 200)
                            state["lower"] = price * (1 - spread_pct / 200)
                            state["step"] = (state["upper"] - state["lower"]) / self.grid_count
                            state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                            if self.config.get("budget_mode") == "percent":
                                state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                            else:
                                state["margin_per_level"] = self.margin_per_level
                            trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                        else:
                            state["ts_active"] = False
                            state["ts_direction"] = None
                        continue

            # ══════════════════════════════════════════════════════
            # ═══  EMA TREND MODU (mevcut)  ═══
            # ══════════════════════════════════════════════════════
            if self.grid_mode == "ema_trend":
                ema6 = float(row["ema6"])
                ema14 = float(row["ema14"])
                ema50 = float(row["ema50"])
                ema200 = float(row["ema200"])
                prev_ema6 = float(df.iloc[i-1]["ema6"]) if i > 0 else ema6
                prev_ema14 = float(df.iloc[i-1]["ema14"]) if i > 0 else ema14

                min_ema_pct = float(self.config.get("min_ema_pct", 1.0))

                trend_long = (ema50 > ema200) and ((ema50 - ema200) / max(ema200, 1) * 100 >= min_ema_pct)
                cross_long = (ema6 > ema14) and (prev_ema6 <= prev_ema14)
                pullback_long = price > ema50
                long_cond = trend_long and cross_long and pullback_long

                trend_short = (ema50 < ema200) and ((ema200 - ema50) / max(ema50, 1) * 100 >= min_ema_pct)
                cross_short = (ema6 < ema14) and (prev_ema6 >= prev_ema14)
                pullback_short = price < ema50
                short_cond = trend_short and cross_short and pullback_short

                if state["ema_wait_cross"]:
                    if long_cond or short_cond:
                        state["ema_wait_cross"] = False
                        state["ema_paused"] = False
                        state["active_direction"] = "long" if long_cond else "short"
                        active_dir = state["active_direction"]

                        spread_pct = float(self.config.get("spread_pct", 1.5))
                        state["upper"] = price * (1 + spread_pct / 200)
                        state["lower"] = price * (1 - spread_pct / 200)
                        state["step"] = (state["upper"] - state["lower"]) / self.grid_count
                        state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                        if self.config.get("budget_mode") == "percent":
                            state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                        else:
                            state["margin_per_level"] = self.margin_per_level
                        trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})

                        state["filled"] = set()
                        state["entry_prices"] = {}
                        state["qtys"] = {}
                        state["entry_times"] = {}
                        state["last_level"] = -1
                        state["band_exited"] = False
                        state["band_exit_side"] = None
                    continue
                if state["ema_paused"]:
                    state["ema_wait_cross"] = True
                    continue

            # ══════════════════════════════════════════════════════
            # ═══  BB DIRECTION MODU (mevcut)  ═══
            # ══════════════════════════════════════════════════════
            if self.grid_mode == "bb_direction":
                current_mid_side = "above" if price > bb_mid else "below"
                if state["bb_dir_wait_cross"]:
                    if state["bb_dir_last_mid"] and current_mid_side != state["bb_dir_last_mid"]:
                        state["bb_dir_wait_cross"] = False
                        state["bb_dir_paused"] = False

                        min_sp = self.config.get("min_spread_pct", 0.3) / 100
                        if (bb_upper - bb_lower) / bb_mid < min_sp:
                            diff = (bb_mid * min_sp) / 2
                            bb_upper = bb_mid + diff
                            bb_lower = bb_mid - diff

                        if bb_upper > bb_lower and price > 0:
                            bb_spread_pct = (bb_upper - bb_lower) / price * 100
                            state["upper"] = price * (1 + bb_spread_pct / 200)
                            state["lower"] = price * (1 - bb_spread_pct / 200)
                            state["step"] = (state["upper"] - state["lower"]) / self.grid_count
                            state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                            if self.config.get("budget_mode") == "percent":
                                state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                            else:
                                state["margin_per_level"] = self.margin_per_level
                            trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                        state["filled"] = set()
                        state["entry_prices"] = {}
                        state["qtys"] = {}
                        state["entry_times"] = {}
                        state["last_level"] = -1
                        state["band_exited"] = False
                        state["band_exit_side"] = None
                    state["bb_dir_last_mid"] = current_mid_side
                    continue
                if state["bb_dir_paused"]:
                    state["bb_dir_wait_cross"] = True
                    state["bb_dir_last_mid"] = current_mid_side
                    continue
                if not state["bb_dir_last_mid"]:
                    state["bb_dir_last_mid"] = current_mid_side

            # ══════════════════════════════════════════════════════
            # ═══  ORTAK: Filtreler, Likidasyon, Grid Fill  ═══
            # ══════════════════════════════════════════════════════

            if self.filters.get("rsi_filter"):
                if active_dir == "long":
                    if rsi > 70: skip_buy = True
                    if rsi < 30: skip_sell = True
                else:
                    if rsi < 30: skip_buy = True
                    if rsi > 70: skip_sell = True

            if self.filters.get("squeeze_filter") and is_squeeze:
                skip_buy = True

            if self.filters.get("midline_filter"):
                if active_dir == "long" and not above_mid: skip_buy = True
                elif active_dir == "short" and above_mid: skip_buy = True

            # ── Cross margin likidasyon kontrolü ──
            mmr = self.maintenance_margin_rate
            total_notional = 0
            total_unrealized = 0
            for lvl in state["filled"]:
                ep = state["entry_prices"][lvl]
                lvl_qty = state["qtys"][lvl]
                lvl_notional = lvl_qty * ep
                total_notional += lvl_notional
                if active_dir == "long":
                    total_unrealized += (price - ep) * lvl_qty
                else:
                    total_unrealized += (ep - price) * lvl_qty

            maintenance_margin = total_notional * mmr
            if state["filled"] and (balance + total_unrealized) <= maintenance_margin:
                for lvl in list(state["filled"]):
                    ep = state["entry_prices"].pop(lvl)
                    lvl_qty = state["qtys"].pop(lvl)
                    entry_ts = state["entry_times"].pop(lvl, ts)
                    margin_used = state["margin_per_level"]
                    pos_val = lvl_qty * ep
                    fee = lvl_qty * price * self.taker_fee_pct
                    trades.append({
                        "entry_ts": entry_ts, "exit_ts": ts, "side": active_dir, "entry": ep, "exit": price,
                        "pnl": 0, "fee": fee, "status": "closed", "lvl": lvl, "qty": lvl_qty,
                        "margin": round(margin_used, 2), "position_value": round(pos_val, 2), "pnl_pct": -100, "exit_reason": "liquidation"
                    })
                liq_loss = balance
                balance = 0
                liq_trades = [t for t in trades if t.get("exit_reason") == "liquidation" and t.get("exit_ts") == ts]
                if liq_trades:
                    per_trade_loss = -liq_loss / len(liq_trades)
                    for t in liq_trades:
                        t["pnl"] = round(per_trade_loss, 2)
                state["filled"] = set()
                state["entry_prices"] = {}
                state["qtys"] = {}
                state["entry_times"] = {}
                if self.grid_mode == "trend_score":
                    state["ts_active"] = False
                    state["ts_direction"] = None

            if balance <= 0:
                balance = 0
                break

            # Init bounds if 0 (non-ema, non-trend_score — bollinger/hybrid/bb_direction)
            if state["upper"] == 0 and self.grid_mode not in ("ema_trend", "trend_score") and bb_upper > bb_lower:
                min_sp = self.config.get("min_spread_pct", 0.3) / 100
                if (bb_upper - bb_lower) / bb_mid < min_sp:
                    diff = (bb_mid * min_sp) / 2
                    bb_upper = bb_mid + diff
                    bb_lower = bb_mid - diff

                state["upper"], state["lower"] = bb_upper, bb_lower
                state["step"] = (bb_upper - bb_lower) / self.grid_count
                state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                if self.config.get("budget_mode") == "percent":
                    state["margin_per_level"] = (balance * (self.order_size / 100)) / self.grid_count
                else:
                    state["margin_per_level"] = self.margin_per_level
                trades.append({"entry_ts": ts, "side": "grid_start", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                state["band_exited"] = False
                state["band_exit_side"] = None

            if not state["levels"]: continue

            # Find current level
            current_level = int((price - state["lower"]) / state["step"]) if state["step"] > 0 else 0
            current_level = max(0, min(self.grid_count - 1, current_level))

            if state["last_level"] == -1:
                state["last_level"] = current_level
                continue

            # ── USD bazlı pozisyon hesaplama ──
            margin_used = state["margin_per_level"]
            pos_val = margin_used * self.leverage
            qty = pos_val / price

            # ── ÖNCE band exit kontrolü (trend_score hariç — o kendi çıkışını yönetir) ──
            band_exit_triggered = False
            if state["upper"] > 0 and self.grid_mode != "trend_score":
                should_close = False
                exit_side = None

                if self.grid_mode == "ema_trend":
                    ema_exit_mode = self.config.get("ema_exit_mode", "ema_cross")
                    if ema_exit_mode == "bollinger":
                        if active_dir == "long" and price > bb_upper: should_close, exit_side = True, "upper"
                        elif active_dir == "short" and price < bb_lower: should_close, exit_side = True, "lower"
                    elif ema_exit_mode == "ema_cross":
                        ema6, ema14 = float(row["ema6"]), float(row["ema14"])
                        if active_dir == "long" and ema6 < ema14: should_close, exit_side = True, "upper"
                        elif active_dir == "short" and ema6 > ema14: should_close, exit_side = True, "lower"
                    elif ema_exit_mode == "touch_ema50":
                        ema50 = float(row["ema50"])
                        if active_dir == "long" and low <= ema50: should_close, exit_side = True, "upper"
                        elif active_dir == "short" and high >= ema50: should_close, exit_side = True, "lower"
                    elif ema_exit_mode == "touch_ema200":
                        ema200 = float(row["ema200"])
                        if active_dir == "long" and low <= ema200: should_close, exit_side = True, "upper"
                        elif active_dir == "short" and high >= ema200: should_close, exit_side = True, "lower"
                else:
                    # BB modları: 2 aşamalı çıkış
                    if not state["band_exited"]:
                        if active_dir == "long" and price > bb_upper:
                            state["band_exited"] = True
                            state["band_exit_side"] = "upper"
                        elif active_dir == "short" and price < bb_lower:
                            state["band_exited"] = True
                            state["band_exit_side"] = "lower"
                    else:
                        if state["band_exit_side"] == "upper" and price <= bb_upper:
                            should_close, exit_side = True, "upper"
                        elif state["band_exit_side"] == "lower" and price >= bb_lower:
                            should_close, exit_side = True, "lower"

                if should_close and state["filled"]:
                    band_exit_triggered = True
                    close_lvls = list(state["filled"])
                    for lvl in close_lvls:
                        state["filled"].discard(lvl)
                        ep = state["entry_prices"].pop(lvl, price)
                        lvl_qty = state["qtys"].pop(lvl, qty)
                        entry_ts = state["entry_times"].pop(lvl, ts)
                        gross = (price - ep) * lvl_qty if active_dir == "long" else (ep - price) * lvl_qty
                        fee = lvl_qty * price * self.taker_fee_pct
                        net_pnl = gross - fee
                        balance += net_pnl
                        entry_margin = state["margin_per_level"]
                        entry_pos_val = lvl_qty * ep
                        pnl_pct = (net_pnl / entry_margin * 100) if entry_margin > 0 else 0
                        trades.append({"entry_ts": entry_ts, "exit_ts": ts, "side": active_dir, "entry": ep, "exit": price, "pnl": round(net_pnl, 4), "fee": round(fee, 4), "status": "band_exit", "lvl": lvl, "qty": lvl_qty, "margin": round(entry_margin, 2), "position_value": round(entry_pos_val, 2), "pnl_pct": round(pnl_pct, 2), "exit_reason": "bb_upper_band" if exit_side == "upper" else "bb_lower_band"})
                    if self.grid_mode == "bb_direction":
                        state["bb_dir_paused"] = True
                    if self.grid_mode == "ema_trend":
                        state["ema_paused"] = True
                    trades.append({"entry_ts": ts, "side": "grid_end", "entry": price, "exit": 0, "pnl": 0, "status": "info", "lvl": 0, "qty": 0})
                    state["upper"] = 0
                    state["lower"] = 0
                    state["levels"] = []
                    state["band_exited"] = False
                    state["band_exit_side"] = None
                    state["last_level"] = current_level
                    continue

            # ── Grid fill: sadece band exit tetiklenmemişse ──
            if not band_exit_triggered:
                if active_dir == "long":
                    if current_level < state["last_level"] and not skip_buy:
                        for lvl in range(state["last_level"] - 1, current_level - 1, -1):
                            if lvl not in state["filled"] and 0 <= lvl < self.grid_count:
                                state["filled"].add(lvl)
                                state["entry_prices"][lvl] = price
                                state["qtys"][lvl] = qty
                                state["entry_times"][lvl] = ts
                                trades.append({"entry_ts": ts, "side": "buy", "entry": price, "exit": 0, "pnl": 0, "status": "open", "lvl": lvl, "qty": qty, "margin": round(margin_used, 2), "position_value": round(pos_val, 2), "pnl_pct": 0})
                    elif current_level > state["last_level"] and not skip_sell:
                        for lvl in range(state["last_level"], current_level):
                            if lvl not in state["filled"]:
                                continue
                            state["filled"].discard(lvl)
                            ep = state["entry_prices"].pop(lvl, price - state["step"])
                            lvl_qty = state["qtys"].pop(lvl, qty)
                            entry_ts = state["entry_times"].pop(lvl, ts)
                            gross = (price - ep) * lvl_qty
                            fee = lvl_qty * price * self.taker_fee_pct
                            net_pnl = gross - fee
                            balance += net_pnl
                            entry_margin = state["margin_per_level"]
                            entry_pos_val = lvl_qty * ep
                            pnl_pct = (net_pnl / entry_margin * 100) if entry_margin > 0 else 0
                            trades.append({"entry_ts": entry_ts, "exit_ts": ts, "side": "buy", "entry": ep, "exit": price, "pnl": round(net_pnl, 4), "fee": round(fee, 4), "status": "closed", "lvl": lvl, "qty": lvl_qty, "margin": round(entry_margin, 2), "position_value": round(entry_pos_val, 2), "pnl_pct": round(pnl_pct, 2)})
                else: # short
                    if current_level > state["last_level"] and not skip_buy:
                        for lvl in range(state["last_level"] + 1, current_level + 1):
                            if lvl not in state["filled"] and 0 <= lvl < self.grid_count:
                                state["filled"].add(lvl)
                                state["entry_prices"][lvl] = price
                                state["qtys"][lvl] = qty
                                state["entry_times"][lvl] = ts
                                trades.append({"entry_ts": ts, "side": "sell", "entry": price, "exit": 0, "pnl": 0, "status": "open", "lvl": lvl, "qty": qty, "margin": round(margin_used, 2), "position_value": round(pos_val, 2), "pnl_pct": 0})
                    elif current_level < state["last_level"] and not skip_sell:
                        for lvl in range(state["last_level"], current_level, -1):
                            if lvl not in state["filled"]:
                                continue
                            state["filled"].discard(lvl)
                            ep = state["entry_prices"].pop(lvl, price + state["step"])
                            lvl_qty = state["qtys"].pop(lvl, qty)
                            entry_ts = state["entry_times"].pop(lvl, ts)
                            gross = (ep - price) * lvl_qty
                            fee = lvl_qty * price * self.taker_fee_pct
                            net_pnl = gross - fee
                            balance += net_pnl
                            entry_margin = state["margin_per_level"]
                            entry_pos_val = lvl_qty * ep
                            pnl_pct = (net_pnl / entry_margin * 100) if entry_margin > 0 else 0
                            trades.append({"entry_ts": entry_ts, "exit_ts": ts, "side": "sell", "entry": ep, "exit": price, "pnl": round(net_pnl, 4), "fee": round(fee, 4), "status": "closed", "lvl": lvl, "qty": lvl_qty, "margin": round(entry_margin, 2), "position_value": round(entry_pos_val, 2), "pnl_pct": round(pnl_pct, 2)})

            state["last_level"] = current_level

            # Trailing
            if not state.get("bb_dir_paused"):
                if price >= state["upper"]:
                    state["upper"] = price
                    state["lower"] = state["lower"] + (price - state["upper"]) if state["upper"]>0 else price - (state["step"]*self.grid_count)
                    state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]
                elif price <= state["lower"] and not state["filled"]:
                    state["lower"] = price
                    state["upper"] = state["upper"] - (state["lower"] - price) if state["lower"]>0 else price + (state["step"]*self.grid_count)
                    state["levels"] = [state["lower"] + j * state["step"] for j in range(self.grid_count + 1)]

            if i % 20 == 0:
                equity_curve.append({"time": ts // 1000, "equity": balance})

            if state["upper"] > 0:
                grid_upper_line.append({"time": ts // 1000, "value": round(state["upper"], 8)})
                grid_lower_line.append({"time": ts // 1000, "value": round(state["lower"], 8)})

        # Force close open positions at the end
        if state["filled"]:
            last_price = float(df.iloc[-1]["close"])
            last_ts = int(df.iloc[-1]["time"])
            active_dir = state.get("active_direction", "long")

            for lvl in list(state["filled"]):
                ep = state["entry_prices"].get(lvl, last_price)
                lvl_qty = state["qtys"].get(lvl, 0)
                if lvl_qty == 0:
                    continue
                gross = (last_price - ep) * lvl_qty if active_dir == "long" else (ep - last_price) * lvl_qty
                fee = lvl_qty * last_price * self.taker_fee_pct
                net_pnl = gross - fee
                balance += net_pnl
                entry_margin = state["margin_per_level"]
                entry_pos_val = lvl_qty * ep
                pnl_pct = (net_pnl / entry_margin * 100) if entry_margin > 0 else 0
                trades.append({"entry_ts": last_ts, "exit_ts": last_ts, "side": active_dir, "entry": ep, "exit": last_price, "pnl": round(net_pnl, 4), "fee": round(fee, 4), "status": "closed", "lvl": lvl, "qty": lvl_qty, "margin": round(entry_margin, 2), "position_value": round(entry_pos_val, 2), "pnl_pct": round(pnl_pct, 2), "exit_reason": "end_of_data"})

        # Calculate metrics
        closed = [t for t in trades if t["status"] in ("closed", "band_exit")]
        pnls = [t["pnl"] for t in closed]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]

        indicators = {}
        if grid_upper_line:
            indicators["grid_upper"] = grid_upper_line
            indicators["grid_lower"] = grid_lower_line
        if score_line:
            indicators["trend_score"] = score_line

        fees = [t.get("fee", 0) for t in closed]

        return {
            "total_trades": len(closed),
            "final_balance": round(balance, 2),
            "total_pnl": round(sum(pnls), 2),
            "total_fees": round(sum(fees), 2),
            "total_pnl_pct": round((sum(pnls) / self.initial_balance) * 100, 2) if self.initial_balance>0 else 0,
            "win_rate": round(len(wins) / len(pnls) * 100, 1) if pnls else 0,
            "win_count": len(wins),
            "loss_count": len(losses),
            "max_drawdown_pct": 0,
            "sharpe_ratio": 0,
            "profit_factor": round(sum(wins)/abs(sum(losses)), 2) if sum(losses)!=0 else (99 if wins else 0),
            "best_trade": round(max(pnls), 2) if pnls else 0,
            "worst_trade": round(min(pnls), 2) if pnls else 0,
            "trades": [{"entry_ts": t["entry_ts"], "exit_ts": t.get("exit_ts", t["entry_ts"]), "side": t["side"], "entry": t["entry"], "exit": t["exit"], "pnl": t["pnl"], "fee": t.get("fee", 0), "qty": t["qty"], "margin": t.get("margin", 0), "position_value": t.get("position_value", 0), "pnl_pct": t.get("pnl_pct", 0), "exit_reason": t.get("exit_reason", t["status"])} for t in closed],
            "equity_curve": equity_curve,
            "indicators": indicators,
        }
