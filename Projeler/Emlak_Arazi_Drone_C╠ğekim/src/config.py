import os
import uuid
import logging
from dotenv import load_dotenv

# Env dosyasını yükle
load_dotenv()

# Logger ayarları
log_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "run.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('ANTIGRAVITY_APP')

# API Anahtarları
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
KIE_AI_API_KEY = os.getenv("KIE_AI_API_KEY")

# Upload servisini catbox gibi free anon servislerden seçebiliriz, 
# Eğer ImgBB kullanılacaksa:
IMGBB_API_KEY = os.getenv("IMGBB_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Workspace and Temporary Directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
TEMP_DIR = os.path.join(BASE_DIR, "temp")

# Dizinleri oluştur
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

def generate_job_id():
    return str(uuid.uuid4())[:8]
