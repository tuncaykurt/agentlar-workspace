import os
import json
import time
from src.config import logger
from src.data_fetcher import TKGMDataFetcher
from src.map_generator import MapGenerator
from src.image_uploader import ImageUploader
from src.image_generator import ImageGenerator
from src.video_generator import VideoGenerator
from src.video_assembler import VideoAssembler

def generate_job_id():
    import uuid
    return str(uuid.uuid4())[:8]

def run_full_pipeline(url: str, area_override: float = None):
    job_id = generate_job_id()
    logger.info(f"--- STARTING ZERO-TO-HERO VIDEO PIPELINE [{job_id}] ---")
    logger.info(f"Target URL: {url}")
    if area_override:
        logger.info(f"Area Override: {area_override} m²")
    
    # 1. Fetch data
    parcel_data = TKGMDataFetcher.parse_from_url(url)
    if not parcel_data:
        logger.error("Failed to fetch/parse parcel data.")
        return
        
    geometry = parcel_data.get("geometri")
    area_m2 = area_override if area_override is not None else parcel_data.get("alan", 0)
    city = parcel_data.get("ilAd", "Bilinmiyor")
    district = parcel_data.get("ilceAd", "Bilinmiyor")
    logger.info(f"Parcel info obtained (Area: {area_m2} m²)")
    
    # 2. Get Drawn and Clean Satellite Maps
    logger.info(f"Generating satellite image for job {job_id}")
    
    # Clean map (for Frame 1)
    satellite_clean_path = MapGenerator.generate_satellite_image(job_id, geometry, draw_polygon=False)
    if not satellite_clean_path:
        logger.error("Failed to generate clean satellite image.")
        return
    satellite_clean_url = ImageUploader.upload(satellite_clean_path)
    logger.info(f"Clean satellite url: {satellite_clean_url}")
    
    # Drawn map (for Frame 2)
    satellite_drawn_path = MapGenerator.generate_satellite_image(job_id, geometry, draw_polygon=True)
    if not satellite_drawn_path:
        logger.error("Failed to generate drawn satellite image.")
        return
    satellite_drawn_url = ImageUploader.upload(satellite_drawn_path)
    logger.info(f"Drawn satellite url: {satellite_drawn_url}")


    # 3. Generate Frame 1 using clean map
    logger.info("Generating Frame 1 (Drone Perspective - CLEAN)...")
    f1_payload = {
        "model": "nano-banana-pro",
        "input": {
            "prompt": f"Transform this 90-degree top-down satellite view into a breathtaking 45-degree angle isometric drone photograph of a {area_m2} sqm land parcel in {city}, {district}. STRICTLY MAINTAIN every detail of the existing landscape in this new 45-degree tilted perspective. Real-world proportions, realistic terrain, vibrant sunny lighting. No horizon, no sky.",
            "aspect_ratio": "9:16",
            "resolution": "1K",
            "output_format": "png",
            "image_input": [satellite_clean_url]
        }
    }
    frame_1_local = ImageGenerator._call_kie_api(f1_payload, f"{job_id}_frame_1.png")
    if not frame_1_local:
         logger.error("Failed to generate Frame 1")
         return
    frame_1_url = ImageUploader.upload(frame_1_local)
    logger.info(f"Frame 1 URL: {frame_1_url}")

    # 4. Generate Frame 2 (Glowing) using drawn map
    logger.info("Generating Frame 2 (Neon Glow - DRAWN)...")
    f2_prompt = "A high-resolution, photorealistic drone photograph from a 45-degree angle. The blue cyan line drawn on the map is magically transformed into a glowing 3D neon beam that perfectly contours the earth surface. The landscape is realistic terrain. Soft cyan light casts onto the grass below the neon beam."
    f2_payload = {
        "model": "nano-banana-pro",
        "input": {
            "prompt": f2_prompt,
            "aspect_ratio": "9:16",
            "resolution": "1K",
            "output_format": "png",
            "image_input": [satellite_drawn_url]
        }
    }
    frame_2_local = ImageGenerator._call_kie_api(f2_payload, f"{job_id}_frame_2.png")
    if not frame_2_local:
         logger.error("Failed to generate Frame 2")
         return
    frame_2_url = ImageUploader.upload(frame_2_local)
    logger.info(f"Frame 2 URL: {frame_2_url}")

    # 5. Generate Frame 3 (Text Overlay)
    logger.info("Generating Frame 3 (Text Overlay via Pillow)...")
    frame_3_local = ImageGenerator.generate_frame_3_fallback_pillow(job_id, frame_2_local, area_m2)
    if not frame_3_local:
         logger.error("Failed to generate Frame 3")
         return
    frame_3_url = ImageUploader.upload(frame_3_local)
    logger.info(f"Frame 3 URL: {frame_3_url}")

    # 6. Generate Frame 4 (Architecture)
    logger.info("Generating Frame 4 (Architectural Project)...")
    # Base it on frame 2 without the text so architecture looks cleaner
    frame_4_local = ImageGenerator.generate_frame_4(job_id, frame_2_url, area_m2)
    if not frame_4_local:
         logger.error("Failed to generate Frame 4")
         return
    frame_4_url = ImageUploader.upload(frame_4_local)
    logger.info(f"Frame 4 URL: {frame_4_url}")

    # 7. Generate Frame 5 (Eye Level)
    logger.info("Generating Frame 5 (Eye Level Perspective)...")
    frame_5_local = ImageGenerator.generate_frame_5(job_id, frame_4_url)
    if not frame_5_local:
         logger.error("Failed to generate Frame 5")
         return
    frame_5_url = ImageUploader.upload(frame_5_local)
    logger.info(f"Frame 5 URL: {frame_5_url}")

    # 8. Start Video Generations in parallel
    logger.info("=== STARTING VIDEO GENERATIONS VIA VEO 3.1 ===")
    
    v1_prompt = "A premium cinematic drone shot flying smoothly forward. The camera gently tilts up from a straight top-down 90-degree view to a 45-degree angle drone perspective. ABSOLUTELY NO 360-DEGREE ROTATION. DO NOT SPIN. DO NOT ROLL. The camera must remain perfectly parallel to the horizon at all times. Ultra-realistic terrain, fluid camera motion. Absolute silence, NO background music."
    logger.info("Starting Video 1: Drone Approach (90->45 deg)")
    task_v1 = VideoGenerator.start_video_generation(satellite_clean_url, frame_1_url, v1_prompt)
    
    v2_prompt = "A smooth, cinematic slow push-in drone shot at a 45-degree angle over a pristine landscape. Gradually, perfectly straight glowing cyan boundary lines elegantly fade in, outlining the land parcel perfectly. Cinematic ambient nature sounds, absolute silence, NO background music."
    logger.info("Starting Video 2: Glowing Borders Appear")
    task_v2 = VideoGenerator.start_video_generation(frame_1_url, frame_2_url, v2_prompt)
    
    v3_prompt = "A premium cinematic tracking shot moving slightly forward maintaining the 45-degree angle. Large elegant 3D typography fades in floating over the landscape. Cinematic wind, absolute silence, NO background music."
    logger.info("Starting Video 3: Area Text Appears")
    task_v3 = VideoGenerator.start_video_generation(frame_2_url, frame_3_url, v3_prompt)
    
    v4_prompt = "A seamless cinematic time-lapse transition at a 45-degree angle. The empty field magically transforms into a breathtaking ultra-modern luxury architectural building standing amidst elegant landscaping. Ambient construction to nature sounds transition, NO background music."
    logger.info("Starting Video 4: Architecture Time-lapse")
    task_v4 = VideoGenerator.start_video_generation(frame_3_url, frame_4_url, v4_prompt)
    
    v5_prompt = "A smooth, gentle cinematic camera movement that lowers gracefully from an elevated 45-degree drone view down to a comfortable, immersive eye-level perspective of the luxury house. Gentle outdoor ambient sounds, NO background music."
    logger.info("Starting Video 5: Camera Descends to Eye Level")
    task_v5 = VideoGenerator.start_video_generation(frame_4_url, frame_5_url, v5_prompt)

    tasks_dict = {}
    if task_v1: tasks_dict[1] = {"task_id": task_v1, "output_filename": f"{job_id}_video_1.mp4"}
    if task_v2: tasks_dict[2] = {"task_id": task_v2, "output_filename": f"{job_id}_video_2.mp4"}
    if task_v3: tasks_dict[3] = {"task_id": task_v3, "output_filename": f"{job_id}_video_3.mp4"}
    if task_v4: tasks_dict[4] = {"task_id": task_v4, "output_filename": f"{job_id}_video_4.mp4"}
    if task_v5: tasks_dict[5] = {"task_id": task_v5, "output_filename": f"{job_id}_video_5.mp4"}

    logger.info(f"Polling {len(tasks_dict)} video generation tasks in parallel...")
    completed_videos = VideoGenerator.poll_multiple_videos(tasks_dict)

    # 9. Assembly
    videos = []
    for i in range(1, 6):
        if i in completed_videos:
            videos.append(completed_videos[i])
            
    if len(videos) < 5:
         logger.warning("Not all videos succeeded. Still assembling what we have.")
         
    final_video = VideoAssembler.assemble_videos(job_id, videos)
    
    logger.info("=== ZERO-TO-HERO PIPELINE COMPLETE ===")
    if final_video:
        logger.info(f"FINAL VIDEO GENERATED SUCCESSFULLY AT: {final_video}")
    else:
        logger.error("Video assembly failed.")
        
    print("\n\n" + "="*50)
    print("ALL URLs for Review:")
    print(f"Satellite (Clean): {satellite_clean_url}")
    print(f"Satellite (Drawn): {satellite_drawn_url}")
    print(f"Frame 1: {frame_1_url}")
    print(f"Frame 2 (Borders): {frame_2_url}")
    print(f"Frame 3 (Text): {frame_3_url}")
    print(f"Frame 4 (Villa): {frame_4_url}")
    print(f"Frame 5 (Ground Level): {frame_5_url}")
    print(f"Final Assembled Video File: {final_video}")
    print("="*50)

if __name__ == "__main__":
    test_url = "https://parselsorgu.tkgm.gov.tr/#ara/idari/206406/1425/8/1772089527401"
    run_full_pipeline(test_url)
