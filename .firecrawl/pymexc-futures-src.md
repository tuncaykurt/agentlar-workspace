[Skip to content](https://github.com/makarworld/pymexc/blob/master/pymexc/futures.py#start-of-content)

You signed in with another tab or window. [Reload](https://github.com/makarworld/pymexc/blob/master/pymexc/futures.py) to refresh your session.You signed out in another tab or window. [Reload](https://github.com/makarworld/pymexc/blob/master/pymexc/futures.py) to refresh your session.You switched accounts on another tab or window. [Reload](https://github.com/makarworld/pymexc/blob/master/pymexc/futures.py) to refresh your session.Dismiss alert

{{ message }}

[makarworld](https://github.com/makarworld)/ **[pymexc](https://github.com/makarworld/pymexc)** Public

- [Notifications](https://github.com/login?return_to=%2Fmakarworld%2Fpymexc) You must be signed in to change notification settings
- [Fork\\
30](https://github.com/login?return_to=%2Fmakarworld%2Fpymexc)
- [Star\\
64](https://github.com/login?return_to=%2Fmakarworld%2Fpymexc)


## Collapse file tree

## Files

master

Search this repository(forward slash)` forward slash/`

/

# futures.py

Copy path

Blame

More file actions

Blame

More file actions

## Latest commit

[![makarworld](https://avatars.githubusercontent.com/u/58076271?v=4&size=40)](https://github.com/makarworld)[makarworld](https://github.com/makarworld/pymexc/commits?author=makarworld)

[add broker; add own something like docs; add examples to common usage…](https://github.com/makarworld/pymexc/commit/edaecf4f2184aaff3fca177ecd46cdab20a28bd8)

Open commit details

6 months agoNov 9, 2025

[edaecf4](https://github.com/makarworld/pymexc/commit/edaecf4f2184aaff3fca177ecd46cdab20a28bd8) · 6 months agoNov 9, 2025

## History

[History](https://github.com/makarworld/pymexc/commits/master/pymexc/futures.py)

Open commit details

[View commit history for this file.](https://github.com/makarworld/pymexc/commits/master/pymexc/futures.py) History

2818 lines (2316 loc) · 96.4 KB

/

# futures.py

Top

## File metadata and controls

- Code

- Blame


2818 lines (2316 loc) · 96.4 KB

[Raw](https://github.com/makarworld/pymexc/raw/refs/heads/master/pymexc/futures.py)

Copy raw file

Download raw file

Open symbols panel

Edit and raw actions

1

2

3

4

5

6

7

8

9

10

11

12

13

14

15

16

17

18

19

20

21

22

23

24

25

26

27

28

29

30

31

32

33

34

35

36

37

38

39

40

41

42

43

44

45

46

47

48

49

50

51

52

53

54

55

56

57

58

59

60

61

62

63

64

65

66

67

68

69

70

71

72

73

74

75

76

77

78

79

80

81

82

83

84

85

86

87

88

89

90

91

92

93

94

95

96

97

98

99

100

101

102

103

104

105

106

107

108

109

110

111

112

113

114

115

116

117

118

119

120

121

122

123

124

125

126

127

128

129

130

131

132

133

134

135

136

137

138

139

140

141

142

143

144

145

146

147

148

149

150

2745

2746

2747

2748

2749

2750

2751

2752

2753

2754

2755

2756

2757

2758

2759

2760

2761

2762

2763

2764

2765

2766

2767

2768

2769

2770

2771

2772

2773

2774

2775

2776

2777

2778

2779

2780

2781

2782

2783

2784

2785

2786

2787

2788

2789

2790

2791

2792

2793

2794

2795

2796

2797

2798

2799

2800

2801

2802

2803

2804

2805

2806

2807

2808

2809

2810

2811

2812

2813

2814

2815

2816

2817

2818

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

importlogging

fromtypingimportCallable, Dict, List, Literal, Optional, Union

logger=logging.getLogger(\_\_name\_\_)

try:

from\_async.futuresimportHTTPasAsyncHTTP

from\_async.futuresimportWebSocketasAsyncWebSocket

frombaseimport\_FuturesHTTP

frombase\_websocketimportFUTURES\_PERSONAL\_TOPICS, \_FuturesWebSocket

exceptImportError:

from .\_async.futuresimportHTTPasAsyncHTTP

from .\_async.futuresimportWebSocketasAsyncWebSocket

from .baseimport\_FuturesHTTP

from .base\_websocketimportFUTURES\_PERSONAL\_TOPICS, \_FuturesWebSocket

\_\_all\_\_= \["HTTP", "WebSocket", "AsyncHTTP", "AsyncWebSocket"\]

classHTTP(\_FuturesHTTP):

\# <=================================================================>

#

\# Market Endpoints

#

\# <=================================================================>

defping(self) ->dict:

"""

### Get Server Time

Rate limit: 20 times / 2 seconds

https://www.mexc.com/api-docs/futures/market-endpoints#get-server-time

"""

returnself.call("GET", "api/v1/contract/ping")

defdetail(self, symbol: Optional\[str\] =None) ->dict:

"""

### Get Contract Info

Rate limit: 1 time / 5 seconds

https://www.mexc.com/api-docs/futures/market-endpoints#get-contract-info

:param symbol: (optional) Contract name

:type symbol: str

:return: response dictionary

:rtype: dict

"""

returnself.call("GET", "api/v1/contract/detail", params=dict(symbol=symbol))

defsupport\_currencies(self) ->dict:

"""

### Get Transferable Currencies

Rate limit: 20 times / 2 seconds

https://www.mexc.com/api-docs/futures/market-endpoints#get-transferable-currencies

:return: response dictionary

:rtype: dict

"""

returnself.call("GET", "api/v1/contract/support\_currencies")

defget\_depth(self, symbol: str, limit: Optional\[int\] =None) ->dict:

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

returnself.call("GET", f"api/v1/contract/depth/{symbol}", params=dict(limit=limit))

defdepth\_commits(self, symbol: str, limit: int) ->dict:

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

returnself.call("GET", f"api/v1/contract/depth\_commits/{symbol}/{limit}")

defindex\_price(self, symbol: str) ->dict:

topic="sub.funding.rate"

self.\_ws\_subscribe(topic, callback, params)

defindex\_price\_stream(self, callback: Callable\[..., None\], symbol: str):

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

params=dict(symbol=symbol)

\# clear none values

params= {k: vfork, vinparams.items() ifvisnotNone}

topic="sub.index.price"

self.\_ws\_subscribe(topic, callback, params)

deffair\_price\_stream(self, callback: Callable\[..., None\], symbol: str):

"""

### Fair price

https://mexcdevelop.github.io/apidocs/contract\_v1\_en/#public-channels

:param callback: the callback function

:type callback: Callable\[..., None\]

:param symbol: the name of the contract

:type symbol: str

:return: None

"""

params=dict(symbol=symbol)

\# clear none values

params= {k: vfork, vinparams.items() ifvisnotNone}

topic="sub.fair.price"

self.\_ws\_subscribe(topic, callback, params)

\# <=================================================================>

#

\# PRIVATE

#

\# <=================================================================>

deffilter\_stream(self, callback: Callable, params: Dict\[str, List\[dict\]\] = {"filters": \[\]}):

"""

## Filter personal data about account

Provide \`{"filters":\[\]}\` as params for subscribe to all info

"""

ifparams.get("filters") isNone:

raiseValueError("Please provide filters")

topics= \[x.get("filter") forxinparams.get("filters", \[\])\]

fortopicintopics:

iftopicnotinFUTURES\_PERSONAL\_TOPICS:

raiseValueError(f"Invalid filter: \`{topic}\`. Valid filters: {FUTURES\_PERSONAL\_TOPICS}")

self.\_ws\_subscribe("personal.filter", callback, params)

\# set callback for provided filters

self.\_set\_personal\_callback(callback, topics)

defpersonal\_stream(self, callback: Callable):

self.filter\_stream(callback, params={"filters": \[\]})

\# set callback for all filters

self.\_set\_personal\_callback(callback, FUTURES\_PERSONAL\_TOPICS)

You can’t perform that action at this time.