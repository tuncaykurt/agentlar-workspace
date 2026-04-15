import os
import subprocess
import static_ffmpeg
static_ffmpeg.add_paths()

from src.config import OUTPUT_DIR, TEMP_DIR, logger

class VideoAssembler:
    @staticmethod
    def assemble_videos(job_id: str, video_files: list, bgm_path: str = None) -> str:
        """
        Assembles a list of video paths using ffmpeg.
        Applies a 2x speedup to the first 2 videos (indices 0 and 1).
        Optionally overlays a background music track (bgm_path).
        """
        logger.info(f"Assembling {len(video_files)} videos for job {job_id} (BGM: {bgm_path})")
        if not video_files:
            logger.error("No video files to assemble!")
            return None
            
        out_path = os.path.join(OUTPUT_DIR, f"{job_id}_final_video.mp4")
        
        # 1. Standardize and Speed Up (if applicable)
        standardized_files = []
        for i, video in enumerate(video_files):
            std_path = video.replace(".mp4", "_std.mp4")
            
            # For the first three videos (0, 1, and 2), we want 2x speed.
            # 0: Video 1 (Drone approach)
            # 1: Video 2 (Neon fade in)
            # 2: Video 3 (Text animation)
            if i in [0, 1, 2]:
                # setpts=0.5*PTS speeds up video 2x
                # atempo=2.0 speeds up audio 2x
                vf_filter = "setpts=0.5*PTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
                af_filter = "atempo=2.0"
                cmd = [
                    "ffmpeg", "-y", "-i", video,
                    "-vf", vf_filter,
                    "-af", af_filter,
                    "-r", "24", "-c:v", "libx264", "-crf", "23", "-preset", "fast",
                    std_path
                ]
            else:
                vf_filter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
                cmd = [
                    "ffmpeg", "-y", "-i", video,
                    "-vf", vf_filter,
                    "-r", "24", "-c:v", "libx264", "-crf", "23", "-preset", "fast",
                    std_path
                ]
                
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                standardized_files.append(std_path)
            except subprocess.CalledProcessError as e:
                logger.error(f"Failed to standardize video {video}: {e.stderr.decode()}")
        
        if len(standardized_files) != len(video_files):
            logger.error("Some videos failed standardization, aborting concatenation.")
            return None

        # 2. Concatenate
        concat_file = os.path.join(TEMP_DIR, f"{job_id}_concat.txt")
        with open(concat_file, 'w') as f:
            for video in standardized_files:
                abs_path = os.path.abspath(video)
                f.write(f"file '{abs_path}'\n")

        concat_out_path = os.path.join(TEMP_DIR, f"{job_id}_concatenated.mp4")
        cmd_concat = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_file,
            "-c", "copy", concat_out_path
        ]
        
        try:
            subprocess.run(cmd_concat, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            logger.info("Successfully concatenated videos.")
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg concatenation failed: {e.stderr.decode()}")
            return None

        # 3. Add Background Music Overlay (if provided)
        if bgm_path and os.path.exists(bgm_path):
            logger.info(f"Adding Background Music: {bgm_path}")
            # Map [0:v] video from input 0
            # Map [0:a] original audio from input 0, volume at 0.8
            # Map [1:a] BGM audio from input 1, volume at 0.15, looped to match shortest (video)
            # amix merges them together
            cmd_bgm = [
                "ffmpeg", "-y",
                "-i", concat_out_path,
                "-stream_loop", "-1", "-i", bgm_path,
                "-filter_complex", "[0:a]volume=0.8[a0];[1:a]volume=0.15[a1];[a0][a1]amix=inputs=2:duration=shortest[a]",
                "-map", "0:v", "-map", "[a]",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                out_path
            ]
            try:
                subprocess.run(cmd_bgm, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                logger.info(f"Successfully added BGM. Final assembly saved to: {out_path}")
            except subprocess.CalledProcessError as e:
                logger.error(f"FFmpeg BGM mix failed: {e.stderr.decode()}")
                return None
        else:
            # If no BGM, just move the concatenated file to the final out path
            import shutil
            shutil.move(concat_out_path, out_path)
            logger.info(f"No BGM provided. Assembly saved directly to: {out_path}")

        # 4. Clean up intermediate files
        for std_file in standardized_files:
            if os.path.exists(std_file):
                os.remove(std_file)
        if os.path.exists(concat_file):
            os.remove(concat_file)
        if os.path.exists(concat_out_path):
            os.remove(concat_out_path)
            
        return out_path
