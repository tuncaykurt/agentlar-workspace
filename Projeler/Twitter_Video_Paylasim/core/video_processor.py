import logging
import subprocess
import os
import shutil

from config import settings

# Resolve ffmpeg binary path once at module load.
# On Railway/Nixpacks, ffmpeg lives under /root/.nix-profile/bin/ which may
# not be inherited by subprocess child processes. Using the absolute path
# prevents FileNotFoundError at runtime.
_FFMPEG_BIN = shutil.which("ffmpeg") or "ffmpeg"

class VideoProcessor:
    def strip_metadata(self, input_path: str) -> str:
        """
        Takes an MP4 file and uses FFmpeg to strip all metadata.
        Returns the path to the stripped file.
        """
        if not input_path or not os.path.exists(input_path):
            logging.error(f"Cannot strip metadata from missing file: {input_path}")
            return None

        # Determine output path
        dir_name = os.path.dirname(input_path)
        base_name = os.path.basename(input_path)
        name, ext = os.path.splitext(base_name)
        output_path = os.path.join(dir_name, f"{name}_clean{ext}")

        # Construct FFmpeg command using resolved absolute path
        # -map_metadata -1 : removes global metadata
        # Re-encoding the video completely (libx264) to ensure the file hash is brand new
        # and X's algorithm cannot detect it as a TikTok downloaded file.
        logging.info(f"Using ffmpeg binary: {_FFMPEG_BIN}")
        cmd = [
            _FFMPEG_BIN,
            "-y",  # overwrite output files without asking
            "-i", input_path,
            "-map_metadata", "-1",
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "fast",
            "-c:a", "aac",
            "-b:a", "128k",
            output_path
        ]

        try:
            logging.info(f"Stripping metadata with command: {' '.join(cmd)}")
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
            if result.returncode == 0 and os.path.exists(output_path):
                logging.info(f"Metadata stripping successful -> {output_path}")
                return output_path
            else:
                logging.error(f"FFmpeg failed with exit code {result.returncode}.\nSTDERR: {result.stderr}")
                return None
        except Exception as e:
            logging.error(f"Failed to execute FFmpeg command: {e}", exc_info=True)
            return None

    def refine_caption(self, raw_caption: str) -> str:
        """
        Cleans up the TikTok caption.
        - Removes hashtags
        - Limits to 250 characters or less
        - Adds an engagement question at the end
        """
        if not raw_caption:
            return "Siz ne düşünüyorsunuz?"

        # Remove hashtags
        words = raw_caption.split()
        clean_words = [w for w in words if not w.startswith("#")]
        cleaned = " ".join(clean_words).strip()

        # If too long, truncate to first sentence or fixed length
        if len(cleaned) > 220:
            # simple sentence detection via dot
            sentences = cleaned.split('.')
            if sentences and len(sentences[0]) > 0:
                cleaned = sentences[0] + "."
            
            # if still too long, hard truncate
            if len(cleaned) > 220:
                cleaned = cleaned[:217] + "..."

        # Add engagement
        suffixes = [
            "Siz bu konuda ne düşünüyorsunuz?",
            "Denediniz mi?",
            "Sence de öyle mi?",
            "Fikrinizi yorumlarda paylaşın 👇"
        ]
        import random
        suffix = random.choice(suffixes)

        final_caption = f"{cleaned}\n\n{suffix}".strip()
        return final_caption
