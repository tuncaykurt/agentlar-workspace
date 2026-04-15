import os
import requests
from src.config import IMGBB_API_KEY, logger

class ImageUploader:
    
    @classmethod
    def upload(cls, file_path: str) -> str:
        """Uploads image and returns public URL. Using Catbox as primary due to ImgBB 502 errors."""
        url = cls._upload_catbox(file_path)
        if not url:
            url = cls._upload_imgbb(file_path)
        return url

    @staticmethod
    def _upload_imgbb(file_path: str) -> str:
        # Before uploading, enforce 720x1280 (9:16) for Veo 3.1 compatibility
        try:
            from PIL import Image
            with Image.open(file_path) as img:
                target_w, target_h = 720, 1280
                if img.size != (target_w, target_h):
                    # Resize with aspect ratio preservation (crop centers if needed)
                    img_ratio = img.width / img.height
                    target_ratio = target_w / target_h
                    
                    if img_ratio > target_ratio:
                        # Image is wider, crop width
                        new_w = int(img.height * target_ratio)
                        offset = (img.width - new_w) // 2
                        crop_box = (offset, 0, offset + new_w, img.height)
                        img = img.crop(crop_box)
                    elif img_ratio < target_ratio:
                        # Image is taller, crop height
                        new_h = int(img.width / target_ratio)
                        offset = (img.height - new_h) // 2
                        crop_box = (0, offset, img.width, offset + new_h)
                        img = img.crop(crop_box)
                        
                    # Now resize to exactly 720x1280
                    img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
                    img.save(file_path)
                    logger.info(f"Resized image to {target_w}x{target_h} before upload.")
        except Exception as e:
            logger.error(f"Failed to resize image before upload: {e}")
            
        url = "https://api.imgbb.com/1/upload"
        with open(file_path, "rb") as file:
            # 86400 seconds = 1 day expiration
            payload = {"key": IMGBB_API_KEY, "expiration": 86400}
            files = {"image": file}
            res = requests.post(url, data=payload, files=files)
            if res.status_code == 200:
                data = res.json()
                public_url = data["data"]["url"]
                logger.info(f"Uploaded to ImgBB: {public_url}")
                return public_url
            else:
                logger.error(f"ImgBB upload failed: {res.text}")
                return None

    @staticmethod
    def _upload_catbox(file_path: str) -> str:
        url = "https://catbox.moe/user/api.php"
        with open(file_path, "rb") as file:
            data = {"reqtype": "fileupload"}
            files = {"fileToUpload": file}
            res = requests.post(url, data=data, files=files)
            if res.status_code == 200:
                public_url = res.text.strip()
                logger.info(f"Uploaded to Catbox: {public_url}")
                return public_url
            else:
                logger.error(f"Catbox upload failed: {res.text}")
                return None
