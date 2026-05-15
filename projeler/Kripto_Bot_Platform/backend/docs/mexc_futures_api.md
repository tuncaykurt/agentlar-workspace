# MEXC Futures Contract API V1 - Reference

Source: https://mexcdevelop.github.io/apidocs/contract_v1_en/

## Order Submission
**POST** `/api/v1/private/order/submit`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| symbol | string | Yes | Contract name (e.g. ETH_USDT) |
| price | decimal | Yes | Order price (0 for market) |
| vol | decimal | Yes | Volume (contracts) |
| leverage | int | Optional | Required for isolated margin |
| side | int | Yes | 1=open long, 2=close short, 3=open short, 4=close long |
| type | int | Yes | 1=limit, 2=post-only, 3=IOC, 4=FOK, 5=market, 6=market-to-limit |
| openType | int | Yes | 1=isolated, 2=cross |
| positionId | long | Optional | Recommended when closing |
| externalOid | string | Optional | External order ID |
| stopLossPrice | decimal | Optional | Stop-loss price |
| takeProfitPrice | decimal | Optional | Take-profit price |

## Plan Orders (Trigger Orders)
**POST** `/api/v1/private/planorder/place`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| symbol | string | Yes | Contract name |
| price | decimal | Optional | Execution price (not needed for market) |
| vol | decimal | Yes | Volume |
| leverage | int | Optional | Required for isolated margin |
| side | int | Yes | 1=open long, 2=close short, 3=open short, 4=close long |
| openType | int | Yes | 1=isolated, 2=cross |
| triggerPrice | decimal | Yes | Trigger price threshold |
| triggerType | int | Yes | 1=greater/equal, 2=less/equal |
| executeCycle | int | Yes | 1=24 hours, 2=7 days |
| orderType | int | Yes | 1=limit, 2=post-only, 3=IOC, 4=FOK, 5=market |
| trend | int | Yes | 1=latest price, 2=fair price, 3=index price |

## Stop-Limit Order Price Modification
**POST** `/api/v1/private/stoporder/change_price`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| orderId | long | Yes | The limit order ID |
| stopLossPrice | decimal | Optional | Stop-loss price (0 or empty = cancel) |
| takeProfitPrice | decimal | Optional | Take-profit price (0 or empty = cancel) |

## Stop-Limit Trigger Order Price Modification
**POST** `/api/v1/private/stoporder/change_plan_price`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| stopPlanOrderId | long | Yes | Stop-limit trigger order ID |
| stopLossPrice | decimal | Optional | At least one must be non-zero |
| takeProfitPrice | decimal | Optional | At least one must be non-zero |

## Position Endpoints

### Get Open Positions
**GET** `/api/v1/private/position/open_positions`
- `symbol` (optional)

### Change Leverage
**POST** `/api/v1/private/position/change_leverage`
- `positionId`, `leverage`, `openType` (optional), `symbol` (optional)

## Stop Orders List
**GET** `/api/v1/private/stoporder/list/orders`
- `symbol`, `is_finished`, `start_time`, `end_time`, `page_num`, `page_size`

## Cancel Plan Order
**POST** `/api/v1/private/planorder/cancel`
- List of `{symbol, orderId}`

## Cancel All Plan Orders
**POST** `/api/v1/private/planorder/cancel_all`
- `symbol` (optional)

---

## CCXT Mapping (contractPrivate methods)
| CCXT Method | API Endpoint |
|-------------|-------------|
| contractPrivatePostOrderSubmit | POST /api/v1/private/order/submit |
| contractPrivatePostPlanorderPlace | POST /api/v1/private/planorder/place (sadece giriş emirleri!) |
| contractPrivatePostStoporderPlace | POST /api/v1/private/stoporder/place (pozisyon TP/SL) |
| contractPrivatePostStoporderChangePrice | POST /api/v1/private/stoporder/change_price |
| contractPrivatePostStoporderChangePlanPrice | POST /api/v1/private/stoporder/change_plan_price |
| contractPrivateGetPositionOpenPositions | GET /api/v1/private/position/open_positions |
| contractPrivateGetStoporderListOrders | GET /api/v1/private/stoporder/list/orders |

## TP/SL Doğru Yöntem (Güncellendi: 2026-05-11)

**ÇALIŞAN YÖNTEM: `stoporder/place` (pozisyon bazlı TP/SL)**

`planorder/place` sadece giriş emirleri için çalışır (side 1,3). Pozisyon TP/SL için `stoporder/place` kullanılmalı.

### Doğru Akış:
1. Market order aç: `contractPrivatePostOrderSubmit` (TP/SL OLMADAN)
2. 1 sn bekle (pozisyon oluşsun)
3. Pozisyon ID al: `contractPrivateGetPositionOpenPositions`
   - positionType: 1=long, 2=short
4. TP/SL koy: `contractPrivatePostStoporderPlace`
   - positionId (zorunlu)
   - vol = kontrat miktarı
   - takeProfitPrice, stopLossPrice
   - profitTrend=1, lossTrend=1 (latest price)
   - stopLossType=0, takeProfitType=0 (market)
   - stopLossOrderPrice=0, takeProfitOrderPrice=0

### Test Sonuçları (6 yöntem denendi)
| Yöntem | Sonuç |
|--------|-------|
| order body takeProfitPrice/stopLossPrice | Error 5003: "The price of stop-limit order error" |
| stoporder/change_price (orderId ile) | Error 2009: "Position is nonexistent or closed" |
| CCXT create_order params | Order açılır ama TP/SL null |
| planorder/place (trigger orders) | Emir oluşur ama tetiklenmez (sadece giriş emirleri destekler) |
| String TP/SL values | Error 5003 |
| **stoporder/place (positionId ile)** | **DOĞRU YÖNTEM — pozisyona bağlı TP/SL** |

### Önemli Notlar
- `planorder/place` sadece side=1 (open long) ve side=3 (open short) destekler — KAPATMA EMRİ OLUŞTURAMAZ
- `stoporder/place` pozisyon bazlı çalışır, positionId gerektirir
- `stoporder/change_price` sadece AÇIK (unfilled) limit order'lar için çalışır
- CCXT method: `contractPrivatePostStoporderPlace`

---

## Native Trailing Stop (Güncellendi: 2026-05-15)

MEXC borsa tarafında çalışan trailing stop sistemi. Bot kapansa bile borsa takip eder.

### Trailing Order Koy
**POST** `/api/v1/private/trackorder/place`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| symbol | string | Yes | Contract name (e.g. ETH_USDT) |
| leverage | int | Yes | Leverage |
| side | int | Yes | 1=open long, 2=close short, 3=open short, 4=close long |
| vol | decimal | Yes | Order quantity (contracts) |
| openType | int | Yes | 1=isolated, 2=cross |
| trend | int | Yes | 1=latest price, 2=fair price, 3=index price |
| activePrice | decimal | No | Activation price (0 = immediately active) |
| backType | int | Yes | 1=percentage, 2=absolute value |
| backValue | decimal | Yes | Callback value (e.g. 1.0 = %1 geri cekilme) |
| positionMode | int | Yes | 1=hedge (two-way), 2=one-way |
| reduceOnly | boolean | No | Reduce-only flag |

### Trailing Order Sorgula
**GET** `/api/v1/private/trackorder/list/orders`
- states: 0=Not activated, 1=Activated, 2=Triggered OK, 3=Trigger failed, 4=Canceled

### Trailing Order Iptal
**POST** `/api/v1/private/trackorder/cancel`
- symbol, trackOrderId

### Trailing Order Guncelle
**POST** `/api/v1/private/trackorder/change_order`
- symbol, trackOrderId, trend, activePrice, backType, backValue, vol

### CCXT Mapping
| CCXT Method | API Endpoint |
|-------------|-------------|
| contractPrivatePostTrackorderPlace | POST /api/v1/private/trackorder/place |
| contractPrivatePostTrackorderCancel | POST /api/v1/private/trackorder/cancel |
| contractPrivateGetTrackorderListOrders | GET /api/v1/private/trackorder/list/orders |
| contractPrivatePostTrackorderChangeOrder | POST /api/v1/private/trackorder/change_order |

### Trailing Stop Akisi
1. Market order ac: `contractPrivatePostOrderSubmit`
2. 1-3 sn bekle (pozisyon olussum)
3. SL koy: `contractPrivatePostStoporderPlace` (sadece SL, TP yok)
4. Trailing koy: `contractPrivatePostTrackorderPlace`
   - activePrice = TP hedefi (fiyat buraya ulasinca trailing baslar)
   - backValue = geri cekilme % (ornegin 1.0 = %1)
   - side = 4 (close long) veya 2 (close short)
5. Fiyat activePrice'a ulasinca trailing aktif olur (state 0 -> 1)
6. Fiyat yukselmeye devam ettikce triggerPrice surekli yukarir
7. Fiyat triggerPrice'a duserse emir tetiklenir, pozisyon kapatilir

### Avantajlar (Client-side trailing'e gore)
- Borsa tarafinda calisir, bot restart/internet kesintisinde de aktif
- activePrice ile TP hedefi gibi kullanilabilir
- Fallback: trailing basarisizsa klasik TP konur
