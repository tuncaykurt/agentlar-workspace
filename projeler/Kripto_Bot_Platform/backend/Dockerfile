FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev curl && rm -rf /var/lib/apt/lists/*

# Pip'i güncelle
RUN pip install --upgrade pip

# Önce temel paketleri yükle
RUN pip install --no-cache-dir fastapi==0.111.0 uvicorn[standard]==0.29.0

# Sonra geri kalanları
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN echo "cache-bust-v6"
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
