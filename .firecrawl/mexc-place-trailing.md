[Skip to main content](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/place-trailing-order#__docusaurus_skipToContent_fallback "Skip to main content")

> Response Example

```json
{
  "success": true,
  "code": 0,
  "data": "739218627261666816"
}
```

- **POST**`/api/v1/private/trackorder/place`

**Required Permission:** Order Placing

**Request Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| symbol | string | true | Contract name |
| leverage | int | true | Leverage |
| side | int | true | 1 Open Long; 2 Close Short; 3 Open Short; 4 Close Long |
| vol | decimal | true | Order quantity |
| openType | int | true | Position mode: 1 Isolated; 2 Cross |
| trend | int | true | Price type: 1 Latest; 2 Fair; 3 Index |
| activePrice | decimal | false | Activation price |
| backType | int | true | Callback type: 1 Percentage; 2 Absolute value |
| backValue | decimal | true | Callback value |
| positionMode | int | true | Position mode. Default 0: no record for historical orders; 1: Two-way (hedged); 2: One-way |
| reduceOnly | boolean | false | Reduce-only |

**Response Parameters:**

Common parameters; success: true for success, false for failure