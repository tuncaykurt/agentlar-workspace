# TradingView MCP Entegrasyon Kılavuzu

## Mevcut Sisteme Etkisi: SIFIR

`TV_MCP_ENABLED=false` (varsayılan) olduğu sürece:
- Hiçbir kod çalışmaz
- Grid bot, HFT engine, MEXC bağlantısı — hepsi aynen devam eder
- Yeni endpoint'ler `/api/tv/` prefix'i altında görünür ama "devre dışı" mesajı döner

---

## Seçenek A — Pine Script Webhook Modu (Önerilen, Kolay)

TradingView'ın kendi alert sistemi üzerinden sinyal gönderir.
**TradingView Desktop kurulumu gerektirmez.**

### 1. .env'i Güncelle
```
TV_MCP_ENABLED=true
TV_WEBHOOK_SECRET=güvenli-bir-şifre-yaz
```

### 2. TradingView Pine Script Alert Ayarla
TradingView'da bir strateji/indikatör aç → Alert oluştur:

**Webhook URL:**
```
https://kriptobot.yapayzekaotomasyon.cloud/api/tv/signal
```

**Alert Mesajı (JSON):**
```json
{
  "action": "START_GRID",
  "symbol": "{{ticker}}",
  "price": {{close}},
  "secret": "güvenli-bir-şifre-yaz",
  "grid_config": {
    "mode": "paper",
    "leverage": 10,
    "order_size": 100,
    "spread_pct": 0.5,
    "grid_count": 20
  }
}
```

### 3. Desteklenen Aksiyonlar

| Aksiyon | Ne Yapar |
|---------|----------|
| `START_GRID` | Grid bot'u başlatır (grid_config parametreleriyle) |
| `STOP_GRID` | Grid bot'u durdurur (pozisyonlar açık kalır) |
| `KILL_SWITCH` | Acil durdurma — tüm pozisyonları kapatır |
| `STATUS` | Sadece durum bilgisi döner (test için) |
| `BUY` / `SELL` | Kaydedilir ama grid bot kendi kararını verir |

### 4. Örnek Pine Script Stratejisi

```pine
//@version=5
strategy("Grid Trigger", overlay=true)

// RSI bazlı tetikleyici
rsi = ta.rsi(close, 14)

// RSI 30 altı → Grid başlat (oversold bölge, alım fırsatı)
if ta.crossover(rsi, 30) and strategy.position_size == 0
    alert('{"action":"START_GRID","symbol":"' + syminfo.ticker + '","price":' + str.tostring(close) + ',"secret":"şifreni-yaz","grid_config":{"mode":"paper","leverage":10,"order_size":100}}', alert.freq_once_per_bar)

// RSI 70 üstü → Grid durdur (overbought, kâr al)
if ta.crossunder(rsi, 70)
    alert('{"action":"STOP_GRID","symbol":"' + syminfo.ticker + '","price":' + str.tostring(close) + ',"secret":"şifreni-yaz"}', alert.freq_once_per_bar)
```

---

## Seçenek B — TradingView Desktop MCP Modu (İleri Seviye)

Claude'un TradingView ekranını "görmesini" ve analiz yapmasını sağlar.

### 1. Gereksinimler
- TradingView Desktop uygulaması (tradingview.com/desktop)
- Node.js v18+
- Ücretli TradingView aboneliği (real-time data için)

### 2. MCP Server Kurulumu (Windows)
```powershell
# Repoyu klon
git clone https://github.com/tradesdontlie/tradingview-mcp.git C:\tradingview-mcp
cd C:\tradingview-mcp
npm install
```

### 3. TradingView'i Debug Modunda Başlat
```powershell
# TradingView'i tamamen kapat, sonra:
$tvPath = "$env:LOCALAPPDATA\Programs\TradingView\TradingView.exe"
Start-Process $tvPath -ArgumentList "--remote-debugging-port=9222"
```

**Bağlantıyı Test Et:**
```
http://localhost:9222/json  →  Bu URL'de JSON dönüyorsa bağlantı tamam
```

Veya API ile:
```
GET /api/tv/mcp-health
```

### 4. Claude Desktop Config (claude_desktop_config.json)
Dosya konumu: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["C:\\tradingview-mcp\\src\\server.js"]
    }
  }
}
```

---

## Seçenek C — Manuel API Kontrolü (TV'siz)

TradingView olmadan da `/api/tv/` endpoint'lerini kullanabilirsin:

```bash
# Grid başlat
curl -X POST https://kriptobot.yapayzekaotomasyon.cloud/api/tv/start-grid \
  -H "Content-Type: application/json" \
  -d '{"symbol":"ETHUSDT","mode":"paper","leverage":10,"order_size":100}'

# Grid durdur
curl -X POST https://kriptobot.yapayzekaotomasyon.cloud/api/tv/stop-grid

# Durum kontrol
curl https://kriptobot.yapayzekaotomasyon.cloud/api/tv/status
```

---

## Endpoint Listesi

| Method | URL | Açıklama |
|--------|-----|----------|
| `POST` | `/api/tv/signal` | Pine Script webhook alıcısı |
| `GET` | `/api/tv/status` | Köprü + grid durumu |
| `GET` | `/api/tv/history` | Son 20 sinyal |
| `POST` | `/api/tv/start-grid` | Manuel grid başlat |
| `POST` | `/api/tv/stop-grid` | Manuel grid durdur |
| `POST` | `/api/tv/kill-switch` | Acil durdurma |
| `GET` | `/api/tv/mcp-health` | TV Desktop bağlantı kontrolü |

---

## Önemli Notlar

- **Grid bot fiyat kaynağı MEXC'te kalır** — TradingView fiyatı kullanılmaz
- **TV sadece tetikleyici** — START_GRID/STOP_GRID kararını verir
- `TV_MCP_ENABLED=false` ile sistem tamamen eski haline döner
- TradingView ToS'una dikkat et (programmatic control kısıtlamaları olabilir)
