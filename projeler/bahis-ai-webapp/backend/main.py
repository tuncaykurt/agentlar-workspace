from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(title="Bahis AI API", version="1.0.0")

@app.on_event("startup")
def startup():
    from services.database import init_db
    init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
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
