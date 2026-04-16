import urllib.request
from src.image_uploader import ImageUploader

# Some robust unpslash source URLs via unsplash source API
refs = {
    "FARM_DRONE_REF": "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1080",
    "FARM_GROUND_REF": "https://images.unsplash.com/photo-1598282361664-9febb0c2b2ff?q=80&w=1080",
    "VILLA_DRONE_REF": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1080",
    "VILLA_GROUND_REF": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1080"
}

import time
for k, url in refs.items():
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            with open(f"temp/{k}.jpg", "wb") as f:
                f.write(response.read())
        uploaded = ImageUploader.upload(f"temp/{k}.jpg")
        print(f"{k} = \"{uploaded}\"")
        time.sleep(2)
    except Exception as e:
        print(f"Failed {k}: {e}")
