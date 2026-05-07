"""
Kripto haber servisi — CryptoPanic API + RSS fallback
CryptoPanic: https://cryptopanic.com/developers/api/
Ücretsiz: 200 istek/saat, son haberler
"""
import httpx
from datetime import datetime
from core.config import settings


async def summarize_news_turkish(title: str, url: str) -> dict:
    """
    Haberin basligini ve URL'ini alip Turkce ozet + sentiment analizi yapar.
    DeepSeek (ucuz) kullanir.
    """
    from ai.openrouter import _call, FAST_MODEL

    prompt = f"""Asagidaki kripto haberi icin Turkce ozet ve piyasa etkisi analizi yap.

Baslik: {title}
URL: {url}

JSON formatinda cevap ver:
{{
  "title_tr": "Haberin Turkce basligi",
  "summary": "2-3 cumlede Turkce ozet",
  "sentiment": "bullish/bearish/neutral",
  "impact": "high/medium/low",
  "affected_coins": ["BTC", "ETH"],
  "trading_note": "Trader icin 1 cumlelik not (Turkce)"
}}"""

    try:
        result = await _call(FAST_MODEL, prompt, max_tokens=400)
        return result
    except Exception as e:
        return {
            "title_tr": title,
            "summary": "Ozet alinamadi",
            "sentiment": "neutral",
            "impact": "low",
            "affected_coins": [],
            "trading_note": str(e),
        }


async def fetch_crypto_news(
    currency: str = "",
    kind: str = "news",       # news, media, all
    limit: int = 30,
) -> list[dict]:
    """
    CryptoPanic API'den kripto haberleri çek.
    API key yoksa RSS fallback kullanır.
    """
    api_key = settings.CRYPTOPANIC_API_KEY

    if api_key:
        return await _fetch_cryptopanic(api_key, currency, kind, limit)

    # Fallback: CoinGecko status + CoinTelegraph RSS proxy
    return await _fetch_rss_fallback(limit)


async def _fetch_cryptopanic(
    api_key: str,
    currency: str,
    kind: str,
    limit: int,
) -> list[dict]:
    url = "https://cryptopanic.com/api/free/v1/posts/"
    params = {
        "auth_token": api_key,
        "kind": kind,
        "public": "true",
    }
    if currency:
        params["currencies"] = currency

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    results = []
    for post in (data.get("results") or [])[:limit]:
        currencies = [c.get("code", "") for c in (post.get("currencies") or [])]
        results.append({
            "id": post.get("id"),
            "title": post.get("title", ""),
            "url": post.get("url", ""),
            "source": post.get("source", {}).get("title", ""),
            "published_at": post.get("published_at", ""),
            "currencies": currencies,
            "kind": post.get("kind", "news"),
            "votes": {
                "positive": post.get("votes", {}).get("positive", 0),
                "negative": post.get("votes", {}).get("negative", 0),
                "important": post.get("votes", {}).get("important", 0),
            },
            "sentiment": _calc_sentiment(post),
        })

    return results


def _calc_sentiment(post: dict) -> str:
    votes = post.get("votes", {})
    pos = votes.get("positive", 0)
    neg = votes.get("negative", 0)
    if pos > neg + 2:
        return "bullish"
    elif neg > pos + 2:
        return "bearish"
    return "neutral"


async def _fetch_rss_fallback(limit: int) -> list[dict]:
    """API key yoksa basit RSS/Atom feed'lerden çek."""
    feeds = [
        "https://cointelegraph.com/rss",
        "https://coindesk.com/arc/outboundfeeds/rss/",
    ]
    results = []

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        for feed_url in feeds:
            try:
                resp = await client.get(feed_url)
                if resp.status_code != 200:
                    continue
                text = resp.text
                # Basit XML parse (harici kütüphane gerektirmez)
                items = _parse_rss_items(text, feed_url)
                results.extend(items)
            except Exception as e:
                print(f"[CryptoNews] RSS fetch error ({feed_url}): {e}")

    # Tarihe göre sırala, son haberler önce
    results.sort(key=lambda x: x.get("published_at", ""), reverse=True)
    return results[:limit]


def _parse_rss_items(xml_text: str, source_url: str) -> list[dict]:
    """Minimal RSS XML parser — sadece title, link, pubDate çeker."""
    import re
    items = []
    source_name = "CoinTelegraph" if "cointelegraph" in source_url else "CoinDesk"

    # <item>...</item> blokları bul
    item_pattern = re.compile(r"<item>(.*?)</item>", re.DOTALL)
    title_pattern = re.compile(r"<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)</title>")
    link_pattern = re.compile(r"<link>(.*?)</link>")
    date_pattern = re.compile(r"<pubDate>(.*?)</pubDate>")

    for match in item_pattern.finditer(xml_text):
        block = match.group(1)

        title_match = title_pattern.search(block)
        title = (title_match.group(1) or title_match.group(2) or "").strip() if title_match else ""

        link_match = link_pattern.search(block)
        link = link_match.group(1).strip() if link_match else ""

        date_match = date_pattern.search(block)
        pub_date = date_match.group(1).strip() if date_match else ""

        if title:
            items.append({
                "id": hash(link or title),
                "title": title,
                "url": link,
                "source": source_name,
                "published_at": pub_date,
                "currencies": [],
                "kind": "news",
                "votes": {"positive": 0, "negative": 0, "important": 0},
                "sentiment": "neutral",
            })

    return items
