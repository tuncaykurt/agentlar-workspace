[Skip to main content](https://www.mexc.com/api-docs/futures/market-endpoints/get-contract-info#__docusaurus_skipToContent_fallback "Skip to main content")

> Request Example

```text
curl "https://api.mexc.com/api/v1/contract/detail/country"
```

> Response Example

```json
{
    "success": true,
    "code": 0,
    "data": {
        "symbol": "BTC_USDT",
        "displayName": "BTC_USDT永续",
        "displayNameEn": "BTC_USDT PERPETUAL",
        "positionOpenType": 3,
        "baseCoin": "BTC",
        "quoteCoin": "USDT",
        "baseCoinName": "BTC",
        "quoteCoinName": "USDT",
        "futureType": 1,
        "settleCoin": "USDT",
        "contractSize": 0.0001,
        "minLeverage": 1,
        "maxLeverage": 500,
        "countryConfigContractMaxLeverage": 0,
        "priceScale": 1,
        "volScale": 0,
        "amountScale": 4,
        "priceUnit": 0.1,
        "volUnit": 1,
        "minVol": 1,
        "maxVol": 400000,
        "bidLimitPriceRate": 0.1,
        "askLimitPriceRate": 0.1,
        "takerFeeRate": 0.0001,
        "makerFeeRate": 0,
        "maintenanceMarginRate": 0.001,
        "initialMarginRate": 0.002,
        "riskBaseVol": 17000000,
        "riskIncrVol": 0,
        "riskLongShortSwitch": 0,
        "riskIncrMmr": 0,
        "riskIncrImr": 0,
        "riskLevelLimit": 1,
        "priceCoefficientVariation": 0.004,
        "indexOrigin": [\
            "BITGET",\
            "BYBIT",\
            "BINANCE",\
            "HTX",\
            "OKX",\
            "MEXC",\
            "KUCOIN"\
        ],
        "state": 0,
        "isNew": false,
        "isHot": false,
        "isHidden": false,
        "conceptPlate": [\
            "mc-trade-zone-layer2",\
            "mc-trade-zone-pow"\
        ],
        "conceptPlateId": [\
            5,\
            12\
        ],
        "riskLimitType": "BY_VOLUME",
        "maxNumOrders": [\
            200,\
            50\
        ],
        "marketOrderMaxLevel": 20,
        "marketOrderPriceLimitRate1": 0.1,
        "marketOrderPriceLimitRate2": 0.005,
        "triggerProtect": 0.1,
        "appraisal": 0,
        "showAppraisalCountdown": 0,
        "automaticDelivery": 0,
        "apiAllowed": true,
        "depthStepList": [\
            "0.1",\
            "1",\
            "10",\
            "100"\
        ],
        "limitMaxVol": 2500000,
        "threshold": 0,
        "baseCoinIconUrl": "https://public.mocortech.com/coin/F20250612182226438Ba037qttKoGcrm.png",
        "id": 10,
        "vid": "128f589271cb4951b03e71e6323eb7be",
        "baseCoinId": "febc9973be4d4d53bb374476239eb219",
        "createTime": 1591242684000,
        "openingTime": 0,
        "openingCountdownOption": 1,
        "showBeforeOpen": true,
        "isMaxLeverage": true,
        "isZeroFeeRate": false,
        "riskLimitMode": "CUSTOM",
        "isZeroFeeSymbol": false,
        "riskLimitCustom": [\
            {\
                "level": 1,\
                "maxVol": 50000,\
                "mmr": 0.001,\
                "imr": 0.002,\
                "maxLeverage": 500\
            },\
            {\
                "level": 2,\
                "maxVol": 120000,\
                "mmr": 0.004,\
                "imr": 0.005,\
                "maxLeverage": 200\
            },\
            {\
                "level": 3,\
                "maxVol": 320000,\
                "mmr": 0.005,\
                "imr": 0.01,\
                "maxLeverage": 100\
            },\
            {\
                "level": 4,\
                "maxVol": 2280000,\
                "mmr": 0.01,\
                "imr": 0.02,\
                "maxLeverage": 50\
            },\
            {\
                "level": 5,\
                "maxVol": 15500000,\
                "mmr": 0.02,\
                "imr": 0.05,\
                "maxLeverage": 20\
            },\
            {\
                "level": 6,\
                "maxVol": 17000000,\
                "mmr": 0.05,\
                "imr": 0.1,\
                "maxLeverage": 10\
            }\
        ],
        "liquidationFeeRate": 0.0004,
        "feeRateMode": "NORMAL",
        "leverageFeeRates": [],
        "tieredFeeRates": [],
        "type": 1,
        "stopOnlyFair": false,
        "preMarket": false,
        "typeLabel": 0,
        "fn": "BTC_USDT永续",
        "feeRateType": "BASE",
        "tagIdList": [\
            5,\
            8\
        ]
    }
}
```

- **GET**`/api/v1/contract/detail/country`

**Request Parameters:**

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| symbol | string | false | Contract symbol |

**Response Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| symbol | string | Contract symbol |
| displayName | string | Display name |
| displayNameEn | string | English display name |
| positionOpenType | int | Opening type: 1 isolated, 2 cross, 3 both supported |
| baseCoin | string | Base asset (e.g. BTC) |
| quoteCoin | string | Quote asset (e.g. USDT) |
| baseCoinName | string | Base asset name |
| quoteCoinName | string | Quote currency name |
| futureType | int | Contract type: 1 perpetual, 2 delivery |
| settleCoin | string | Settlement asset |
| contractSize | decimal | Contract size |
| minLeverage | int | Minimum leverage |
| maxLeverage | int | Maximum leverage |
| countryConfigContractMaxLeverage | int | Country-configured maximum leverage for this contract |
| priceScale | int | Price precision |
| volScale | int | Volume precision |
| amountScale | int | Amount precision |
| priceUnit | decimal | Minimum price tick |
| volUnit | decimal | Minimum quantity step |
| minVol | decimal | Minimum order size (contracts) |
| maxVol | decimal | Maximum order size (contracts) |
| bidLimitPriceRate | decimal | Buy-side limit price protection ratio |
| askLimitPriceRate | decimal | Sell-side limit price protection ratio |
| takerFeeRate | decimal | Taker fee rate |
| makerFeeRate | decimal | Maker fee rate |
| maintenanceMarginRate | decimal | Maintenance margin rate |
| initialMarginRate | decimal | Initial margin rate |
| riskBaseVol | decimal | Base risk volume (contracts) |
| riskIncrVol | decimal | Incremental risk volume (contracts) |
| riskLongShortSwitch | int | Separate long/short risk limits: 0 off, 1 on |
| riskIncrMmr | decimal | Maintenance margin rate increment per tier |
| riskIncrImr | decimal | Initial margin rate increment per tier |
| riskLevelLimit | int | Number of risk limit tiers |
| priceCoefficientVariation | decimal | Fair price deviation coefficient from index price |
| indexOrigin | `List<String>` | Index price sources |
| state | int | Status: 0 enabled, 1 delivery, 2 delivered, 3 offline, 4 paused |
| isNew | boolean | Whether this is the new-listing tag; `true` yes, `false` no |
| isHot | boolean | Whether this is the hot symbol tag; `true` yes, `false` no |
| isHidden | boolean | Whether hidden from default display; `true` yes, `false` no |
| conceptPlate | `List<String>` | Sector tags (matches sector list `entryKey`) |
| conceptPlateId | `List<Integer>` | Sector tag IDs |
| riskLimitType | string | Risk limit type: `BY_VOLUME` (by contracts), `BY_VALUE` (by position value) |
| maxNumOrders | `List<Integer>` | Max open orders: \[hedged mode max, one-way mode max\] |
| marketOrderMaxLevel | int | Max market-order taker depth levels |
| marketOrderPriceLimitRate1 | decimal | Price protection coefficient for market orders when depth exceeds 20 levels |
| marketOrderPriceLimitRate2 | decimal | Price protection coefficient for market orders when depth is 20 levels or fewer |
| triggerProtect | decimal | Conditional order trigger threshold for priceProtect; 0 disables protection |
| appraisal | int | Assessment flag: 1 on, 0 off |
| showAppraisalCountdown | int | Show assessment countdown: 1 on, 0 off |
| automaticDelivery | int | Auto delivery flag: 1 on, 0 off |
| apiAllowed | boolean | Whether API trading is allowed |
| depthStepList | `List<String>` | Order book depth step list |
| limitMaxVol | decimal | Max contracts per limit order |
| threshold | long | `0` disabled; greater than `0` indicates an active configuration |
| baseCoinIconUrl | string | Base asset icon URL |
| id | int | Contract ID |
| vid | string | Settlement coin vcoin ID |
| baseCoinId | string | Base coin vcoin ID |
| createTime | long | Creation time; Unix millisecond timestamp |
| openingTime | long | Market open time; Unix millisecond timestamp |
| openingCountdownOption | int | Opening countdown UI: 1 show open time and countdown; 2 show open time only; 3 show neither |
| showBeforeOpen | boolean | Whether shown on the new listing board before market open; true: yes, false: no |
| isMaxLeverage | boolean | Whether this is the max leverage tag; true: yes, false: no |
| isZeroFeeRate | boolean | Whether this is a zero-fee tag; true: yes, false: no |
| riskLimitMode | string | Risk limit mode: `INCREASE` = incremental mode, `CUSTOM` = custom mode |
| isZeroFeeSymbol | boolean | Whether this is a zero-fee symbol; true: participates in the zero-fee program, false: no |
| riskLimitCustom | array | Custom risk limit list in CUSTOM mode; each item is an object containing level (tier), maxVol (maximum contracts), mmr (maintenance margin rate), imr (initial margin rate), and maxLeverage (maximum leverage) |
| liquidationFeeRate | decimal | Liquidation fee rate |
| feeRateMode | string | Fee rate mode: `NORMAL` = normal mode, `LEVERAGE` = leverage fee mode, `TIERED` = tiered fee mode |
| leverageFeeRates | array | Leverage fee schedule (used when `feeRateMode` is `LEVERAGE`; empty when not applicable) |
| tieredFeeRates | array | Tiered fee bands (used when `feeRateMode` is `TIERED`; empty when not applicable) |
| type | int | Pair type: 1 = normal, 2 = suspended |
| stopOnlyFair | boolean | Whether TP/SL may only trigger at fair price; `true` yes, `false` no |
| preMarket | boolean | Whether pre-market trading applies; `true` yes, `false` no |
| typeLabel | int | Type label for suspended pairs (legacy): 0 = none, 1 = TradFi, 2 = stock |
| fn | string | Localized full contract name |
| feeRateType | string | Fee rate type: `BASE` = base fee rate, `TEMP` = temporary fee rate |
| tagIdList | `List<Long>` | Contract tag ID list |