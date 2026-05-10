import asyncio
import json
from bot.engine import BotEngine
from exchange.mexc_client import MEXCClient
from core.redis_client import get_redis

async def test_mexc_trade():
    print("Mexc Test Başlıyor (PAPER MODE)...")
    
    # Fake bot config
    bot_config = {
        "id": 999,
        "name": "MEXC_Test_Bot",
        "symbol": "BTC/USDT:USDT",
        "strategy": "custom_signal",
        "exchange": "mexc",
        "initial_balance": 7.0,  # 7 dolarlık
        "leverage": 500,         # 500x
        "paper_mode": True,      # PAPER MODE - gerçek API gitmez
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
        # Fiyatı public API'den çekmeye çalışalım (bu çalışır çünkü anahtar istemez)
        print("Fiyat alınıyor (Public)...")
        ticker = await mexc_client.exchange.fetch_ticker("BTC/USDT:USDT")
        price = float(ticker['last'])
        print(f"BTC Fiyatı: {price}")
        
        # Sinyal verisi
        ai_result = {
            "approved": True,
            "confidence": 100,
            "stop_loss": price * (1 + 0.002), # 0.2% SL (Sell)
            "take_profit": price * (1 - 0.004), # 0.4% TP (Sell)
            "analysis": "Paper Test Signal"
        }
        
        # 7 USD margin ile 500x kaldıraç = 3500 pozisyon büyüklüğü
        qty = 3500 / price
        
        print(f"Emir gönderiliyor: Yön=SELL, Qty={qty:.4f}, Fiyat={price}, Kaldıraç=500x, TP={ai_result['take_profit']:.2f}, SL={ai_result['stop_loss']:.2f}")
        
        # Engine execute
        await engine._execute(
            side="sell",
            price=price,
            qty=qty,
            stop_loss=ai_result["stop_loss"],
            ai_result=ai_result
        )
        
        print("İşlem komutu Engine'e başarıyla iletildi (Paper Mode).")
        
    except Exception as e:
        print(f"HATA: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        await mexc_client.close()

if __name__ == "__main__":
    asyncio.run(test_mexc_trade())
