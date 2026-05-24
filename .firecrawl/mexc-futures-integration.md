[Skip to main content](https://www.mexc.com/api-docs/futures/integration-guide#__docusaurus_skipToContent_fallback "Skip to main content")

On this page

## Access URL [​](https://www.mexc.com/api-docs/futures/integration-guide\#access-url "Direct link to Access URL")

```text
https://api.mexc.com
```

## Common Response Structure [​](https://www.mexc.com/api-docs/futures/integration-guide\#common-response-structure "Direct link to Common Response Structure")

> Response Example

```json
{
  "success": true,
  "code": 0,
  "data": {
    "symbol": "BTC_USD",
    "fairPrice": 8000,
    "timestamp": 1587442022003
  }
}
```

> Or

```json
{
  "success": false,
  "code":500,
  "message": "系统内部错误!"
}
```

## Request Format [​](https://www.mexc.com/api-docs/futures/integration-guide\#request-format "Direct link to Request Format")

The current Open-API directly supports three request sources: APP, WEB, and OPEN-API.
The corresponding APIs accept GET, POST, or DELETE requests. For POST requests, the Content-Type is `application/json`, and parameters are sent in JSON format (parameter names use camelCase). For GET requests, parameters are sent as request parameters (parameter naming rules are '\_' delimited).
Each request source uses a different authentication method:

1. If the request source is OPEN-API, you must add the `ApiKey` parameter in the request header. If the request source is APP, you must add `App-version` in the header.

2. Public endpoints do not require authorization or signatures.

3. For private endpoints:
   - If the request source is WEB or APP, include the `Authorization` parameter in the header with the corresponding token value.

   - If the request source is OPEN-API, include the `ApiKey`, `Request-Time`, `Signature`, and `Recv-Window` (optional) parameters in the header. `Signature` is the signature string, with rules as follows:


     1. Obtain the request parameter string first; if there are no parameters, use an empty string `""`.

For GET/DELETE requests, sort business parameters in dictionary order, concatenate them with `&`, and produce the final string to sign (for batch APIs, if parameter values contain commas or other special characters, these must be URL-encoded during signing).

For POST requests, the parameters to sign are the JSON string (no dictionary sorting required).
     2. After obtaining the parameter string, build the target string for signing as: `accessKey + timestamp + parameterString`.

     3. Use the HMAC-SHA256 algorithm to sign the target string, and include the resulting signature in the request header.

     4. Business parameters that are `null` are not included in the signature. Path parameters are also excluded from the signature. Note: For GET requests, when appending parameters to the URL, if a parameter is `null`, the backend may parse it as `""`. Therefore, for GET requests, if a parameter is `null`, do not pass that parameter, or set its value to `""` when signing; otherwise, signature verification may fail!

     5. When sending the request, place the value used for `req_time` during signing into the `Request-Time` header, the generated signature string into the `Signature` header, and your API key’s Access Key into the `ApiKey` header. Other business parameters should be sent as usual.

## Time Security [​](https://www.mexc.com/api-docs/futures/integration-guide\#time-security "Direct link to Time Security")

All signed endpoints require the `Request-Time` header parameter, which is the timestamp in milliseconds as a string. The server validates the request’s time window. If, upon receiving the request, the `req_time` is more than 10 seconds (default) behind or ahead of the server time (this window can be customized by sending the optional `Recv-Window` header parameter; its maximum value is 60, and using a value above 30 seconds is not recommended), the request is considered invalid.

## Create API Key [​](https://www.mexc.com/api-docs/futures/integration-guide\#create-api-key "Direct link to Create API Key")

Users can create an API key in the MEXC user center. It consists of two parts: the Access key (API access key) and the Secret key (used for signature calculation and verification).

You can click [here](https://www.mexc.com/user/openapi "create API key") to create an API Key.
Note: To create/enable futures order placement permissions, the account must first complete KYC verification. Accounts that have not completed KYC can still create an API key, but may not be able to enable or use futures order placement–related permissions.

When creating an API Key, you can choose to bind IP addresses. API Keys that are not bound to IP addresses are valid for 90 days. (Binding IP addresses is strongly recommended.)

Renewal: 5 days prior to the expiry of your API key, you can extend its validity by 90 days in \[My API Key—Action—Renew\].

These two keys are closely related to your account security. Never disclose them to others under any circumstances.

- [Access URL](https://www.mexc.com/api-docs/futures/integration-guide#access-url "Access URL")
- [Common Response Structure](https://www.mexc.com/api-docs/futures/integration-guide#common-response-structure "Common Response Structure")
- [Request Format](https://www.mexc.com/api-docs/futures/integration-guide#request-format "Request Format")
- [Time Security](https://www.mexc.com/api-docs/futures/integration-guide#time-security "Time Security")
- [Create API Key](https://www.mexc.com/api-docs/futures/integration-guide#create-api-key "Create API Key")