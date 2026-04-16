import sys
from src.config import generate_job_id, logger
from src.data_fetcher import TKGMDataFetcher
from src.map_generator import MapGenerator
from src.image_generator import ImageGenerator
from src.video_generator import VideoGenerator
from src.image_uploader import ImageUploader
from src.video_assembler import VideoAssembler

def run_pipeline(city: str, district: str, neighborhood: str, block: str, parcel: str):
    job_id = generate_job_id()
    logger.info(f"--- STARTING PIPELINE [{job_id}] ---")
    logger.info(f"Target: {city}/{district}/{neighborhood} {block}/{parcel}")
    
    # 1. Fetch TKGM Data
    parcel_data = TKGMDataFetcher.parse_parcel_info(city, district, neighborhood, block, parcel)
    if not parcel_data:
        logger.error("Failed to parse parcel info. Aborting.")
        return
        
    geometry = parcel_data.get("geometri")
    area_m2 = parcel_data.get("alan", 0)
    logger.info(f"Parcel found: {area_m2} m2")
    
    # 2. Get Satellite Image
    satellite_img_local = MapGenerator.generate_satellite_image(job_id, geometry)
    if not satellite_img_local:
        logger.error("Failed to generate satellite image. Aborting.")
        return
        
    # Upload to pass to Nano Banana / Veo 3.1
    satellite_img_url = ImageUploader.upload(satellite_img_local)
    if not satellite_img_url:
        logger.error("Failed to upload satellite image. Aborting.")
        return
        
    # 3. Generate Frames via Nano Banana Pro
    frame_1_local = ImageGenerator.generate_frame_1(job_id, satellite_img_url)
    if not frame_1_local:
        return
    frame_1_url = ImageUploader.upload(frame_1_local)
    
    frame_2_local = ImageGenerator.generate_frame_2(job_id, frame_1_url, area_m2)
    if not frame_2_local:
        return
    frame_2_url = ImageUploader.upload(frame_2_local)
        
    # Frame 3: Pillow Fallback for Text
    frame_3_local = ImageGenerator.generate_frame_3_fallback_pillow(job_id, frame_2_local, area_m2)
    if not frame_3_local:
        return
    frame_3_url = ImageUploader.upload(frame_3_local)
        
    # Frame 4: Project View
    frame_4_local = ImageGenerator.generate_frame_4(job_id, frame_1_url, area_m2)
    if not frame_4_local:
        return
    frame_4_url = ImageUploader.upload(frame_4_local)
        
    # Frame 5: Eye Level
    frame_5_local = ImageGenerator.generate_frame_5(job_id, frame_4_url)
    if not frame_5_local:
        return
    frame_5_url = ImageUploader.upload(frame_5_local)
    
    # 4. Generate Videos via Veo 3.1
    logger.info("Starting Video Generation...")
    
    # V1: Frame 1 -> Frame 2
    prompt_v1 = "A cinematic drone shot. Bright cyan/blue glowing boundary lines appear outlining the parcel borders."
    video_1_local = VideoGenerator.generate_video(job_id, frame_1_url, frame_2_url, prompt_v1, 1)
    
    # V2: Frame 2 -> Frame 3
    prompt_v2 = "A drone shot. Camera zooms in slightly. Large bold 3D text gradual materialize floating above parcel."
    video_2_local = VideoGenerator.generate_video(job_id, frame_2_url, frame_3_url, prompt_v2, 2)
    
    # V3: Frame 3 -> Frame 4
    prompt_v3 = "Text fades, empty land transforms. A modern architectural project gradually rises cinematic time-lapse."
    video_3_local = VideoGenerator.generate_video(job_id, frame_3_url, frame_4_url, prompt_v3, 3)
    
    # V4: Frame 4 -> Frame 5
    prompt_v4 = "Camera smoothly descends and rotates to arrive at an eye-level street view. Smooth drone downward flight."
    video_4_local = VideoGenerator.generate_video(job_id, frame_4_url, frame_5_url, prompt_v4, 4)
    
    videos = [v for v in [video_1_local, video_2_local, video_3_local, video_4_local] if v]
    
    # 5. Connect the Final Video
    final_video_path = VideoAssembler.assemble_videos(job_id, videos)
    if final_video_path:
        logger.info(f"--- SUCCESS: Pipeline {job_id} Completed. Final Video at {final_video_path}")
    else:
        logger.error(f"--- FAILED: Pipeline {job_id} could not assemble the final video")

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python main.py <city> <district> <neighborhood> <block> <parcel>")
        print("Example: python main.py Antalya Alanya Kestel 2216 13")
        sys.exit(1)
        
    city = sys.argv[1]
    district = sys.argv[2]
    neighborhood = sys.argv[3]
    block = sys.argv[4]
    parcel = sys.argv[5]
    
    run_pipeline(city, district, neighborhood, block, parcel)
