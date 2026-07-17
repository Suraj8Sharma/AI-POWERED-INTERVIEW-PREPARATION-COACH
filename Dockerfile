FROM python:3.11-slim

# System libraries required by mediapipe/opencv (headless linux) and whisper's
# ffmpeg fallback path for non-WAV audio (webm/ogg/mp4 chunks from the browser).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libegl1 \
    libgles2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOME=/app \
    XDG_CACHE_HOME=/app/.cache

# torch is openai-whisper's hard dependency. Installed separately, from
# PyTorch's own CPU-only index — the default PyPI wheel is CUDA-enabled and
# several GB larger, which free-tier hosts can't afford. Keeping this as its
# own step (rather than --extra-index-url in requirements-prod.txt) avoids
# pip resolving unrelated packages against the wrong index.
RUN pip install --no-cache-dir torch==2.10.0 --index-url https://download.pytorch.org/whl/cpu

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY web/ web/
COPY AI_BACKEND/ AI_BACKEND/

# AI_BACKEND/chroma_db (vector DB) and AI_BACKEND/video_capture/models (pose model)
# are gitignored for local dev but must ship in the image — there's no build-time
# network/secret access on most free container hosts (e.g. HF Spaces) to build
# them on the fly. Build them locally first (see AI_BACKEND/rag_backend.ipynb and
# a first run of the app to trigger the pose-model download), then build the image.

EXPOSE 7860

CMD ["python", "-m", "uvicorn", "web.api:app", "--host", "0.0.0.0", "--port", "7860"]
