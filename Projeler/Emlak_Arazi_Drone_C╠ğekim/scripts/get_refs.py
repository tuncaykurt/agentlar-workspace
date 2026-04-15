import os
from src.image_uploader import ImageUploader
path = "temp/farm_ground_ref.jpg"
uploaded = ImageUploader.upload(path)
print(f"FARM_GROUND_REF = \"{uploaded}\"")
