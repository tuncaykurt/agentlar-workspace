from fastapi import APIRouter, Query
from ai.indicators import calculate_all, generate_signal, volume_change_pct, calculate_custom, list_indicators
from ai.openrouter import quick_filter, deep_analysis
from ai.market_context import collect_full_context
from ai.confluence import calculate_confluence
from exchange.exchange_factory import get_public_client, SUPPORTED_EXCHANGES
from services.data_fetcher import DataFetcher

router = APIRouter(prefix="/ai", tags=["ai"])

# Borsa başına DataFetcher cache
_fetchers: dict[str, DataFetcher] = {}


def _get_fetcher(exchange: str = "mexc") -> DataFetcher:
    if exchange not in _fetchers:
        client = get_public_client(exchange)
        _fetchers[exchange] = DataFetcher(client, exchange_name=exchange)
    return _fetchers[exchange]


def _get_client(exchange: str = "mexc"):
    return get_public_client(exchange)


@router.get("/analyze")
async def analyze(
    symbol: str = "BTC/USDT:USDT",
    exchange: str = Query(default="mexc", description="Veri kaynağı borsa"),
):
    """Tam AI analizi — tüm veri kaynakları."""
    if exchange not in SUPPORTED_EXCHANGES:
        exchange = "mexc"
    client = _get_client(exchange)

    ohlcv   = await client.fetch_ohlcv(symbol, "1h", limit=100)
    ind     = calculate_all(ohlcv)
    signal  = generate_signal(ind)

    funding = 0
    try:
        ticker = await client.fetch_ticker(symbol)
        funding = float(ticker.get("info", {}).get("fundingRate", 0))
    except Exception:
        pass

    vol_chg = volume_change_pct(ohlcv)

    # Tüm bağlamı topla — client'ı wrapper ile geçir
    class _ClientWrapper:
        def __init__(self, ex):
            self.exchange = ex
        async def get_ohlcv(self, sym, tf, limit=200):
            return await self.exchange.fetch_ohlcv(sym, tf, limit=limit)
        async def get_funding_rate(self, sym):
            try:
                t = await self.exchange.fetch_ticker(sym)
                return float(t.get("info", {}).get("fundingRate", 0))
            except Exception:
                return 0

    wrapper = _ClientWrapper(client)
    full_ctx = await collect_full_context(wrapper, symbol)

    result = {
        "symbol":       symbol,
        "exchange":     exchange,
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
async def market_context(
    symbol: str = "BTC/USDT:USDT",
    exchange: str = Query(default="mexc"),
):
    """Sadece piyasa bağlamını döner (AI olmadan)."""
    if exchange not in SUPPORTED_EXCHANGES:
        exchange = "mexc"
    client = _get_client(exchange)

    class _ClientWrapper:
        def __init__(self, ex):
            self.exchange = ex
        async def get_ohlcv(self, sym, tf, limit=200):
            return await self.exchange.fetch_ohlcv(sym, tf, limit=limit)
        async def get_funding_rate(self, sym):
            try:
                t = await self.exchange.fetch_ticker(sym)
                return float(t.get("info", {}).get("fundingRate", 0))
            except Exception:
                return 0

    wrapper = _ClientWrapper(client)
    ctx = await collect_full_context(wrapper, symbol)
    return ctx


@router.get("/confluence")
async def confluence_analysis(
    symbol: str = Query(default="BTC/USDT:USDT"),
    timeframe: str = Query(default="1h"),
    exchange: str = Query(default="mexc"),
):
    """Confluence Scoring analizi — tüm katmanlar."""
    if exchange not in SUPPORTED_EXCHANGES:
        exchange = "mexc"
    fetcher = _get_fetcher(exchange)
    client = _get_client(exchange)

    ohlcv = await fetcher.get_ohlcv(symbol, timeframe, 200)
    ind = calculate_all(ohlcv)

    class _ClientWrapper:
        def __init__(self, ex):
            self.exchange = ex
        async def get_ohlcv(self, sym, tf, limit=200):
            return await self.exchange.fetch_ohlcv(sym, tf, limit=limit)
        async def get_funding_rate(self, sym):
            try:
                t = await self.exchange.fetch_ticker(sym)
                return float(t.get("info", {}).get("fundingRate", 0))
            except Exception:
                return 0

    full_ctx = {}
    try:
        wrapper = _ClientWrapper(client)
        full_ctx = await collect_full_context(wrapper, symbol)
    except Exception:
        pass

    funding = 0
    try:
        ticker = await client.fetch_ticker(symbol)
        funding = float(ticker.get("info", {}).get("fundingRate", 0))
    except Exception:
        pass

    market_ctx = {
        "funding_rate": funding * 100,
        **full_ctx,
    }

    result = calculate_confluence(ind, market_ctx)
    result["symbol"] = symbol
    result["timeframe"] = timeframe
    result["indicators"] = ind

    return result


@router.get("/indicators/list")
async def get_indicator_list():
    """Kullanılabilir tüm indikatörleri kategorileriyle listele."""
    return list_indicators()


@router.get("/indicators/calculate")
async def calculate_indicator(
    symbol: str = Query(default="BTC/USDT:USDT"),
    timeframe: str = Query(default="1h"),
    indicator: str = Query(description="İndikatör adı (ör: supertrend, ema, rsi)"),
    length: int = Query(default=14),
    exchange: str = Query(default="mexc"),
):
    """Herhangi bir pandas-ta indikatörünü isimle hesapla."""
    if exchange not in SUPPORTED_EXCHANGES:
        exchange = "mexc"
    fetcher = _get_fetcher(exchange)
    ohlcv = await fetcher.get_ohlcv(symbol, timeframe, 200)
    result = calculate_custom(ohlcv, indicator, length=length)
    return {"symbol": symbol, "timeframe": timeframe, "indicator": indicator, "result": result}
