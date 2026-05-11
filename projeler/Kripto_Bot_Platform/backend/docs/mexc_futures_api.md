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
| contractPrivatePostPlanorderPlace | POST /api/v1/private/planorder/place |
| contractPrivatePostStoporderChangePrice | POST /api/v1/private/stoporder/change_price |
| contractPrivatePostStoporderChangePlanPrice | POST /api/v1/private/stoporder/change_plan_price |
| contractPrivateGetPositionOpenPositions | GET /api/v1/private/position/open_positions |
| contractPrivateGetStoporderListOrders | GET /api/v1/private/stoporder/list/orders |

## TP/SL Doğru Yöntem (Test Edildi: 2026-05-11)

**ÇALIŞAN TEK YÖNTEM: `planorder/place` (trigger orders)**

Akış:
1. Market order aç: `contractPrivatePostOrderSubmit` (TP/SL OLMADAN)
2. TP trigger emri: `contractPrivatePostPlanorderPlace`
   - side=close_side (long→2, short→4)
   - triggerPrice=tp_price
   - triggerType=1 (>=) for long, 2 (<=) for short
   - executeCycle=2 (7 gün), orderType=5 (market), trend=1 (latest price)
3. SL trigger emri: `contractPrivatePostPlanorderPlace`
   - side=close_side (long→2, short→4)
   - triggerPrice=sl_price
   - triggerType=2 (<=) for long, 1 (>=) for short
   - executeCycle=2 (7 gün), orderType=5 (market), trend=1 (latest price)

### Test Sonuçları (5 yöntem denendi)
| Yöntem | Sonuç |
|--------|-------|
| order body takeProfitPrice/stopLossPrice | Error 5003: "The price of stop-limit order error" |
| stoporder/change_price (orderId ile) | Error 2009: "Position is nonexistent or closed" |
| CCXT create_order params | Order açılır ama TP/SL null |
| **planorder/place (trigger orders)** | **BAŞARILI — TP ve SL ikisi de set edildi** |
| String TP/SL values | Error 5003 |

### Önemli Notlar
- MEXC Futures API order endpoints "temporarily closed" since 2022-07-25 ama CCXT üzerinden çalışır
- Order body'deki `stopLossPrice`/`takeProfitPrice` error 5003 verir (market order'da çalışmaz)
- `changeTakeProfitStopLoss` resmi endpoint DEĞİL — CCXT'nin generate ettiği bir method
- `stoporder/change_price` sadece AÇIK (unfilled) limit order'lar için çalışır, filled market order için 2009 verir
- CCXT `create_order` params'da TP/SL gönderilse bile MEXC API tarafından sessizce yok sayılır
- **Tek güvenilir yöntem: önce order aç, sonra ayrı planorder/place ile TP ve SL trigger emirleri oluştur**
