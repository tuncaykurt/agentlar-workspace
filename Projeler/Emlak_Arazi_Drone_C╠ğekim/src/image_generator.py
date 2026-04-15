import os
import requests
import json
import time
from PIL import Image, ImageDraw, ImageFont
from src.config import KIE_AI_API_KEY, TEMP_DIR, logger

class ImageGenerator:
    CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask"
    RECORD_INFO_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"
    
    HEADERS = {
        "Authorization": f"Bearer {KIE_AI_API_KEY}",
        "Content-Type": "application/json"
    }

    @classmethod
    def generate_frame_1(cls, job_id: str, satellite_url: str) -> str:
        """Frame 1: Satellite image transformed to 45 degree drone perspective"""
        logger.info(f"Generating Frame 1 for job {job_id}")
        prompt = (
            "Transform this 90-degree top-down satellite view into a breathtaking drone "
            "photograph taken from a cinematic 45-degree angle looking down. "
            "STRICTLY MAINTAIN every single detail of the existing landscape: keep 모든 roads, neighboring "
            "buildings, trees, and ground textures in their EXACT positions from the original image. "
            "Do not hallucinate new structures. Photorealistic 8k quality, natural lighting. "
            "No horizon, no sky. Vertical format, 9:16 aspect ratio."
        )
        
        payload = {
            "model": "nano-banana-2",
            "input": {
                "prompt": prompt,
                "aspect_ratio": "9:16",
                "resolution": "1K",
                "output_format": "png",
                "google_search": False,
                "image_input": [satellite_url]
            }
        }
        
        return cls._call_kie_api(payload, f"{job_id}_frame_1.png")

    @classmethod
    def generate_frame_2(cls, job_id: str, frame_1_url: str, parcel_area: float) -> str:
        """Frame 2: Glowing cyan boundary lines."""
        logger.info(f"Generating Frame 2 for job {job_id}")
        prompt = (
            f"This is a cinematic drone photograph looking down at a 45-degree angle. "
            f"Add bright, perfectly straight, glowing neon cyan boundary lines (#00FFFF) on the ground marking a land parcel "
            f"of exactly {parcel_area} square meters in the center of the image. "
            f"The glowing lines should have a soft, premium luminous halo effect that slightly illuminates the grass/terrain below them. "
            f"Everything else in the image stays ultra-realistic, highly detailed and unchanged. "
            f"Do not add any text."
        )
        
        payload = {
            "model": "nano-banana-2",
            "input": {
                "prompt": prompt,
                "aspect_ratio": "9:16",
                "resolution": "1K",
                "output_format": "png",
                "google_search": False,
                "image_input": [frame_1_url]
            }
        }
        
        return cls._call_kie_api(payload, f"{job_id}_frame_2.png")

    @classmethod
    def generate_frame_3_fallback_pillow(cls, job_id: str, frame_2_path: str, area_m2: float) -> str:
        """Frame 3 Fallback: Draw area text using Pillow on top of Frame 2."""
        logger.info(f"Generating Frame 3 via Pillow (Fallback) for job {job_id}")
        try:
            img = Image.open(frame_2_path).convert("RGBA")
            # Create a transparent overlay
            overlay = Image.new("RGBA", img.size, (255, 255, 255, 0))
            draw = ImageDraw.Draw(overlay)
            
            # Handle cases where area_m2 is already a string with commas (like "373,44")
            if isinstance(area_m2, str):
                # Try to clean it and parse to float or just use it directly
                clean_area = area_m2.replace(",", ".")
                try:
                    area_val = float(clean_area)
                    formatted_area = f"{area_val:,.0f} m²".replace(",", ".")
                except ValueError:
                    formatted_area = f"{area_m2} m²"
            else:
                formatted_area = f"{area_m2:,.0f} m²".replace(",", ".")
            from PIL import ImageFilter
            
            try:
                # Dynamic font sizing to fit width
                target_width = img.width * 0.85
                font_size = 280
                
                while True:
                    try:
                        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Black.ttf", size=font_size)
                    except IOError:
                        try:
                            font = ImageFont.truetype("/Library/Fonts/Arial Black.ttf", size=font_size)
                        except IOError:
                            font = ImageFont.load_default()
                            break
                            
                    text_bbox = draw.textbbox((0, 0), formatted_area, font=font)
                    text_w = text_bbox[2] - text_bbox[0]
                    text_h = text_bbox[3] - text_bbox[1]
                    
                    if text_w <= target_width or font_size <= 60:
                        break
                    font_size -= 10
            except Exception as e:
                logger.error(f"Font loading failed: {e}")
                font = ImageFont.load_default()
                text_bbox = draw.textbbox((0, 0), formatted_area, font=font)
                text_w = text_bbox[2] - text_bbox[0]
                text_h = text_bbox[3] - text_bbox[1]
            
            x = (img.width - text_w) / 2
            y = (img.height - text_h) / 2
            
            # 1. Soft Drop Shadow
            shadow_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))
            s_draw = ImageDraw.Draw(shadow_layer)
            s_draw.text((x + 20, y + 40), formatted_area, font=font, fill=(0, 0, 0, 150))
            shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(15))
            overlay.paste(shadow_layer, (0,0), shadow_layer)

            # 2. 3D Extrusion
            depth = max(1, int(font_size * 0.1))
            for i in range(depth, 0, -1):
                shade = 160 + int((depth - i) * (60 / depth)) # 160 to 220
                draw.text((x, y + i), formatted_area, font=font, fill=(shade, shade, shade, 255))

            # 3. Top surface
            draw.text((x, y), formatted_area, font=font, fill=(255, 255, 255, 255))
            
            # Composite
            final = Image.alpha_composite(img, overlay).convert("RGB")
            out_path = os.path.join(TEMP_DIR, f"{job_id}_frame_3.png")
            final.save(out_path)
            return out_path
        except Exception as e:
            logger.error(f"Pillow fallback failed: {e}")
            return None

    @classmethod
    def generate_frame_4(cls, job_id: str, reference_url: str, area_m2: float) -> str:
        """Frame 4: Architectural Project."""
        logger.info(f"Generating Frame 4 for job {job_id}")
        prompt = (
            f"Transform this empty land parcel seen from a drone at 45-degree angle into a "
            f"breathtaking, ultra-modern luxury property development. Based on the {area_m2} square meter area, "
            f"create a premium architectural masterpiece with an infinity pool, elegant landscaping, and glass facades. "
            f"Maintain the exact same drone camera angle and perspective. "
            f"Surrounding area outside the parcel stays exactly as it is. Photorealistic 8k architectural visualization, "
            f"cinematic golden hour warm lighting, high-end real estate advertisement style."
        )
        
        payload = {
            "model": "nano-banana-2",
            "input": {
                "prompt": prompt,
                "aspect_ratio": "9:16",
                "resolution": "1K",
                "output_format": "png",
                "google_search": False,
                "image_input": [reference_url]
            }
        }
        
        return cls._call_kie_api(payload, f"{job_id}_frame_4.png")

    @classmethod
    def generate_frame_4_farm(cls, job_id: str, reference_url: str, area_m2: float) -> str:
        """Frame 4 FARM MODE: Active agricultural field with tractor and crops — no construction."""
        logger.info(f"Generating Frame 4 (FARM MODE) for job {job_id}")
        prompt = (
            f"Transform ONLY the interior land of the {area_m2:.0f} sqm parcel (inside the neon cyan borders) "
            f"into a vast, expansive, high-production agricultural field. "
            f"Because the area is 1.6 hectares (large scale), show hundreds of very fine, dense, perfectly straight "
            f"crop rows stretching across the entire width. The red tractor should appear relatively small "
            f"(miniature scale) to reflect the massive 16,000 sqm size of the land. "
            f"KEEP THE ENTIRE OUTSIDE WORLD (everything outside the neon) 100% IDENTICAL to the input image. "
            f"Photorealistic 8k, cinematic drone 45-degree angle, vibrant morning sun, high detail, no construction."
        )
        
        payload = {
            "model": "nano-banana-2",
            "input": {
                "prompt": prompt,
                "aspect_ratio": "9:16",
                "resolution": "1K",
                "output_format": "png",
                "google_search": False,
                "image_input": [reference_url]
            }
        }
        
        return cls._call_kie_api(payload, f"{job_id}_frame_4_farm.png")

    @classmethod
    def generate_frame_5_farm(cls, job_id: str, frame_4_url: str) -> str:
        """Frame 5 FARM MODE: Ground-level perspective of active farm."""
        logger.info(f"Generating Frame 5 (FARM MODE) for job {job_id}")
        prompt = (
            "A breathtaking ground-level epic perspective standing in the middle of a massive 1.6-hectare farm. "
            "Endless perfectly straight rows of tall green crops (corn or wheat) stretch deep into the distance. "
            "A small red tractor is working far in the background to show the vast scale of the property. "
            "Warm golden morning sun rays filtering through the leaves with cinematic lens flares and bokeh. "
            "Ultra-realistic 8k, photorealistic pastoral elegance. 9:16 vertical format, no construction."
        )
        
        payload = {
            "model": "nano-banana-2",
            "input": {
                "prompt": prompt,
                "aspect_ratio": "9:16",
                "resolution": "1K",
                "output_format": "png",
                "google_search": False,
                "image_input": [frame_4_url]
            }
        }
        
        return cls._call_kie_api(payload, f"{job_id}_frame_5_farm.png")

    @classmethod
    def generate_frame_5(cls, job_id: str, frame_4_url: str) -> str:
        """Frame 5: Eye level perspective of the created project."""
        logger.info(f"Generating Frame 5 for job {job_id}")
        prompt = (
            "Generate a ground-level, eye-height perspective view of the ultra-modern luxury architectural project "
            "that was shown from a drone angle in the reference image. "
            "Camera at human eye height (~1.7m), looking slightly upward at the striking glass facades and pool. "
            "Warm cinematic golden hour lighting, photorealistic 8k quality, highly detailed textures, inviting premium atmosphere. "
            "Vertical 9:16 format."
        )
        
        payload = {
            "model": "nano-banana-2",
            "input": {
                "prompt": prompt,
                "aspect_ratio": "9:16",
                "resolution": "1K",
                "output_format": "png",
                "google_search": False,
                "image_input": [frame_4_url]
            }
        }
        
        return cls._call_kie_api(payload, f"{job_id}_frame_5.png")

    @classmethod
    def _call_kie_api(cls, payload: dict, output_filename: str) -> str:
        if not KIE_AI_API_KEY:
            raise ValueError("KIE_AI_API_KEY missing!")
            
        logger.info("Calling Kie AI (CREATE TASK) API for Nano Banana Pro...")
        try:
            res = requests.post(cls.CREATE_TASK_URL, headers=cls.HEADERS, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                task_id = data.get("taskId") or data.get("id") or data.get("data", {}).get("taskId")
                if task_id:
                    logger.info(f"Task {task_id} initiated. Polling for completion...")
                    return cls._poll_task_status(task_id, output_filename)
                elif "images" in data:
                    # Synchronous fallback if possible
                    image_url = data["images"][0]["url"]
                    return cls._download_image(image_url, output_filename)
                else:
                    logger.error(f"Task creation failed. Response: {data}")
            else:
                logger.error(f"Kie AI Task Error: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Kie API request failed: {e}")
            
        return None

    @classmethod
    def _poll_task_status(cls, task_id: str, output_filename: str) -> str:
        url = f"{cls.RECORD_INFO_URL}?taskId={task_id}"
        max_attempts = 60
        
        for attempt in range(max_attempts):
            try:
                res = requests.get(url, headers=cls.HEADERS, timeout=10)
                if res.status_code == 200:
                    payload = res.json()
                    data = payload.get("data", payload)
                    status = data.get("state") or data.get("status")
                    
                    if status in ["success", "SUCCESS", "COMPLETED"]:
                        result_json = data.get("resultJson", {})
                        if isinstance(result_json, str):
                            result_json = json.loads(result_json)
                            
                        # Extract URL appropriately 
                        urls = result_json.get("resultUrls") or result_json.get("images", [])
                        
                        image_url = None
                        if urls and isinstance(urls, list):
                            if isinstance(urls[0], str):
                                image_url = urls[0]
                            elif isinstance(urls[0], dict):
                                image_url = urls[0].get("url")
                                
                        if not image_url and "url" in result_json:
                             image_url = result_json["url"]

                        if image_url:
                            logger.info(f"Image Task {task_id} ready! Downloading...")
                            return cls._download_image(image_url, output_filename)
                        else:
                            logger.error(f"Could not find URL in success response: {data}")
                            return None
                    elif status in ["fail", "error", "FAILED", "ERROR"]:
                        logger.error(f"Kie API generation failed for task {task_id}: {data}")
                        return None
                        
            except Exception as e:
                logger.warning(f"Polling error for task {task_id}: {e}")
                
            logger.info(f"Task {task_id} still processing... waiting 5s (attempt {attempt+1}/{max_attempts})")
            time.sleep(5)
            
        logger.error(f"Polling timeout for task {task_id}.")
        return None

    @classmethod
    def _download_image(cls, url: str, output_filename: str) -> str:
        for attempt in range(3):
            try:
                img_res = requests.get(url, stream=True, timeout=60)
                if img_res.status_code == 200:
                    out_path = os.path.join(TEMP_DIR, output_filename)
                    with open(out_path, "wb") as f:
                        for chunk in img_res.iter_content(8192):
                            f.write(chunk)
                    return out_path
                else:
                     logger.error(f"Failed to download generated image. HTTP {img_res.status_code}")
            except Exception as e:
                logger.error(f"Failed to download image from {url} (Attempt {attempt+1}/3): {e}")
                time.sleep(3)
        return None
