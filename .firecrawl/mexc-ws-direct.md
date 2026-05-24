[Skip to main content](https://www.mexc.com/api-docs/futures/websocket-api#__docusaurus_skipToContent_fallback "Skip to main content")

[![MEXC Logo](https://static.mocortech.com/image-host/web/common/logo/logo-text-horizontal-dark.svg)](https://www.mexc.com/ "https://www.mexc.com/")[SpotV3](https://www.mexc.com/api-docs/spot-v3/introduction "SpotV3") [Futures](https://www.mexc.com/api-docs/futures/update-log "Futures") [Broker](https://www.mexc.com/api-docs/broker/mexc-broker-introduction "Broker")

[English](https://www.mexc.com/api-docs/futures/websocket-api# "English")

- [English](https://www.mexc.com/api-docs/futures/websocket-api/ "English")
- [中文](https://www.mexc.com/zh-MY/api-docs/futures/websocket-api/ "中文")

- [Update log](https://www.mexc.com/api-docs/futures/update-log "Update log")
- [Integration Guide](https://www.mexc.com/api-docs/futures/integration-guide "Integration Guide")
- [Internationalization Support](https://www.mexc.com/api-docs/futures/error-code "Internationalization Support")
- [Market Endpoints](https://www.mexc.com/api-docs/futures/market-endpoints/ "Market Endpoints")

- [Account and Trading Endpoints](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/ "Account and Trading Endpoints")

- [WebSocket API](https://www.mexc.com/api-docs/futures/websocket-api/ "WebSocket API")

  - [Native ws endpoint](https://www.mexc.com/api-docs/futures/websocket-api/native-ws-endpoint "Native ws endpoint")
  - [Command details for data exchange](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange "Command details for data exchange")
  - [Subscription filtering](https://www.mexc.com/api-docs/futures/websocket-api/subscription-filtering "Subscription filtering")
  - [Public channels](https://www.mexc.com/api-docs/futures/websocket-api# "Public channels")

  - [Private channels](https://www.mexc.com/api-docs/futures/websocket-api# "Private channels")

  - [Incremental Order Book Maintenance Mechanism](https://www.mexc.com/api-docs/futures/websocket-api/incremental-order-book-maintenance-mechanism "Incremental Order Book Maintenance Mechanism")
  - [ENUM definitions](https://www.mexc.com/api-docs/futures/websocket-api/enum-definitions "ENUM definitions")

# WebSocket API

WebSocket is a new HTML5 protocol that enables full-duplex communication between client and server, allowing data to flow quickly in both directions. A simple handshake establishes the connection; after that, the server can proactively push messages to the client based on business rules. Benefits:

1. Very small header overhead during data transfer (about 2 bytes).
2. Both client and server can actively send data to each other.
3. No repeated TCP connection setup/teardown—saves bandwidth and server resources.

We strongly recommend developers use the WebSocket API to obtain market quotes and order book depth.

[Previous\\
\\
Delete STP Group](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/delete-stp-group "PreviousDelete STP Group") [Next\\
\\
Native ws endpoint](https://www.mexc.com/api-docs/futures/websocket-api/native-ws-endpoint "NextNative ws endpoint")