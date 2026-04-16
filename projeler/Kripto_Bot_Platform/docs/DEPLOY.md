# Coolify Deploy Kılavuzu

## 1. GitHub'a Push Et
```bash
cd projeler/kripto-bot-platform
git init
git add .
git commit -m "initial: kripto bot platform"
git remote add origin https://github.com/kullaniciadi/kripto-bot-platform.git
git push -u origin main
```

## 2. Coolify'da Proje Oluştur

1. Coolify paneline gir (VPS IP:8000)
2. **New Resource → Docker Compose**
3. GitHub repo'yu bağla
4. `docker-compose.yml` dosyasını seç

## 3. Environment Variables (Coolify → Settings → Environment)
```
DATABASE_URL=postgresql://user:pass@supabase-host:5432/cryptobot
REDIS_URL=redis://redis:6379
BITGET_API_KEY=...
BITGET_API_SECRET=...
BITGET_PASSPHRASE=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
SECRET_KEY=rastgele-uzun-string
ENVIRONMENT=production
FRONTEND_URL=https://senin-domain.com
BACKEND_URL=https://api.senin-domain.com
```

## 4. Supabase Self-Hosted Bağlantısı
Supabase'in `DATABASE_URL`'ini doğrudan kullan:
```
DATABASE_URL=postgresql://postgres:sifren@supabase-ip:5432/postgres
```

## 5. Domain Ayarla (Coolify → Domains)
- Frontend → `kripto.domain.com` → Port 3000
- Backend  → `api.kripto.domain.com` → Port 8000

## 6. İlk Çalıştırma
```bash
# Coolify terminali veya SSH ile:
docker compose exec backend python -c "
from core.database import engine, Base
import asyncio
from models.trade import Bot, Trade
asyncio.run(engine.dispose())
"
```

## 7. Bitget API Key Alma
1. Bitget → Profil → API Management
2. **Create API** → Futures Trading izni ver
3. IP kısıtlaması: VPS IP'ni ekle (güvenlik!)
4. Passphrase belirle ve kaydet

## Kontrol
- Backend: https://api.domain.com/health → {"status": "ok"}
- Frontend: https://domain.com/dashboard → Grafik görünmeli
