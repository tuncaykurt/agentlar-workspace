import requests
import time
import json
import sys
import argparse

def run_apify_task(api_token, actor_id, payload, max_polling_time=600):
    # Apify API uses tilde (~) format: "username~actorname"
    # Auto-convert slash format to tilde
    actor_id = actor_id.replace("/", "~")
    url = f"https://api.apify.com/v2/acts/{actor_id}/runs"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json"
    }

    print(f"🚀 Başlatılıyor: {actor_id}")
    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        run_data = response.json()
        run_id = run_data["data"]["id"]
        print(f"✅ Görev oluşturuldu. Run ID: {run_id}")
    except Exception as e:
        print(f"❌ Görev başlatılamadı: {e}")
        if 'response' in locals() and response.text:
             print(f"Hata detayı: {response.text}")
        return None

    poll_url = f"https://api.apify.com/v2/actor-runs/{run_id}"
    start_time = time.time()
    
    print("⏳ Sonuç bekleniyor (Polling)...")
    while True:
        try:
             status_response = requests.get(poll_url, headers=headers)
             status_response.raise_for_status()
             status_data = status_response.json()["data"]
             status = status_data["status"]
             
             if status == "SUCCEEDED":
                 default_dataset_id = status_data["defaultDatasetId"]
                 print(f"✅ Görev tamamlandı! Dataset ID: {default_dataset_id}")
                 
                 dataset_url = f"https://api.apify.com/v2/datasets/{default_dataset_id}/items"
                 results_response = requests.get(dataset_url, headers=headers)
                 results_response.raise_for_status()
                 
                 return results_response.json()
                 
             elif status in ["FAILED", "ABORTED", "TIMED-OUT"]:
                 print(f"❌ Görev başarısız oldu. Durum: {status}")
                 return None
                 
        except Exception as e:
             print(f"⚠️ Polling sırasında hata anlık: {e}")
             
        if time.time() - start_time > max_polling_time:
            print(f"❌ Zaman aşımı! ({max_polling_time} saniye)")
            return None
            
        time.sleep(10)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Apify Automation Script")
    parser.add_argument("--token", required=True, help="Apify API Token")
    parser.add_argument("--actor", required=True, help="Apify Actor ID")
    parser.add_argument("--payload", required=True, help="Path to JSON payload file")
    parser.add_argument("--output", default="output.json", help="Output JSON file path")
    
    args = parser.parse_args()
    
    try:
        with open(args.payload, 'r', encoding='utf-8') as f:
            payload_data = json.load(f)
    except Exception as e:
        print(f"❌ Payload dosyası okunamadı: {e}")
        sys.exit(1)
        
    results = run_apify_task(args.token, args.actor, payload_data)
    
    if results:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"🎉 Sonuçlar kaydedildi: {args.output}")
        print(f"📊 Toplam {len(results)} kayıt bulundu.")
    else:
        sys.exit(1)
