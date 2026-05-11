"""Lightweight static file server for testing frontend changes."""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from pathlib import Path

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="PrepLoom Static Preview")

@app.get("/")
async def serve_index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/features")
async def serve_features():
    return FileResponse(STATIC_DIR / "features.html")

@app.get("/about")
async def serve_about():
    return FileResponse(STATIC_DIR / "about.html")

@app.get("/revision")
async def serve_revision():
    return FileResponse(STATIC_DIR / "revision.html")

@app.get("/settings")
async def serve_settings():
    return FileResponse(STATIC_DIR / "settings.html")

@app.get("/app")
async def serve_app():
    return FileResponse(STATIC_DIR / "app.html")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
