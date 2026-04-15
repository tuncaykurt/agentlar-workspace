import os
import requests
import time

def collect_data(target_ig_handle: str):
    """
    Uses the Apify API to run an Instagram Scraper actor for the given target handle.
    Returns a summarized JSON list of their latest posts.
    """
    api_token = os.getenv("APIFY_API_TOKEN")
    if not api_token:
        print("❌ Error: APIFY_API_TOKEN is not set.")
        return None

    # This is a placeholder for the actual Apify Actor ID for an Instagram Scraper
    # A popular one is typically 'apify/instagram-post-scraper' or similar
    actor_id = "apify/instagram-profile-scraper" 
    
    run_url = f"https://api.apify.com/v2/acts/{actor_id}/runs?token={api_token}"
    
    payload = {
        "usernames": [target_ig_handle],
        "resultsLimit": 15 # Son 15 post
    }
    
    try:
        print(f"📡 Triggering Apify actor {actor_id} for @{target_ig_handle}...")
        run_res = requests.post(run_url, json=payload)
        run_res.raise_for_status()
        run_data = run_res.json()
        run_id = run_data['data']['id']
        default_dataset_id = run_data['data']['defaultDatasetId']
        
        # Poll for completion
        print(f"⏳ Waiting for run {run_id} to finish...")
        while True:
            status_url = f"https://api.apify.com/v2/actor-runs/{run_id}?token={api_token}"
            status_res = requests.get(status_url)
            status_data = status_res.json()
            status = status_data['data']['status']
            
            if status in ['SUCCEEDED', 'FAILED', 'ABORTED']:
                break
            time.sleep(5)
            
        if status != 'SUCCEEDED':
            print(f"❌ Actor run failed with status: {status}")
            return None
            
        # Fetch results
        dataset_url = f"https://api.apify.com/v2/datasets/{default_dataset_id}/items?token={api_token}"
        print("📥 Downloading dataset...")
        dataset_res = requests.get(dataset_url)
        items = dataset_res.json()
        
        # Summarize to reduce token usage for LLM
        summarized_items = []
        for item in items:
            # Apify structure can vary by actor, but generally:
            latest_posts = item.get("latestPosts", [])
            for post in latest_posts:
                summarized_items.append({
                    "type": post.get("type"),
                    "caption": post.get("caption"),
                    "likesCount": post.get("likesCount"),
                    "commentsCount": post.get("commentsCount"),
                    "videoViewCount": post.get("videoViewCount"),
                    "timestamp": post.get("timestamp")
                })
                
        return summarized_items

    except Exception as e:
        print(f"❌ Error during Apify execution: {e}")
        return None
