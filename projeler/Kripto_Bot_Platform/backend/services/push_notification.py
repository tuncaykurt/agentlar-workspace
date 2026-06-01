"""
Web Push Notification Service — PWA Bildirim Gönderici
═══════════════════════════════════════════════════════
Grid botundan işlem sinyalleri geldiğinde mobil PWA'ya
native bildirim gönderir.

Akış:
1. Frontend: Kullanıcı bildirim izni verir → subscription Redis'e kaydedilir
2. Backend: Grid trade gerçekleştiğinde → push_trade_notification() çağrılır
3. PWA: Service Worker push event'i yakalar → native bildirim gösterir
"""
import json
import traceback
from core.redis_client import get_redis

# ── VAPID Anahtarları ──────────────────────────────────────────────
VAPID_PUBLIC_KEY = "BJ8TZYDjv-OHYrjJu0Y5xwEgNRfsrxdZ2sLi16Aj13PttTxfwrhtBs8j5OYkp1fIOc0qkPtMxnEr7rVNq1izPF8"
VAPID_PRIVATE_KEY = "com3y1Bjr-4hokvARZrX9UzrzaAJmLS-VGQSMEyNz6o"
VAPID_CLAIMS = {"sub": "mailto:tuncay@yapayzekaotomasyon.cloud"}

REDIS_KEY_PREFIX = "push:subscriptions:"


async def save_subscription(subscription: dict, user_id: str) -> bool:
    """Push subscription'ı Redis'e kaydet."""
    redis = get_redis()
    redis_key = f"{REDIS_KEY_PREFIX}{user_id}"
    endpoint = subscription.get("endpoint", "")
    if not endpoint:
        return False

    # Aynı endpoint varsa güncelle
    existing = await redis.lrange(redis_key, 0, -1)
    for item in existing:
        try:
            sub = json.loads(item)
            if sub.get("endpoint") == endpoint:
                # Zaten kayıtlı
                return True
        except (json.JSONDecodeError, TypeError):
            pass

    await redis.rpush(redis_key, json.dumps(subscription))
    count = await redis.llen(redis_key)
    print(f"[Push] Yeni subscription kaydedildi. Toplam: {count}")
    return True


async def remove_subscription(endpoint: str, user_id: str) -> bool:
    """Subscription'ı kaldır."""
    redis = get_redis()
    redis_key = f"{REDIS_KEY_PREFIX}{user_id}"
    existing = await redis.lrange(redis_key, 0, -1)
    for item in existing:
        try:
            sub = json.loads(item)
            if sub.get("endpoint") == endpoint:
                await redis.lrem(redis_key, 1, item)
                print(f"[Push] Subscription kaldırıldı: {endpoint[:50]}...")
                return True
        except (json.JSONDecodeError, TypeError):
            pass
    return False


async def send_push(title: str, body: str, data: dict = None, tag: str = "trade", user_id: str = "default"):
    """Sadece ilgili kullanıcının abonelerine push bildirim gönder."""
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("[Push] pywebpush yüklü değil, bildirim gönderilemedi.")
        return

    redis = get_redis()
    redis_key = f"{REDIS_KEY_PREFIX}{user_id}"
    subs_raw = await redis.lrange(redis_key, 0, -1)
    print(f"[Push] user_id={user_id} key={redis_key} subscription_count={len(subs_raw) if subs_raw else 0}")
    if not subs_raw:
        print(f"[Push] Subscription bulunamadı, bildirim gönderilemedi. user_id={user_id}")
        return

    payload = json.dumps({
        "title": title,
        "body": body,
        "tag": tag,
        "data": data or {},
    })

    dead_endpoints = []

    import asyncio

    def _send_sync(sub_info, data):
        """Senkron webpush çağrısı — thread'de çalıştırılır."""
        webpush(
            subscription_info=sub_info,
            data=data,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS,
        )

    for sub_raw in subs_raw:
        try:
            sub = json.loads(sub_raw)
            await asyncio.to_thread(_send_sync, sub, payload)
            print(f"[Push] Bildirim gönderildi: {sub.get('endpoint', '')[:60]}...")
        except Exception as e:
            err_str = str(e)
            # 404/410 = subscription expired/invalid
            if "404" in err_str or "410" in err_str or "Gone" in err_str:
                dead_endpoints.append(sub.get("endpoint", ""))
            else:
                print(f"[Push] Gönderim hatası: {err_str[:200]}")

    # Geçersiz subscription'ları temizle
    for ep in dead_endpoints:
        await remove_subscription(ep, user_id)
        print(f"[Push] Geçersiz subscription temizlendi: {ep[:50]}...")


async def push_trade_notification(trade: dict, user_id: str = "default"):
    """Grid trade gerçekleştiğinde ilgili kullanıcıya bildirim gönder."""
    side = trade.get("side", "buy").upper()
    pnl = trade.get("pnl", 0)
    price = trade.get("price", 0)
    symbol = trade.get("symbol", "")
    level_count = trade.get("level_count", 1)
    mode = trade.get("mode", "paper")
    leverage = trade.get("leverage", 0)
    margin_per_level = trade.get("margin_per_level", 0)
    grid_mode = trade.get("grid_mode", "manual")
    direction = trade.get("direction", "long")

    # Symbol'den coin adını çıkar: "BTCUSDT" → "BTC", "ETH/USDT:USDT" → "ETH"
    coin = symbol.replace("USDT", "").replace("/", "").replace(":USDT", "").strip() or "?"
    mode_label = "Paper" if mode == "paper" else "Canlı"
    strategy_map = {"manual": "Manuel", "bollinger": "BB", "hybrid": "Hibrit", "bb_direction": "BB Yön", "math_grid_gemini": "Math Grid", "trend_score": "Trend Score"}
    strategy_label = strategy_map.get(grid_mode, grid_mode)

    if pnl != 0:
        # Pozisyon kapatma (kâr/zarar)
        if pnl > 0:
            title = f"🟢 {coin} Kâr Alındı: +${abs(pnl):.4f}"
        else:
            title = f"🔴 {coin} Zarar Kapandı: -${abs(pnl):.4f}"
        body = f"{side} {level_count} kademe kapandı\nFiyat: ${price:,.2f} | {mode_label}"
    else:
        # Pozisyon açma — detaylı bilgi
        dir_label = "LONG" if side == "BUY" else "SHORT"
        emoji = "📈" if side == "BUY" else "📉"
        title = f"{emoji} {coin} {dir_label} Pozisyon Açıldı"
        lines = [f"{level_count} kademe @ ${price:,.2f} | {mode_label}"]
        if leverage:
            lines.append(f"Kaldıraç: {leverage}x | Strateji: {strategy_label}")
        if margin_per_level:
            lines.append(f"Kademe başı: ${margin_per_level:.2f} | Yön: {direction.upper()}")
        body = "\n".join(lines)

    await send_push(title, body, data={"url": "/hft"}, tag=f"trade-{side}", user_id=user_id)


async def push_grid_event(event: str, details: str = "", user_id: str = "default"):
    """Grid lifecycle event bildirimi (başlama, durma, sinyal) ilgili kullanıcıya gönder."""
    events = {
        "grid_start": ("🚀 Grid Bot Başlatıldı", details or "Bot aktif, işlemler başlıyor."),
        "grid_stop": ("⏹️ Grid Bot Durduruldu", details or "Bot durduruldu."),
        "signal_long": ("📈 LONG Yönü Algılandı", details or "Fiyat orta çizgiyi yukarı kesti, alım yönü aktif."),
        "signal_short": ("📉 SHORT Yönü Algılandı", details or "Fiyat orta çizgiyi aşağı kesti, satış yönü aktif."),
        "band_exit": ("🔔 Bant Dışına Çıkış", details or "Fiyat Bollinger bandını aştı, grid yeniden kurulacak."),
        "waiting": ("⏳ Sinyal Bekleniyor", details or "Uygun giriş noktası aranıyor."),
    }

    title, body = events.get(event, ("📢 Grid Bildirimi", details or event))
    await send_push(title, body, data={"url": "/hft"}, tag=f"grid-{event}", user_id=user_id)
