from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os, logging, traceback

load_dotenv()
logger = logging.getLogger(__name__)

app = FastAPI(title="Bahis AI API", version="1.0.0")

# CORS — önce middleware ekle, sonra router
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

@app.on_event("startup")
def startup():
    from services.database import init_db
    init_db()

# 500 hatalarında da CORS header gönder + hatayı logla
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"500 hatası [{request.url}]: {exc}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )

from routers import fixtures, analysis, combinations
app.include_router(fixtures.router)
app.include_router(analysis.router)
app.include_router(combinations.router)

@app.get("/")
def root():
    return {"status": "ok", "service": "Bahis AI API"}

@app.get("/health")
def health():
    return {"status": "healthy"}
