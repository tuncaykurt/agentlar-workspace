[Skip to main content](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange#__docusaurus_skipToContent_fallback "Skip to main content")

[![MEXC Logo](https://static.mocortech.com/image-host/web/common/logo/logo-text-horizontal-dark.svg)](https://www.mexc.com/ "https://www.mexc.com/")[SpotV3](https://www.mexc.com/api-docs/spot-v3/introduction "SpotV3") [Futures](https://www.mexc.com/api-docs/futures/update-log "Futures") [Broker](https://www.mexc.com/api-docs/broker/mexc-broker-introduction "Broker")

[English](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange# "English")

- [English](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange "English")
- [中文](https://www.mexc.com/zh-MY/api-docs/futures/websocket-api/command-details-for-data-exchange "中文")

- [Update log](https://www.mexc.com/api-docs/futures/update-log "Update log")
- [Integration Guide](https://www.mexc.com/api-docs/futures/integration-guide "Integration Guide")
- [Internationalization Support](https://www.mexc.com/api-docs/futures/error-code "Internationalization Support")
- [Market Endpoints](https://www.mexc.com/api-docs/futures/market-endpoints/ "Market Endpoints")

- [Account and Trading Endpoints](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/ "Account and Trading Endpoints")

- [WebSocket API](https://www.mexc.com/api-docs/futures/websocket-api/ "WebSocket API")

  - [Native ws endpoint](https://www.mexc.com/api-docs/futures/websocket-api/native-ws-endpoint "Native ws endpoint")
  - [Command details for data exchange](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange "Command details for data exchange")
  - [Subscription filtering](https://www.mexc.com/api-docs/futures/websocket-api/subscription-filtering "Subscription filtering")
  - [Public channels](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange# "Public channels")

  - [Private channels](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange# "Private channels")

  - [Incremental Order Book Maintenance Mechanism](https://www.mexc.com/api-docs/futures/websocket-api/incremental-order-book-maintenance-mechanism "Incremental Order Book Maintenance Mechanism")
  - [ENUM definitions](https://www.mexc.com/api-docs/futures/websocket-api/enum-definitions "ENUM definitions")

# Command details for data exchange

> Send ping

```json
{
  "method": "ping"
}
```

> Server response

```json
{
  "channel": "pong",
  "data": 1587453241453
}
```

Subscribe/unsubscribe command list (except personal/private commands, all others do **not** require WS auth).

If no ping is received from the client within 1 minute, the connection will be closed. Send a ping every 10–20 seconds.

[Previous\\
\\
Native ws endpoint](https://www.mexc.com/api-docs/futures/websocket-api/native-ws-endpoint "PreviousNative ws endpoint") [Next\\
\\
Subscription filtering](https://www.mexc.com/api-docs/futures/websocket-api/subscription-filtering "NextSubscription filtering")