[Skip to main content](https://www.mexc.com/api-docs/futures/websocket-api/get-a-single-ticker#__docusaurus_skipToContent_fallback "Skip to main content")

[![MEXC Logo](https://static.mocortech.com/image-host/web/common/logo/logo-text-horizontal-dark.svg)](https://www.mexc.com/ "https://www.mexc.com/")[SpotV3](https://www.mexc.com/api-docs/spot-v3/introduction "SpotV3") [Futures](https://www.mexc.com/api-docs/futures/update-log "Futures") [Broker](https://www.mexc.com/api-docs/broker/mexc-broker-introduction "Broker")

[English](https://www.mexc.com/api-docs/futures/websocket-api/get-a-single-ticker# "English")

- [English](https://www.mexc.com/api-docs/futures/websocket-api/get-a-single-ticker "English")
- [中文](https://www.mexc.com/zh-MY/api-docs/futures/websocket-api/get-a-single-ticker "中文")

- [Update log](https://www.mexc.com/api-docs/futures/update-log "Update log")
- [Integration Guide](https://www.mexc.com/api-docs/futures/integration-guide "Integration Guide")
- [Internationalization Support](https://www.mexc.com/api-docs/futures/error-code "Internationalization Support")
- [Market Endpoints](https://www.mexc.com/api-docs/futures/market-endpoints/ "Market Endpoints")

- [Account and Trading Endpoints](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/ "Account and Trading Endpoints")

- [WebSocket API](https://www.mexc.com/api-docs/futures/websocket-api/ "WebSocket API")

  - [Native ws endpoint](https://www.mexc.com/api-docs/futures/websocket-api/native-ws-endpoint "Native ws endpoint")
  - [Command details for data exchange](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange "Command details for data exchange")
  - [Subscription filtering](https://www.mexc.com/api-docs/futures/websocket-api/subscription-filtering "Subscription filtering")
  - [Public channels](https://www.mexc.com/api-docs/futures/websocket-api/get-a-single-ticker# "Public channels")

    - [Tickers](https://www.mexc.com/api-docs/futures/websocket-api/tickers "Tickers")
    - [Get a single ticker](https://www.mexc.com/api-docs/futures/websocket-api/get-a-single-ticker "Get a single ticker")
    - [Deal](https://www.mexc.com/api-docs/futures/websocket-api/deal "Deal")
    - [Order book depth](https://www.mexc.com/api-docs/futures/websocket-api/order-book-depth "Order book depth")
    - [Depth — specify minimum notional step](https://www.mexc.com/api-docs/futures/websocket-api/depth-specify-minimum-notional-step "Depth — specify minimum notional step")
    - [K-line data](https://www.mexc.com/api-docs/futures/websocket-api/k-line-data "K-line data")
    - [Funding rate](https://www.mexc.com/api-docs/futures/websocket-api/funding-rate "Funding rate")
    - [Index price](https://www.mexc.com/api-docs/futures/websocket-api/index-price "Index price")
    - [Fair price](https://www.mexc.com/api-docs/futures/websocket-api/fair-price "Fair price")
    - [Contract data](https://www.mexc.com/api-docs/futures/websocket-api/contract-data "Contract data")
    - [Event contracts](https://www.mexc.com/api-docs/futures/websocket-api/event-contracts "Event contracts")
  - [Private channels](https://www.mexc.com/api-docs/futures/websocket-api/get-a-single-ticker# "Private channels")

  - [Incremental Order Book Maintenance Mechanism](https://www.mexc.com/api-docs/futures/websocket-api/incremental-order-book-maintenance-mechanism "Incremental Order Book Maintenance Mechanism")
  - [ENUM definitions](https://www.mexc.com/api-docs/futures/websocket-api/enum-definitions "ENUM definitions")

# Get a single ticker

> Subscribe

```json
{
  "method": "sub.ticker",
  "param": {
    "symbol": "BTC_USDT"
  }
}
```

> Unsubscribe

```json
{
  "method": "unsub.ticker",
  "param": {
    "symbol": "BTC_USDT"
  }
}
```

> Sample data

```json
{
  "channel": "push.ticker",
  "data": {
    "ask1": 6866.5,
    "bid1": 6865,
    "contractId": 1,
    "fairPrice": 6867.4,
    "fundingRate": 0.0008,
    "high24Price": 7223.5,
    "indexPrice": 6861.6,
    "lastPrice": 6865.5,
    "lower24Price": 6756,
    "maxBidPrice": 7073.42,
    "minAskPrice": 6661.37,
    "riseFallRate": -0.0424,
    "riseFallValue": -304.5,
    "symbol": "BTC_USDT",
    "timestamp": 1587442022003,
    "holdVol": 2284742,
    "volume24": 164586129
  },
  "symbol": "BTC_USDT"
}
```

Get latest price, best bid/ask, and 24h volume for a given contract. No login required. Pushes every 1s when trades occur.

**Response fields:**

| Field | Type | Description |
| --- | --- | --- |
| symbol | string | Contract |
| timestamp | long | Trade time |
| lastPrice | decimal | Last price |
| bid1 | decimal | Best bid |
| ask1 | decimal | Best ask |
| holdVol | decimal | Open interest |
| fundingRate | decimal | Funding rate |
| riseFallRate | decimal | Change rate |
| riseFallValue | decimal | Change amount |
| volume24 | decimal | 24h volume (contracts) |
| amount24 | decimal | 24h turnover (currency) |
| fairPrice | decimal | Fair price |
| indexPrice | decimal | Index price |
| maxBidPrice | decimal | Max buy price |
| minAskPrice | decimal | Min sell price |
| lower24Price | decimal | 24h low |
| high24Price | decimal | 24h high |

[Previous\\
\\
Tickers](https://www.mexc.com/api-docs/futures/websocket-api/tickers "PreviousTickers") [Next\\
\\
Deal](https://www.mexc.com/api-docs/futures/websocket-api/deal "NextDeal")