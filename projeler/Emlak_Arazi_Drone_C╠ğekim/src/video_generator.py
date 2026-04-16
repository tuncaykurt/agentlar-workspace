import os
import requests
import json
import time
from src.config import KIE_AI_API_KEY, TEMP_DIR, logger

class VideoGenerator:
    VEO_GENERATE_URL = "https://api.kie.ai/api/v1/veo/generate"
    RECORD_INFO_URL = "https://api.kie.ai/api/v1/veo/record-info"
    
    HEADERS = {
        "Authorization": f"Bearer {KIE_AI_API_KEY}",
        "Content-Type": "application/json"
    }

    @classmethod
    def generate_video(cls, job_id: str, start_img_url: str, end_img_url: str, prompt: str, part: int) -> str:
        """Video segment using Veo 3.1"""
        logger.info(f"Generating video part {part} for job {job_id}")
        
        payload = {
            "prompt": f"{prompt} Vertical format 9:16.",
            "imageUrls": [start_img_url, end_img_url],
            "model": "veo3_fast",
            "aspectRatio": "9:16",
            "enableFallback": False,
            "enableTranslation": True,
            "generationType": "FIRST_AND_LAST_FRAMES_2_VIDEO"
        }
        
        try:
            res = requests.post(cls.VEO_GENERATE_URL, headers=cls.HEADERS, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                data_node = data.get("data", {})
                task_id = data_node.get("taskId") if isinstance(data_node, dict) else None
                
                # Fallbacks in case its flattened
                if not task_id:
                    task_id = data.get("taskId") or data.get("id")
                
                if task_id:
                    logger.info(f"Task {task_id} initiated. Polling for video completion...")
                    return cls._poll_video_status(task_id, f"{job_id}_video_{part}.mp4")
                else:
                    logger.error(f"No task ID returned in payload: {data}")
            else:
                logger.error(f"Veo API error: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Veo request failed: {e}")
            
        return None

    @classmethod
    def start_video_generation(cls, start_img_url: str, end_img_url: str, prompt: str) -> str:
        """Starts a video generation task and returns the task_id without blocking. Returns None on failure."""
        payload = {
            "prompt": f"{prompt} Vertical format 9:16.",
            "imageUrls": [start_img_url, end_img_url],
            "model": "veo3_fast",
            "aspectRatio": "9:16",
            "enableFallback": False,
            "enableTranslation": True,
            "generationType": "FIRST_AND_LAST_FRAMES_2_VIDEO"
        }
        
        try:
            res = requests.post(cls.VEO_GENERATE_URL, headers=cls.HEADERS, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                data_node = data.get("data", {})
                task_id = data_node.get("taskId") if isinstance(data_node, dict) else None
                if not task_id:
                    task_id = data.get("taskId") or data.get("id")
                
                if task_id:
                    return task_id
                else:
                    logger.error(f"No task ID returned in payload: {data}")
            else:
                logger.error(f"Veo API error: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Veo request failed: {e}")
            
        return None

    @classmethod
    def poll_multiple_videos(cls, tasks_dict: dict) -> dict:
        """
        Polls multiple video tasks concurrently.
        tasks_dict format: { part_number: { "task_id": str, "output_filename": str } }
        Returns dictionary of successful video paths: { part_number: "path.mp4" }
        """
        max_attempts = 270 # 270 * 10s = 45 minutes max video wait
        results = {}
        pending = list(tasks_dict.keys())
        
        for attempt in range(max_attempts):
            if not pending:
                break
                
            logger.info(f"Polling {len(pending)} active Veo task(s)... (attempt {attempt+1}/{max_attempts})")
            
            for part in list(pending):
                task_info = tasks_dict[part]
                task_id = task_info["task_id"]
                output_filename = task_info["output_filename"]
                
                url = f"{cls.RECORD_INFO_URL}?taskId={task_id}"
                try:
                    res = requests.get(url, headers=cls.HEADERS, timeout=10)
                    if res.status_code == 200:
                        payload = res.json()
                        data = payload.get("data", {})
                        success_flag = data.get("successFlag")
                        
                        if success_flag == 1:
                            response_data = data.get("response", {})
                            urls = response_data.get("resultUrls") or response_data.get("originUrls")
                            
                            video_url = None
                            if urls and isinstance(urls, list) and len(urls) > 0:
                                video_url = urls[0]
                            elif isinstance(urls, str):
                                video_url = urls

                            if video_url:
                                logger.info(f"Video Task {task_id} (Part {part}) ready! Downloading...")
                                v_res = requests.get(video_url, stream=True, timeout=30)
                                if v_res.status_code == 200:
                                    out_path = os.path.join(TEMP_DIR, output_filename)
                                    with open(out_path, "wb") as f:
                                        for chunk in v_res.iter_content(chunk_size=8192):
                                            f.write(chunk)
                                    results[part] = out_path
                                    pending.remove(part)
                                else:
                                    logger.error(f"Failed to download video from {video_url} - status {v_res.status_code}")
                            else:
                                logger.error(f"Could not find Video URL in success response: {data}")
                                pending.remove(part)
                                
                        elif success_flag in [2, 3]:
                            logger.error(f"Veo API generation failed for task {task_id} (Part {part}): {data}")
                            pending.remove(part)
                            
                except Exception as e:
                    logger.warning(f"Polling error for task {task_id} (Part {part}): {e}")
            
            if pending:
                time.sleep(10)
                
        if pending:
            logger.error(f"Polling timeout for {len(pending)} tasks.")
            
        return results

    @classmethod
    def _poll_video_status(cls, task_id: str, output_filename: str) -> str:
        url = f"{cls.RECORD_INFO_URL}?taskId={task_id}"
        max_attempts = 270 # 270 * 10s = 45 minutes max video wait
        
        for attempt in range(max_attempts):
            try:
                res = requests.get(url, headers=cls.HEADERS, timeout=10)
                if res.status_code == 200:
                    payload = res.json()
                    
                    data = payload.get("data", {})
                    success_flag = data.get("successFlag")
                    
                    if success_flag == 1: # 1 means ready/success
                        response_data = data.get("response", {})
                        urls = response_data.get("resultUrls") or response_data.get("originUrls")
                        
                        video_url = None
                        if urls and isinstance(urls, list) and len(urls) > 0:
                            video_url = urls[0]
                        elif isinstance(urls, str):
                            video_url = urls

                        if video_url:
                            logger.info(f"Video Task {task_id} ready! Downloading...")
                            # Download
                            v_res = requests.get(video_url, stream=True, timeout=30)
                            if v_res.status_code == 200:
                                out_path = os.path.join(TEMP_DIR, output_filename)
                                with open(out_path, "wb") as f:
                                    for chunk in v_res.iter_content(chunk_size=8192):
                                        f.write(chunk)
                                return out_path
                            else:
                                logger.error(f"Failed to download video from {video_url} - status {v_res.status_code}")
                        else:
                            logger.error(f"Could not find Video URL in success response: {data}")
                        return None
                        
                    elif success_flag in [2, 3]: # 2 is task failed, 3 is generation failed
                        logger.error(f"Veo API generation failed for task {task_id}: {data}")
                        return None
                        
            except Exception as e:
                logger.warning(f"Polling error for task {task_id}: {e}")
                
            logger.info(f"Task {task_id} still processing (successFlag 0)... waiting 10s (attempt {attempt+1}/{max_attempts})")
            time.sleep(10)
            
        logger.error(f"Polling timeout for task {task_id}.")
        return None
