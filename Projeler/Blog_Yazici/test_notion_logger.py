import os
import sys
from dotenv import load_dotenv

# Load env vars from .env or master.env
load_dotenv()
_master_env = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_knowledge", "credentials", "master.env")
if os.path.exists(_master_env):
    load_dotenv(_master_env)

# Verify required env vars
if not os.environ.get("NOTION_SOCIAL_TOKEN"):
    print("❌ NOTION_SOCIAL_TOKEN not found. Set it in .env or master.env")
    sys.exit(1)

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import notion_logger

logger = notion_logger.get_logger("Pipeline")
logger.info("Test Run", "This is an integration test.", blog_link="https://KISISEL_WEBSITE_BURAYA/blog/test-article")

try:
    1 / 0
except Exception as e:
    logger.error("Test Error", exception=e, message="Divided by zero manually for testing")

logger.wait_for_logs()
print("Test completed.")
