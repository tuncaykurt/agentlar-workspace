import asyncio
import json
from bot.engine import BotEngine
from exchange.mexc_client import MEXCClient
from core.config import settings

# Kullanıcının verdiği API Key'leri inject ediyoruz (Container restart gerektirmesin diye)
settings.MEXC_API_KEY = "mx0vglde0CJdBbq0rK"
settings.MEXC_API_SECRET = "2edec334e4ed4258b8ab6aefa657f4ef"

async def test_mexc_live_trade():
    print("Mexc CANLI İŞLEM Testi Başlıyor...")
    
    # Fake bot config
    bot_config = {
        "id": 999,
        "name": "MEXC_Live_Test",
        "symbol": "ETH/USDT:USDT",
        "strategy": "custom_signal",
        "exchange": "mexc",
        "initial_balance": 7.0,  # 7 dolarlık işlem büyüklüğü
        "leverage": 500,         # 500x
        "paper_mode": False,     # GERÇEK İŞLEM!
        "risk_per_trade": 100.0,
        "params": {
            "tp_pct": 0.4,
            "sl_pct": 0.2,
            "margin_mode": "cross",
            "position_action": "close_and_open"
        }
    }
    
    mexc_client = MEXCClient()
    engine = BotEngine(bot_config, mexc_client)
    
    try:
        # Fiyatı alalım
        print("ETH Fiyatı alınıyor...")
        ticker = await mexc_client.exchange.fetch_ticker("ETH/USDT:USDT")
        price = float(ticker['last'])
        print(f"ETH Anlık Fiyatı: {price}")
        
        # Kaldıraç ayarla (500x)
        try:
            print("Kaldıraç ayarlanıyor: 500x")
            await mexc_client.set_leverage("ETH/USDT:USDT", 500)
            print("Kaldıraç başarıyla ayarlandı.")
        except Exception as e:
            print(f"Kaldıraç ayarlama hatası (zaten ayarlanmış olabilir): {e}")

        # Sinyal verisi
        ai_result = {
            "approved": True,
            "confidence": 100,
            "stop_loss": price * (1 + 0.002), # 0.2% SL (Sell)
            "take_profit": price * (1 - 0.004), # 0.4% TP (Sell)
            "analysis": "Canlı Test Sinyali"
        }
        
        # 7 USD margin ile 500x kaldıraç = 3500 pozisyon büyüklüğü
        qty = 3500 / price
        
        print(f"CANLI EMİR GÖNDERİLİYOR: Yön=SELL, Qty={qty:.4f}, Fiyat={price}, Kaldıraç=500x, TP={ai_result['take_profit']:.2f}, SL={ai_result['stop_loss']:.2f}")
        
        # Engine execute - Bu aşamada gerçek borsa isteği yapılır
        await engine._execute(
            side="sell",
            price=price,
            qty=qty,
            stop_loss=ai_result["stop_loss"],
            ai_result=ai_result
        )
        
        print("✅ CANLI İŞLEM BAŞARIYLA AÇILDI!")
        
    except Exception as e:
        print(f"❌ HATA: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        await mexc_client.close()

if __name__ == "__main__":
    asyncio.run(test_mexc_live_trade())
