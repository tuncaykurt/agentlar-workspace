[Skip to main content](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/place-tpsl-order-by-position#__docusaurus_skipToContent_fallback "Skip to main content")

> Response Example

```json
{
  "success": false,
  "code": 0,
  "message": "",
  "data": [\
    {\
      "id": 0,\
      "symbol": "",\
      "leverage": 0,\
      "side": 0,\
      "triggerPrice": 0.0,\
      "price": 0.0,\
      "vol": 0.0,\
      "openType": 0,\
      "triggerType": 0,\
      "state": 0,\
      "executeCycle": 0,\
      "trend": 0,\
      "orderType": 0,\
      "orderId": 0,\
      "errorCode": 0,\
      "createTime": "",\
      "updateTime": ""\
    }\
  ]
}
```

- **POST**`/api/v1/private/stoporder/place`

**Required Permission:** Order Placing

**Request Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| lossTrend | int | true | Stop-loss type: 1 latest price 2 fair price 3 index price |
| profitTrend | int | true | Take-profit type: 1 latest price 2 fair price 3 index price |
| positionId | long | true | Position id |
| vol | decimal | true | Order quantity; must be within the allowed range for the contract; the order quantity plus existing TP/SL order quantity must be less than the closable quantity; position quantity will not be frozen, but checks are required |
| stopLossPrice | decimal | false | Stop-loss price; at least one of stop-loss or take-profit must be non-empty and greater than 0 |
| takeProfitPrice | decimal | false | Take-profit price; at least one of stop-loss or take-profit must be non-empty and greater than 0 |
| priceProtect | int | false | Trigger protection: "1","0" |
| profitLossVolType | string | false | TP/SL quantity type (SAME: same quantity; SEPARATE: different quantities) |
| takeProfitVol | decimal | false | Take-profit quantity (when profitLossVolType == SEPARATE) |
| stopLossVol | decimal | false | Stop-loss quantity (when profitLossVolType == SEPARATE) |
| volType | int | false | Quantity type 1: partial TP/SL 2: position TP/SL |
| takeProfitReverse | int | false | Take-profit reverse: 1 yes 2 no |
| stopLossReverse | int | false | Stop-loss reverse: 1 yes 2 no |
| mtoken | string | false | Web device id |
| takeProfitType | int | false | Take-profit type 0 - market TP 1 - limit TP |
| takeProfitOrderPrice | decimal | true | Limit TP order price |
| stopLossType | long | true | Stop-loss type 0 - market SL 1 - limit SL |
| stopLossOrderPrice | decimal | true | Limit SL order price |

**Response Parameters:**

On success, success = true, data is the order id; on failure, success = false, data = null. If there is a non-final TP/SL order with the same price, the previous id is returned and the previous order quantity is updated asynchronously.