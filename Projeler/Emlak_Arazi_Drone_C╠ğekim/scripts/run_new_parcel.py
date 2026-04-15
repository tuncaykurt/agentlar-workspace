import sys
import logging
from generate_full_video import run_full_pipeline

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        # Default test URL provided by user
        url = "https://parselsorgu.tkgm.gov.tr/#ara/idari/28787/224/7/1772198390190"
    
    print(f"Running pipeline for URL: {url}")
    run_full_pipeline(url)
