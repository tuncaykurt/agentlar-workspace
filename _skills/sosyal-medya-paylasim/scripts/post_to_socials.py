import os
import argparse
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def post_to_make_webhook(text: str, media_url: str, platforms: list):
    """
    Sends the content to a configured Make.com (or n8n) webhook.
    The webhook should be configured to parse this JSON and distribute
    it to the requested platforms.
    """
    webhook_url = os.getenv("MAKE_WEBHOOK_URL")
    
    if not webhook_url:
        print("❌ Error: MAKE_WEBHOOK_URL is not set in the environment or .env file.")
        print("Please add it to your .env file or _knowledge/api-anahtarlari.md settings.")
        return False
        
    payload = {
        "text": text,
        "media_url": media_url if media_url else None,
        "platforms": platforms
    }
    
    print(f"🚀 Sending payload to webhook: {webhook_url}")
    print(f"📦 Payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")
    
    try:
        response = requests.post(webhook_url, json=payload)
        response.raise_for_status()
        print("✅ Successfully sent to the webhook!")
        print(f"🔌 Response from Make/n8n: {response.text}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"❌ Failed to reach the webhook: {e}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Social Media Publisher for Antigravity")
    parser.add_argument("--text", required=True, help="Text caption for the social media post")
    parser.add_argument("--media", required=False, help="Public URL of the media (image/video)")
    parser.add_argument("--platforms", required=True, help="Comma-separated list of platforms (eg: ig,tiktok,linkedin)")
    
    args = parser.parse_args()
    
    # Process platforms into a list
    platform_list = [p.strip().lower() for p in args.platforms.split(',')]
    
    success = post_to_make_webhook(args.text, args.media, platform_list)
    
    if not success:
        exit(1)
