#!/bin/bash
# ============================================================
# 🔧 Servis İzleyici — Otomatik Kurulum
# ============================================================
# Bu script:
# 1. master.env'den tokenları /tmp/antigravity_env.json'a kopyalar
# 2. macOS LaunchAgent ile saatlik health check ayarlar
# 3. Dry-run test yapar
#
# Kullanım: bash setup_cron.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
ANTIGRAVITY_ROOT="$(dirname "$(dirname "$SKILL_DIR")")"
HEALTH_CHECK="$SCRIPT_DIR/health_check.py"
ENV_CACHE="/tmp/antigravity_env.json"
MASTER_ENV="$ANTIGRAVITY_ROOT/_knowledge/credentials/master.env"
PLIST_SRC="$SKILL_DIR/com.antigravity.servis-izleyici.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.antigravity.servis-izleyici.plist"
LABEL="com.antigravity.servis-izleyici"

echo "🔧 Servis İzleyici Kurulumu"
echo "================================="

# ── 1. Token Dosyası Oluştur ──
echo ""
echo "📦 Adım 1: Token bilgileri hazırlanıyor..."

RAILWAY_TOKEN=""
SMTP_USER=""
SMTP_APP_PASSWORD=""

# master.env'den oku
if [ -r "$MASTER_ENV" ]; then
    RAILWAY_TOKEN=$(grep "^RAILWAY_TOKEN=" "$MASTER_ENV" | cut -d'=' -f2 | tr -d ' ')
    SMTP_USER=$(grep "^SMTP_USER=" "$MASTER_ENV" | cut -d'=' -f2 | tr -d ' ')
    SMTP_APP_PASSWORD=$(grep "^SMTP_APP_PASSWORD=" "$MASTER_ENV" | cut -d'=' -f2-)
    echo "  ✅ master.env okundu"
else
    echo "  ⚠️  master.env okunamadı. Token bilgilerini girin:"
fi

if [ -z "$RAILWAY_TOKEN" ]; then
    read -p "  Railway Token: " RAILWAY_TOKEN
fi
if [ -z "$SMTP_USER" ]; then
    SMTP_USER="EMAIL_ADRESI_BURAYA"
fi
if [ -z "$SMTP_APP_PASSWORD" ]; then
    read -p "  Gmail App Password (boş bırakabilirsiniz): " SMTP_APP_PASSWORD
fi

cat > "$ENV_CACHE" << EOF
{
    "RAILWAY_TOKEN": "$RAILWAY_TOKEN",
    "SMTP_USER": "$SMTP_USER",
    "SMTP_APP_PASSWORD": "$SMTP_APP_PASSWORD",
    "DEPLOY_REGISTRY": "$ANTIGRAVITY_ROOT/_knowledge/deploy-registry.md"
}
EOF
chmod 600 "$ENV_CACHE"
echo "  ✅ Token cache: $ENV_CACHE"

# ── 2. Test ──
echo ""
echo "🧪 Adım 2: Dry-run test..."
PYTHON=$(which python3)
$PYTHON "$HEALTH_CHECK" --dry-run
echo ""
echo "  ✅ Test başarılı!"

# ── 3. LaunchAgent Ayarla ──
echo ""
echo "⏰ Adım 3: LaunchAgent ayarlanıyor..."

# Eğer zaten yüklüyse durdur
launchctl list "$LABEL" 2>/dev/null && launchctl unload "$PLIST_DST" 2>/dev/null || true

# Plist'i kopyala
cp "$PLIST_SRC" "$PLIST_DST"
echo "  ✅ Plist kopyalandı: $PLIST_DST"

# Yükle ve başlat
launchctl load "$PLIST_DST"
echo "  ✅ LaunchAgent yüklendi ve başlatıldı!"

# Durum kontrol
echo ""
echo "  LaunchAgent durumu:"
launchctl list "$LABEL" 2>&1 || true

# ── 4. Crontab (Yedek) ──
echo ""
echo "📝 Yedek olarak crontab da ayarlanıyor..."
CRON_CMD="0 * * * * $PYTHON $HEALTH_CHECK >> /tmp/antigravity_health_check.log 2>&1"
(crontab -l 2>/dev/null | grep -v "health_check.py"; echo "$CRON_CMD") | crontab - 2>/dev/null && echo "  ✅ Crontab ayarlandı" || echo "  ⚠️  Crontab ayarlanamadı (LaunchAgent aktif)"

# ── 5. Özet ──
echo ""
echo "================================="
echo "✅ KURULUM TAMAMLANDI!"
echo "================================="
echo ""
echo "📋 Durum:"
echo "  • Health check: $HEALTH_CHECK"
echo "  • Token cache: $ENV_CACHE"
echo "  • LaunchAgent: $PLIST_DST"
echo "  • Log: /tmp/antigravity_health_check.log"
echo "  • Aralık: Saatlik (3600 saniye)"
echo ""
echo "🔧 Komutlar:"
echo "  python3 $HEALTH_CHECK --dry-run     # Manuel test"
echo "  python3 $HEALTH_CHECK               # Gerçek çalıştırma"
echo "  tail -f /tmp/antigravity_health_check.log  # Log izle"
echo ""
echo "🛑 Durdurmak için:"
echo "  launchctl unload $PLIST_DST"
