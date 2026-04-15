@echo off
echo Bahis Manipulasyon Tespit Sistemi
echo ==================================

:: Sanal ortam yoksa oluştur
if not exist ".venv" (
    echo Sanal ortam olusturuluyor...
    python -m venv .venv
)

:: Aktifleştir
call .venv\Scripts\activate.bat

:: Bağımlılıkları yükle
echo Bagimliliklar yukleniyor...
pip install -r requirements.txt -q

:: Dashboard başlat
echo Dashboard baslatiliyor: http://localhost:8501
streamlit run dashboard/app.py --server.port 8501 --server.headless false
