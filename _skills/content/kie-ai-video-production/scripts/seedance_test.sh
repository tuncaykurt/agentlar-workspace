#!/bin/bash
# Seedance 2.0 API Test Script
# Tüm testler: 480p, 4 saniye (minimum maliyet)

API_KEY="BURAYA_KIE_API_KEY"
BASE_URL="https://api.kie.ai/api/v1"

echo "============================================"
echo "🧪 SEEDANCE 2.0 API TEST SÜİTİ"
echo "============================================"
echo "Çözünürlük: 480p | Süre: 4s | Ses: kapalı"
echo ""

# ──────────────────────────────────────────
# TEST 1: Text-to-Video (Sadece Prompt)
# ──────────────────────────────────────────
echo "📹 TEST 1: Text-to-Video (sadece prompt)"
echo "──────────────────────────────────────────"

RESPONSE_1=$(curl -s --location --request POST "$BASE_URL/jobs/createTask" \
--header "Authorization: Bearer $API_KEY" \
--header "Content-Type: application/json" \
--data-raw '{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "A single red rose slowly blooming in time-lapse, soft studio backlight creating a warm golden glow, extreme close-up, locked-off camera, shallow depth of field, 4 seconds, smooth gentle motion",
        "resolution": "480p",
        "aspect_ratio": "16:9",
        "duration": 4,
        "generate_audio": false,
        "web_search": false
    }
}')

echo "Response: $RESPONSE_1"
TASK_ID_1=$(echo "$RESPONSE_1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('taskId','FAILED'))" 2>/dev/null || echo "PARSE_ERROR")
echo "Task ID: $TASK_ID_1"
echo ""

# ──────────────────────────────────────────
# TEST 2: Image-to-Video (first_frame_url)
# ──────────────────────────────────────────
echo "📹 TEST 2: Image-to-Video (first_frame_url)"
echo "──────────────────────────────────────────"

# Unsplash'tan ücretsiz bir ürün görseli kullanıyoruz
RESPONSE_2=$(curl -s --location --request POST "$BASE_URL/jobs/createTask" \
--header "Authorization: Bearer $API_KEY" \
--header "Content-Type: application/json" \
--data-raw '{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "Camera slowly pushes in toward the subject, preserve composition and colors, gentle ambient motion, warm consistent lighting, smooth dolly-in, 4 seconds",
        "first_frame_url": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800",
        "resolution": "480p",
        "aspect_ratio": "16:9",
        "duration": 4,
        "generate_audio": false,
        "web_search": false
    }
}')

echo "Response: $RESPONSE_2"
TASK_ID_2=$(echo "$RESPONSE_2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('taskId','FAILED'))" 2>/dev/null || echo "PARSE_ERROR")
echo "Task ID: $TASK_ID_2"
echo ""

# ──────────────────────────────────────────
# TEST 3: Multimodal Referans (reference_image_urls)
# ──────────────────────────────────────────
echo "📹 TEST 3: Multimodal Referans (reference_image_urls)"
echo "──────────────────────────────────────────"

RESPONSE_3=$(curl -s --location --request POST "$BASE_URL/jobs/createTask" \
--header "Authorization: Bearer $API_KEY" \
--header "Content-Type: application/json" \
--data-raw '{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "@Image1 as style reference for color palette and lighting. A misty forest path at dawn, golden light filtering through trees, slow tracking shot forward along the path, National Geographic documentary quality, smooth camera movement, 4 seconds",
        "reference_image_urls": [
            "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800"
        ],
        "resolution": "480p",
        "aspect_ratio": "16:9",
        "duration": 4,
        "generate_audio": false,
        "web_search": false
    }
}')

echo "Response: $RESPONSE_3"
TASK_ID_3=$(echo "$RESPONSE_3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('taskId','FAILED'))" 2>/dev/null || echo "PARSE_ERROR")
echo "Task ID: $TASK_ID_3"
echo ""

# ──────────────────────────────────────────
# TEST 4: Audio Üretimi Açık (generate_audio: true)
# ──────────────────────────────────────────
echo "📹 TEST 4: Text-to-Video + Native Audio"
echo "──────────────────────────────────────────"

RESPONSE_4=$(curl -s --location --request POST "$BASE_URL/jobs/createTask" \
--header "Authorization: Bearer $API_KEY" \
--header "Content-Type: application/json" \
--data-raw '{
    "model": "bytedance/seedance-2",
    "input": {
        "prompt": "Gentle ocean waves lapping against a sandy beach at sunset, seagulls calling in the distance, warm golden hour backlight, wide shot, locked-off camera, peaceful ASMR atmosphere, 4 seconds",
        "resolution": "480p",
        "aspect_ratio": "16:9",
        "duration": 4,
        "generate_audio": true,
        "web_search": false
    }
}')

echo "Response: $RESPONSE_4"
TASK_ID_4=$(echo "$RESPONSE_4" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('taskId','FAILED'))" 2>/dev/null || echo "PARSE_ERROR")
echo "Task ID: $TASK_ID_4"
echo ""

# ──────────────────────────────────────────
# SONUÇ TABLOSU
# ──────────────────────────────────────────
echo "============================================"
echo "📊 TASK ID ÖZETİ (Polling için)"
echo "============================================"
echo "Test 1 (Text-to-Video):    $TASK_ID_1"
echo "Test 2 (Image-to-Video):   $TASK_ID_2"
echo "Test 3 (Multimodal Ref):   $TASK_ID_3"
echo "Test 4 (Native Audio):     $TASK_ID_4"
echo "============================================"
