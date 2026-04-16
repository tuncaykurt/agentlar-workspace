import os
import random
from notion_service import get_ready_videos
from drive_service import authenticate_google_drive, _extract_folder_id
from autonomous_cover_agent import run_autonomous_generation, generate_cover_text_and_scene
from drive_service import upload_cover_to_drive

def clean_drive_folder(folder_url):
    service = authenticate_google_drive()
    if not service:
        print("Could not auth drive.")
        return
        
    folder_id = _extract_folder_id(folder_url)
    if not folder_id:
        print(f"Could not extract ID from {folder_url}")
        return
        
    try:
        # Find any files or folders containing 'KAPAK'
        query = f"'{folder_id}' in parents and name contains 'KAPAK' and trashed = false"
        results = service.files().list(q=query, fields="files(id, name, mimeType)").execute()
        files = results.get('files', [])
        
        for file in files:
            if file['mimeType'] == 'application/vnd.google-apps.folder':
                # It's the KAPAK folder — delete files inside it first, then the folder
                inner_query = f"'{file['id']}' in parents and trashed = false"
                inner_results = service.files().list(q=inner_query, fields="files(id, name)").execute()
                inner_files = inner_results.get('files', [])
                for inner_file in inner_files:
                    print(f"  Deleting cover file: {inner_file['name']} (ID: {inner_file['id']})")
                    service.files().delete(fileId=inner_file['id']).execute()
                print(f"Deleting KAPAK folder: {file['name']} (ID: {file['id']})")
                service.files().delete(fileId=file['id']).execute()
            else:
                print(f"Deleting old cover: {file['name']} (ID: {file['id']})")
                service.files().delete(fileId=file['id']).execute()
            
    except Exception as e:
        print(f"Error cleaning drive: {e}")

def force_regenerate():
    videos = get_ready_videos()
    target_names = ["Abacus", "Verdent", "Buzzy", "buzzy"]
    
    for video in videos:
        is_target = any(target.lower() in video['name'].lower() for target in target_names)
        
        if is_target:
            print(f"\n{'='*60}")
            print(f"--- Forcing Regeneration for: {video['name']} ---")
            print(f"{'='*60}")
            
            # 1. Clean Drive — delete all existing covers
            print("\n[Step 1] Cleaning existing covers from Drive...")
            clean_drive_folder(video['drive_url'])
            
            cutout_dir = "outputs/cutouts"
            available_cutouts = [f for f in os.listdir(cutout_dir) if f.lower().endswith(('png', 'jpg', 'jpeg'))]
            if not available_cutouts:
                print("No cutouts found in outputs/cutouts.")
                continue
                
            topic = video['name']
            script_content = video.get('script_text', '')
            
            # 2. Generate cover text AND matching scene description
            print("\n[Step 2] Generating cover text + scene description...")
            text_result = generate_cover_text_and_scene(topic, script_content)
            main_text = text_result.get("cover_text", topic.upper())
            scene_description = text_result.get("scene_description", "")
            
            print(f"  Cover Text: {main_text}")
            print(f"  Scene Description: {scene_description}")
            
            for variant_index in range(1, 4):
                cutout_name = random.choice(available_cutouts)
                cutout_path = os.path.join(cutout_dir, cutout_name)
                
                final_cover_filename = f"cover_{video['id']}_var{variant_index}.png"
                final_cover_path = os.path.join("outputs", final_cover_filename)
                
                print(f"\n>> Generating Variant {variant_index} for {video['name']} with {cutout_name}")
                success = run_autonomous_generation(
                    local_person_image_path=cutout_path,
                    video_topic=topic,
                    main_text=main_text,
                    output_path=final_cover_path,
                    max_retries=2,
                    variant_index=variant_index,
                    script_text=script_content,
                    scene_description=scene_description
                )
                
                if success:
                    print(f"Variant {variant_index} generated. Uploading to Drive...")
                    upload_cover_to_drive(final_cover_path, video['drive_url'], file_name=f"Kapak {variant_index}.png")
                else:
                    print(f"Failed to generate Variant {variant_index}.")

if __name__ == "__main__":
    force_regenerate()
