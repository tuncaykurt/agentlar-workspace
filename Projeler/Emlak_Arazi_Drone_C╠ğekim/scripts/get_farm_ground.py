import logging
import urllib.request
from src.image_uploader import ImageUploader

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Some robust unpslash source URLs via unsplash source API
url = "https://images.unsplash.com/photo-1595841696677-6479c42878c7?q=80&w=1080"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        with open("temp/farm_ground.jpg", "wb") as f:
            f.write(response.read())
    uploaded = ImageUploader.upload("temp/farm_ground.jpg")
    print(f"FARM_GROUND_REF = \"{uploaded}\"")
except Exception as e:
    logger.error("Farm ground image download/upload failed", exc_info=True)
