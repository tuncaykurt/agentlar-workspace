
import requests
import json

url = "http://localhost:8000/api/signals/webhook/tv/test_token_123"
payload = {
    "action": "buy",
    "symbol": "BTCUSDT",
    "price": 62000.5
}
headers = {
    "Content-Type": "application/json"
}

try:
    response = requests.post(url, json=payload, headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
