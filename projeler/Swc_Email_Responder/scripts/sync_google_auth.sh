#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 🔄 google_auth.py Senkronizasyon Scripti
# ═══════════════════════════════════════════════════════════════
# Merkezi _knowledge/credentials/oauth/google_auth.py dosyasını
# shared/google_auth.py'ye kopyalar.
#
# Kullanım:
#   bash scripts/sync_google_auth.sh        (manuel)
#   Pre-commit hook tarafından otomatik çağrılır
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# Proje kökünü bul (scripts/ dizininin bir üstü)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Merkezi kaynak dosya (Antigravity kökünden relative)
SOURCE_ABS="$PROJECT_ROOT/../../_knowledge/credentials/oauth/google_auth.py"
TARGET_ABS="$PROJECT_ROOT/shared/google_auth.py"

# Kaynak dosya yoksa (Railway ortamı) sessizce çık
if [ ! -f "$SOURCE_ABS" ]; then
  echo "⚠️  Merkezi google_auth.py bulunamadı: $SOURCE_ABS"
  echo "   (Railway ortamında normal — env var kullanılır)"
  exit 0
fi

# Hedef yoksa oluştur
if [ ! -f "$TARGET_ABS" ]; then
  echo "🆕 shared/google_auth.py mevcut değil, kopyalanıyor..."
  cp "$SOURCE_ABS" "$TARGET_ABS"
  git -C "$PROJECT_ROOT" add "$TARGET_ABS" 2>/dev/null || true
  echo "🔄 google_auth.py senkronize edildi (merkezi → shared/)"
  exit 0
fi

# Fark varsa kopyala ve git'e ekle
if ! diff -q "$SOURCE_ABS" "$TARGET_ABS" > /dev/null 2>&1; then
  cp "$SOURCE_ABS" "$TARGET_ABS"
  git -C "$PROJECT_ROOT" add "$TARGET_ABS" 2>/dev/null || true
  echo "🔄 google_auth.py senkronize edildi (merkezi → shared/)"
else
  echo "✅ google_auth.py zaten güncel"
fi
