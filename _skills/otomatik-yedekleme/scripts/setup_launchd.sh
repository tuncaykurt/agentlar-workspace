#!/bin/bash
# ============================================================================
# ⏰ LaunchD Kurulum Script'i (Cron'dan daha iyi!)
# ============================================================================
# macOS launchd ile haftalık yedekleme kurar.
# Avantajı: Bilgisayar kapalıyken kaçırılan job'ı açılınca çalıştırır.
# ============================================================================

set -euo pipefail

PLIST_SOURCE="$HOME/Desktop/Antigravity/_skills/otomatik-yedekleme/scripts/com.antigravity.backup.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.antigravity.backup.plist"
BACKUP_SCRIPT="$HOME/Desktop/Antigravity/_skills/otomatik-yedekleme/scripts/backup.sh"
BACKUP_DIR="$HOME/Desktop/_backups"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ⏰ LaunchD Kurulumu (Akıllı Zamanlayıcı)   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Script'in var olduğunu kontrol et
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "❌ HATA: Backup script bulunamadı: $BACKUP_SCRIPT"
    exit 1
fi

# Script'i çalıştırılabilir yap
chmod +x "$BACKUP_SCRIPT"

# Backup dizinini oluştur
mkdir -p "$BACKUP_DIR"

# LaunchAgents dizinini oluştur
mkdir -p "$HOME/Library/LaunchAgents"

# Eski job varsa kaldır
if launchctl list 2>/dev/null | grep -q "com.antigravity.backup"; then
    echo "⚠️  Mevcut job bulundu, kaldırılıyor..."
    launchctl unload "$PLIST_TARGET" 2>/dev/null || true
fi

# Plist'i kopyala
cp "$PLIST_SOURCE" "$PLIST_TARGET"

# Job'ı yükle
launchctl load "$PLIST_TARGET"

echo "✅ LaunchD job başarıyla kuruldu!"
echo ""
echo "📋 Yapılandırma:"
echo "   Zamanlama  : Her Pazar, 03:00"
echo "   Script     : $BACKUP_SCRIPT"
echo "   Log        : $BACKUP_DIR/launchd_output.log"
echo ""
echo "🔑 Cron'dan farkı:"
echo "   Mac kapalı/uykudaysa → açılınca otomatik çalıştırır!"
echo ""
echo "📌 Doğrulama:"
echo "   launchctl list | grep antigravity"
echo ""
echo "🗑️  Kaldırmak için:"
echo "   launchctl unload ~/Library/LaunchAgents/com.antigravity.backup.plist"
echo "   rm ~/Library/LaunchAgents/com.antigravity.backup.plist"
echo ""

# Durum kontrolü
echo "📄 Job durumu:"
echo "─────────────────────────────────────────"
launchctl list | grep "antigravity" || echo "(henüz çalışmadı)"
echo "─────────────────────────────────────────"
echo ""

# Eski cron job'ı kaldırma önerisi
if crontab -l 2>/dev/null | grep -q "backup.sh"; then
    echo "💡 Eski cron job'ı hâlâ aktif. Kaldırmak için:"
    echo "   crontab -l | grep -v 'backup.sh' | crontab -"
    echo ""
fi
