import sys
import logging
from src.video_assembler import VideoAssembler

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

video_files = [
    "temp/fbae68a3_video_1.mp4",
    "temp/fbae68a3_video_2.mp4",
    "temp/fbae68a3_video_3.mp4",
    "temp/fbae68a3_video_4.mp4"
]

out = VideoAssembler.assemble_videos("fbae68a3", video_files)
print("ASSEMBLY OUTPUT:", out)
