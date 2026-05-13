from freqtrade.strategy import IStrategy
from pandas import DataFrame
import talib.abstract as ta
import freqtrade.vendor.qtpylib.indicators as qtpylib

class AntigravityStrategy(IStrategy):
    """
    Antigravity AI için özel olarak tasarlanmış başlangıç stratejisi.
    RSI ve Bollinger Bantları kullanarak güvenli giriş/çıkış noktaları arar.
    """
    INTERFACE_VERSION = 3
    timeframe = '5m'

    # Strateji parametreleri
    minimal_roi = {
        "60": 0.01,
        "30": 0.02,
        "0": 0.04
    }
    stoploss = -0.10
    trailing_stop = False

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # RSI
        dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)

        # Bollinger Bands
        bollinger = qtpylib.bollinger_bands(qtpylib.typical_price(dataframe), window=20, stds=2)
        dataframe['bb_lowerband'] = bollinger['lower']
        dataframe['bb_upperband'] = bollinger['upper']

        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (
                (dataframe['rsi'] < 30) &  # Aşırı satış
                (dataframe['close'] < dataframe['bb_lowerband']) # Alt bant delinmiş
            ),
            'enter_long'] = 1

        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[
            (
                (dataframe['rsi'] > 70) |  # Aşırı alış
                (dataframe['close'] > dataframe['bb_upperband']) # Üst bant delinmiş
            ),
            'exit_long'] = 1

        return dataframe
