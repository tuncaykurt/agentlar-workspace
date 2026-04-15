@echo off
echo AI Bahis Analiz Platformu
echo ==========================
call .venv\Scripts\activate.bat
streamlit run dashboard/app.py --server.port 8502 --server.headless false
