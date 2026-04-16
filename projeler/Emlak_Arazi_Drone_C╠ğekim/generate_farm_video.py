"""
generate_farm_video.py
======================
TARLA MODU — Agricultural Field Pipeline

Bu script, verilen TKGM parseli üzerinde inşaat/mimari proje yerine
aktif ve canlı bir tarımsal arazi görselleştirmesi üretir.

Pipeline:
  Uydu (clean) → Frame 1 (45° drone) → Frame 2 (neon sınırlar)
  → Frame 3 (alan m² metni) → Frame 4 🌾 (aktif tarla/traktör)
  → Frame 5 🚜 (zemin seviyesi tarla görünümü) → Final Video

Kullanım:
  python generate_farm_video.py
"""

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


def run_farm_pipeline(url: str, area_override: float = None):
    """
    Tarla/tarım arazisi için tam video pipeline'ı.
    Frame 4 ve 5'te inşaat yerine aktif tarımsal görünüm üretilir.
    """
    job_id = generate_job_id()
    logger.info(f"--- TARIM TARLA PIPELINE BAŞLATIYOR [{job_id}] ---")
    logger.info(f"Hedef URL: {url}")
    if area_override:
        logger.info(f"Area Override: {area_override} m²")

    # ─── 1. TKGM Parsel Verisi ───────────────────────────────────────────────
    parcel_data = TKGMDataFetcher.parse_from_url(url)
    if not parcel_data:
        logger.error("Parsel verisi alınamadı. İşlem durduruluyor.")
        return

    geometry = parcel_data.get("geometri")
    area_m2 = area_override if area_override is not None else parcel_data.get("alan", 0)
    city = parcel_data.get("ilAd", "Bilinmiyor")
    district = parcel_data.get("ilceAd", "Bilinmiyor")
    mahalle = parcel_data.get("mahalleAd", "")
    nitelik = parcel_data.get("nitelik", "TARLA")

    logger.info(f"✅ Parsel bulundu: {city}/{district}/{mahalle} | Alan: {area_m2} m² | Nitelik: {nitelik}")

    if not geometry:
        logger.error("Geometri verisi bulunamadı. Fallback kullanılamaz.")
        return

    # ─── 2. Uydu Görüntüleri ─────────────────────────────────────────────────
    logger.info("Uydu haritaları oluşturuluyor...")

    satellite_clean_path = MapGenerator.generate_satellite_image(job_id, geometry, draw_polygon=False, target_area=area_m2)
    if not satellite_clean_path:
        logger.error("Temiz uydu görüntüsü oluşturulamadı.")
        return
    satellite_clean_url = ImageUploader.upload(satellite_clean_path)
    logger.info(f"Temiz uydu URL: {satellite_clean_url}")

    satellite_drawn_path = MapGenerator.generate_satellite_image(job_id, geometry, draw_polygon=True, target_area=area_m2)
    if not satellite_drawn_path:
        logger.error("Çizimli uydu görüntüsü oluşturulamadı.")
        return
    satellite_drawn_url = ImageUploader.upload(satellite_drawn_path)
    logger.info(f"Çizimli uydu URL: {satellite_drawn_url}")

    # ─── 3. Frame 2 — 45° Drone (Neon) ─────────────────────────────────────
    # We generate the neon version FIRST because it's easier for the AI to follow the lines on map.
    DRONE_REF_URL = "https://i.ibb.co/BVX8yCQy/ref-drone.jpg"

    logger.info("Frame 2 üretiliyor (45° Drone perspektifi + Neon Sınırlar)...")
    f2_payload = {
        "model": "nano-banana-2",
        "input": {
            "prompt": (
                f"Birinci referans görselde uydudan aldığım bir haritayı görüyorsun. İkinci referans görselde ise drone ile çekilmiş bir hava fotoğrafı görüyorsun. "
                f"Senden istediğim: Birinci referans görseldeki haritayı, tıpkı ikinci referans görseldeki gibi (yaklaşık 45 derecelik bir açıyla yukarıdan bakan) "
                f"bir drone çekimi stiline dönüştürmen. Ayrıca arazinin üzerindeki çizgileri parlayan 3 boyutlu neon cyan renge dönüştür. Mükemmel 45 derece izometrik açı, ufuk çizgisi yok, 8k gerçekçi."
            ),
            "aspect_ratio": "9:16",
            "resolution": "1K",
            "output_format": "png",
            "google_search": False,
            "image_input": [satellite_drawn_url, DRONE_REF_URL]
        }
    }
    frame_2_local = ImageGenerator._call_kie_api(f2_payload, f"{job_id}_frame_2.png")
    if not frame_2_local:
        logger.error("Frame 2 üretilemedi.")
        return
    frame_2_url = ImageUploader.upload(frame_2_local)
    logger.info(f"Frame 2 URL: {frame_2_url}")

    # ─── 4. Frame 1 — 45° Drone (Temiz) ─────────────────────────────────────
    # We generate the CLEAN version by 'erasing' the neon from Frame 2.
    # This ensures the background is 100% stable between V1 and V2.
    logger.info("Frame 1 üretiliyor (Neon temizleme - Arka plan tutarlılığı için)...")
    f1_payload = {
        "model": "nano-banana-2",
        "input": {
            "prompt": (
                "Photorealistic aerial drone photograph. REMOVE THE GLOWING NEON LINES from the ground "
                "and replace them perfectly with natural grass and soil. "
                "DO NOT CHANGE ANY OTHER PART OF THE IMAGE. Keep every tree, road, and field exactly "
                "where it is. Pure natural terrain. 9:16 vertical format."
            ),
            "aspect_ratio": "9:16",
            "resolution": "1K",
            "output_format": "png",
            "google_search": False,
            "image_input": [frame_2_url]
        }
    }
    frame_1_local = ImageGenerator._call_kie_api(f1_payload, f"{job_id}_frame_1.png")
    if not frame_1_local:
        logger.error("Frame 1 üretilemedi.")
        return
    frame_1_url = ImageUploader.upload(frame_1_local)
    logger.info(f"Frame 1 URL: {frame_1_url}")

    # ─── 5. Frame 3 — Alan Metni (Pillow) ─────────────────────────────────────
    logger.info("Frame 3 üretiliyor (Alan m² metni - Pillow)...")
    frame_3_local = ImageGenerator.generate_frame_3_fallback_pillow(job_id, frame_2_local, area_m2)
    if not frame_3_local:
        logger.error("Frame 3 üretilemedi.")
        return
    frame_3_url = ImageUploader.upload(frame_3_local)
    logger.info(f"Frame 3 URL: {frame_3_url}")

    # ─── 6. Frame 4 🌾 — Aktif Tarla (FARM MODE - MASKED) ────────────────────
    logger.info("Frame 4 🌾 üretiliyor (Aktif tarımsal arazi - FARM MODE)...")
    FARM_DRONE_REF = "https://i.ibb.co/mrY5mfFn/farm-drone-ref.jpg"

    # NEW: Ensure only the masked area transforms (if possible)
    # Since pixel-perfect masking is hard without the exact vector, we use a strictly prompted Frame 4 first.
    # We will upload the raw one for now, but we use the Neon version (Frame 2) as input to keep context.
    
    # We apply the drone reference here to keep consistent 45 degree active farm style
    f4_farm_payload = {
        "model": "nano-banana-2",
        "input": {
            "prompt": (
                f"Birinci referans görselde mavi neon çizilmiş bir tarla hududu görüyorsun. İkinci referans görselde ise aktif bir tarım/doğa arazisi fotoğrafı var. "
                f"Senden istediğim: Birinci referans görseldeki arazinin {area_m2:.0f} metrekarelik İÇ KISMINI, tıpkı ikinci referans görseldeki ahenk ve kaliteyle "
                f"aktif, yemyeşil yüzlerce ince düz çizgi ekim sırası olan büyük ölçekli bir tarlaya (mümkünse kırmızı bir traktörle) dönüştürmen. "
                f"Sınır dışındaki dünyayı (yollar vs.) AYLAŞTIRMA! İkinci referans görsel sadece tarla kalitesi ve 45 derece drone bakış açısı için örnektir."
            ),
            "aspect_ratio": "9:16",
            "resolution": "1K",
            "output_format": "png",
            "google_search": False,
            "image_input": [frame_2_url, FARM_DRONE_REF]
        }
    }
    
    frame_4_raw_local = ImageGenerator._call_kie_api(f4_farm_payload, f"{job_id}_frame_4_farm.png")
    if not frame_4_raw_local:
        logger.error("Frame 4 (Farm) üretilemedi.")
        return
    
    # NEW: Ensure only the masked area transforms (if possible)
    # Since pixel-perfect masking is hard without the exact vector, we use a strictly prompted Frame 4 first.
    # We will upload the raw one for now, but we use the Neon version (Frame 2) as input to keep context.
    frame_4_url = ImageUploader.upload(frame_4_raw_local)
    logger.info(f"Frame 4 Farm URL: {frame_4_url}")

    # ─── 7. Frame 5 🚜 — Zemin Seviyesi Tarla ────────────────────────────────
    logger.info("Frame 5 🚜 üretiliyor (Zemin seviyesi tarla görünümü)...")
    FARM_GROUND_REF = "https://i.ibb.co/r2DFYzWq/farm-ground.jpg"
    
    f5_farm_payload = {
        "model": "nano-banana-2",
        "input": {
            "prompt": (
                "Birinci referans görselde 45 derece havadan bir tarla görüyorsun. İkinci referans görselde ise ZEMİNDEN, tarlanın İÇİNDEN çekilmiş bir örnek fotoğraf var. "
                "Senden istediğim: Birinci referans görseldeki o kocaman tarlanın tam ortasına inmişiz gibi (zemin seviyesinden, insan boyu hizasından) ufka doğru uzanan "
                "yemyeşil uzun mısır/buğday sıralarını gösteren görkemli, 8k gerçekçi, sabah ışıltılı bir doğa fotoğrafı oluşturman. İkinci referans görsel sana tarlaya zeminden "
                "bakış açısının nasıl durduğunu göstermek içindir, o stili kopyala. Asla gökyüzü inşaatı vb çizme, dümdüz görkemli bir tarla manzarası olsun (Zemin hizası)."
            ),
            "aspect_ratio": "9:16",
            "resolution": "1K",
            "output_format": "png",
            "google_search": False,
            "image_input": [frame_4_url, FARM_GROUND_REF]
        }
    }
    frame_5_local = ImageGenerator._call_kie_api(f5_farm_payload, f"{job_id}_frame_5_farm.png")
    if not frame_5_local:
        logger.error("Frame 5 (Farm) üretilemedi.")
        return
    frame_5_url = ImageUploader.upload(frame_5_local)
    logger.info(f"Frame 5 Farm URL: {frame_5_url}")

    # ─── 8. Video Üretimi (Paralel) ──────────────────────────────────────────
    logger.info("=== VEO 3.1 VIDEO ÜRETIMI BAŞLIYOR ===")

    v1_prompt = (
        "A premium cinematic drone shot flying smoothly forward. The camera gently tilts up from a straight "
        "top-down 90-degree view to a 45-degree angle drone view. "
        "CRITICAL RULE: DO NOT ROTATE THE CAMERA. DO NOT SPIN. DO NOT ROLL. DO NOT PAN SURROUNDINGS. "
        "The camera lens MUST only look UP/DOWN (pitch). The horizon lines must stay perfectly locked on the same vertical axis. "
        "Fluid motion, ultra-realistic terrain, high stability. No sky. No background music."
    )
    logger.info("Video 1 başlatılıyor: Drone yaklaşımı (90→45°)")
    task_v1 = VideoGenerator.start_video_generation(satellite_clean_url, frame_1_url, v1_prompt)

    v2_prompt = (
        "A slow cinematic push-in drone shot at 45-degree angle over pristine agricultural land. "
        "Gradually, perfectly straight glowing cyan boundary lines elegantly fade in, outlining the "
        "field parcel. Gentle wind through grass, ambient nature sounds. No background music."
    )
    logger.info("Video 2 başlatılıyor: Neon sınırlar beliriyor")
    task_v2 = VideoGenerator.start_video_generation(frame_1_url, frame_2_url, v2_prompt)

    v3_prompt = (
        "A premium cinematic tracking drone shot maintaining 45-degree angle. "
        "Large elegant 3D typography fades in floating above the field. "
        "Warm countryside atmosphere, gentle breeze. No background music."
    )
    logger.info("Video 3 başlatılıyor: Alan metni beliriyor")
    task_v3 = VideoGenerator.start_video_generation(frame_2_url, frame_3_url, v3_prompt)

    v4_prompt = (
        "A breathtaking seamless cinematic time-lapse transition at 45-degree drone angle. "
        "The bare empty field magically transforms into a lush, vibrant, actively cultivated agricultural "
        "paradise. Perfectly aligned green crop rows, active irrigation sprinklers casting soft mist, "
        "and a red tractor moving across the field. In the distance, a few white birds take flight. "
        "Vibrant golden morning sunlight, hyper-realistic natural details. No construction, pure active farming."
    )
    logger.info("Video 4 🌾 başlatılıyor: Tarla canlanıyor (FARM TRANSFORMATION)")
    task_v4 = VideoGenerator.start_video_generation(frame_3_url, frame_4_url, v4_prompt)

    v5_prompt = (
        "A premium cinematic slow-motion camera movement at ground-level between lush, tall crop rows. "
        "The camera moves slowly through the vibrant green stalks. A red tractor is seen working in the "
        "background with a farmer waving. Small birds fly across the bright blue morning sky. "
        "The scene feels alive, peaceful, and highly productive. Warm golden hour light, cinematic bokeh. "
        "No construction, pure pastoral elegance."
    )
    logger.info("Video 5 🚜 başlatılıyor: Kamerа zemine iniyor (FARM GROUND LEVEL)")
    task_v5 = VideoGenerator.start_video_generation(frame_4_url, frame_5_url, v5_prompt)

    tasks_dict = {}
    if task_v1: tasks_dict[1] = {"task_id": task_v1, "output_filename": f"{job_id}_video_1.mp4"}
    if task_v2: tasks_dict[2] = {"task_id": task_v2, "output_filename": f"{job_id}_video_2.mp4"}
    if task_v3: tasks_dict[3] = {"task_id": task_v3, "output_filename": f"{job_id}_video_3.mp4"}
    if task_v4: tasks_dict[4] = {"task_id": task_v4, "output_filename": f"{job_id}_video_4.mp4"}
    if task_v5: tasks_dict[5] = {"task_id": task_v5, "output_filename": f"{job_id}_video_5.mp4"}

    logger.info(f"{len(tasks_dict)} video görevi paralel olarak bekleniyor...")
    completed_videos = VideoGenerator.poll_multiple_videos(tasks_dict)

    # ─── 9. Video Birleştirme ─────────────────────────────────────────────────
    videos = []
    for i in range(1, 6):
        if i in completed_videos:
            videos.append(completed_videos[i])

    if len(videos) < 5:
        logger.warning(f"Yalnızca {len(videos)}/5 video tamamlandı. Mevcut videolar birleştiriliyor.")

    final_video = VideoAssembler.assemble_videos(job_id, videos)

    # ─── 10. Özet ─────────────────────────────────────────────────────────────
    logger.info("=== TARIM TARLA PIPELINE TAMAMLANDI ===")

    print("\n" + "="*60)
    print("🌾  TARLA MODU — TÜM URL'LER (İnceleme İçin)")
    print("="*60)
    print(f"📍 Parsel   : {city}/{district}/{mahalle} | {area_m2} m² | {nitelik}")
    print(f"🛰️  Uydu (Temiz)  : {satellite_clean_url}")
    print(f"🛰️  Uydu (Sınır)  : {satellite_drawn_url}")
    print(f"🎞️  Frame 1 (45°) : {frame_1_url}")
    print(f"🎞️  Frame 2 (Neon): {frame_2_url}")
    print(f"🎞️  Frame 3 (Metn): {frame_3_url}")
    print(f"🌾  Frame 4 (Tarla Drone): {frame_4_url}")
    print(f"🚜  Frame 5 (Tarla Zemin): {frame_5_url}")
    if final_video:
        print(f"🎬  Final Video  : {final_video}")
        logger.info(f"✅ BAŞARILI: Final video → {final_video}")
    else:
        print("❌  Final video birleştirilemedi.")
        logger.error("Video birleştirme başarısız.")
    print("="*60)


if __name__ == "__main__":
    # 🌾 Hedef: 16.065 m² Tarla Parseli
    TARLA_URL = "https://parselsorgu.tkgm.gov.tr/#ara/idari/149762/7881/11/1772300198196"
    run_farm_pipeline(TARLA_URL)
