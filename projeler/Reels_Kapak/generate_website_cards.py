import os
import random
import time
import requests
import json
from dotenv import load_dotenv

# Load env in order to get KIE_API_KEY
load_dotenv("ANTIGRAVITY_ROOT_BURAYA/_knowledge/credentials/master.env")

# Try to find KIE_API_KEY from master.env or .env
KIE_API_KEY = os.getenv("KIE_API_KEY") 
if not KIE_API_KEY:
    load_dotenv()
    KIE_API_KEY = os.getenv("KIE_API_KEY")

import base64

IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")

def upload_to_imgbb(image_path: str) -> str:
    print(f"Uploading {image_path} to ImgBB...")
    with open(image_path, "rb") as file:
        encoded_image = base64.b64encode(file.read()).decode("utf-8")
    
    url = "https://api.imgbb.com/1/upload"
    payload = {
        "key": IMGBB_API_KEY,
        "image": encoded_image
    }
    response = requests.post(url, data=payload)
    if response.status_code == 200:
        img_url = response.json()["data"]["url"]
        print(f"Uploaded successfully to ImgBB: {img_url}")
        return img_url
    else:
        print(f"ImgBB upload failed: {response.text}")
        return None
def generate_image_no_text(image_url: str, prompt: str) -> str:
    print(f"Sending request to Kie AI...")
    create_url = "https://api.kie.ai/api/v1/jobs/createTask"
    headers = {
        "Authorization": f"Bearer {KIE_API_KEY}",
        "Content-Type": "application/json"
    }
    # Using 3:4 or 4:5 aspect ratio as implied by the reference UI cards
    payload = {
        "model": "nano-banana-pro",
        "input": {
            "prompt": prompt,
            "image_input": [image_url],
            "aspect_ratio": "3:4" 
        }
    }
    
    response = requests.post(create_url, headers=headers, json=payload)
    if response.status_code != 200:
        print(f"Failed to create task: {response.text}")
        return None
        
    task_id = response.json().get("data", {}).get("taskId")
    print(f"Task created: {task_id}. Waiting for completion...")
    
    poll_url = f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}"
    while True:
        poll_resp = requests.get(poll_url, headers=headers)
        if poll_resp.status_code != 200:
             time.sleep(5)
             continue
             
        data = poll_resp.json().get("data", {})
        state = data.get("state")
        if state == "success":
            result_json = data.get("resultJson", "{}")
            result_data = json.loads(result_json)
            final_image_url = None
            if isinstance(result_data, list) and len(result_data) > 0:
                final_image_url = result_data[0]
            elif isinstance(result_data, dict) and "resultUrls" in result_data:
                final_image_url = result_data["resultUrls"][0]
            elif isinstance(result_data, dict) and "images" in result_data:
                final_image_url = result_data["images"][0]["url"]
            elif isinstance(result_data, dict) and "url" in result_data:
                 final_image_url = result_data["url"]
            return final_image_url
        elif state == "failed":
            print(f"Generation failed. Msg: {data.get('failMsg')}")
            return None
        elif state in ["processing", "wait"]:
             time.sleep(10)

if __name__ == "__main__":
    cutout_dir = "assets/cutouts"
    output_dir = "/tmp/products"
    os.makedirs(output_dir, exist_ok=True)
    
    # Let's use specific cutouts so they are different but high quality
    card_prompts = [
        {
            "name": "artifex_campus",
            "cutout": "cutout_IMG_4188.png",
            "prompt": "A modern, cinematic 3:4 portrait of an Asian entrepreneur standing in a high-tech modern office space. He is looking off-camera inspired, perhaps touching a futuristic transparent display or sitting in a sleek modern chair. Dark, moody aesthetic. Streetwear or smart casual attire. High contrast cinematic lighting with purple and blue neon undertones. Photorealistic, 35mm lens, depth of field. NO TEXT ON IMAGE. --cref {} --cw 0"
        },
        {
            "name": "ai_factory",
            "cutout": "cutout_IMG_4225.png",
            "prompt": "A modern, cinematic 3:4 portrait of an Asian tech founder presenting or collaborating in a modern coworking space. He is wearing a dark hoodie. He looks inspiring and community-oriented. Dark, moody aesthetic, with subtle cyan/blue background glows. Very professional, highly detailed, photorealistic. NO TEXT ON IMAGE. --cref {} --cw 0"
        },
        {
            "name": "hizmetler",
            "cutout": "cutout_IMG_4294.png",
            "prompt": "A cinematic 3:4 portrait of an Asian AI consultant in a premium, moody corporate boardoom or dark luxury office. He is wearing a modern dark blazer, looking professional and trustworthy. Accent lighting in purple/magenta colors perfectly highlighting his face and the premium backdrop. NO TEXT ON IMAGE. --cref {} --cw 0"
        },
        {
            "name": "marka_is_birlikleri",
            "cutout": "cutout_IMG_4265.png",
            "prompt": "A cinematic 3:4 portrait of an Asian content creator in a moody Youtube studio. He is seated with a professional podcast microphone (Shure SM7B) visibly on the desk in front of him. Neon lighting (pink and purple) illuminating the background slightly. He looks engaged, as if talking to an audience. Extremely photorealistic and cinematic. NO TEXT ON IMAGE. --cref {} --cw 0"
        }
    ]
    
    for item in card_prompts:
        out_path = os.path.join(output_dir, f"{item['name']}.jpg")
        if os.path.exists(out_path):
            print(f"Already exists: {out_path}, skipping.")
            continue
            
        cutout_path = os.path.join(cutout_dir, item['cutout'])
        print(f"Uploading {cutout_path}...")
        img_url = upload_to_imgbb(cutout_path)
        if not img_url:
            print("Failed to upload cutout.")
            continue
            
        prompt = item["prompt"].format(img_url)
        print(f"Generating for {item['name']}...")
        result_url = generate_image_no_text(img_url, prompt)
        
        if result_url:
            print(f"Downloading result for {item['name']} to {out_path}...")
            img_data = requests.get(result_url).content
            with open(out_path, 'wb') as handler:
                handler.write(img_data)
        else:
            print(f"Failed to generate for {item['name']}")
