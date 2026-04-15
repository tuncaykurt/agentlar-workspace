from fastapi import APIRouter
from ai.indicators import calculate_all, generate_signal, volume_change_pct
from ai.openrouter import quick_filter, deep_analysis
from ai.market_context import collect_full_context
from exchange.bitget_client import bitget

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/analyze")
async def analyze(symbol: str = "BTC/USDT:USDT"):
    """Tam AI analizi — tüm veri kaynakları."""
    ohlcv   = await bitget.get_ohlcv(symbol, "1h", 100)
    ind     = calculate_all(ohlcv)
    signal  = generate_signal(ind)
    funding = await bitget.get_funding_rate(symbol)
    vol_chg = volume_change_pct(ohlcv)

    # Tüm bağlamı topla
    full_ctx = await collect_full_context(bitget, symbol)

    result = {
        "symbol":       symbol,
        "signal":       signal,
        "indicators":   ind,
        "funding_rate": funding,
        "volume_change": vol_chg,
        "market_context": full_ctx,
        "ai_filter":    None,
        "ai_analysis":  None,
    }

    if signal:
        filter_r = await quick_filter(
            symbol=symbol, side=signal,
            price=ind["close"], rsi=ind["rsi"],
            macd_hist=ind["macd_hist"],
            funding_rate=funding,
            volume_change_pct=vol_chg,
            fear_greed=full_ctx.get("fear_greed"),
            order_book=full_ctx.get("order_book"),
            mtf=full_ctx.get("mtf"),
        )
        result["ai_filter"] = filter_r

        # DeepSeek bilgi amaçlı — Claude her zaman çalışır
        analysis = await deep_analysis(
            symbol=symbol, side=signal,
            price=ind["close"], candles=ohlcv,
            indicators=ind,
            market_context={"funding_rate": funding, "volume_change": vol_chg},
            full_context=full_ctx,
        )
        result["ai_analysis"] = analysis

    return result


@router.get("/context")
async def market_context(symbol: str = "BTC/USDT:USDT"):
    """Sadece piyasa bağlamını döner (AI olmadan)."""
    ctx = await collect_full_context(bitget, symbol)
    return ctx
