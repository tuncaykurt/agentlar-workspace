[Skip to main content](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/query-trailing-orders#__docusaurus_skipToContent_fallback "Skip to main content")

> Response Example

```json
{
  "success": true,
  "code": 0,
  "data": [\
    {\
      "id": "739628779353703936",\
      "symbol": "DOGE_USDT",\
      "leverage": 2,\
      "side": 1,\
      "vol": 100,\
      "openType": 1,\
      "trend": 1,\
      "activePrice": 0,\
      "markPrice": 0.18657,\
      "backType": 1,\
      "backValue": 0.02,\
      "triggerPrice": 0.1903,\
      "orderId": 0,\
      "errorCode": 0,\
      "state": 1,\
      "createTime": 1762011642623,\
      "updateTime": 1762011642623,\
      "positionMode": 1,\
      "reduceOnly": false,\
      "triggerType": 1\
    }\
  ]
}
```

- **GET**`/api/v1/private/trackorder/list/orders`

**Required Permission:** View Order Details

**Request Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| symbol | string | false | Contract name |
| states | `List<int>` | true | Order status: 0 Not activated; 1 Activated; 2 Triggered successfully; 3 Trigger failed; 4 Canceled |
| side | int | false | 1 Open Long; 2 Close Short; 3 Open Short; 4 Close Long |
| start\_time | long | false | Unix millisecond timestamp |
| end\_time | long | false | Unix millisecond timestamp |
| pageIndex | int | false | Page index |
| pageSize | int | false | Page size |

**Response Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| id | long | Order ID |
| symbol | string | Contract name |
| leverage | int | Leverage |
| side | int | 1 Open Long; 2 Close Short; 3 Open Short; 4 Close Long |
| vol | decimal | Order quantity |
| openType | int | Position mode: 1 Isolated; 2 Cross |
| trend | int | Price type: 1 Latest; 2 Fair; 3 Index |
| activePrice | decimal | Activation price |
| markPrice | decimal | Reference price (highest or lowest after activation) |
| backType | int | Callback type: 1 Percentage; 2 Absolute value |
| backValue | decimal | Callback value |
| triggerPrice | decimal | Trigger price (updates with the reference price) |
| orderId | decimal | Order ID after trigger success |
| errorCode | decimal | Error code when trigger fails |
| state | decimal | Current trailing order state (0 Not activated; 1 Activated; 2 Executed successfully; 3 Execution failed; 4 Canceled) |
| createTime | long | Create time |
| updateTime | long | Update time |
| positionMode | int | Position mode. Default 0: no record for historical orders; 1: Two-way; 2: One-way |
| reduceOnly | boolean | Reduce-only |
| triggerType | int | Trigger condition: 1 ≥; 2 ≤ |