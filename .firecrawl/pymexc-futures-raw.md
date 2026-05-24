"""
\### Futures API
Documentation: https://www.mexc.com/api-docs/futures/market-endpoints#get-server-time

\### Usage

\`\`\`python
from pymexc import futures

api\_key = "YOUR API KEY"
api\_secret = "YOUR API SECRET KEY"

def handle\_message(message):
 # handle websocket message
 print(message)

\# initialize HTTP client (synchronous)
futures\_client = futures.HTTP(api\_key = api\_key, api\_secret = api\_secret)
\# initialize WebSocket client (synchronous)
ws\_futures\_client = futures.WebSocket(api\_key = api\_key, api\_secret = api\_secret)

\# make http request to api
print(futures\_client.index\_price("MX\_USDT"))

\# create websocket connection to public channel (sub.tickers)
\# all messages will be handled by function \`handle\_message\`
ws\_futures\_client.tickers\_stream(handle\_message)

\# loop forever for save websocket connection
while True:
 ...

\# Async usage:
\# initialize HTTP client (asynchronous)
async\_futures\_client = futures.AsyncHTTP(api\_key = api\_key, api\_secret = api\_secret)
\# initialize WebSocket client (asynchronous)
async\_ws\_futures\_client = futures.AsyncWebSocket(api\_key = api\_key, api\_secret = api\_secret)

\# make async http request to api
print(await async\_futures\_client.index\_price("MX\_USDT"))

\# create async websocket connection
await async\_ws\_futures\_client.tickers\_stream(handle\_message)

"""

import logging
from typing import Callable, Dict, List, Literal, Optional, Union

logger = logging.getLogger(\_\_name\_\_)

try:
 from \_async.futures import HTTP as AsyncHTTP
 from \_async.futures import WebSocket as AsyncWebSocket
 from base import \_FuturesHTTP
 from base\_websocket import FUTURES\_PERSONAL\_TOPICS, \_FuturesWebSocket
except ImportError:
 from .\_async.futures import HTTP as AsyncHTTP
 from .\_async.futures import WebSocket as AsyncWebSocket
 from .base import \_FuturesHTTP
 from .base\_websocket import FUTURES\_PERSONAL\_TOPICS, \_FuturesWebSocket

\_\_all\_\_ = \["HTTP", "WebSocket", "AsyncHTTP", "AsyncWebSocket"\]

class HTTP(\_FuturesHTTP):
 # <=================================================================>
 #
 # Market Endpoints
 #
 # <=================================================================>

 def ping(self) -> dict:
 """
 ### Get Server Time

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-server-time
 """
 return self.call("GET", "api/v1/contract/ping")

 def detail(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Get Contract Info

 Rate limit: 1 time / 5 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-contract-info

 :param symbol: (optional) Contract name
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/contract/detail", params=dict(symbol=symbol))

 def support\_currencies(self) -> dict:
 """
 ### Get Transferable Currencies

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-transferable-currencies

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/contract/support\_currencies")

 def get\_depth(self, symbol: str, limit: Optional\[int\] = None) -> dict:
 """
 ### Get Contract Order Book Depth

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-contract-order-book-depth

 :param symbol: the name of the contract
 :type symbol: str
 :param limit: (optional) the limit of the depth
 :type limit: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/contract/depth/{symbol}", params=dict(limit=limit))

 def depth\_commits(self, symbol: str, limit: int) -> dict:
 """
 ### Get the Last N Depth Snapshots

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-the-last-n-depth-snapshots

 :param symbol: the name of the contract
 :type symbol: str
 :param limit: count
 :type limit: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/contract/depth\_commits/{symbol}/{limit}")

 def index\_price(self, symbol: str) -> dict:
 """
 ### Get Index Price

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-index-price

 :param symbol: the name of the contract
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/contract/index\_price/{symbol}")

 def fair\_price(self, symbol: str) -> dict:
 """
 ### Get Fair Price

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-fair-price

 :param symbol: the name of the contract
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/contract/fair\_price/{symbol}")

 def funding\_rate(self, symbol: str) -> dict:
 """
 ### Get Funding Rate

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-funding-rate

 :param symbol: the name of the contract
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/contract/funding\_rate/{symbol}")

 def kline(
 self,
 symbol: str,
 interval: Optional\[\
 Literal\[\
 "Min1",\
 "Min5",\
 "Min15",\
 "Min30",\
 "Min60",\
 "Hour4",\
 "Hour8",\
 "Day1",\
 "Week1",\
 "Month1",\
 \]\
 \] = None,
 start: Optional\[int\] = None,
 end: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Get Candlestick Data

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-candlestick-data

 :param symbol: the name of the contract
 :type symbol: str
 :param interval: The time interval for the Kline data. Must be one of "Min1", "Min5", "Min15", "Min30", "Min60", "Hour4", "Hour8", "Day1", "Week1", "Month1". Defaults to "Min1".
 :type interval: Optional\[Literal\["Min1", "Min5", "Min15", "Min30", "Min60", "Hour4", "Hour8", "Day1", "Week1", "Month1"\]\]
 :param start: (optional) The start time of the Kline data in Unix timestamp format.
 :type start: Optional\[int\]
 :param end: (optional) The end time of the Kline data in Unix timestamp format.
 :type end: Optional\[int\]

 :return: A dictionary containing the Kline data for the specified symbol and interval within the specified time range.
 :rtype: dict
 """
 return self.call(
 "GET",
 f"api/v1/contract/kline/{symbol}",
 params=dict(symbol=symbol, interval=interval, start=start, end=end),
 )

 def kline\_index\_price(
 self,
 symbol: str,
 interval: Optional\[\
 Literal\[\
 "Min1",\
 "Min5",\
 "Min15",\
 "Min30",\
 "Min60",\
 "Hour4",\
 "Hour8",\
 "Day1",\
 "Week1",\
 "Month1",\
 \]\
 \] = "Min1",
 start: Optional\[int\] = None,
 end: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Get Index Price Candles

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-index-price-candles

 :param symbol: the name of the contract
 :type symbol: str
 :param interval: The time interval for the Kline data. Must be one of "Min1", "Min5", "Min15", "Min30", "Min60", "Hour4", "Hour8", "Day1", "Week1", "Month1". Defaults to "Min1".
 :type interval: Optional\[Literal\["Min1", "Min5", "Min15", "Min30", "Min60", "Hour4", "Hour8", "Day1", "Week1", "Month1"\]\]
 :param start: (optional) The start time of the Kline data in Unix timestamp format.
 :type start: Optional\[int\]
 :param end: (optional) The end time of the Kline data in Unix timestamp format.
 :type end: Optional\[int\]

 :return: A dictionary containing the Kline data for the specified symbol and interval within the specified time range.
 :rtype: dict
 """
 return self.call(
 "GET",
 f"api/v1/contract/kline/index\_price/{symbol}",
 params=dict(symbol=symbol, interval=interval, start=start, end=end),
 )

 def kline\_fair\_price(
 self,
 symbol: str,
 interval: Optional\[\
 Literal\[\
 "Min1",\
 "Min5",\
 "Min15",\
 "Min30",\
 "Min60",\
 "Hour4",\
 "Hour8",\
 "Day1",\
 "Week1",\
 "Month1",\
 \]\
 \] = "Min1",
 start: Optional\[int\] = None,
 end: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Get Fair Price Candles

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-fair-price-candles

 :param symbol: the name of the contract
 :type symbol: str
 :param interval: The time interval for the Kline data. Must be one of "Min1", "Min5", "Min15", "Min30", "Min60", "Hour4", "Hour8", "Day1", "Week1", "Month1". Defaults to "Min1".
 :type interval: Optional\[Literal\["Min1", "Min5", "Min15", "Min30", "Min60", "Hour4", "Hour8", "Day1", "Week1", "Month1"\]\]
 :param start: (optional) The start time of the Kline data in Unix timestamp format.
 :type start: Optional\[int\]
 :param end: (optional) The end time of the Kline data in Unix timestamp format.
 :type end: Optional\[int\]

 :return: A dictionary containing the Kline data for the specified symbol and interval within the specified time range.
 :rtype: dict
 """
 return self.call(
 "GET",
 f"api/v1/contract/kline/fair\_price/{symbol}",
 params=dict(symbol=symbol, interval=interval, start=start, end=end),
 )

 def deals(self, symbol: str, limit: Optional\[int\] = 100) -> dict:
 """
 ### Get Recent Trades

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-recent-trades

 :param symbol: the name of the contract
 :type symbol: str
 :param limit: (optional) consequence set quantity, maximum is 100, default 100 without setting
 :type limit: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 f"api/v1/contract/deals/{symbol}",
 params=dict(symbol=symbol, limit=limit),
 )

 def ticker(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Get Ticker (Contract Market Data)

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-ticker-contract-market-data

 :param symbol: (optional) the name of the contract
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/contract/ticker", params=dict(symbol=symbol))

 def risk\_reverse(self, symbol: str) -> dict:
 """
 ### Get Insurance Fund Balance

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-insurance-fund-balance

 :param symbol: Contract symbol
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/contract/risk\_reverse/{symbol}")

 def risk\_reverse\_history(self, symbol: str, page\_num: Optional\[int\] = 1, page\_size: Optional\[int\] = 20) -> dict:
 """
 ### Get Insurance Fund Balance History

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-insurance-fund-balance-history

 :param symbol: the name of the contract
 :type symbol: str
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: the page size, default 20, maximum 100
 :type page\_size: int

 :return: A dictionary containing the risk reverse history.
 """
 return self.call(
 "GET",
 "api/v1/contract/risk\_reverse/history",
 params=dict(symbol=symbol, page\_num=page\_num, page\_size=page\_size),
 )

 def funding\_rate\_history(self, symbol: str, page\_num: Optional\[int\] = 1, page\_size: Optional\[int\] = 20) -> dict:
 """
 ### Get Funding Rate History

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/market-endpoints#get-funding-rate-history

 :param symbol: the name of the contract
 :type symbol: str
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: the page size, default 20, maximum 1000
 :type page\_size: int

 :return: A dictionary containing the funding rate history.
 """
 return self.call(
 "GET",
 "api/v1/contract/funding\_rate/history",
 params=dict(symbol=symbol, page\_num=page\_num, page\_size=page\_size),
 )

 # <=================================================================>
 #
 # Account and trading endpoints
 #
 # <=================================================================>

 def assets(self) -> dict:
 """
 ### Get All Account Assets
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-all-account-assets

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/assets")

 def asset(self, currency: str) -> dict:
 """
 ### Get Single Currency Asset Information
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-single-currency-asset-information

 :param currency: Currency
 :type currency: str
 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/private/account/asset/{currency}")

 def transfer\_record(
 self,
 currency: Optional\[str\] = None,
 state: Optional\[Literal\["WAIT", "SUCCESS", "FAILED"\]\] = None,
 type: Optional\[Literal\["IN", "OUT"\]\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Asset Transfer Records
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-asset-transfer-records

 :param currency: (optional) The currency.
 :type currency: str
 :param state: (optional) state:WAIT 、SUCCESS 、FAILED
 :type state: str
 :param type: (optional) type:IN 、OUT
 :type type: str
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: page size, default 20, maximum 100
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/account/transfer\_record",
 params=dict(
 currency=currency,
 state=state,
 type=type,
 page\_num=page\_num,
 page\_size=page\_size,
 ),
 )

 def history\_positions(
 self,
 symbol: Optional\[str\] = None,
 type: Optional\[int\] = None,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Historical Positions
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-historical-positions

 :param symbol: (optional) the name of the contract
 :type symbol: str
 :param type: (optional) position type: 1 - long, 2 -short
 :type type: int
 :param start\_time: (optional) Start time
 :type start\_time: int
 :param end\_time: (optional) End time
 :type end\_time: int
 :param page\_num: current page number , default is 1
 :type page\_num: int
 :param page\_size: page size , default 20, maximum 100
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/position/list/history\_positions",
 params=dict(
 symbol=symbol,
 type=type,
 start\_time=start\_time,
 end\_time=end\_time,
 page\_num=page\_num,
 page\_size=page\_size,
 ),
 )

 def open\_positions(self, symbol: Optional\[str\] = None, position\_id: Optional\[int\] = None) -> dict:
 """
 ### Get Open Positions
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-open-positions

 :param symbol: (optional) the name of the contract
 :type symbol: str
 :param position\_id: (optional) Position ID
 :type position\_id: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET", "api/v1/private/position/open\_positions", params=dict(symbol=symbol, positionId=position\_id)
 )

 def funding\_records(
 self,
 position\_type: int,
 start\_time: int,
 end\_time: int,
 symbol: Optional\[str\] = None,
 position\_id: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Funding Fee Details
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-funding-fee-details

 :param symbol: (optional) the name of the contract
 :type symbol: str
 :param position\_id: (optional) position id
 :type position\_id: int
 :param position\_type: Position type, 1 long 2 short
 :type position\_type: int
 :param start\_time: Start time
 :type start\_time: int
 :param end\_time: End time
 :type end\_time: int
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: page size, default 20, maximum 100
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "GET",
 "api/v1/private/position/funding\_records",
 params=dict(
 symbol=symbol,
 position\_id=position\_id,
 position\_type=position\_type,
 start\_time=start\_time,
 end\_time=end\_time,
 page\_num=page\_num,
 page\_size=page\_size,
 ),
 )

 def open\_orders(
 self,
 symbol: Optional\[str\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Current Open Orders
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-current-open-orders

 :param symbol: (optional) The name of the contract. Returns all contract parameters if not specified.
 :type symbol: str
 :param page\_num: The current page number. Defaults to 1.
 :type page\_num: int
 :param page\_size: The page size. Defaults to 20. Maximum of 100.
 :type page\_size: int

 :return: A dictionary containing the user's current pending order.
 :rtype: dict
 """
 if symbol:
 return self.call(
 "GET",
 f"api/v1/private/order/open\_orders/{symbol}",
 params=dict(page\_num=page\_num, page\_size=page\_size),
 )
 else:
 return self.call(
 "GET",
 "api/v1/private/order/open\_orders",
 params=dict(page\_num=page\_num, page\_size=page\_size),
 )

 def history\_orders(
 self,
 symbol: Optional\[str\] = None,
 states: Optional\[str\] = None,
 category: Optional\[int\] = None,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 side: Optional\[int\] = None,
 order\_id: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get All Historical Orders
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-all-historical-orders

 :param symbol: (optional) The name of the contract. Returns all contract parameters if not specified.
 :type symbol: str
 :param states: (optional) The order state(s) to filter by. Multiple states can be separated by ','. Defaults to None.
 :type states: str
 :param category: (optional) The order category to filter by. Defaults to None.
 :type category: int
 :param start\_time: (optional) The start time of the order history to retrieve. Defaults to None.
 :type start\_time: int
 :param end\_time: (optional) The end time of the order history to retrieve. Defaults to None.
 :type end\_time: int
 :param side: (optional) The order direction to filter by. Defaults to None.
 :type side: int
 :param order\_id: (optional) Order ID
 :type order\_id: int
 :param page\_num: The current page number. Defaults to 1.
 :type page\_num: int
 :param page\_size: The page size. Defaults to 20. Maximum of 100.
 :type page\_size: int

 :return: A dictionary containing all of the user's historical orders.
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/order/list/history\_orders",
 params=dict(
 symbol=symbol,
 states=states,
 category=category,
 startTime=start\_time,
 endTime=end\_time,
 side=side,
 orderId=order\_id,
 page\_num=page\_num,
 page\_size=page\_size,
 ),
 )

 def get\_order\_external(self, symbol: str, external\_oid: str) -> dict:
 """
 ### Get Order by External ID
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-order-by-external-id

 :param symbol: The name of the contract.
 :type symbol: str
 :param external\_oid: The external order ID.
 :type external\_oid: str

 :return: A dictionary containing the queried order based on the external number.
 :rtype: dict
 """

 return self.call("GET", f"api/v1/private/order/external/{symbol}/{external\_oid}")

 def get\_order(self, order\_id: Union\[str, int\]) -> dict:
 """
 ### Get Order Information by Order ID
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-order-information-by-order-id

 :param order\_id: Order ID
 :type order\_id: Union\[str, int\]

 :return: A dictionary containing the queried order based on the order number.
 :rtype: dict
 """
 return self.call("GET", f"api/v1/private/order/get/{order\_id}")

 def batch\_query(self, order\_ids: Union\[List\[int\], str\]) -> dict:
 """
 ### Batch Query Orders by Order ID
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#batch-query-orders-by-order-id

 :param order\_ids: An array of order IDs, separated by ",". Maximum of 50 orders.
 :type order\_ids: Union\[List\[int\], str\]

 :return: A dictionary containing the queried orders in bulk based on the order number.
 :rtype: dict
 """
 if isinstance(order\_ids, list):
 order\_ids\_str = ",".join(str(oid) for oid in order\_ids)
 else:
 order\_ids\_str = order\_ids
 return self.call(
 "GET",
 "api/v1/private/order/batch\_query",
 params=dict(order\_ids=order\_ids\_str),
 )

 def deal\_details(self, symbol: str, order\_id: Union\[str, int\]) -> dict:
 """
 ### Get Trade Details by Order ID
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-trade-details-by-order-id

 :param symbol: Contract symbol
 :type symbol: str
 :param order\_id: The ID of the order to retrieve transaction details for.
 :type order\_id: Union\[str, int\]

 :return: A dictionary containing the transaction details for the given order ID.
 :rtype: dict
 """
 return self.call("GET", f"api/v1/private/order/deal\_details/{order\_id}", params=dict(symbol=symbol))

 def order\_deals(
 self,
 symbol: str,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Historical Order Deal Details
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-historical-order-deal-details

 :param symbol: the name of the contract
 :type symbol: str
 :param start\_time: (optional) the starting time, the default is to push forward 7 days, and the maximum span is 90 days
 :type start\_time: int
 :param end\_time: (optional) the end time, start and end time span is 90 days
 :type end\_time: int
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: page size , default 20, maximum 1000
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/order/list/order\_deals/v3",
 params=dict(
 symbol=symbol,
 start\_time=start\_time,
 end\_time=end\_time,
 page\_num=page\_num,
 page\_size=page\_size,
 ),
 )

 def get\_trigger\_orders(
 self,
 symbol: Optional\[str\] = None,
 states: Optional\[str\] = None,
 side: Optional\[int\] = None,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Plan Order List
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-plan-order-list

 :param symbol: (optional) the name of the contract
 :type symbol: str
 :param states: (optional) order state, 1 untriggered, 2 canceled, 3 executed, 4 invalidated, 5 execution failed; Multiple separate by ','
 :type states: str
 :param side: (optional) Order side,1: open long,2: close short,3: open short,4: close long
 :type side: int
 :param start\_time: (optional) start time, 13-digit timestamp
 :type start\_time: int
 :param end\_time: (optional) end time, 13-digit timestamp
 :type end\_time: int
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: page size, default 20, maximum 100
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/planorder/list/orders",
 params=dict(
 symbol=symbol,
 states=states,
 side=side,
 start\_time=start\_time,
 end\_time=end\_time,
 page\_num=page\_num,
 page\_size=page\_size,
 ),
 )

 def get\_stop\_limit\_orders(
 self,
 symbol: Optional\[str\] = None,
 is\_finished: Optional\[int\] = None,
 state: Optional\[int\] = None,
 type: Optional\[int\] = None,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Take-Profit/Stop-Loss Order List
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-take-profitstop-loss-order-list

 :param symbol: (optional) the name of the contract
 :type symbol: str
 :param is\_finished: (optional) final state indicator :0: unfinished, 1: finished
 :type is\_finished: int
 :param state: (optional) Status：1 untriggered 2 canceled 3 executed 4 invalidated 5 execution failed
 :type state: int
 :param type: (optional) Position type,1: long，2: short
 :type type: int
 :param start\_time: (optional) start time, 13-digit timestamp
 :type start\_time: int
 :param end\_time: (optional) end time, 13-digit timestamp
 :type end\_time: int
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: page size, default 20, maximum 100
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "GET",
 "api/v1/private/stoporder/list/orders",
 params=dict(
 symbol=symbol,
 is\_finished=is\_finished,
 state=state,
 type=type,
 start\_time=start\_time,
 end\_time=end\_time,
 page\_num=page\_num,
 page\_size=page\_size,
 ),
 )

 def risk\_limit(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Get Risk Limits
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-risk-limits

 :param symbol: (optional) the name of the contract , not uploaded will return all
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/risk\_limit", params=dict(symbol=symbol))

 def tiered\_fee\_rate(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Get Fee Details
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-fee-details

 :param symbol: (optional) the name of the contract; when symbol is provided, query fee rate info under that contract
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """

 return self.call("GET", "api/v1/private/account/tiered\_fee\_rate/v2", params=dict(symbol=symbol))

 def change\_margin(self, position\_id: int, amount: float, type: str) -> dict:
 """
 ### Modify Position Margin (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#modify-position-marginunder-maintenance

 :param position\_id: position id
 :type position\_id: int
 :param amount: amount
 :type amount: float
 :param type: type, ADD: increase, SUB: decrease
 :type type: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/position/change\_margin",
 params=dict(positionId=position\_id, amount=amount, type=type),
 )

 def get\_leverage(self, symbol: str) -> dict:
 """
 ### Get Position Leverage Multipliers
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-position-leverage-multipliers

 :param symbol: Contract name
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """

 return self.call("GET", "api/v1/private/position/leverage", params=dict(symbol=symbol))

 def change\_leverage(
 self,
 leverage: int,
 position\_id: Optional\[int\] = None,
 open\_type: Optional\[int\] = None,
 symbol: Optional\[str\] = None,
 position\_type: Optional\[int\] = None,
 leverage\_mode: Optional\[int\] = None,
 margin\_selected: Optional\[bool\] = None,
 leverage\_selected: Optional\[bool\] = None,
 ) -\> dict:
 """
 ### Modify Leverage (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#modify-leverageunder-maintenance

 :param leverage: leverage
 :type leverage: int
 :param position\_id: (optional) position id, provide when a position exists
 :type position\_id: int
 :param open\_type: (optional) Required when there is no position, openType, 1: isolated, 2: cross
 :type open\_type: int
 :param symbol: (optional) Required when there is no position, contract name
 :type symbol: str
 :param position\_type: (optional) When no position exists, position type， 1 long 2 short
 :type position\_type: int
 :param leverage\_mode: (optional) Leverage mode 1: advanced mode 2: simple mode
 :type leverage\_mode: int
 :param margin\_selected: (optional) Flag for adjusting all contracts' margin mode - whether selected
 :type margin\_selected: bool
 :param leverage\_selected: (optional) Flag for adjusting all contracts' leverage mode - whether selected
 :type leverage\_selected: bool

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/position/change\_leverage",
 params=dict(
 positionId=position\_id,
 leverage=leverage,
 openType=open\_type,
 symbol=symbol,
 positionType=position\_type,
 leverageMode=leverage\_mode,
 marginSelected=margin\_selected,
 leverageSelected=leverage\_selected,
 ),
 )

 def get\_position\_mode(self) -> dict:
 """
 ### Get User Position Mode
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-user-position-mode

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/position/position\_mode")

 def change\_position\_mode(self, position\_mode: int) -> dict:
 """
 ### Modify User Position Mode (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#modify-user-position-modeunder-maintenance

 :param position\_mode: 1: dual-side, 2: one-way. To modify the position mode, you must ensure there are no active orders, plan orders, or unfinished positions; otherwise, it cannot be modified. When switching from dual-side to one-way mode, the risk limit level will reset to level 1. To change it, call the interface to modify.
 :type position\_mode: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/position/change\_position\_mode",
 params=dict(positionMode=position\_mode),
 )

 def order(
 self,
 symbol: str,
 price: float,
 vol: float,
 side: int,
 type: int,
 open\_type: int,
 position\_id: Optional\[int\] = None,
 leverage: Optional\[int\] = None,
 external\_oid: Optional\[str\] = None,
 stop\_loss\_price: Optional\[float\] = None,
 take\_profit\_price: Optional\[float\] = None,
 loss\_trend: Optional\[int\] = None,
 profit\_trend: Optional\[int\] = None,
 price\_protect: Optional\[int\] = None,
 position\_mode: Optional\[int\] = None,
 reduce\_only: Optional\[bool\] = False,
 market\_ceiling: Optional\[bool\] = None,
 flash\_close: Optional\[bool\] = None,
 bbo\_type\_num: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Place Order (Under Maintenance)
 #### Required permissions: Trading permission

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#place-order-under-maintenance

 :param symbol: the name of the contract
 :type symbol: str
 :param price: price
 :type price: float
 :param vol: volume
 :type vol: float
 :param leverage: (optional) leverage, must be provided when opening a position
 :type leverage: int
 :param side: order direction 1 open long, 2 close short, 3 open short, 4 close long
 :type side: int
 :param type: orderType,1: limit,2: Post Only (maker only),3: IOC,4: FOK,5: market
 :type type: int
 :param open\_type: open type,1: isolated,2: cross
 :type open\_type: int
 :param position\_id: (optional) position Id, It is recommended to fill in this parameter when closing a position
 :type position\_id: int
 :param external\_oid: (optional) external order ID
 :type external\_oid: str
 :param stop\_loss\_price: (optional) stop-loss price
 :type stop\_loss\_price: float
 :param take\_profit\_price: (optional) take-profit price
 :type take\_profit\_price: float
 :param loss\_trend: (optional) Stop-loss price type;1: latest price (default);2: fair price;3: index price
 :type loss\_trend: int
 :param profit\_trend: (optional) Take-profit price type;1: latest price (default);2: fair price;3: index price
 :type profit\_trend: int
 :param price\_protect: (optional) Conditional order trigger protection: "1","0", default "0" disabled. Required only for plan orders/TP-SL orders
 :type price\_protect: int
 :param position\_mode: (optional) position mode, default dual-side; 2: one-way; 1: dual-side
 :type position\_mode: int
 :param reduce\_only: (optional) Reduce-only, only applicable in one-way mode
 :type reduce\_only: bool
 :param market\_ceiling: (optional) 100% market open
 :type market\_ceiling: bool
 :param flash\_close: (optional) Flash close
 :type flash\_close: bool
 :param bbo\_type\_num: (optional) Limit order type - BBO type; 0: not BBO;1: opposite-1;2: opposite-5;3: same-side-1;4: same-side-5;
 :type bbo\_type\_num: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/order/create",
 params=dict(
 symbol=symbol,
 price=price,
 vol=vol,
 side=side,
 type=type,
 openType=open\_type,
 positionId=position\_id,
 leverage=leverage,
 externalOid=external\_oid,
 stopLossPrice=stop\_loss\_price,
 takeProfitPrice=take\_profit\_price,
 lossTrend=loss\_trend,
 profitTrend=profit\_trend,
 priceProtect=price\_protect,
 positionMode=position\_mode,
 reduceOnly=reduce\_only,
 marketCeiling=market\_ceiling,
 flashClose=flash\_close,
 bboTypeNum=bbo\_type\_num,
 ),
 )

 def bulk\_order(
 self,
 symbol: str,
 price: float,
 vol: float,
 side: int,
 type: int,
 open\_type: int,
 position\_id: Optional\[int\] = None,
 external\_oid: Optional\[str\] = None,
 stop\_loss\_price: Optional\[float\] = None,
 take\_profit\_price: Optional\[float\] = None,
 ) -\> dict:
 """
 ### Bulk Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 1 time / 2 seconds

 Note: This endpoint may not be documented in the current API documentation.

 :param symbol: the name of the contract
 :type symbol: str
 :param price: price
 :type price: float
 :param vol: volume
 :type vol: float
 :param side: order side 1 open long, 2 close short, 3 open short, 4 close long
 :type side: int
 :param type: order type 1: limit, 2: Post Only (maker only), 3: IOC, 4: FOK, 5: market, 6: convert market price to current price
 :type type: int
 :param open\_type: open type, 1: isolated, 2: cross
 :type open\_type: int
 :param position\_id: (optional) position Id, It is recommended to fill in this parameter when closing a position
 :type position\_id: int
 :param external\_oid: (optional) external order ID, return the existing order ID if it already exists
 :type external\_oid: str
 :param stop\_loss\_price: (optional) stop-loss price
 :type stop\_loss\_price: float
 :param take\_profit\_price: (optional) take-profit price
 :type take\_profit\_price: float

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/order/submit\_batch",
 params=dict(
 symbol=symbol,
 price=price,
 vol=vol,
 side=side,
 type=type,
 openType=open\_type,
 positionId=position\_id,
 externalOid=external\_oid,
 stopLossPrice=stop\_loss\_price,
 takeProfitPrice=take\_profit\_price,
 ),
 )

 def cancel\_order(self, order\_ids: Union\[List\[int\], int\]) -> dict:
 """
 ### Cancel Orders (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-orders-under-maintenance

 :param order\_ids: list of order ids to cancel, maximum 50
 :type order\_ids: Union\[List\[int\], int\]

 :return: dictionary containing the order ID and error message, if any
 :rtype: dict
 """

 return self.call(
 "POST", "api/v1/private/order/cancel", json=order\_ids if isinstance(order\_ids, list) else \[order\_ids\]
 )

 def cancel\_order\_with\_external(self, orders: List\[Dict\[str, str\]\]) -> dict:
 """
 ### Cancel by External Order ID (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-by-external-order-idunder-maintenance

 :param orders: list collection; e.g. \[{"symbol":"BTC\_USDT", "externalOid":"ext\_11"}\]
 :type orders: List\[Dict\[str, str\]\]

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/order/cancel\_with\_external",
 json=orders,
 )

 def cancel\_all(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Cancel All Orders Under a Contract (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-all-orders-under-a-contractunder-maintenance

 :param symbol: (optional) Contract; if provided, cancel only orders under that contract; if not, cancel orders under all contracts
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """

 return self.call("POST", "api/v1/private/order/cancel\_all", params=dict(symbol=symbol))

 def change\_risk\_level(self) -> dict:
 """
 ### Change Risk Level (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 Note: Disabled. Calling this returns error code 8817 with message: The risk limit feature has been upgraded. Please check the web page for details.

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#change-risk-levelunder-maintenance

 :return: response dictionary
 :rtype: dict
 """

 return self.call("POST", "api/v1/private/account/change\_risk\_level")

 def trigger\_order(
 self,
 symbol: str,
 vol: float,
 side: int,
 open\_type: int,
 trigger\_price: float,
 trigger\_type: int,
 execute\_cycle: int,
 order\_type: int,
 trend: int,
 leverage: int,
 price: Optional\[float\] = None,
 price\_protect: Optional\[int\] = None,
 position\_mode: Optional\[int\] = None,
 loss\_trend: Optional\[int\] = None,
 profit\_trend: Optional\[int\] = None,
 stop\_loss\_price: Optional\[float\] = None,
 take\_profit\_price: Optional\[float\] = None,
 reduce\_only: Optional\[bool\] = None,
 ) -\> dict:
 """
 ### Place Plan Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#place-plan-orderunder-maintenance

 :param symbol: the name of the contract
 :type symbol: str
 :param price: (optional) execute price, not required for market
 :type price: float
 :param vol: volume
 :type vol: float
 :param leverage: leverage, required when opening
 :type leverage: int
 :param side: 1 open long, 2 close short, 3 open short, 4 close long
 :type side: int
 :param open\_type: open type, 1: isolated, 2: cross
 :type open\_type: int
 :param trigger\_price: trigger price
 :type trigger\_price: float
 :param trigger\_type: trigger type, 1: greater than or equal to，2: less than or equal to
 :type trigger\_type: int
 :param execute\_cycle: execution cycle, 1: 24 hours, 2: 7 days
 :type execute\_cycle: int
 :param order\_type: order type, 1: limit, 2: Post Only (maker only), 3: IOC, 4: FOK, 5: market
 :type order\_type: int
 :param trend: trigger price type, 1: latest price，2: fair price，3: index price
 :type trend: int
 :param price\_protect: (optional) Conditional order trigger protection: "1","0", default "0" disabled
 :type price\_protect: int
 :param position\_mode: (optional) User-set position type default 0: historical orders no record 2: one-way 1: dual-side
 :type position\_mode: int
 :param loss\_trend: (optional) Stop-loss reference price type 1 latest price 2 fair price 3 index price
 :type loss\_trend: int
 :param profit\_trend: (optional) Take-profit reference price type 1 latest price 2 fair price 3 index price
 :type profit\_trend: int
 :param stop\_loss\_price: (optional) Stop-loss price
 :type stop\_loss\_price: float
 :param take\_profit\_price: (optional) Take-profit price
 :type take\_profit\_price: float
 :param reduce\_only: (optional) Reduce-only
 :type reduce\_only: bool

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/planorder/place/v2",
 params=dict(
 symbol=symbol,
 price=price,
 vol=vol,
 leverage=leverage,
 side=side,
 openType=open\_type,
 triggerPrice=trigger\_price,
 triggerType=trigger\_type,
 executeCycle=execute\_cycle,
 orderType=order\_type,
 trend=trend,
 priceProtect=price\_protect,
 positionMode=position\_mode,
 lossTrend=loss\_trend,
 profitTrend=profit\_trend,
 stopLossPrice=stop\_loss\_price,
 takeProfitPrice=take\_profit\_price,
 reduceOnly=reduce\_only,
 ),
 )

 def cancel\_trigger\_order(self, orders: List\[Dict\[str, Union\[str, int\]\]\]) -> dict:
 """
 ### Cancel Planned Orders (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-planned-ordersmaintenance

 :param orders: list of orders to be cancelled (maximum of 50), e.g. \[{"symbol":"BTC\_USDT","orderId":1}\]
 :type orders: List\[Dict\[str, Union\[str, int\]\]\]

 :return: response dictionary
 :rtype: dict
 """

 return self.call("POST", "api/v1/private/planorder/cancel", json=orders)

 def cancel\_all\_trigger\_orders(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Cancel All Planned Orders (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-all-planned-ordersmaintenance

 :param symbol: (optional) Contract name. If provided, only cancel orders under this contract; if not, cancel orders under all contracts
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """

 return self.call("POST", "api/v1/private/planorder/cancel\_all", params=dict(symbol=symbol))

 def cancel\_stop\_order(self, orders: List\[Dict\[str, int\]\]) -> dict:
 """
 ### Cancel TP/SL Planned Orders (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-tpsl-planned-ordersmaintenance

 :param orders: list of orders to be cancelled (maximum of 50), e.g. \[{"stopPlanOrderId":1}\]
 :type orders: List\[Dict\[str, int\]\]

 :return: response dictionary
 :rtype: dict
 """

 return self.call("POST", "api/v1/private/stoporder/cancel", json=orders)

 def cancel\_all\_stop\_order(self, position\_id: Optional\[int\] = None, symbol: Optional\[str\] = None) -> dict:
 """
 ### Cancel All TP/SL Planned Orders (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-all-tpsl-planned-ordersmaintenance

 :param position\_id: (optional) Position ID. If provided, cancel only TP/SL orders for this position; if not provided, check symbol
 :type position\_id: int
 :param symbol: (optional) Contract name. If provided, cancel only TP/SL orders under this contract; if not, cancel TP/SL orders under all contracts
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/stoporder/cancel\_all",
 params=dict(positionId=position\_id, symbol=symbol),
 )

 def stop\_limit\_change\_price(
 self,
 order\_id: int,
 symbol: str,
 stop\_loss\_price: Optional\[float\] = None,
 take\_profit\_price: Optional\[float\] = None,
 loss\_trend: Optional\[int\] = None,
 profit\_trend: Optional\[int\] = None,
 take\_profit\_reverse: Optional\[int\] = None,
 stop\_loss\_reverse: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Modify TP/SL Prices on a Limit Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#modify-tpsl-prices-on-a-limit-orderunder-maintenance

 :param order\_id: the limit order ID
 :type order\_id: int
 :param symbol: Contract
 :type symbol: str
 :param stop\_loss\_price: (optional) stop-loss price. If both TP and SL are empty or both are 0, the order's TP/SL will be canceled
 :type stop\_loss\_price: float
 :param take\_profit\_price: (optional) take-profit price. If both TP and SL are empty or both are 0, the order's TP/SL will be canceled
 :type take\_profit\_price: float
 :param loss\_trend: (optional) Stop-loss price type: 1 Latest Price; 2 Fair Price; 3 Index Price
 :type loss\_trend: int
 :param profit\_trend: (optional) Take-profit price type: 1 Latest Price; 2 Fair Price; 3 Index Price
 :type profit\_trend: int
 :param take\_profit\_reverse: (optional) Reverse on take-profit: 1 Yes; 2 No
 :type take\_profit\_reverse: int
 :param stop\_loss\_reverse: (optional) Reverse on stop-loss: 1 Yes; 2 No
 :type stop\_loss\_reverse: int

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/stoporder/change\_price",
 params=dict(
 orderId=order\_id,
 symbol=symbol,
 stopLossPrice=stop\_loss\_price,
 takeProfitPrice=take\_profit\_price,
 lossTrend=loss\_trend,
 profitTrend=profit\_trend,
 takeProfitReverse=take\_profit\_reverse,
 stopLossReverse=stop\_loss\_reverse,
 ),
 )

 def stop\_limit\_change\_plan\_price(
 self,
 stop\_plan\_order\_id: int,
 stop\_loss\_price: Optional\[float\] = None,
 take\_profit\_price: Optional\[float\] = None,
 loss\_trend: Optional\[int\] = None,
 profit\_trend: Optional\[int\] = None,
 take\_profit\_reverse: Optional\[int\] = None,
 stop\_loss\_reverse: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Modify TP/SL Prices on a TP/SL Planned Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#modify-tpsl-prices-on-a-tpsl-planned-orderunder-maintenance

 :param stop\_plan\_order\_id: the Stop-Limit price of trigger order ID
 :type stop\_plan\_order\_id: int
 :param stop\_loss\_price: (optional) stop-loss price. At least one of TP/SL must be non-empty and greater than 0
 :type stop\_loss\_price: float
 :param take\_profit\_price: (optional) take-profit price. At least one of TP/SL must be non-empty and greater than 0
 :type take\_profit\_price: float
 :param loss\_trend: (optional) Stop-loss price type: 1 Latest Price; 2 Fair Price; 3 Index Price
 :type loss\_trend: int
 :param profit\_trend: (optional) Take-profit price type: 1 Latest Price; 2 Fair Price; 3 Index Price
 :type profit\_trend: int
 :param take\_profit\_reverse: (optional) Reverse on take-profit: 1 Yes; 2 No
 :type take\_profit\_reverse: int
 :param stop\_loss\_reverse: (optional) Reverse on stop-loss: 1 Yes; 2 No
 :type stop\_loss\_reverse: int

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/stoporder/change\_plan\_price",
 params=dict(
 stopPlanOrderId=stop\_plan\_order\_id,
 stopLossPrice=stop\_loss\_price,
 takeProfitPrice=take\_profit\_price,
 lossTrend=loss\_trend,
 profitTrend=profit\_trend,
 takeProfitReverse=take\_profit\_reverse,
 stopLossReverse=stop\_loss\_reverse,
 ),
 )

 def place\_stop\_order(
 self,
 position\_id: int,
 vol: float,
 loss\_trend: int,
 profit\_trend: int,
 stop\_loss\_price: Optional\[float\] = None,
 take\_profit\_price: Optional\[float\] = None,
 price\_protect: Optional\[int\] = None,
 profit\_loss\_vol\_type: Optional\[str\] = None,
 take\_profit\_vol: Optional\[float\] = None,
 stop\_loss\_vol: Optional\[float\] = None,
 vol\_type: Optional\[int\] = None,
 take\_profit\_reverse: Optional\[int\] = None,
 stop\_loss\_reverse: Optional\[int\] = None,
 mtoken: Optional\[str\] = None,
 take\_profit\_type: Optional\[int\] = None,
 take\_profit\_order\_price: Optional\[float\] = None,
 stop\_loss\_type: Optional\[int\] = None,
 stop\_loss\_order\_price: Optional\[float\] = None,
 ) -\> dict:
 """
 ### Place TP/SL Order by Position (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#place-tpsl-order-by-positionunder-maintenance

 :param position\_id: Position id
 :type position\_id: int
 :param vol: Order quantity; must be within the allowed range for the contract; the order quantity plus existing TP/SL order quantity must be less than the closable quantity; position quantity will not be frozen, but checks are required
 :type vol: float
 :param loss\_trend: Stop-loss type: 1 latest price 2 fair price 3 index price
 :type loss\_trend: int
 :param profit\_trend: Take-profit type: 1 latest price 2 fair price 3 index price
 :type profit\_trend: int
 :param stop\_loss\_price: (optional) Stop-loss price; at least one of stop-loss or take-profit must be non-empty and greater than 0
 :type stop\_loss\_price: float
 :param take\_profit\_price: (optional) Take-profit price; at least one of stop-loss or take-profit must be non-empty and greater than 0
 :type take\_profit\_price: float
 :param price\_protect: (optional) Trigger protection: "1","0"
 :type price\_protect: int
 :param profit\_loss\_vol\_type: (optional) TP/SL quantity type (SAME: same quantity; SEPARATE: different quantities)
 :type profit\_loss\_vol\_type: str
 :param take\_profit\_vol: (optional) Take-profit quantity (when profitLossVolType == SEPARATE)
 :type take\_profit\_vol: float
 :param stop\_loss\_vol: (optional) Stop-loss quantity (when profitLossVolType == SEPARATE)
 :type stop\_loss\_vol: float
 :param vol\_type: (optional) Quantity type 1: partial TP/SL 2: position TP/SL
 :type vol\_type: int
 :param take\_profit\_reverse: (optional) Take-profit reverse: 1 yes 2 no
 :type take\_profit\_reverse: int
 :param stop\_loss\_reverse: (optional) Stop-loss reverse: 1 yes 2 no
 :type stop\_loss\_reverse: int
 :param mtoken: (optional) Web device id
 :type mtoken: str
 :param take\_profit\_type: (optional) Take-profit type 0 - market TP 1 - limit TP
 :type take\_profit\_type: int
 :param take\_profit\_order\_price: (optional) Limit TP order price
 :type take\_profit\_order\_price: float
 :param stop\_loss\_type: (optional) Stop-loss type 0 - market SL 1 - limit SL
 :type stop\_loss\_type: int
 :param stop\_loss\_order\_price: (optional) Limit SL order price
 :type stop\_loss\_order\_price: float

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/stoporder/place",
 params=dict(
 positionId=position\_id,
 vol=vol,
 lossTrend=loss\_trend,
 profitTrend=profit\_trend,
 stopLossPrice=stop\_loss\_price,
 takeProfitPrice=take\_profit\_price,
 priceProtect=price\_protect,
 profitLossVolType=profit\_loss\_vol\_type,
 takeProfitVol=take\_profit\_vol,
 stopLossVol=stop\_loss\_vol,
 volType=vol\_type,
 takeProfitReverse=take\_profit\_reverse,
 stopLossReverse=stop\_loss\_reverse,
 mtoken=mtoken,
 takeProfitType=take\_profit\_type,
 takeProfitOrderPrice=take\_profit\_order\_price,
 stopLossType=stop\_loss\_type,
 stopLossOrderPrice=stop\_loss\_order\_price,
 ),
 )

 def close\_all(self) -> dict:
 """
 ### Close All (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#close-allunder-maintenance

 :return: response dictionary
 :rtype: dict
 """

 return self.call("POST", "api/v1/private/position/close\_all")

 def reverse\_position(self, symbol: str, position\_id: int, vol: float) -> dict:
 """
 ### Reverse Open Position (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#reverse-open-positionunder-maintenance

 :param symbol: Contract
 :type symbol: str
 :param position\_id: Position id
 :type position\_id: int
 :param vol: Quantity
 :type vol: float

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/position/reverse",
 params=dict(symbol=symbol, positionId=position\_id, vol=vol),
 )

 def change\_limit\_order(self, order\_id: int, price: float, vol: float) -> dict:
 """
 ### Modify Order Price & Quantity (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#modify-order-price--quantityunder-maintenance

 :param order\_id: Order ID
 :type order\_id: int
 :param price: Price
 :type price: float
 :param vol: Quantity
 :type vol: float

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/order/change\_limit\_order",
 params=dict(orderId=order\_id, price=price, vol=vol),
 )

 def chase\_limit\_order(self, order\_id: int) -> dict:
 """
 ### Chase Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 Modify order price to the corresponding one-tick price

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#chase-orderunder-maintenance

 :param order\_id: Order ID
 :type order\_id: int

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/order/chase\_limit\_order",
 params=dict(orderId=order\_id),
 )

 def open\_order\_total\_count(self) -> dict:
 """
 ### Query In-Flight Order Counts
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#query-in-flight-order-counts

 :return: response dictionary
 :rtype: dict
 """

 return self.call("POST", "api/v1/private/order/open\_order\_total\_count")

 def change\_auto\_add\_im(self, position\_id: int, is\_enabled: bool) -> dict:
 """
 ### Enable or Disable Auto-Add Margin (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 requests / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#enable-or-disable-auto-add-marginunder-maintenance

 :param position\_id: Position ID
 :type position\_id: int
 :param is\_enabled: Whether to enable
 :type is\_enabled: bool

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/position/change\_auto\_add\_im",
 params=dict(positionId=position\_id, isEnabled=is\_enabled),
 )

 def batch\_cancel\_with\_external(self, orders: List\[Dict\[str, str\]\]) -> dict:
 """
 ### Batch Cancel by External Order ID (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#batch-cancel-by-external-order-idunder-maintenance

 :param orders: list collection; e.g. \[{"symbol":"BTC\_USDT", "externalOid":"ext\_11"}\]
 :type orders: List\[Dict\[str, str\]\]

 :return: response dictionary
 :rtype: dict
 """

 return self.call(
 "POST",
 "api/v1/private/order/batch\_cancel\_with\_external",
 json=orders,
 )

 def close\_orders(
 self,
 symbol: Optional\[str\] = None,
 category: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Get Closed Orders
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-closed-orders

 :param symbol: (optional) Contract
 :type symbol: str
 :param category: (optional) Order category,1: limit,2: liquidation custody,3: custody close,4: ADL reduction
 :type category: int
 :param page\_num: current page number, default is 1
 :type page\_num: int
 :param page\_size: page size, default 20, max 100
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/order/close\_orders",
 params=dict(symbol=symbol, category=category, page\_num=page\_num, page\_size=page\_size),
 )

 def open\_stop\_orders(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Get Current Take-Profit/Stop-Loss Order List
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#get-current-take-profitstop-loss-order-list

 :param symbol: (optional) Contract
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/stoporder/open\_orders", params=dict(symbol=symbol))

 def batch\_query\_with\_external(self, orders: List\[Dict\[str, str\]\]) -> dict:
 """
 ### Batch Query - Get Orders by External Order ID
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#batch-query---get-orders-by-external-order-id

 :param orders: list collection; e.g. \[{"symbol":"BTC\_USDT", "externalOid":"ext\_11"}\]
 :type orders: List\[Dict\[str, str\]\]

 :return: response dictionary
 :rtype: dict
 """
 return self.call("POST", "api/v1/private/order/batch\_query\_with\_external", json=orders)

 def profit\_rate(self, type: int) -> dict:
 """
 ### View Personal Profit Rate
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#view-personal-profit-rate

 :param type: Type: 1 Day; 2 Week
 :type type: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", f"api/v1/private/account/profit\_rate/{type}")

 def asset\_analysis(
 self,
 currency: str,
 type: int,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Asset Analysis
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#asset-analysis

 :param currency: Currency
 :type currency: str
 :param type: Type: 1 This week; 2 This month; 3 All; 4 Custom time range
 :type type: int
 :param start\_time: (optional) Start time (ms)
 :type start\_time: int
 :param end\_time: (optional) End time (ms)
 :type end\_time: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 f"api/v1/private/account/asset/analysis/{type}",
 params=dict(currency=currency, startTime=start\_time, endTime=end\_time),
 )

 def yesterday\_pnl(self) -> dict:
 """
 ### Yesterday's PnL
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#yesterdays-pnl

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/asset/analysis/yesterday\_pnl")

 def asset\_analysis\_v3(
 self,
 start\_time: int,
 end\_time: int,
 reverse: Optional\[int\] = None,
 include\_unrealised\_pnl: Optional\[int\] = None,
 symbol: Optional\[str\] = None,
 ) -\> dict:
 """
 ### User Asset Analysis API
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#user-asset-analysis-api

 :param start\_time: Start time (ms)
 :type start\_time: int
 :param end\_time: End time (ms)
 :type end\_time: int
 :param reverse: (optional) Contract type: 0 All; 1 USDT-M; 2 Coin-M; 3 USDC-M
 :type reverse: int
 :param include\_unrealised\_pnl: (optional) Include unrealized PnL: 0 No; 1 Yes
 :type include\_unrealised\_pnl: int
 :param symbol: (optional) Trading pair
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/account/asset/analysis/v3",
 params=dict(
 startTime=start\_time,
 endTime=end\_time,
 reverse=reverse,
 includeUnrealisedPnl=include\_unrealised\_pnl,
 symbol=symbol,
 ),
 )

 def asset\_analysis\_calendar\_daily\_v3(
 self,
 start\_time: int,
 end\_time: int,
 reverse: Optional\[int\] = None,
 include\_unrealised\_pnl: Optional\[int\] = None,
 ) -\> dict:
 """
 ### User Asset Calendar Analysis (Daily)
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#user-asset-calendar-analysis-daily

 :param start\_time: Start time (ms)
 :type start\_time: int
 :param end\_time: End time (ms)
 :type end\_time: int
 :param reverse: (optional) Contract type: 0 All; 1 USDT-M; 2 Coin-M; 3 USDC-M
 :type reverse: int
 :param include\_unrealised\_pnl: (optional) Include unrealized PnL: 0 No; 1 Yes
 :type include\_unrealised\_pnl: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/account/asset/analysis/calendar/daily/v3",
 params=dict(
 startTime=start\_time,
 endTime=end\_time,
 reverse=reverse,
 includeUnrealisedPnl=include\_unrealised\_pnl,
 ),
 )

 def asset\_analysis\_calendar\_monthly\_v3(
 self,
 reverse: Optional\[int\] = None,
 include\_unrealised\_pnl: Optional\[int\] = None,
 ) -\> dict:
 """
 ### User Asset Calendar Analysis (Monthly)
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#user-asset-calendar-analysis-monthly

 :param reverse: (optional) Contract type: 0 All; 1 USDT-M; 2 Coin-M; 3 USDC-M
 :type reverse: int
 :param include\_unrealised\_pnl: (optional) Include unrealized PnL: 0 No; 1 Yes
 :type include\_unrealised\_pnl: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/account/asset/analysis/calendar/monthly/v3",
 params=dict(reverse=reverse, includeUnrealisedPnl=include\_unrealised\_pnl),
 )

 def asset\_analysis\_recent\_v3(
 self,
 reverse: Optional\[int\] = None,
 include\_unrealised\_pnl: Optional\[int\] = None,
 symbol: Optional\[str\] = None,
 ) -\> dict:
 """
 ### Recent User Asset Analysis
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#recent-user-asset-analysis

 :param reverse: (optional) Contract type: 0 All; 1 USDT-M; 2 Coin-M; 3 USDC-M
 :type reverse: int
 :param include\_unrealised\_pnl: (optional) Include unrealized PnL: 0 No; 1 Yes
 :type include\_unrealised\_pnl: int
 :param symbol: (optional) Trading pair
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/account/asset/analysis/recent/v3",
 params=dict(reverse=reverse, includeUnrealisedPnl=include\_unrealised\_pnl, symbol=symbol),
 )

 def today\_pnl(
 self,
 reverse: Optional\[int\] = None,
 include\_unrealised\_pnl: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Today's User Asset Analysis
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#todays-user-asset-analysis

 :param reverse: (optional) Contract type: 0 All; 1 USDT-M; 2 Coin-M; 3 USDC-M
 :type reverse: int
 :param include\_unrealised\_pnl: (optional) Include unrealized PnL: 0 No; 1 Yes
 :type include\_unrealised\_pnl: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/account/asset/analysis/today\_pnl",
 params=dict(reverse=reverse, includeUnrealisedPnl=include\_unrealised\_pnl),
 )

 def contract\_fee\_discount\_config(self) -> dict:
 """
 ### Query All Spot Discount Configuration Information
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#query-all-spot-discount-configuration-information

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/config/contractFeeDiscountConfig")

 def fee\_details(
 self,
 symbol: str,
 ids: Optional\[List\[int\]\] = None,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 page\_num: int = 1,
 page\_size: int = 20,
 ) -\> dict:
 """
 ### Query Contract Fee Deduction Details
 #### Required permissions: View Order Details

 Rate limit: 20 requests / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#query-contract-fee-deduction-details

 :param symbol: Contract name
 :type symbol: str
 :param ids: (optional) Deal ID; up to 20 can be sent in a batch
 :type ids: List\[int\]
 :param start\_time: (optional) Start time; if omitted, defaults to current time minus 7 days; max span 90 days
 :type start\_time: int
 :param end\_time: (optional) End time; the span between start and end is 90 days
 :type end\_time: int
 :param page\_num: (optional) Current page number, default 1
 :type page\_num: int
 :param page\_size: (optional) Page size, default 20, max 100
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """
 params = dict(symbol=symbol, page\_num=page\_num, page\_size=page\_size)
 if ids:
 params\["ids"\] = ",".join(str(id) for id in ids)
 if start\_time:
 params\["start\_time"\] = start\_time
 if end\_time:
 params\["end\_time"\] = end\_time
 return self.call("GET", "api/v1/private/order/fee\_details", params=params)

 def discount\_type(self) -> dict:
 """
 ### Query User Discount Usage
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#query-user-discount-usage

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/discountType")

 def export\_pnl\_analysis(
 self,
 start\_time: int,
 end\_time: int,
 file\_type: int,
 language: str,
 timezone: str,
 reverse: Optional\[int\] = None,
 include\_unrealised\_pnl: Optional\[int\] = None,
 symbol: Optional\[str\] = None,
 ) -\> dict:
 """
 ### Export PnL Analysis
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#export-pnl-analysis

 :param start\_time: Export start time (ms)
 :type start\_time: int
 :param end\_time: Export end time (ms)
 :type end\_time: int
 :param file\_type: File type: 1-EXCEL 2-PDF
 :type file\_type: int
 :param language: Language; e.g., zh-CN
 :type language: str
 :param timezone: Timezone; e.g., UTC+08:00
 :type timezone: str
 :param reverse: (optional) Contract type: 0: All; 1: USDT-M; 2: Coin-M
 :type reverse: int
 :param include\_unrealised\_pnl: (optional) Include unrealized PnL: 0: No; 1: Yes
 :type include\_unrealised\_pnl: int
 :param symbol: (optional) Trading pair
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "GET",
 "api/v1/private/account/asset/analysis/export",
 headers={"timezone-login": timezone},
 params=dict(
 startTime=start\_time,
 endTime=end\_time,
 reverse=reverse,
 includeUnrealisedPnl=include\_unrealised\_pnl,
 symbol=symbol,
 fileType=file\_type,
 language=language,
 ),
 )

 def order\_deal\_fee\_total(self) -> dict:
 """
 ### 30-Day Fee Statistics
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#30-day-fee-statistics

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/asset\_book/order\_deal\_fee/total")

 def contract\_fee\_rate(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Fee Details Under a Specific Contract
 #### Required permissions: View Account Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#fee-details-under-a-specific-contract

 :param symbol: (optional) Trading pair
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/contract/fee\_rate", params=dict(symbol=symbol))

 def zero\_fee\_rate(self, symbol: Optional\[str\] = None) -> dict:
 """
 ### Zero-Fee Trading Pairs
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#zero-fee-trading-pairs

 :param symbol: (optional) Trading pair
 :type symbol: str

 :return: response dictionary
 :rtype: dict
 """
 return self.call("GET", "api/v1/private/account/contract/zero\_fee\_rate", params=dict(symbol=symbol))

 def place\_track\_order(
 self,
 symbol: str,
 leverage: int,
 side: int,
 vol: float,
 open\_type: int,
 trend: int,
 back\_type: int,
 back\_value: float,
 position\_mode: int,
 active\_price: Optional\[float\] = None,
 reduce\_only: Optional\[bool\] = None,
 ) -\> dict:
 """
 ### Place Trailing Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#place-trailing-orderunder-maintenance

 :param symbol: Contract name
 :type symbol: str
 :param leverage: Leverage
 :type leverage: int
 :param side: 1 Open Long; 2 Close Short; 3 Open Short; 4 Close Long
 :type side: int
 :param vol: Order quantity
 :type vol: float
 :param open\_type: Position mode: 1 Isolated; 2 Cross
 :type open\_type: int
 :param trend: Price type: 1 Latest; 2 Fair; 3 Index
 :type trend: int
 :param back\_type: Callback type: 1 Percentage; 2 Absolute value
 :type back\_type: int
 :param back\_value: Callback value
 :type back\_value: float
 :param position\_mode: Position mode. Default 0: no record for historical orders; 1: Two-way (hedged); 2: One-way
 :type position\_mode: int
 :param active\_price: (optional) Activation price
 :type active\_price: float
 :param reduce\_only: (optional) Reduce-only
 :type reduce\_only: bool

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/trackorder/place",
 json=dict(
 symbol=symbol,
 leverage=leverage,
 side=side,
 vol=vol,
 openType=open\_type,
 trend=trend,
 backType=back\_type,
 backValue=back\_value,
 positionMode=position\_mode,
 activePrice=active\_price,
 reduceOnly=reduce\_only,
 ),
 )

 def cancel\_track\_order(
 self,
 symbol: Optional\[str\] = None,
 track\_order\_id: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Cancel Trailing Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#cancel-trailing-orderunder-maintenance

 :param symbol: (optional) Contract name
 :type symbol: str
 :param track\_order\_id: (optional) Trailing order ID
 :type track\_order\_id: int

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/trackorder/cancel",
 json=dict(symbol=symbol, trackOrderId=track\_order\_id),
 )

 def change\_track\_order(
 self,
 symbol: str,
 track\_order\_id: int,
 trend: int,
 back\_type: int,
 back\_value: float,
 vol: float,
 active\_price: Optional\[float\] = None,
 ) -\> dict:
 """
 ### Modify Trailing Order (Under Maintenance)
 #### Required permissions: Order Placing

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#modify-trailing-orderunder-maintenance

 :param symbol: Contract name
 :type symbol: str
 :param track\_order\_id: Trailing order ID
 :type track\_order\_id: int
 :param trend: Price type: 1 Latest; 2 Fair; 3 Index
 :type trend: int
 :param back\_type: Callback type: 1 Percentage; 2 Absolute value
 :type back\_type: int
 :param back\_value: Callback value
 :type back\_value: float
 :param vol: Order quantity
 :type vol: float
 :param active\_price: (optional) Activation price
 :type active\_price: float

 :return: response dictionary
 :rtype: dict
 """
 return self.call(
 "POST",
 "api/v1/private/trackorder/change\_order",
 json=dict(
 symbol=symbol,
 trackOrderId=track\_order\_id,
 trend=trend,
 activePrice=active\_price,
 backType=back\_type,
 backValue=back\_value,
 vol=vol,
 ),
 )

 def get\_track\_orders(
 self,
 states: List\[int\],
 symbol: Optional\[str\] = None,
 side: Optional\[int\] = None,
 start\_time: Optional\[int\] = None,
 end\_time: Optional\[int\] = None,
 page\_index: Optional\[int\] = None,
 page\_size: Optional\[int\] = None,
 ) -\> dict:
 """
 ### Query Trailing Orders
 #### Required permissions: View Order Details

 Rate limit: 20 times / 2 seconds

 https://www.mexc.com/api-docs/futures/account-and-trading-endpoints#query-trailing-orders

 :param states: Order status: 0 Not activated; 1 Activated; 2 Triggered successfully; 3 Trigger failed; 4 Canceled
 :type states: List\[int\]
 :param symbol: (optional) Contract name
 :type symbol: str
 :param side: (optional) 1 Open Long; 2 Close Short; 3 Open Short; 4 Close Long
 :type side: int
 :param start\_time: (optional) Start time
 :type start\_time: int
 :param end\_time: (optional) End time
 :type end\_time: int
 :param page\_index: (optional) Page index
 :type page\_index: int
 :param page\_size: (optional) Page size
 :type page\_size: int

 :return: response dictionary
 :rtype: dict
 """
 params = dict(states=",".join(str(s) for s in states))
 if symbol:
 params\["symbol"\] = symbol
 if side is not None:
 params\["side"\] = side
 if start\_time:
 params\["start\_time"\] = start\_time
 if end\_time:
 params\["end\_time"\] = end\_time
 if page\_index:
 params\["pageIndex"\] = page\_index
 if page\_size:
 params\["pageSize"\] = page\_size
 return self.call("GET", "api/v1/private/trackorder/list/orders", params=params)

class WebSocket(\_FuturesWebSocket):
 def \_\_init\_\_(
 self,
 api\_key: Optional\[str\] = None,
 api\_secret: Optional\[str\] = None,
 personal\_callback: Optional\[Callable\[..., None\]\] = None,
 ping\_interval: Optional\[int\] = 20,
 ping\_timeout: Optional\[int\] = 10,
 retries: Optional\[int\] = 10,
 restart\_on\_error: Optional\[bool\] = True,
 trace\_logging: Optional\[bool\] = False,
 http\_proxy\_host: Optional\[str\] = None,
 http\_proxy\_port: Optional\[int\] = None,
 http\_no\_proxy: Optional\[list\] = None,
 http\_proxy\_auth: Optional\[tuple\] = None,
 http\_proxy\_timeout: Optional\[int\] = None,
 ):
 super().\_\_init\_\_(
 api\_key=api\_key,
 api\_secret=api\_secret,
 subscribe\_callback=personal\_callback,
 ping\_interval=ping\_interval,
 ping\_timeout=ping\_timeout,
 retries=retries,
 restart\_on\_error=restart\_on\_error,
 trace\_logging=trace\_logging,
 http\_proxy\_host=http\_proxy\_host,
 http\_proxy\_port=http\_proxy\_port,
 http\_no\_proxy=http\_no\_proxy,
 http\_proxy\_auth=http\_proxy\_auth,
 http\_proxy\_timeout=http\_proxy\_timeout,
 )
 if personal\_callback:
 self.connect()

 def unsubscribe(self, method: str \| Callable):
 personal\_filters = \["personal.filter", "filter", "personal"\]
 if (
 method in personal\_filters
 or getattr(method, "\_\_name\_\_", "").replace("\_stream", "").replace("\_", ".") in personal\_filters
 ):
 return self.personal\_stream(lambda: ...)

 return super().unsubscribe(method)

 def tickers\_stream(self, callback: Callable\[..., None\]):
 """
 ### Tickers
 Get the latest transaction price, buy-price, sell-price and 24 transaction volume of all the perpetual contracts on the platform without login.
 Send once a second after subscribing.

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]

 :return: None
 """
 params = {}
 topic = "sub.tickers"
 self.\_ws\_subscribe(topic, callback, params)

 def ticker\_stream(self, callback: Callable\[..., None\], symbol: str):
 """
 ### Ticker
 Get the latest transaction price, buy price, sell price and 24 transaction volume of a contract,
 send the transaction data without users' login, and send once a second after subscription.

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str

 :return: None
 """
 params = dict(symbol=symbol)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.ticker"
 self.\_ws\_subscribe(topic, callback, params)

 def deal\_stream(self, callback: Callable\[..., None\], symbol: str):
 """
 ### Transaction
 Access to the latest data without login, and keep updating.

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str

 :return: None
 """
 params = dict(symbol=symbol)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.deal"
 self.\_ws\_subscribe(topic, callback, params)

 def depth\_stream(self, callback: Callable\[..., None\], symbol: str):
 """
 ### Depth

 Tip: \[411.8, 10, 1\] 411.8 is price, 10 is the order numbers of the contract ,1 is the order quantity

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str

 :return: None
 """
 params = dict(symbol=symbol)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.depth"
 self.\_ws\_subscribe(topic, callback, params)

 def depth\_full\_stream(self, callback: Callable\[..., None\], symbol: str, limit: int = 20):
 """
 ### Depth full

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str
 :param limit: Limit could be 5, 10 or 20, default 20 without define., only subscribe to the full amount of one gear
 :type limit: int

 :return: None
 """
 params = dict(symbol=symbol, limit=limit)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.depth.full"
 self.\_ws\_subscribe(topic, callback, params)

 def kline\_stream(
 self,
 callback: Callable\[..., None\],
 symbol: str,
 interval: Literal\["Min1", "Min5", "Min15", "Min60", "Hour1", "Hour4", "Day1", "Week1"\] = "Min1",
 ):
 """
 ### K-line
 Get the k-line data of the contract and keep updating.

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str
 :param interval: Min1, Min5, Min15, Min30, Min60, Hour4, Hour8, Day1, Week1, Month1
 :type interval: str

 :return: None
 """
 params = dict(symbol=symbol, interval=interval)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.kline"
 self.\_ws\_subscribe(topic, callback, params)

 def funding\_rate\_stream(self, callback: Callable\[..., None\], symbol: str):
 """
 ### Funding rate
 Get the contract funding rate, and keep updating.

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str

 :return: None
 """
 params = dict(symbol=symbol)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.funding.rate"
 self.\_ws\_subscribe(topic, callback, params)

 def index\_price\_stream(self, callback: Callable\[..., None\], symbol: str):
 """
 ### Index price
 Get the index price, and will keep updating if there is any changes.

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str

 :return: None
 """
 params = dict(symbol=symbol)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.index.price"
 self.\_ws\_subscribe(topic, callback, params)

 def fair\_price\_stream(self, callback: Callable\[..., None\], symbol: str):
 """
 ### Fair price

 https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

 :param callback: the callback function
 :type callback: Callable\[..., None\]
 :param symbol: the name of the contract
 :type symbol: str

 :return: None
 """
 params = dict(symbol=symbol)

 # clear none values
 params = {k: v for k, v in params.items() if v is not None}

 topic = "sub.fair.price"
 self.\_ws\_subscribe(topic, callback, params)

 # <=================================================================>
 #
 # PRIVATE
 #
 # <=================================================================>

 def filter\_stream(self, callback: Callable, params: Dict\[str, List\[dict\]\] = {"filters": \[\]}):
 """
 ## Filter personal data about account
 Provide \`{"filters":\[\]}\` as params for subscribe to all info
 """
 if params.get("filters") is None:
 raise ValueError("Please provide filters")

 topics = \[x.get("filter") for x in params.get("filters", \[\])\]
 for topic in topics:
 if topic not in FUTURES\_PERSONAL\_TOPICS:
 raise ValueError(f"Invalid filter: \`{topic}\`. Valid filters: {FUTURES\_PERSONAL\_TOPICS}")

 self.\_ws\_subscribe("personal.filter", callback, params)
 # set callback for provided filters
 self.\_set\_personal\_callback(callback, topics)

 def personal\_stream(self, callback: Callable):
 self.filter\_stream(callback, params={"filters": \[\]})
 # set callback for all filters
 self.\_set\_personal\_callback(callback, FUTURES\_PERSONAL\_TOPICS)