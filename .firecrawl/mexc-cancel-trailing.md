[Skip to main content](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/cancel-trailing-order#__docusaurus_skipToContent_fallback "Skip to main content")

> Response Example

```json
{
  "success": true,
  "code": 0
}
```

- **POST**`/api/v1/private/trackorder/cancel`

**Required Permission:** Order Placing

**Request Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| symbol | string | false | Contract name |
| trackOrderId | int | false | Trailing order ID |

**Response Parameters:**

Common parameters; success: true for success, false for failure