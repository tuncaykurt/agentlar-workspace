#!/bin/bash
# ============================================================================
# ⏰ Crontab Kurulum Script'i
# ============================================================================
# Antigravity yedekleme script'ini crontab'a ekler.
# Her Pazar gece 03:00'te çalışacak şekilde yapılandırır.
# ============================================================================

set -euo pipefail

BACKUP_SCRIPT="$HOME/Desktop/Antigravity/_skills/otomatik-yedekleme/scripts/backup.sh"
BACKUP_LOG_DIR="$HOME/Desktop/_backups"
CRON_SCHEDULE="0 3 * * 0"  # Her Pazar 03:00
CRON_LINE="${CRON_SCHEDULE} /bin/bash ${BACKUP_SCRIPT} >> ${BACKUP_LOG_DIR}/cron_output.log 2>&1"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ⏰ Crontab Kurulumu                        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Script'in var olduğunu kontrol et
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "❌ HATA: Backup script bulunamadı: $BACKUP_SCRIPT"
    exit 1
fi

# Script'i çalıştırılabilir yap
chmod +x "$BACKUP_SCRIPT"

# Backup log dizinini oluştur
mkdir -p "$BACKUP_LOG_DIR"

# Mevcut crontab'da backup satırı var mı kontrol et
if crontab -l 2>/dev/null | grep -q "backup.sh"; then
    echo "⚠️  Mevcut backup cron job'ı bulundu. Güncelleniyor..."
    # Eski satırı kaldır
    crontab -l 2>/dev/null | grep -v "backup.sh" | crontab -
fi

# Yeni cron job ekle
(crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -

echo "✅ Cron job başarıyla eklendi!"
echo ""
echo "📋 Yapılandırma:"
echo "   Zamanlama : Her Pazar, 03:00"
echo "   Script    : $BACKUP_SCRIPT"
echo "   Log       : $BACKUP_LOG_DIR/cron_output.log"
echo ""
echo "📌 Doğrulama:"
echo "   crontab -l | grep backup"
echo ""
echo "🗑️  Kaldırmak için:"
echo "   crontab -l | grep -v 'backup.sh' | crontab -"
echo ""

# Mevcut crontab'ı göster
echo "📄 Mevcut crontab içeriği:"
echo "─────────────────────────────────────────"
crontab -l 2>/dev/null || echo "(boş)"
echo "─────────────────────────────────────────"
echo ""

# macOS izin uyarısı
echo "⚠️  macOS Notu:"
echo "   Cron'un düzgün çalışması için Full Disk Access izni gerekebilir."
echo "   System Settings > Privacy & Security > Full Disk Access"
echo "   altında '/usr/sbin/cron' ekleyin."
echo ""
