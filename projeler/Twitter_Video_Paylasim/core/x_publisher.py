import logging
import tweepy
import time

from config import settings

class XPublisher:
    def __init__(self):
        # Setting up OAuth 1.0a User Context
        # X Free Tier requires User Context for media upload & tweeting.
        # The 4 tokens provided from the developer portal are perfect for headless server OAuth 1.0a.
        auth = tweepy.OAuth1UserHandler(
            settings.X_CONSUMER_KEY, 
            settings.X_CONSUMER_SECRET,
            settings.X_ACCESS_TOKEN, 
            settings.X_ACCESS_TOKEN_SECRET
        )
        # V1.1 API needed for Media Upload
        self.api = tweepy.API(auth)
        
        # V2 Client needed for Create Tweet
        self.client = tweepy.Client(
            consumer_key=settings.X_CONSUMER_KEY,
            consumer_secret=settings.X_CONSUMER_SECRET,
            access_token=settings.X_ACCESS_TOKEN,
            access_token_secret=settings.X_ACCESS_TOKEN_SECRET
        )

    def upload_video(self, video_path: str) -> str:
        """
        Uploads an MP4 video to X using chunked media upload via v1.1 endpoint.
        Returns the media_id string.
        """
        if not video_path:
            logging.error("No video path provided for X upload.")
            return None

        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would have uploaded {video_path} to X API.")
            return "mock_media_id_123"

        try:
            logging.info(f"Uploading {video_path} to X API...")
            
            # Tweepy chunked media upload natively handles INIT, APPEND, FINALIZE and STATUS polling.
            # wait_for_async_upload=True means it will synchronously block until the video is 'succeeded'.
            media = self.api.media_upload(
                filename=video_path, 
                media_category='tweet_video', 
                chunked=True, 
                wait_for_async_upload=True
            )
            media_id = media.media_id_string
            
            logging.info(f"INIT/APPEND/FINALIZE complete. Media ID: {media_id}. Processing finished.")
            return media_id

        except Exception as e:
            logging.error(f"Failed to upload video to X API: {e}", exc_info=True)
            return None

    def post_tweet(self, text: str, media_id: str) -> str:
        """
        Creates a tweet using X API v2 with the uploaded media.
        """
        if settings.IS_DRY_RUN:
            logging.info(f"[DRY-RUN] Would tweet: '{text}' with media_id: {media_id}")
            return "mock_tweet_id_456"

        try:
            logging.info("Creating tweet...")
            response = self.client.create_tweet(
                text=text,
                media_ids=[media_id] if media_id else None
            )
            
            tweet_id = response.data.get('id')
            logging.info(f"Tweet successfully posted! Tweet ID: {tweet_id}")
            return tweet_id
        except Exception as e:
            logging.error(f"Failed to post tweet: {e}", exc_info=True)
            return None
