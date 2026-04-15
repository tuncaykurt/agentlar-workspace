#!/bin/bash
# ============================================
# Kie AI — Görev Durumu Sorgulama (Polling)
# Ortak helper script — diğer scriptler tarafından kullanılır
# ============================================

KIE_API_KEY="BURAYA_KIE_API_KEY"
KIE_BASE_URL="https://api.kie.ai/api/v1"

# Görev durumunu sorgula ve sonucu bekle
# Kullanım: source scripts/kie_poll.sh && poll_task "task-id"
poll_task() {
  local TASK_ID="$1"
  local MAX_ATTEMPTS="${2:-60}"  # Varsayılan 60 deneme (5 dakika)
  local INTERVAL="${3:-5}"       # Varsayılan 5 saniye

  echo "⏳ Görev bekleniyor: $TASK_ID"
  echo "   Max deneme: $MAX_ATTEMPTS, Aralık: ${INTERVAL}s"

  for ((i=1; i<=MAX_ATTEMPTS; i++)); do
    RESPONSE=$(curl -s -X GET \
      "${KIE_BASE_URL}/jobs/recordInfo?taskId=${TASK_ID}" \
      -H "Authorization: Bearer ${KIE_API_KEY}" \
      -H "Content-Type: application/json")

    STATE=$(echo "$RESPONSE" | jq -r '.data.state // empty')

    if [ "$STATE" = "success" ]; then
      echo "✅ Görev tamamlandı!"
      RESULT_JSON=$(echo "$RESPONSE" | jq -r '.data.resultJson // empty')
      if [ -n "$RESULT_JSON" ]; then
        RESULT_URLS=$(echo "$RESULT_JSON" | jq -r '.resultUrls[]? // empty' 2>/dev/null)
        if [ -n "$RESULT_URLS" ]; then
          echo "📥 Sonuç URL'leri:"
          echo "$RESULT_URLS"
        fi
      fi
      echo "$RESPONSE" | jq '.data'
      return 0
    elif [ "$STATE" = "failed" ]; then
      echo "❌ Görev başarısız!"
      FAIL_MSG=$(echo "$RESPONSE" | jq -r '.data.failMsg // "Bilinmeyen hata"')
      echo "   Hata: $FAIL_MSG"
      echo "$RESPONSE" | jq '.data'
      return 1
    else
      echo "   [$i/$MAX_ATTEMPTS] Durum: ${STATE:-processing}..."
      sleep "$INTERVAL"
    fi
  done

  echo "⏰ Zaman aşımı! Görev hâlâ tamamlanmadı."
  echo "   Task ID: $TASK_ID"
  echo "   Manuel kontrol: curl -s '${KIE_BASE_URL}/jobs/recordInfo?taskId=${TASK_ID}' -H 'Authorization: Bearer ${KIE_API_KEY}'"
  return 2
}

# Görev oluştur ve task ID döndür
# Kullanım: TASK_ID=$(create_task '{...json...}')
create_task() {
  local JSON_BODY="$1"

  RESPONSE=$(curl -s -X POST \
    "${KIE_BASE_URL}/jobs/createTask" \
    -H "Authorization: Bearer ${KIE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$JSON_BODY")

  TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id // .data.taskId // empty')

  if [ -z "$TASK_ID" ]; then
    echo "❌ Görev oluşturulamadı!" >&2
    echo "$RESPONSE" | jq '.' >&2
    return 1
  fi

  echo "$TASK_ID"
}

# Veo 3.1 için özel görev oluşturma (farklı endpoint)
create_veo_task() {
  local JSON_BODY="$1"

  RESPONSE=$(curl -s -X POST \
    "${KIE_BASE_URL}/veo/generate" \
    -H "Authorization: Bearer ${KIE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$JSON_BODY")

  TASK_ID=$(echo "$RESPONSE" | jq -r '.data.task_id // .data.taskId // empty')

  if [ -z "$TASK_ID" ]; then
    echo "❌ Veo görevi oluşturulamadı!" >&2
    echo "$RESPONSE" | jq '.' >&2
    return 1
  fi

  echo "$TASK_ID"
}
