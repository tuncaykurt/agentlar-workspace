import os
import sys
import logging
import requests
import json
from datetime import datetime, timezone
import traceback
import threading
import queue

# Adjust path to find env_loader.py
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    from env_loader import get_env
except ImportError:
    # Fallback to os.environ if env_loader is not available
    def get_env(key, default=None):
        return os.environ.get(key, default)

NOTION_TOKEN = get_env("NOTION_SOCIAL_TOKEN") or get_env("NOTION_API_TOKEN")
# Use the specific DB ID created for Blog_Yazici logs
NOTION_DB_LOGS = get_env("NOTION_DB_BLOG_LOGS", "32f95514-0a32-81fe-965b-c2e227046837")

class NotionLogWorker(threading.Thread):
    """
    Background worker thread to dispatch logs to Notion asynchronously
    to avoid blocking the main execution pipeline.
    """
    def __init__(self, log_queue, token, db_id):
        super().__init__(daemon=True)
        self.log_queue = log_queue
        self.token = token
        self.db_id = db_id
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        }

    def run(self):
        while True:
            try:
                log_data = self.log_queue.get()
                if log_data is None: # Sentinel value to stop
                    break
                
                self._send_to_notion(log_data)
                self.log_queue.task_done()
            except Exception as e:
                # Fallback to print if Notion logging fails
                error_msg = f"[NotionLogger Error] Failed to send log to Notion: {e}"
                if hasattr(e, 'response') and e.response is not None:
                    error_msg += f"\nResponse details: {e.response.text}"
                print(error_msg, file=sys.stderr)

    def _send_to_notion(self, log_data):
        title = log_data.get("title", "")
        message = log_data.get("message", "")
        level = log_data.get("level", "INFO")
        component = log_data.get("component", "Pipeline")
        details = log_data.get("details", "")
        blog_link = log_data.get("blog_link", "")

        # Truncate to avoid Notion limits (2000 chars per text block)
        details = details[:1990] if details else ""
        message = message[:1990] if message else ""

        payload = {
            "parent": {"database_id": self.db_id},
            "properties": {
                "Title": {
                    "title": [{"text": {"content": title}}]
                },
                "Message": {
                    "rich_text": [{"text": {"content": message}}]
                },
                "Zaman": {
                    "date": {"start": datetime.now(timezone.utc).isoformat()}
                },
                "Level": {
                    "select": {"name": level}
                },
                "Component": {
                    "select": {"name": component}
                }
            }
        }

        if details:
            payload["properties"]["Details"] = {
                "rich_text": [{"text": {"content": details}}]
            }
        
        if blog_link:
            payload["properties"]["Blog Link"] = {
                "url": blog_link
            }

        response = requests.post("https://api.notion.com/v1/pages", headers=self.headers, json=payload, timeout=10)
        response.raise_for_status()


class NotionLogger:
    """
    A unified logger that logs to stdout AND asynchronously to the Notion Database.
    """
    def __init__(self, component="Pipeline"):
        self.component = component
        self.token = NOTION_TOKEN
        self.db_id = NOTION_DB_LOGS
        
        self.queue = queue.Queue()
        self.worker = None

        if self.token and self.db_id:
            self.worker = NotionLogWorker(self.queue, self.token, self.db_id)
            self.worker.start()
        else:
            print("[NotionLogger Warning] NOTION_TOKEN or DB ID missing, logging only to console.")

        # Standard logger setup
        self.std_logger = logging.getLogger(f"BlogYazici_{component}")
        if not self.std_logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - [%(name)s] %(message)s')
            handler.setFormatter(formatter)
            self.std_logger.addHandler(handler)
            self.std_logger.setLevel(logging.INFO)

    def _enqueue_log(self, level, title, message="", details="", blog_link=""):
        if self.worker:
            self.queue.put({
                "level": level,
                "title": title,
                "message": message,
                "component": self.component,
                "details": details,
                "blog_link": blog_link
            })

    def info(self, title, message="", blog_link=""):
        self.std_logger.info(f"{title}: {message}")
        self._enqueue_log("INFO", title, message, blog_link=blog_link)

    def success(self, title, message="", blog_link=""):
        self.std_logger.info(f"✅ {title}: {message}")
        self._enqueue_log("SUCCESS", title, message, blog_link=blog_link)

    def warning(self, title, message="", details=""):
        self.std_logger.warning(f"⚠️ {title}: {message}")
        self._enqueue_log("WARNING", title, message, details=details)

    def error(self, title, exception=None, message=""):
        details = ""
        if exception:
            details = "".join(traceback.format_exception(type(exception), exception, exception.__traceback__))
        
        self.std_logger.error(f"❌ {title}: {message}\n{details}")
        self._enqueue_log("ERROR", title, message, details=details)

    def wait_for_logs(self):
        """Wait until all queued logs are sent to Notion."""
        if self.worker:
            self.queue.join()

# Global instances for simple usage
logger = NotionLogger(component="Pipeline")

def get_logger(component):
    return NotionLogger(component=component)
