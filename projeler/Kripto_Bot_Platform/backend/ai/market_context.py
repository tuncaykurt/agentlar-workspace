"""
Piyasa Bağlamı Toplayıcı
- Fear & Greed Index (alternative.me - ücretsiz)
- BTC Dominance (CoinGecko - ücretsiz)
- Liquidation verileri (Binance public + CoinGlass opsiyonel)
- Order Book analizi (Bitget)
- Çoklu zaman dilimi analizi
- Whale hareketi tespiti
- Haber/Sentiment (CryptoPanic - ücretsiz API key)
"""
import httpx
import asyncio
from ai.indicators import calculate_all, generate_signal
from core.config import settings


# ─── Fear & Greed Index ───────────────────────────────────────────────────────

async def get_fear_greed() -> dict:
    """
    0-25: Aşırı Korku (alım fırsatı)
    26-45: Korku
    46-55: Nötr
    56-75: Açgözlülük
    76-100: Aşırı Açgözlülük (satım sinyali)
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://api.alternative.me/fng/?limit=2")
            data = r.json()["data"]
            current = data[0]
            yesterday = data[1]
            return {
                "value": int(current["value"]),
                "label": current["value_classification"],
                "yesterday": int(yesterday["value"]),
                "change": int(current["value"]) - int(yesterday["value"]),
                "signal": _fg_signal(int(current["value"])),
            }
    except Exception as e:
        return {"value": 50, "label": "Neutral", "yesterday": 50, "change": 0, "signal": "neutral", "error": str(e)}


def _fg_signal(value: int) -> str:
    if value <= 25: return "extreme_fear"    # Güçlü alım fırsatı
    if value <= 45: return "fear"            # Alım eğilimi
    if value <= 55: return "neutral"
    if value <= 75: return "greed"           # Satım eğilimi
    return "extreme_greed"                   # Güçlü satım sinyali


# ─── BTC Dominance ───────────────────────────────────────────────────────────

async def get_btc_dominance() -> dict:
    """BTC dominance düşüyorsa altcoin sezonu, yükseliyorsa BTC güçlü."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.coingecko.com/api/v3/global",
                headers={"accept": "application/json"}
            )
            data = r.json()["data"]
            dom = data["market_cap_percentage"]["btc"]
            return {
                "btc_dominance": round(dom, 2),
                "signal": "btc_strong" if dom > 55 else "altseason" if dom < 45 else "neutral",
            }
    except Exception as e:
        return {"btc_dominance": 50, "signal": "neutral", "error": str(e)}


# ─── Order Book Analizi ───────────────────────────────────────────────────────

async def get_order_book_pressure(exchange, symbol: str) -> dict:
    """
    Order book'taki alış/satış baskısını hesapla.
    Güçlü alış duvarı → fiyat destekleniyor
    Güçlü satış duvarı → fiyat baskı altında
    """
    try:
        ob = await exchange.exchange.fetch_order_book(symbol, limit=20)
        bids = ob["bids"]  # [[fiyat, miktar], ...]
        asks = ob["asks"]

        bid_volume = sum(b[0] * b[1] for b in bids)
        ask_volume = sum(a[0] * a[1] for a in asks)
        total = bid_volume + ask_volume

        ratio = bid_volume / total if total > 0 else 0.5

        return {
            "bid_volume": round(bid_volume, 2),
            "ask_volume": round(ask_volume, 2),
            "ratio": round(ratio, 3),
            "signal": "buy_pressure" if ratio > 0.6 else "sell_pressure" if ratio < 0.4 else "balanced",
            "best_bid": bids[0][0] if bids else 0,
            "best_ask": asks[0][0] if asks else 0,
            "spread": round(asks[0][0] - bids[0][0], 4) if asks and bids else 0,
        }
    except Exception as e:
        return {"ratio": 0.5, "signal": "balanced", "error": str(e)}


# ─── Whale Hareketi Tespiti ───────────────────────────────────────────────────

async def detect_whale_activity(exchange, symbol: str) -> dict:
    """
    Son işlemlerdeki büyük emirleri tespit et.
    Büyük alım → whale accumulation
    Büyük satım → whale distribution
    """
    try:
        trades = await exchange.exchange.fetch_trades(symbol, limit=100)
        if not trades:
            return {"whale_detected": False, "signal": "neutral"}

        # Ortalama işlem büyüklüğü
        sizes = [t["cost"] for t in trades if t.get("cost")]
        if not sizes:
            return {"whale_detected": False, "signal": "neutral"}

        avg_size = sum(sizes) / len(sizes)
        whale_threshold = avg_size * 10  # Ortalamanın 10 katı = whale

        whale_buys  = [t for t in trades if t.get("side") == "buy"  and t.get("cost", 0) > whale_threshold]
        whale_sells = [t for t in trades if t.get("side") == "sell" and t.get("cost", 0) > whale_threshold]

        whale_buy_vol  = sum(t["cost"] for t in whale_buys)
        whale_sell_vol = sum(t["cost"] for t in whale_sells)

        signal = "neutral"
        if whale_buy_vol > whale_sell_vol * 1.5:
            signal = "whale_buying"
        elif whale_sell_vol > whale_buy_vol * 1.5:
            signal = "whale_selling"

        return {
            "whale_detected": len(whale_buys) + len(whale_sells) > 0,
            "whale_buys": len(whale_buys),
            "whale_sells": len(whale_sells),
            "whale_buy_volume": round(whale_buy_vol, 2),
            "whale_sell_volume": round(whale_sell_vol, 2),
            "signal": signal,
        }
    except Exception as e:
        return {"whale_detected": False, "signal": "neutral", "error": str(e)}


# ─── Çoklu Zaman Dilimi Analizi ───────────────────────────────────────────────

async def multi_timeframe_analysis(exchange, symbol: str) -> dict:
    """
    4s, 1s, 15d zaman dilimlerinde trend analizi.
    3 zaman dilimi aynı yöndeyse → çok güçlü sinyal.
    """
    timeframes = {
        "4h":  {"tf": "4h",  "limit": 60},
        "1h":  {"tf": "1h",  "limit": 100},
        "15m": {"tf": "15m", "limit": 100},
    }

    results = {}
    for name, cfg in timeframes.items():
        try:
            ohlcv = await exchange.get_ohlcv(symbol, cfg["tf"], cfg["limit"])
            ind = calculate_all(ohlcv)
            signal = generate_signal(ind)
            trend = "up" if ind.get("ema9", 0) > ind.get("ema21", 0) else "down"
            results[name] = {
                "signal": signal,
                "trend": trend,
                "rsi": ind.get("rsi"),
                "ema9": ind.get("ema9"),
                "ema21": ind.get("ema21"),
                "macd_hist": ind.get("macd_hist"),
            }
        except Exception as e:
            results[name] = {"signal": None, "trend": "unknown", "error": str(e)}

    # Confluence skoru — kaç zaman dilimi aynı yönde
    signals = [r.get("signal") for r in results.values() if r.get("signal")]
    trends  = [r.get("trend") for r in results.values()]

    buy_count  = signals.count("buy")
    sell_count = signals.count("sell")
    up_count   = trends.count("up")
    down_count = trends.count("down")

    confluence = "strong_buy"  if buy_count >= 2 and up_count >= 2  else \
                 "strong_sell" if sell_count >= 2 and down_count >= 2 else \
                 "buy"         if buy_count >= 1 and up_count >= 2   else \
                 "sell"        if sell_count >= 1 and down_count >= 2 else \
                 "neutral"

    return {
        "timeframes": results,
        "confluence": confluence,
        "buy_count": buy_count,
        "sell_count": sell_count,
        "alignment": buy_count == 3 or sell_count == 3,  # Tam uyum
    }


# ─── Haber & Sentiment Analizi ───────────────────────────────────────────────

async def get_news_sentiment(symbol: str) -> dict:
    """
    Ücretsiz RSS feed'lerinden kripto haberleri (API key gerekmez).
    Kaynaklar: CoinTelegraph, Decrypt, CoinDesk
    Pozitif/negatif anahtar kelime analizi ile sentiment skoru.
    """
    coin = symbol.split("/")[0].replace(":USDT", "").upper()
    coin_lower = coin.lower()

    # Coin adı eşleştirme
    coin_names = {
        "BTC": ["bitcoin", "btc"],
        "ETH": ["ethereum", "eth"],
        "SOL": ["solana", "sol"],
        "BNB": ["bnb", "binance"],
        "XRP": ["xrp", "ripple"],
    }
    keywords = coin_names.get(coin, [coin_lower])

    # Ücretsiz RSS kaynakları
    rss_feeds = [
        "https://cointelegraph.com/rss",
        "https://decrypt.co/feed",
        "https://www.coindesk.com/arc/outboundfeeds/rss/",
    ]

    POSITIVE = ["surge", "rally", "bull", "pump", "gain", "rise", "high", "record", "adoption",
                "partnership", "upgrade", "buy", "growth", "yükseliş", "artış", "rekor"]
    NEGATIVE = ["crash", "dump", "bear", "fall", "drop", "hack", "ban", "sell", "fear",
                "liquidat", "plunge", "decline", "düşüş", "çöküş", "yasak"]

    all_news = []

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for feed_url in rss_feeds:
                try:
                    r = await client.get(feed_url, headers={"User-Agent": "Mozilla/5.0"})
                    text = r.text

                    # Basit XML parse — <title> taglarını çek
                    import re
                    titles = re.findall(r"<title><!\[CDATA\[(.*?)\]\]></title>|<title>(.*?)</title>", text)
                    for t in titles[:30]:
                        title = (t[0] or t[1]).strip()
                        if not title or len(title) < 10:
                            continue
                        title_lower = title.lower()
                        # Coin ile ilgili mi?
                        if any(kw in title_lower for kw in keywords):
                            sentiment = "neutral"
                            if any(p in title_lower for p in POSITIVE):
                                sentiment = "positive"
                            elif any(n in title_lower for n in NEGATIVE):
                                sentiment = "negative"
                            all_news.append({"title": title, "source": feed_url.split("/")[2], "sentiment": sentiment})
                except Exception:
                    continue

        if not all_news:
            # Coin'e özel haber bulunamazsa genel kripto haberleri
            return {"sentiment_score": 50, "signal": "neutral", "bullish_count": 0, "bearish_count": 0, "news": [], "note": f"{coin} için özel haber bulunamadı"}

        bullish = sum(1 for n in all_news if n["sentiment"] == "positive")
        bearish = sum(1 for n in all_news if n["sentiment"] == "negative")
        total = len(all_news) or 1

        score = round((bullish / total) * 100, 1)
        signal = "bullish" if score > 60 else "bearish" if score < 40 else "neutral"

        return {
            "sentiment_score": score,
            "signal": signal,
            "bullish_count": bullish,
            "bearish_count": bearish,
            "total_news": len(all_news),
            "news": all_news[:5],
        }

    except Exception as e:
        return {"sentiment_score": 50, "signal": "neutral", "news": [], "error": str(e)}


# ─── Liquidation Seviyeleri ───────────────────────────────────────────────────

async def get_liquidation_levels(symbol: str) -> dict:
    """
    Son 24 saatteki zorla tasfiye emirleri (Binance public API — key gerekmez).
    CoinGlass key varsa daha detaylı heatmap verilir.
    """
    coin = symbol.split("/")[0].replace(":USDT", "") + "USDT"

    try:
        # Binance public liquidation feed (key gerekmez)
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://fapi.binance.com/fapi/v1/allForceOrders",
                params={"symbol": coin, "limit": 200}
            )
            orders = r.json()

            if isinstance(orders, list) and orders:
                long_liqs  = [o for o in orders if o.get("side") == "SELL"]   # Long liquidated
                short_liqs = [o for o in orders if o.get("side") == "BUY"]    # Short liquidated

                long_vol   = sum(float(o.get("origQty", 0)) * float(o.get("price", 0)) for o in long_liqs)
                short_vol  = sum(float(o.get("origQty", 0)) * float(o.get("price", 0)) for o in short_liqs)
                total_vol  = long_vol + short_vol

                signal = "neutral"
                if long_vol > short_vol * 1.5:
                    signal = "longs_liquidated"   # Düşüş baskısı
                elif short_vol > long_vol * 1.5:
                    signal = "shorts_liquidated"  # Yükseliş baskısı

                # En büyük liquidation fiyatları (destek/direnç gibi)
                all_prices = sorted([float(o["price"]) for o in orders], reverse=True)
                top_levels = all_prices[:3] if len(all_prices) >= 3 else all_prices

                return {
                    "long_liq_count":  len(long_liqs),
                    "short_liq_count": len(short_liqs),
                    "long_liq_volume":  round(long_vol, 0),
                    "short_liq_volume": round(short_vol, 0),
                    "total_volume":     round(total_vol, 0),
                    "signal": signal,
                    "top_price_levels": top_levels,
                }

        return {"long_liq_count": 0, "short_liq_count": 0, "signal": "neutral", "error": "Veri yok"}

    except Exception as e:
        return {"long_liq_count": 0, "short_liq_count": 0, "signal": "neutral", "error": str(e)}


# ─── Tüm Bağlamı Topla ────────────────────────────────────────────────────────

async def collect_full_context(exchange, symbol: str) -> dict:
    """Tüm piyasa bağlamını paralel olarak topla."""
    fear_greed, btc_dom, order_book, whale, mtf, news, liquidations = await asyncio.gather(
        get_fear_greed(),
        get_btc_dominance(),
        get_order_book_pressure(exchange, symbol),
        detect_whale_activity(exchange, symbol),
        multi_timeframe_analysis(exchange, symbol),
        get_news_sentiment(symbol),
        get_liquidation_levels(symbol),
        return_exceptions=True,
    )

    def safe(x, default={}):
        return x if not isinstance(x, Exception) else default

    return {
        "fear_greed":    safe(fear_greed,    {"value": 50, "label": "Neutral", "signal": "neutral"}),
        "btc_dominance": safe(btc_dom,       {"btc_dominance": 50, "signal": "neutral"}),
        "order_book":    safe(order_book,    {"ratio": 0.5, "signal": "balanced"}),
        "whale":         safe(whale,         {"whale_detected": False, "signal": "neutral"}),
        "mtf":           safe(mtf,           {"confluence": "neutral", "alignment": False}),
        "news":          safe(news,          {"sentiment_score": 50, "signal": "neutral", "news": []}),
        "liquidations":  safe(liquidations,  {"long_liq_count": 0, "short_liq_count": 0, "signal": "neutral"}),
    }
