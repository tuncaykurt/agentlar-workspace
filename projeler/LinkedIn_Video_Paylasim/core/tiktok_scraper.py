import logging
import yt_dlp
import os

from config import settings

class TikTokScraper:
    def __init__(self):
        self.username = settings.TIKTOK_USERNAME
        self.profile_url = f"https://www.tiktok.com/@{self.username}"
        self.download_dir = "/tmp/linkedin_paylasim"
        os.makedirs(self.download_dir, exist_ok=True)

    def get_recent_videos(self, count=10):
        """
        Fetches the latest N videos' metadata from the assigned TikTok profile.
        Returns a list of dicts: [{'id': '...', 'title': '...', 'url': '...'}, ...] or empty list.
        """
        ydl_opts = {
            'extract_flat': True,
            'playlistend': count,
            'quiet': True,
            'no_warnings': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                result = ydl.extract_info(self.profile_url, download=False)
                if 'entries' in result and len(result['entries']) > 0:
                    videos = []
                    for entry in result['entries']:
                        video_id = entry.get('id')
                        title = entry.get('title', '')
                        url = entry.get('url', f"https://www.tiktok.com/@{self.username}/video/{video_id}")
                        videos.append({
                            "id": video_id,
                            "title": title,
                            "url": url
                        })
                    logging.info(f"Found {len(videos)} recent videos on profile.")
                    return videos
                else:
                    logging.warning(f"No videos found on profile: {self.profile_url}")
                    return []
            except Exception as e:
                logging.error(f"Error extracting profile info for {self.profile_url}: {e}", exc_info=True)
                return []

    def download_video(self, video_url: str, output_id: str) -> str:
        """
        Downloads a single TikTok video in 1080p quality and returns the path to the downloaded MP4 file.
        """
        output_template = os.path.join(self.download_dir, f"{output_id}.%(ext)s")
        ydl_opts = {
            # Prefer 1080p video + best audio, fallback to best available
            'format': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True,
            'restrictfilenames': True,
            'merge_output_format': 'mp4',
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                ydl.download([video_url])
                expected_file = os.path.join(self.download_dir, f"{output_id}.mp4")
                if os.path.exists(expected_file):
                    # Verify resolution
                    file_size_mb = os.path.getsize(expected_file) / (1024 * 1024)
                    logging.info(f"Successfully downloaded TikTok video to {expected_file} ({file_size_mb:.1f} MB)")
                    return expected_file
                else:
                    logging.error(f"Download completed but file not found at {expected_file}")
                    return None
            except Exception as e:
                logging.error(f"Error downloading TikTok video {video_url}: {e}", exc_info=True)
                return None

    def clean_tmp_files(self, filepath: str):
        """
        Cleans up the downloaded file.
        """
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                logging.info(f"Cleaned up temporary file: {filepath}")
            except Exception as e:
                logging.error(f"Failed to clean up file {filepath}: {e}", exc_info=True)
