[Skip to main content](https://www.mexc.com/api-docs/futures/websocket-api/command-details-for-data-exchange#__docusaurus_skipToContent_fallback "Skip to main content")

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