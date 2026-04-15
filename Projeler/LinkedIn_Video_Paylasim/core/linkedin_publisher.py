import logging
import requests
import os
import math
import time

from config import settings


class LinkedInPublisher:
    """
    Publishes videos to LinkedIn personal profile using:
    - Videos API (initialize upload + chunked upload)
    - Posts API (create post with video)
    
    Ref: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
    """

    API_BASE = "https://api.linkedin.com"
    CHUNK_SIZE = 4 * 1024 * 1024  # 4MB chunks

    def __init__(self):
        self.access_token = settings.LINKEDIN_ACCESS_TOKEN
        self.person_urn = settings.LINKEDIN_PERSON_URN
        self.headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "LinkedIn-Version": "202503",
            "X-Restli-Protocol-Version": "2.0.0",
        }

    def upload_video(self, video_path: str) -> str:
        """
        Uploads a video to LinkedIn and returns the video URN (asset).
        Three-step process:
        1. Initialize Upload -> get upload URL(s)
        2. Upload binary file chunk(s)
        3. Finalize Upload -> get video URN
        
        Returns the video URN string or None on failure.
        """
        if not video_path or not os.path.exists(video_path):
            logging.error(f"Video file not found: {video_path}")
            return None

        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would upload {video_path} to LinkedIn.")
            return "urn:li:video:mock_video_123"

        file_size = os.path.getsize(video_path)
        logging.info(f"Starting LinkedIn video upload: {video_path} ({file_size / (1024*1024):.1f} MB)")

        # Step 1: Initialize Upload
        video_urn = self._initialize_upload(file_size)
        if not video_urn:
            return None

        # Step 2: Upload chunks
        upload_success = self._upload_file_chunks(video_path, video_urn, file_size)
        if not upload_success:
            return None

        # Step 3: Finalize Upload
        finalized = self._finalize_upload(video_urn)
        if not finalized:
            return None

        logging.info(f"LinkedIn video upload complete! Video URN: {video_urn}")
        return video_urn

    def _initialize_upload(self, file_size: int) -> str:
        """Initialize the video upload and get upload instructions."""
        url = f"{self.API_BASE}/rest/videos?action=initializeUpload"
        payload = {
            "initializeUploadRequest": {
                "owner": self.person_urn,
                "fileSizeBytes": file_size,
                "uploadCaptions": False,
                "uploadThumbnail": False,
            }
        }

        try:
            resp = requests.post(url, headers=self.headers, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            video_urn = data.get("value", {}).get("video")
            upload_instructions = data.get("value", {}).get("uploadInstructions", [])

            if not video_urn:
                logging.error(f"No video URN in initialize response: {data}")
                return None

            # Store upload instructions for chunk upload
            self._upload_instructions = upload_instructions
            logging.info(f"Upload initialized. Video URN: {video_urn}, Chunks: {len(upload_instructions)}")
            return video_urn

        except Exception as e:
            logging.error(f"Failed to initialize LinkedIn video upload: {e}", exc_info=True)
            if hasattr(e, 'response') and e.response is not None:
                logging.error(f"Response body: {e.response.text[:500]}")
            return None

    def _upload_file_chunks(self, video_path: str, video_urn: str, file_size: int) -> bool:
        """Upload the video file in chunks according to upload instructions."""
        try:
            with open(video_path, "rb") as f:
                for i, instruction in enumerate(self._upload_instructions):
                    upload_url = instruction.get("uploadUrl")
                    if not upload_url:
                        logging.error(f"No upload URL for chunk {i}")
                        return False

                    # Read the chunk
                    chunk_data = f.read(self.CHUNK_SIZE)
                    if not chunk_data:
                        break

                    logging.info(f"Uploading chunk {i+1}/{len(self._upload_instructions)} ({len(chunk_data)} bytes)...")

                    upload_headers = {
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/octet-stream",
                    }

                    resp = requests.put(upload_url, headers=upload_headers, data=chunk_data, timeout=120)
                    if resp.status_code not in (200, 201):
                        logging.error(f"Chunk {i+1} upload failed: {resp.status_code} - {resp.text[:300]}")
                        return False

            logging.info("All chunks uploaded successfully.")
            return True

        except Exception as e:
            logging.error(f"Error uploading file chunks: {e}", exc_info=True)
            return False

    def _finalize_upload(self, video_urn: str) -> bool:
        """Finalize the video upload by checking processing status."""
        url = f"{self.API_BASE}/rest/videos/{video_urn}"

        max_retries = 30  # Wait up to 5 minutes
        for attempt in range(max_retries):
            try:
                resp = requests.get(url, headers=self.headers, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    status = data.get("status", "")
                    if status == "AVAILABLE":
                        logging.info(f"Video processing complete. Status: {status}")
                        return True
                    elif status in ("PROCESSING", "WAITING_UPLOAD"):
                        logging.info(f"Video still processing (attempt {attempt+1}/{max_retries})...")
                        time.sleep(10)
                    elif status == "PROCESSING_FAILED":
                        logging.error(f"Video processing failed on LinkedIn side: {data}")
                        return False
                    else:
                        logging.info(f"Unknown status '{status}', waiting... (attempt {attempt+1})")
                        time.sleep(10)
                else:
                    logging.warning(f"Status check returned {resp.status_code}, retrying...")
                    time.sleep(10)
            except Exception as e:
                logging.error(f"Error checking video status: {e}", exc_info=True)
                time.sleep(10)

        logging.error("Video processing timed out after 5 minutes.")
        return False

    def create_post(self, text: str, video_urn: str) -> str:
        """
        Creates a LinkedIn post with the uploaded video.
        Returns the post URN or None.
        """
        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would create LinkedIn post: '{text[:80]}...' with video {video_urn}")
            return "urn:li:share:mock_post_456"

        url = f"{self.API_BASE}/rest/posts"
        payload = {
            "author": self.person_urn,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": []
            },
            "content": {
                "media": {
                    "title": text[:100] if text else "Video",
                    "id": video_urn,
                }
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False
        }

        try:
            resp = requests.post(url, headers=self.headers, json=payload, timeout=30)
            if resp.status_code in (200, 201):
                # LinkedIn returns the post URN in x-restli-id header
                post_urn = resp.headers.get("x-restli-id", "")
                if not post_urn:
                    # Try response body
                    data = resp.json() if resp.text else {}
                    post_urn = data.get("id", "unknown")
                
                logging.info(f"LinkedIn post created successfully! Post URN: {post_urn}")
                return post_urn
            else:
                logging.error(f"Failed to create LinkedIn post: {resp.status_code} - {resp.text[:500]}")
                return None
        except Exception as e:
            logging.error(f"Error creating LinkedIn post: {e}", exc_info=True)
            return None
