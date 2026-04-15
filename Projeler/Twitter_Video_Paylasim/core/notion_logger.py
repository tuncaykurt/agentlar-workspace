import requests
import logging

from config import settings

class NotionLogger:
    def __init__(self):
        self.token = settings.NOTION_TOKEN
        self.db_id = settings.NOTION_TWITTER_DB_ID
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
        }

    def is_video_posted(self, video_id: str) -> bool:
        """
        Check if the given video_id has already been posted successfully.
        """
        try:
            url = f"https://api.notion.com/v1/databases/{self.db_id}/query"
            payload = {
                "filter": {
                    "and": [
                        {
                            "property": "Video ID",
                            "title": {
                                "equals": video_id
                            }
                        },
                        {
                            "property": "Status",
                            "select": {
                                "equals": "Success"
                            }
                        }
                    ]
                }
            }
            resp = requests.post(url, headers=self.headers, json=payload, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            return len(data.get("results", [])) > 0
        except Exception as e:
            logging.error(f"Error checking Notion for video_id {video_id}: {e}", exc_info=True)
            # Fail safe: if we can't check, assume it might not be posted, but maybe return True to prevent double post? 
            # Better return True to avoid spamming if API is down.
            return True

    def log_video(self, video_id: str, platform: str, status: str, tiktok_url: str, twitter_url: str):
        """
        Logs a video attempt or success to the Notion database.
        """
        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would log to Notion -> ID: {video_id}, Status: {status}")
            return True

        from datetime import datetime
        now_iso = datetime.utcnow().isoformat() + "Z"

        try:
            url = "https://api.notion.com/v1/pages"
            payload = {
                "parent": {"database_id": self.db_id},
                "properties": {
                    "Video ID": {
                        "title": [
                            {"text": {"content": video_id}}
                        ]
                    },
                    "Platform": {
                        "select": {"name": platform}
                    },
                    "Status": {
                        "select": {"name": status}
                    },
                    "TikTok URL": {
                        "url": tiktok_url if tiktok_url else "https://www.tiktok.com"
                    },
                    "Twitter URL": {
                        "url": twitter_url if twitter_url else "https://x.com"
                    },
                    "Paylaşım Tarihi": {
                        "date": {"start": now_iso}
                    }
                }
            }
            resp = requests.post(url, headers=self.headers, json=payload, timeout=10)
            resp.raise_for_status()
            logging.info(f"Successfully logged Video ID {video_id} to Notion with status {status}.")
            return True
        except Exception as e:
            logging.error(f"Error logging video {video_id} to Notion: {e}", exc_info=True)
            return False
