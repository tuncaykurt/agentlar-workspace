# Kripto Bot Platform — Proje Planı

## Stack
- **Frontend:** Next.js 14 + Tailwind CSS + TradingView Lightweight Charts
- **Backend:** FastAPI (Python 3.11)
- **DB:** Supabase (self-hosted PostgreSQL)
- **Cache:** Redis (Docker container)
- **Deploy:** Coolify / Hostinger VPS (4GB RAM)
- **Exchange:** Bybit (Futures)
- **Alert:** Telegram Bot

## Fazlar

### Faz 1 — Veri + Grafik
- [ ] FastAPI kurulum + Bybit WebSocket
- [ ] Canlı fiyat verisi akışı
- [ ] Next.js dashboard + TradingView chart
- [ ] Coolify deploy

### Faz 2 — Bot Engine
- [ ] Strateji sistemi (EMA Cross)
- [ ] Paper trading modu
- [ ] Risk manager
- [ ] PnL takibi + DB
- [ ] Telegram alert

### Faz 3 — Gerçek İşlem
- [ ] Bybit API key entegrasyonu
- [ ] Gerçek order execution
- [ ] Kill switch mekanizması
- [ ] Backtest arayüzü

## Klasör Yapısı
```
kripto-bot-platform/
├── frontend/        # Next.js 14
├── backend/         # FastAPI
├── docs/            # Dokümantasyon
├── docker-compose.yml
└── .env.example
```
