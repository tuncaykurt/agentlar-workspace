#!/bin/bash
# ============================================================================
# 🗄️ Antigravity Otomatik Yedekleme Script'i
# ============================================================================
# Antigravity projesini tarihli zip olarak yedekler.
# Gereksiz dosyaları hariç tutar ve eski yedekleri otomatik siler.
# ============================================================================

set -euo pipefail

# --- Yapılandırma ---
SOURCE_DIR="$HOME/Desktop/Antigravity"
BACKUP_DIR="$HOME/Desktop/_backups"
MAX_BACKUPS=4
DATE=$(date +%Y-%m-%d)
BACKUP_NAME="Antigravity_backup_${DATE}.zip"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
LOG_FILE="${BACKUP_DIR}/backup_log.txt"

# --- Fonksiyonlar ---

log_message() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $message" | tee -a "$LOG_FILE"
}

create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_message "📁 Yedek dizini oluşturuldu: $BACKUP_DIR"
    fi
}

check_source() {
    if [ ! -d "$SOURCE_DIR" ]; then
        log_message "❌ HATA: Kaynak dizin bulunamadı: $SOURCE_DIR"
        exit 1
    fi
}

perform_backup() {
    local start_time=$(date +%s)
    
    # Aynı tarihli yedek varsa üzerine yaz
    if [ -f "$BACKUP_PATH" ]; then
        rm "$BACKUP_PATH"
        log_message "⚠️  Aynı tarihli eski yedek silindi: $BACKUP_NAME"
    fi
    
    # Zip ile yedekleme — proje kökünden çalıştır
    cd "$(dirname "$SOURCE_DIR")"
    
    local base="$(basename "$SOURCE_DIR")"
    
    zip -r -q "$BACKUP_PATH" "$base" \
        -x "${base}/.git/*" \
        -x "${base}/*/node_modules/*" \
        -x "${base}/node_modules/*" \
        -x "${base}/*/.venv/*" \
        -x "${base}/.venv/*" \
        -x "${base}/*/venv/*" \
        -x "${base}/venv/*" \
        -x "${base}/*/__pycache__/*" \
        -x "${base}/__pycache__/*" \

        -x "*.mp4" \
        -x "*.mov" \
        -x "*.DS_Store" \
        -x "*.pyc" \
        -x "${base}/*/.env" \
        -x "${base}/.env" \
        -x "${base}/.gemini/*"
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local size=$(du -h "$BACKUP_PATH" | cut -f1 | xargs)
    
    echo "${size}|${duration}"
}

cleanup_old_backups() {
    local count=0
    local deleted=0
    
    # Yedekleri tarihe göre sırala (en yeni en üstte)
    while IFS= read -r file; do
        count=$((count + 1))
        if [ $count -gt $MAX_BACKUPS ]; then
            rm "$file"
            deleted=$((deleted + 1))
            log_message "🗑️  Eski yedek silindi: $(basename "$file")"
        fi
    done < <(ls -t "$BACKUP_DIR"/Antigravity_backup_*.zip 2>/dev/null)
    
    echo "$deleted"
}

count_backups() {
    ls -1 "$BACKUP_DIR"/Antigravity_backup_*.zip 2>/dev/null | wc -l | xargs
}

# --- Ana Akış ---

main() {
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║   🗄️  Antigravity Yedekleme Sistemi          ║"
    echo "╠══════════════════════════════════════════════╣"
    echo "║   Tarih: $(date '+%Y-%m-%d %H:%M:%S')              ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""
    
    # Ön kontroller
    check_source
    create_backup_dir
    
    log_message "🚀 Yedekleme başlatılıyor..."
    log_message "📂 Kaynak: $SOURCE_DIR"
    log_message "📦 Hedef: $BACKUP_PATH"
    
    # Yedekleme
    result=$(perform_backup)
    backup_size=$(echo "$result" | cut -d'|' -f1)
    backup_duration=$(echo "$result" | cut -d'|' -f2)
    
    # Eski yedekleri temizle
    deleted=$(cleanup_old_backups)
    remaining=$(count_backups)
    
    # Sonuç
    log_message "✅ Backup başarılı: $BACKUP_NAME (${backup_size}) | Süre: ${backup_duration}s | Tutulan: ${remaining} yedek"
    
    echo ""
    echo "┌──────────────────────────────────────────────┐"
    echo "│  ✅ Yedekleme tamamlandı!                     │"
    echo "│  📦 Dosya: $BACKUP_NAME"
    echo "│  💾 Boyut: ${backup_size}"
    echo "│  ⏱️  Süre: ${backup_duration} saniye"
    echo "│  📊 Toplam yedek: ${remaining}/${MAX_BACKUPS}"
    if [ "$deleted" -gt 0 ]; then
    echo "│  🗑️  Silinen eski yedek: ${deleted}"
    fi
    echo "└──────────────────────────────────────────────┘"
    echo ""
}

main "$@"
