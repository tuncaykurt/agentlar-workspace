[Skip to main content](https://www.mexc.com/api-docs/futures/websocket-api/subscription-filtering#__docusaurus_skipToContent_fallback "Skip to main content")

> Disable default pushes

```json
{
  "subscribe": false,
  "method": "login",
  "param": {
    "apiKey": "mxU1TzSmRDW1o5AsE",
    "signature": "8c957a757ea31672eca05cb652d26bab7f46a41364adb714dda5475264aff120",
    "reqTime": "1611038237237"
  }
}
```

> Only assets

```json
{
  "method": "personal.filter",
  "param": {
    "filters": [\
      {\
        "filter": "asset"\
      }\
    ]
  }
}
```

> Only ADL level

```json
{
  "method": "personal.filter",
  "param": {
    "filters": [\
      {\
        "filter": "adl.level"\
      }\
    ]
  }
}
```

> All fills only

```json
{
  "method": "personal.filter",
  "param": {
    "filters": [\
      {\
        "filter": "order.deal",\
        "rules": []\
      }\
    ]
  }
}
```

> Or

```json
{
  "method": "personal.filter",
  "param": {
    "filters": [\
      {\
        "filter": "order.deal"\
      }\
    ]
  }
}
```

> Fills for a single contract only

```json
{
  "method": "personal.filter",
  "param": {
    "filters": [\
      {\
        "filter": "order.deal",\
        "rules": ["BTC_USDT"]\
      }\
    ]
  }
}
```

> Mixed usage

```json
{
  "method": "personal.filter",
  "param": {
    "filters": [\
      {\
        "filter": "order",\
        "rules": ["BTC_USDT"]\
      },\
      {\
        "filter": "order.deal",\
        "rules": ["EOS_USDT", "ETH_USDT", "BTC_USDT"]\
      },\
      {\
        "filter": "position",\
        "rules": ["EOS_USDT", "BTC_USDT"]\
      },\
      {\
        "filter": "asset"\
      }\
    ]
  }
}
```

After login, all personal data will be pushed by default: `order` (orders), `order.deal` (fills), `position` (positions), `plan.order` (plan orders), `stop.order` (TP/SL orders), `stop.planorder` (TP/SL plan orders), `risk.limit` (risk limits), `adl.level` (ADL level), `asset` (assets).

1. To cancel default pushes, add `"subscribe": false` to the login params (default is `true`).
2. After login, send the `personal.filter` event to filter what you need. To restore all pushes, send `{"method":"personal.filter"}` or `{"method":"personal.filter","param":{"filters":[]}}`.
3. Valid `filter` keys (fixed values; errors if incorrect): `order`, `order.deal`, `position`, `plan.order`, `stop.order`, `stop.planorder`, `risk.limit`, `adl.level`, `asset`.

`asset` and `adl.level` do not support per-symbol filtering; others can filter by a single contract.

Subsequent `filter` events overwrite previous ones.