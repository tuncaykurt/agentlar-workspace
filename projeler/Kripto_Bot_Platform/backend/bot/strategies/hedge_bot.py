"""
Hedge Bot Stratejisi — Çift Yönlü Pozisyon Yönetimi

Aynı anda LONG + SHORT açar. Kazanan taraf TP'ye vurduğunda kapatılır,
kaybeden taraf farklı modlarda yönetilebilir:

- hold_to_breakeven : Kaybeden tarafı tut, piyasa dönünce kapat
- trailing          : Kaybeden tarafa trailing stop uygula
- close_both        : Her iki tarafı da kapat (sıfır-sum, sadece komisyon)
- sl_only           : Kaybeden tarafta sadece SL çalışsın

Kâr mantığı: Kazanan TP → Kaybeden geri döner → Net kâr
Risk         : Güçlü trend → Kaybeden SL'e vurur
"""


class HedgeBotState:
    """Bot döngüsü boyunca tutulan hedge durumu."""
    IDLE       = "idle"         # Pozisyon yok, bekliyor
    OPEN_BOTH  = "open_both"    # Her iki taraf açık
    ONE_CLOSED = "one_closed"   # Bir taraf kapandı (TP/SL), diğer yönetiliyor
    COOLDOWN   = "cooldown"     # Döngü bitti, bekleme


class HedgeBotParams:
    """Hedge bot parametrelerini merkezi olarak ayrıştırır."""

    def __init__(self, params: dict):
        # ── Tetikleyici ─────────────────────────────────────────────────────
        self.trigger_mode    = params.get("trigger_mode", "on_signal")
        # on_signal: TV webhook / custom sinyal gelince
        # on_start:  bot başlayınca hemen aç
        # scheduled: belirli intervalda aç

        # ── Kaldıraç & Büyüklük ─────────────────────────────────────────────
        self.leverage           = int(params.get("leverage", 20))
        self.position_size_mode = params.get("position_size_mode", "percentage")
        # percentage: bakiyenin yüzdesiyle işlem aç
        # fixed_usdt: sabit USDT miktarıyla işlem aç
        self.position_size_pct  = float(params.get("position_size_pct", 100))
        self.position_size_usdt = float(params.get("position_size_usdt", 100))
        self.long_size_ratio    = float(params.get("long_size_ratio", 0.5))
        # 0.5 = eşit büyüklük; 0.6 = long daha büyük

        # ── TP/SL (fiyat hareketi % olarak, kaldıraçsız) ────────────────────
        self.long_tp_pct  = float(params.get("long_tp_pct",  2.0))
        self.long_sl_pct  = float(params.get("long_sl_pct",  4.0))
        self.short_tp_pct = float(params.get("short_tp_pct", 2.0))
        self.short_sl_pct = float(params.get("short_sl_pct", 4.0))

        # ── Kaybeden Taraf Yönetimi ──────────────────────────────────────────
        self.losing_side_mode = params.get("losing_side_mode", "hold_to_breakeven")
        # hold_to_breakeven : break-even'e dönene kadar tut
        # trailing          : kazanan kapanınca trailing stop aktifleşir
        # close_both        : kazanan kapanınca kaybeden de kapat
        # sl_only           : sadece SL çalışsın, müdahale yok

        self.losing_trail_pct       = float(params.get("losing_trail_pct", 1.5))
        self.breakeven_buffer_pct   = float(params.get("breakeven_buffer_pct", 0.1))
        # Kaybeden taraf breakeven + buffer % kâra geçince kapat

        # ── Yeniden Açma ────────────────────────────────────────────────────
        self.reopen_after_tp        = bool(params.get("reopen_after_tp", True))
        self.reopen_trigger         = params.get("reopen_trigger", "at_entry_price")
        # immediate: hemen yeniden aç
        # at_entry_price: fiyat başlangıca döndüğünde
        # delay: X saniye bekle
        # on_signal: yeni sinyal gelince
        self.reopen_delay_secs      = int(params.get("reopen_delay_secs", 300))
        self.max_cycles             = int(params.get("max_cycles", 5))

        # ── Fonlama Oranı Koruması ───────────────────────────────────────────
        self.funding_pause_enabled  = bool(params.get("funding_pause_enabled", False))
        self.funding_pause_threshold = float(params.get("funding_pause_threshold", 0.1))
        # Saatlik funding rate % bu değeri geçerse pozisyon açma

        # ── Genel Güvenlik ───────────────────────────────────────────────────
        self.max_loss_pct           = float(params.get("max_loss_pct", 10.0))
        # Toplam sermayenin bu % kadarı kaybedilirse tüm döngü dursun


def compute_hedge_levels(entry_price: float, params: HedgeBotParams) -> dict:
    """
    Giriş fiyatından TP/SL seviyelerini hesapla.
    Tüm % değerleri FİYAT hareketi % (kaldıraçsız).
    """
    p = entry_price
    return {
        "long": {
            "entry":  p,
            "tp":     round(p * (1 + params.long_tp_pct  / 100), 4),
            "sl":     round(p * (1 - params.long_sl_pct  / 100), 4),
            "tp_pct": params.long_tp_pct,
            "sl_pct": params.long_sl_pct,
        },
        "short": {
            "entry":  p,
            "tp":     round(p * (1 - params.short_tp_pct / 100), 4),
            "sl":     round(p * (1 + params.short_sl_pct / 100), 4),
            "tp_pct": params.short_tp_pct,
            "sl_pct": params.short_sl_pct,
        },
    }


def check_price_levels(
    current_price: float,
    levels: dict,
    active_sides: set,
) -> dict:
    """
    Mevcut fiyatı TP/SL seviyeleriyle karşılaştır.
    Döner: {long_tp, long_sl, short_tp, short_sl} → True/False
    """
    result = {side: {"tp": False, "sl": False} for side in ("long", "short")}

    if "long" in active_sides:
        lvl = levels["long"]
        if current_price >= lvl["tp"]:
            result["long"]["tp"] = True
        elif current_price <= lvl["sl"]:
            result["long"]["sl"] = True

    if "short" in active_sides:
        lvl = levels["short"]
        if current_price <= lvl["tp"]:
            result["short"]["tp"] = True
        elif current_price >= lvl["sl"]:
            result["short"]["sl"] = True

    return result


def check_losing_side_exit(
    current_price: float,
    losing_side: str,          # "long" | "short"
    entry_price: float,
    params: HedgeBotParams,
    peak_price: float = None,  # trailing için tepe/dip fiyat
) -> str | None:
    """
    Kaybeden taraf için çıkış koşulunu kontrol et.
    Döner: "breakeven" | "trailing" | None (beklemeye devam)
    """
    if params.losing_side_mode == "hold_to_breakeven":
        buf = params.breakeven_buffer_pct / 100
        if losing_side == "long"  and current_price >= entry_price * (1 + buf):
            return "breakeven"
        if losing_side == "short" and current_price <= entry_price * (1 - buf):
            return "breakeven"

    elif params.losing_side_mode == "trailing" and peak_price:
        trail = params.losing_trail_pct / 100
        if losing_side == "long":
            # Long: en yüksek fiyattan % geri çekilirse kapat
            trail_price = peak_price * (1 - trail)
            if current_price <= trail_price:
                return "trailing"
        else:
            # Short: en düşük fiyattan % yukarı çıkarsa kapat
            trail_price = peak_price * (1 + trail)
            if current_price >= trail_price:
                return "trailing"

    return None
