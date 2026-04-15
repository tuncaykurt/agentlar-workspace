import requests
from src.image_uploader import ImageUploader

# Publicly available 45-degree angle agriculture photography as reference
ref_url = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1080&auto=format&fit=crop"

res = requests.get(ref_url)
with open("temp/ref_drone.jpg", "wb") as f:
    f.write(res.content)

uploaded_url = ImageUploader.upload("temp/ref_drone.jpg")
print(f"REFERENCE_URL={uploaded_url}")
