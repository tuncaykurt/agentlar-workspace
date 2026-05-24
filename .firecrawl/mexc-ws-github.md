[Skip to main content](https://www.mexc.com/api-docs/futures/update-log#__docusaurus_skipToContent_fallback "Skip to main content")

[![MEXC Logo](https://static.mocortech.com/image-host/web/common/logo/logo-text-horizontal-dark.svg)](https://www.mexc.com/ "https://www.mexc.com/")[SpotV3](https://www.mexc.com/api-docs/spot-v3/introduction "SpotV3") [Futures](https://www.mexc.com/api-docs/futures/update-log "Futures") [Broker](https://www.mexc.com/api-docs/broker/mexc-broker-introduction "Broker")

[English](https://www.mexc.com/api-docs/futures/update-log# "English")

- [English](https://www.mexc.com/api-docs/futures/update-log "English")
- [中文](https://www.mexc.com/zh-MY/api-docs/futures/update-log "中文")

- [Update log](https://www.mexc.com/api-docs/futures/update-log "Update log")
- [Integration Guide](https://www.mexc.com/api-docs/futures/integration-guide "Integration Guide")
- [Internationalization Support](https://www.mexc.com/api-docs/futures/error-code "Internationalization Support")
- [Market Endpoints](https://www.mexc.com/api-docs/futures/market-endpoints/ "Market Endpoints")

- [Account and Trading Endpoints](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints/ "Account and Trading Endpoints")

- [WebSocket API](https://www.mexc.com/api-docs/futures/websocket-api/ "WebSocket API")


On this page

# Update log

## **2026-05-12** [​](https://www.mexc.com/api-docs/futures/update-log\#2026-05-12 "Direct link to 2026-05-12")

- **Documentation** — Removed the standalone _Fee Details Under a Specific Contract_ documentation page; contract-level fee fields remain covered under **Get Contract Information** and other fee-related endpoints.

## **2026-05-08** [​](https://www.mexc.com/api-docs/futures/update-log\#2026-05-08 "Direct link to 2026-05-08")

- **Documentation** — Restructured Futures documentation by splitting the former consolidated account and trading reference into individual endpoint pages under the corresponding module paths.

## **2026-05-03** [​](https://www.mexc.com/api-docs/futures/update-log\#2026-05-03 "Direct link to 2026-05-03")

- **Documentation** — `GET /api/v1/contract/detail/country`: expanded the response field reference for the contract object under `data`, and refreshed the worked example (fee modes, risk tiers, flags such as `apiAllowed` / `feeRateMode`, and related metadata).

## **2026-04-25** [​](https://www.mexc.com/api-docs/futures/update-log\#2026-04-25 "Direct link to 2026-04-25")

- **Documentation** — `POST /api/v1/private/order/create`: clarified that on success, `data` is an object containing `orderId` (string) and `ts` (Unix millisecond server response time); on failure, `success` is `false` and `data` is `null`.

## **2026-04-18** [​](https://www.mexc.com/api-docs/futures/update-log\#2026-04-18 "Direct link to 2026-04-18")

- **Documentation** — `GET /api/v1/contract/funding_rate/{symbol}`: refreshed the request parameter reference (including the documented requirement for `symbol`) and added `idxPrice` and `fairPrice` to the response fields and sample payload.

## **2026-03-31** [​](https://www.mexc.com/api-docs/futures/update-log\#2026-03-31 "Direct link to 2026-03-31")

- **Updated** — Futures Trading API maintenance ended; trading access reopened.

## **2026-01-19** [​](https://www.mexc.com/api-docs/futures/update-log\#2026-01-19 "Direct link to 2026-01-19")

- **Added** — STP and batch order API; futures API base domain changed to `https://api.mexc.com`.

## **2025-12-08** [​](https://www.mexc.com/api-docs/futures/update-log\#2025-12-08 "Direct link to 2025-12-08")

- **Added** — WebSocket channel push frequency description.

## **2025-12-05** [​](https://www.mexc.com/api-docs/futures/update-log\#2025-12-05 "Direct link to 2025-12-05")

- **Added** — WebSocket incremental order book maintenance mechanism.

## **2025-12-02** [​](https://www.mexc.com/api-docs/futures/update-log\#2025-12-02 "Direct link to 2025-12-02")

- **Added** — Endpoint `api/v1/private/order/list/open_orders`; removed endpoints `api/v1/private/order/open_orders` and `api/v1/private/order/close_orders`.

## **2025-11-25** [​](https://www.mexc.com/api-docs/futures/update-log\#2025-11-25 "Direct link to 2025-11-25")

- **Added** — Contract WebSocket: overall update, including web/APP login flows.

## **2025-11-03** [​](https://www.mexc.com/api-docs/futures/update-log\#2025-11-03 "Direct link to 2025-11-03")

- **Added** — Contract API: comprehensive update, including internationalization support and error code optimization.

## **2025-08-21** [​](https://www.mexc.com/api-docs/futures/update-log\#2025-08-21 "Direct link to 2025-08-21")

- **Updated** — WebSocket deal stream: zipped push enabled by default (`compress` = `true`).

## **2025-04-09** [​](https://www.mexc.com/api-docs/futures/update-log\#2025-04-09 "Direct link to 2025-04-09")

- **Updated** — WebSocket incremental depth stream: zipped push enabled by default (`compress` = `true`).

## **2024-01-31** [​](https://www.mexc.com/api-docs/futures/update-log\#2024-01-31 "Direct link to 2024-01-31")

- **Updated** — WebSocket base URL: `wss://contract.mexc.com/edge`.

## **2022-07-25** [​](https://www.mexc.com/api-docs/futures/update-log\#2022-07-25 "Direct link to 2022-07-25")

- **Maintenance** — Place-order and cancel-order endpoints temporarily unavailable; query endpoints remained available.

## **2022-07-07** [​](https://www.mexc.com/api-docs/futures/update-log\#2022-07-07 "Direct link to 2022-07-07")

- **Added** — Get contract information: response field `apiAllowed` (`true` / `false`) indicating whether API trading is supported.

## **2021-03-30** [​](https://www.mexc.com/api-docs/futures/update-log\#2021-03-30 "Direct link to 2021-03-30")

- **Updated** — Paths and response formats adjusted for: all history orders, ongoing orders, history positions, stop-limit order list, trigger order list, and all transaction details (legacy paths still supported; gradual deprecation planned).

## **2021-01-15** [​](https://www.mexc.com/api-docs/futures/update-log\#2021-01-15 "Direct link to 2021-01-15")

- **Added** — Contract API initial release.

[Next\\
\\
Integration Guide](https://www.mexc.com/api-docs/futures/integration-guide "NextIntegration Guide")

- [**2026-05-12**](https://www.mexc.com/api-docs/futures/update-log#2026-05-12 "2026-05-12")
- [**2026-05-08**](https://www.mexc.com/api-docs/futures/update-log#2026-05-08 "2026-05-08")
- [**2026-05-03**](https://www.mexc.com/api-docs/futures/update-log#2026-05-03 "2026-05-03")
- [**2026-04-25**](https://www.mexc.com/api-docs/futures/update-log#2026-04-25 "2026-04-25")
- [**2026-04-18**](https://www.mexc.com/api-docs/futures/update-log#2026-04-18 "2026-04-18")
- [**2026-03-31**](https://www.mexc.com/api-docs/futures/update-log#2026-03-31 "2026-03-31")
- [**2026-01-19**](https://www.mexc.com/api-docs/futures/update-log#2026-01-19 "2026-01-19")
- [**2025-12-08**](https://www.mexc.com/api-docs/futures/update-log#2025-12-08 "2025-12-08")
- [**2025-12-05**](https://www.mexc.com/api-docs/futures/update-log#2025-12-05 "2025-12-05")
- [**2025-12-02**](https://www.mexc.com/api-docs/futures/update-log#2025-12-02 "2025-12-02")
- [**2025-11-25**](https://www.mexc.com/api-docs/futures/update-log#2025-11-25 "2025-11-25")
- [**2025-11-03**](https://www.mexc.com/api-docs/futures/update-log#2025-11-03 "2025-11-03")
- [**2025-08-21**](https://www.mexc.com/api-docs/futures/update-log#2025-08-21 "2025-08-21")
- [**2025-04-09**](https://www.mexc.com/api-docs/futures/update-log#2025-04-09 "2025-04-09")
- [**2024-01-31**](https://www.mexc.com/api-docs/futures/update-log#2024-01-31 "2024-01-31")
- [**2022-07-25**](https://www.mexc.com/api-docs/futures/update-log#2022-07-25 "2022-07-25")
- [**2022-07-07**](https://www.mexc.com/api-docs/futures/update-log#2022-07-07 "2022-07-07")
- [**2021-03-30**](https://www.mexc.com/api-docs/futures/update-log#2021-03-30 "2021-03-30")
- [**2021-01-15**](https://www.mexc.com/api-docs/futures/update-log#2021-01-15 "2021-01-15")