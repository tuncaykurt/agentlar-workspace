@echo off
echo =====================================
echo   Bahis AI Platform Baslatiliyor
echo =====================================

:: Backend
echo.
echo [1/2] FastAPI Backend baslatiliyor...
start "Backend" cmd /k "cd backend && .venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak > nul

:: Frontend
echo [2/2] Next.js Frontend baslatiliyor...
start "Frontend" cmd /k "cd frontend && npm run dev -- --port 3000"

echo.
echo =====================================
echo  Backend:   http://localhost:8000
echo  Frontend:  http://localhost:3000
echo  API Docs:  http://localhost:8000/docs
echo =====================================
echo.
pause
