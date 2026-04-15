import os
import sys
import time
import google.generativeai as genai
from src.config import GEMINI_API_KEY, logger

if not GEMINI_API_KEY:
    print("GEMINI_API_KEY is missing!")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-pro')

def analyze_frame_2(image_path: str):
    print(f"--- Analyzing Frame 2: {image_path} ---")
    if not os.path.exists(image_path):
        print("Image not found.")
        return
        
    prompt = (
        "Lütfen bu fotoğrafı incele. Bu fotoğrafın 45 derecelik izometrik eğimli bir drone bakış açısına "
        "sahip olması, yani yere tamamen paralel (90 derece düz kuş bakışı) OLMAMASI gerekiyor. "
        "Şu anki görsel gerçekten bir drone'un 45 derece eğimli açısından mı bakıyor, "
        "yoksa sadece 90 derece düz tepeden kuş bakışı olarak mı kalmış? "
        "Lütfen detaylıca inceleyip dürüstçe analiz et. Eksikse nedir?"
    )
    
    try:
        from PIL import Image
        img = Image.open(image_path)
        response = model.generate_content([prompt, img])
        print("--- Frame 2 Analiz Sonucu ---")
        print(response.text)
    except Exception as e:
        print(f"Error during image analysis: {e}")


def analyze_video_1(video_path: str):
    print(f"--- Analyzing Video 1: {video_path} ---")
    if not os.path.exists(video_path):
        print("Video not found.")
        return
        
    prompt = (
        "Lütfen bu videoyu dikkatlice izle. "
        "Videonun başlangıcından sonuna kadar olan kamera hareketini incele. "
        "Kamera 90 dereceden (tam tepeden) 45 derece eğimli açıya geçiş yaparken "
        "kendi etrafında 360 derece (veya herhangi bir derecede) takla atıyor mu (roll dönme hareketi yapıyor mu)? "
        "Yoksa sorunsuz ve dönüş yapmadan temiz bir şekilde sadece eğiliyor mu (tilt hareketi)? "
        "Lütfen çok dikkatli bak ve videoda takla atıp atmadığını analiz et."
    )
    
    try:
        print(f"Uploading {video_path} to Gemini...")
        video_file = genai.upload_file(path=video_path)
        
        while video_file.state.name == "PROCESSING":
            print('.', end='', flush=True)
            time.sleep(2)
            video_file = genai.get_file(video_file.name)
            
        print("\nUpload complete. Generating analysis...")
        response = model.generate_content([video_file, prompt])
        print("--- Video 1 Analiz Sonucu ---")
        print(response.text)
        
        genai.delete_file(video_file.name)
    except Exception as e:
        print(f"Error during video analysis: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyze_results.py <job_id>")
        sys.exit(1)
        
    job_id = sys.argv[1]
    
    frame2_path = f"temp/{job_id}_frame_2.png"
    video1_path = f"output/{job_id}_video_1.mp4"
    if not os.path.exists(video1_path):
        video1_path = f"temp/{job_id}_video_1.mp4"
    
    analyze_frame_2(frame2_path)
    print("\n" + "="*50 + "\n")
    analyze_video_1(video1_path)
