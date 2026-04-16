import logging
import time
import schedule

from core.tiktok_scraper import TikTokScraper
from core.video_processor import VideoProcessor
from core.content_filter import ContentFilter
from core.linkedin_publisher import LinkedInPublisher
from core.notion_logger import NotionLogger


def job():
    logging.info("==============================================")
    logging.info("Starting Daily TikTok -> LinkedIn Workflow")
    logging.info("==============================================")

    try:
        # Initialize Core Modules
        scraper = TikTokScraper()
        processor = VideoProcessor()
        content_filter = ContentFilter()
        publisher = LinkedInPublisher()
        logger_db = NotionLogger()

        # Step 1: Fetch Recent Videos (last 10)
        recent_videos = scraper.get_recent_videos(count=10)
        if not recent_videos:
            logging.info("Workflow Stop: Could not fetch any videos from TikTok.")
            return

        logging.info(f"Checking {len(recent_videos)} recent videos for a suitable candidate...")

        # Step 2: Loop through videos — find first suitable, unprocessed one
        for idx, video in enumerate(recent_videos, 1):
            video_id = video["id"]
            video_url = video["url"]
            video_title = video.get("title", "")

            # 2a: Duplication Check (already posted OR filtered)
            if logger_db.is_video_posted(video_id):
                logging.info(f"  [{idx}/{len(recent_videos)}] Skipping {video_id} — (Daha önce başarıyla yüklendi VEYA filtreden geçemediği için reddedildi)")
                continue

            logging.info(f"  [{idx}/{len(recent_videos)}] New video found! ID: {video_id} — {video_title[:60]}...")

            # 2b: LLM Content Filter
            logging.info("  Running LLM content filter...")
            filter_result = content_filter.evaluate_content(video_title)
            decision = filter_result["decision"]
            reason = filter_result["reason"]
            confidence = filter_result["confidence"]

            logging.info(f"  Filter Decision: {decision} (confidence: {confidence:.2f}) — {reason}")

            if decision == "REJECT":
                logger_db.log_video(
                    video_id=video_id,
                    status="Filtered",
                    tiktok_url=video_url,
                    filter_decision="Rejected",
                    filter_reason=reason
                )
                logging.info(f"  Video {video_id} rejected by content filter. Trying next...")
                continue

            # Step 3: Download Video (1080p)
            downloaded_path = scraper.download_video(video_url, output_id=f"linkedin_{video_id}")
            if not downloaded_path:
                logging.error(f"  Video {video_id} download failed. Trying next...")
                logger_db.log_video(
                    video_id=video_id,
                    status="Failed",
                    tiktok_url=video_url,
                    filter_decision="Approved",
                    filter_reason=f"Download failed. Filter reason: {reason}"
                )
                continue

            try:
                # Step 4: Metadata Strip + 1080p Ensure
                cleaned_path = processor.strip_metadata(downloaded_path)
                if not cleaned_path:
                    logging.error(f"  Video {video_id} metadata stripping failed. Trying next...")
                    logger_db.log_video(
                        video_id=video_id,
                        status="Failed",
                        tiktok_url=video_url,
                        filter_decision="Approved",
                        filter_reason=f"FFmpeg processing failed. Filter reason: {reason}"
                    )
                    continue

                # Step 5: Adapt Caption for LinkedIn (LLM)
                logging.info("  Adapting caption for LinkedIn...")
                linkedin_caption = content_filter.adapt_caption_for_linkedin(video_title)
                logging.info(f"  LinkedIn Caption: '{linkedin_caption[:100]}...'")

                # Step 6: Upload Video to LinkedIn
                video_urn = publisher.upload_video(cleaned_path)
                if not video_urn:
                    logging.error(f"  Video {video_id} LinkedIn upload failed. Trying next...")
                    logger_db.log_video(
                        video_id=video_id,
                        status="Failed",
                        tiktok_url=video_url,
                        filter_decision="Approved",
                        filter_reason=f"LinkedIn upload failed. Filter reason: {reason}",
                        adapted_caption=linkedin_caption
                    )
                    continue

                # Step 7: Create LinkedIn Post
                post_urn = publisher.create_post(text=linkedin_caption, video_urn=video_urn)
                if not post_urn:
                    logging.error(f"  Video {video_id} post creation failed. Trying next...")
                    logger_db.log_video(
                        video_id=video_id,
                        status="Failed",
                        tiktok_url=video_url,
                        filter_decision="Approved",
                        filter_reason=f"Post creation failed. Filter reason: {reason}",
                        adapted_caption=linkedin_caption
                    )
                    continue

                # Step 8: Log Success
                linkedin_url = f"https://www.linkedin.com/feed/update/{post_urn}/"
                logger_db.log_video(
                    video_id=video_id,
                    status="Success",
                    tiktok_url=video_url,
                    linkedin_url=linkedin_url,
                    filter_decision="Approved",
                    filter_reason=reason,
                    adapted_caption=linkedin_caption
                )

                logging.info("==============================================")
                logging.info(f"Workflow Complete: Video successfully posted to LinkedIn!")
                logging.info(f"LinkedIn URL: {linkedin_url}")
                logging.info("==============================================")
                return  # SUCCESS — exit after first successful post

            finally:
                # Cleanup temp files for this iteration
                scraper.clean_tmp_files(downloaded_path)
                if 'cleaned_path' in locals() and cleaned_path:
                    scraper.clean_tmp_files(cleaned_path)

        # If we reach here, all videos were either already processed or rejected
        logging.info("==============================================")
        logging.info("Workflow Complete: No suitable new video found among recent uploads.")
        logging.info("All recent videos were either already processed or rejected by content filter.")
        logging.info("==============================================")

    except Exception as e:
        logging.error(f"FATAL ERROR in job: {e}", exc_info=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    import os
    mode = os.environ.get("RUN_MODE", "cron").lower()

    if mode == "schedule":
        # Lokal geliştirme veya sürekli çalışan mod
        logging.info("LinkedIn_Video_Paylasim started in SCHEDULE mode (local dev).")
        logging.info("Ensure the TZ env variable is set to 'Europe/Istanbul' on Railway for accurate timings.")
        schedule.every().day.at("13:00").do(job)
        while True:
            schedule.run_pending()
            time.sleep(60)
    else:
        # Railway Cron modu: container açılır, job çalışır, container kapanır.
        logging.info("LinkedIn_Video_Paylasim started in CRON mode. Running job once and exiting.")
        job()
        logging.info("Job finished. Container will now exit.")
