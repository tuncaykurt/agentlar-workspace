"""
Math Genius Grid - Gemini Stratejisi
-------------------
ADX ve EMA'ya göre trend yönlü grid oluşturur.
ATR bazlı volatilite ile dinamik aralık hesaplar.
Mevcut fiyatın etrafında N adet grid seviyesi belirler.
"""
import pandas as pd
import ta

class MathGridGeminiStrategy:
    needs_ohlcv = True

    def __init__(self, params: dict):
        self.grid_count = max(2, int(params.get("grid_count", 20)))
        self.per_grid_usdt = float(params.get("per_grid_usdt", 10))
        self.atr_period = int(params.get("atr_period", 14))
        self.atr_grid_mult = float(params.get("atr_grid_mult", 0.5))
        self.adx_period = int(params.get("adx_period", 14))
        self.adx_threshold = float(params.get("adx_threshold", 25))
        self.ema_period = int(params.get("ema_period", 200))
        self.breakout_atr_mult = float(params.get("breakout_atr_mult", 1.5))
        self.target_pnl_pct = float(params.get("target_pnl_pct", 5)) / 100
        self.max_drawdown_pct = float(params.get("max_drawdown_pct", 15)) / 100
        
        self.maker_fee_pct = 0.0
        self.taker_fee_pct = 0.0002 # 0.02%
        
        self.levels = []
        self.bought = set()
        self.entry_price = 0.0
        self.realized_pnl = 0.0
        self.initialized = False
        self.last_price = 0.0
        
        # Ek koruma ve takip degiskenleri
        self.mode = "neutral" # neutral, long, short
        self.upper_bound = 0.0
        self.lower_bound = 0.0
        self.atr_value = 0.0

    def initialize(self, current_price: float, ohlcv: list = None):
        """Grid'i baslat, ohlcv verisi ile ADX/ATR hesapla ve yon belirle"""
        if ohlcv and len(ohlcv) > max(self.ema_period, self.adx_period, self.atr_period):
            df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
            
            # Indicator hesaplama
            adx_ind = ta.trend.ADXIndicator(high=df['high'], low=df['low'], close=df['close'], window=self.adx_period)
            df['ADX'] = adx_ind.adx()
            
            atr_ind = ta.volatility.AverageTrueRange(high=df['high'], low=df['low'], close=df['close'], window=self.atr_period)
            df['ATR'] = atr_ind.average_true_range()
            
            ema_ind = ta.trend.EMAIndicator(close=df['close'], window=self.ema_period)
            df['EMA'] = ema_ind.ema_indicator()
            
            latest = df.iloc[-1]
            
            adx_val = latest.get("ADX")
            atr_val = latest.get("ATR") 
            ema_val = latest.get("EMA")
            
            adx = float(adx_val) if adx_val is not None and not pd.isna(adx_val) else 0.0
            atr = float(atr_val) if atr_val is not None and not pd.isna(atr_val) else current_price * 0.01
            ema = float(ema_val) if ema_val is not None and not pd.isna(ema_val) else current_price
            
            self.atr_value = atr
            
            if adx < self.adx_threshold:
                self.mode = "neutral"
            elif current_price > ema:
                self.mode = "long"
            else:
                self.mode = "short"
        else:
            self.mode = "neutral"
            self.atr_value = current_price * 0.01
            
        self.entry_price = current_price
        
        # Grid araligi (toplam mesafe = atr_value * atr_grid_mult * grid_count)
        # Neutral mod: fiyat merkezde, gridler asagi ve yukari dogru yayilir.
        # Long mod: gridler asagi (buy) odakli
        # Short mod: gridler yukari (sell) odakli
        grid_step = self.atr_value * self.atr_grid_mult
        
        if self.mode == "neutral":
            half_count = self.grid_count // 2
            self.lower_bound = current_price - (grid_step * half_count)
            self.upper_bound = current_price + (grid_step * (self.grid_count - half_count - 1))
        elif self.mode == "long":
            self.lower_bound = current_price - (grid_step * int(self.grid_count * 0.8))
            self.upper_bound = current_price + (grid_step * int(self.grid_count * 0.2))
        else: # short
            self.lower_bound = current_price - (grid_step * int(self.grid_count * 0.2))
            self.upper_bound = current_price + (grid_step * int(self.grid_count * 0.8))
            
        # Grid seviyeleri olustur
        self.levels = []
        step = (self.upper_bound - self.lower_bound) / max(1, self.grid_count - 1)
        for i in range(self.grid_count):
            self.levels.append(self.lower_bound + i * step)
            
        self.initialized = True
        self.last_price = current_price
        print(f"[MathGridGemini] Baslatildi: {self.mode} mod, {self.grid_count} seviye, ATR={self.atr_value:.2f}, ${self.lower_bound:.2f} — ${self.upper_bound:.2f}")

    def generate_signal(self, current_price: float) -> str | None:
        if not self.initialized:
            return None
            
        # Fail-Safe (Max Drawdown / Breakout Stop)
        breakout_dist = self.atr_value * self.breakout_atr_mult
        is_breakout_stop = False
        if self.mode in ("long", "neutral") and current_price < self.lower_bound - breakout_dist:
            is_breakout_stop = True
        elif self.mode == "short" and current_price > self.upper_bound + breakout_dist:
            is_breakout_stop = True
            
        if is_breakout_stop:
            print(f"[MathGridGemini] Breakout Stop (fiyat grid disina ters yonde asiri cikti): ${current_price:.2f}")
            self.bought.clear()
            self.realized_pnl = 0
            self.initialized = False
            return "stop_loss"
            
        total_inv = len(self.bought) * self.per_grid_usdt
        # Dinamik PnL hesabi
        unrealized_pnl = 0
        for i in self.bought:
            if i < len(self.levels) - 1:
                if self.mode == "short":
                    entry_price = self.levels[i + 1]
                    unrealized_pnl += (entry_price - current_price) / entry_price * self.per_grid_usdt
                else:
                    entry_price = self.levels[i]
                    unrealized_pnl += (current_price - entry_price) / entry_price * self.per_grid_usdt
                
        total_pnl = self.realized_pnl + unrealized_pnl
        
        if total_inv > 0:
            pnl_pct = total_pnl / total_inv
            if pnl_pct >= self.target_pnl_pct:
                print(f"[MathGridGemini] Take Profit (hedef PnL ulasildi): ${total_pnl:.2f}")
                self.bought.clear()
                self.realized_pnl = 0
                self.initialized = False # Sonraki cycle'da yeniden hesaplamasi icin kapanir
                return "take_profit"
            if pnl_pct <= -self.max_drawdown_pct:
                print(f"[MathGridGemini] Stop Loss (Maks Drawdown): ${total_pnl:.2f}")
                self.bought.clear()
                self.realized_pnl = 0
                self.initialized = False
                return "stop_loss"
        
        # Grid Islem Mantigi
        # Long/Neutral mode: Buy low, sell high
        # Short mode: Sell high, buy low
        signal = None
        for i in range(len(self.levels) - 1):
            buy_level  = self.levels[i]
            sell_level = self.levels[i + 1]

            if self.mode in ("long", "neutral"):
                if self.last_price > buy_level and current_price <= buy_level and i not in self.bought:
                    self.bought.add(i)
                    signal = "buy"
                    break
                elif self.last_price < sell_level and current_price >= sell_level and i in self.bought:
                    self.bought.discard(i)
                    gross = self.per_grid_usdt * (sell_level - buy_level) / buy_level
                    fee   = self.per_grid_usdt * (self.maker_fee_pct + self.taker_fee_pct)
                    self.realized_pnl += gross - fee
                    signal = "sell"
                    break
            
            elif self.mode == "short":
                # In short mode, we OPEN short at sell_level and CLOSE short at buy_level
                if self.last_price < sell_level and current_price >= sell_level and i not in self.bought:
                    self.bought.add(i)
                    signal = "sell" # Open short
                    break
                elif self.last_price > buy_level and current_price <= buy_level and i in self.bought:
                    self.bought.discard(i)
                    gross = self.per_grid_usdt * (sell_level - buy_level) / sell_level
                    fee   = self.per_grid_usdt * (self.maker_fee_pct + self.taker_fee_pct)
                    self.realized_pnl += gross - fee
                    signal = "buy" # Close short
                    break

        self.last_price = current_price
        return signal
        
    def status(self) -> dict:
        if not self.initialized:
            return {"initialized": False}
        return {
            "initialized": True,
            "mode": self.mode,
            "levels": len(self.levels),
            "active_positions": len(self.bought),
            "entry_price": self.entry_price,
            "lower": self.levels[0] if self.levels else 0,
            "upper": self.levels[-1] if self.levels else 0,
            "invested_usdt": len(self.bought) * self.per_grid_usdt,
            "realized_pnl": round(self.realized_pnl, 4),
        }
