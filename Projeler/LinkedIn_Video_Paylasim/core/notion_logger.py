import requests
import logging
from datetime import datetime, timezone

from config import settings


class NotionLogger:
    """
    Logs LinkedIn sharing activity to a Notion database.
    Tracks: video ID, status, filter decision, URLs, timestamps.
    """

    def __init__(self):
        self.token = settings.NOTION_TOKEN
        self.db_id = settings.NOTION_LINKEDIN_DB_ID
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
        }

    def is_video_posted(self, video_id: str) -> bool:
        """
        Check if the given video_id has already been processed (posted or filtered).
        Returns True if already handled.
        """
        try:
            url = f"https://api.notion.com/v1/databases/{self.db_id}/query"
            payload = {
                "filter": {
                    "property": "Video ID",
                    "title": {
                        "equals": video_id
                    }
                }
            }
            resp = requests.post(url, headers=self.headers, json=payload, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            return len(data.get("results", [])) > 0
        except Exception as e:
            logging.error(f"Error checking Notion for video_id {video_id}: {e}", exc_info=True)
            # Fail safe: return False to prevent falsely marking a video as processed if API fails
            return False

    def log_video(
        self,
        video_id: str,
        status: str,
        tiktok_url: str = "",
        linkedin_url: str = "",
        filter_decision: str = "",
        filter_reason: str = "",
        adapted_caption: str = ""
    ):
        """
        Logs a video event to the Notion database.
        Status can be: "Success", "Failed", "Filtered"
        """
        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would log to Notion -> ID: {video_id}, Status: {status}, Filter: {filter_decision}")
            return True

        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            url = "https://api.notion.com/v1/pages"
            properties = {
                "Video ID": {
                    "title": [
                        {"text": {"content": video_id}}
                    ]
                },
                "Status": {
                    "select": {"name": status}
                },
                "Platform": {
                    "select": {"name": "LinkedIn"}
                },
                "TikTok URL": {
                    "url": tiktok_url if tiktok_url else None
                },
                "Paylaşım Tarihi": {
                    "date": {"start": now_iso}
                },
            }

            # Optional fields
            if linkedin_url:
                properties["LinkedIn URL"] = {"url": linkedin_url}

            if filter_decision:
                properties["Filter Kararı"] = {"select": {"name": filter_decision}}

            if filter_reason:
                properties["Filter Sebebi"] = {
                    "rich_text": [{"text": {"content": filter_reason[:2000]}}]
                }

            if adapted_caption:
                properties["LinkedIn Caption"] = {
                    "rich_text": [{"text": {"content": adapted_caption[:2000]}}]
                }

            payload = {
                "parent": {"database_id": self.db_id},
                "properties": properties
            }
            resp = requests.post(url, headers=self.headers, json=payload, timeout=10)
            resp.raise_for_status()
            logging.info(f"Successfully logged Video ID {video_id} to Notion with status {status}.")
            return True
        except Exception as e:
            logging.error(f"Error logging video {video_id} to Notion: {e}", exc_info=True)
            return False
