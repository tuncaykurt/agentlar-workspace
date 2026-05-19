[Skip to main content](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/modify-trailing-order#__docusaurus_skipToContent_fallback "Skip to main content")

> Response Example

```json
{
  "success": true,
  "code": 0
}
```

- **POST**`/api/v1/private/trackorder/change_order`

**Required Permission:** Order Placing

**Request Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| symbol | string | true | Contract name |
| trackOrderId | long | true | Trailing order ID |
| trend | int | true | Price type: 1 Latest; 2 Fair; 3 Index |
| activePrice | decimal | false | Activation price |
| backType | int | true | Callback type: 1 Percentage; 2 Absolute value |
| backValue | decimal | true | Callback value |
| vol | decimal | true | Order quantity |

**Response Parameters:**

Common parameters; success: true for success, false for failure