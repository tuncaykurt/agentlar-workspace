import sys
import os
import logging

# Ensure project root is in path
sys.path.append(os.getcwd())

from generate_farm_video import run_farm_pipeline

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

if __name__ == "__main__":
    url = "https://parselsorgu.tkgm.gov.tr/#ara/idari/202809/40/191/1772461488512"
    area_override = 46689.0
    
    print(f"Running FARM pipeline for URL: {url}")
    print(f"Using Area Override: {area_override} m²")
    
    run_farm_pipeline(url, area_override=area_override)
