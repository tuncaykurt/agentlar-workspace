FROM python:3.11-slim

# Sistem bağımlılıkları: ffmpeg (frame extraction), libglib2.0 (opencv-headless)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Force cache invalidation when requirements change
COPY requirements.txt .
RUN echo "CACHE_BUST_20260326_v4_opencv_fix" && pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "run_pipeline.py", "--from-notion"]
