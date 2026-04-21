"""
PrepLoom — FastAPI backend.

Wraps AI_BACKEND modules as REST endpoints:
  /api/roles, /api/start, /api/submit, /api/next,
  /api/transcribe, /api/analyze-posture, /api/report/{id}

Auth (MongoDB + JWT):
  POST /api/auth/register, POST /api/auth/login, GET /api/auth/me

Run:
  cd <project root>
  python -m uvicorn web.api:app --reload --port 8000
"""

from __future__ import annotations

import io
import logging
import sys
import uuid
import time
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import base64
import json

import numpy as np
from PIL import Image
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

# ── Path setup (same as frontend.py) ──────────────────────────────────────
APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

load_dotenv(APP_ROOT / ".ENV")
load_dotenv(APP_ROOT / ".env")

from web.auth_routes import get_optional_user, router as auth_router
from web.mongo_db import get_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        db = get_db()
        await asyncio.wait_for(db.users.create_index("email", unique=True), timeout=3)
    except Exception as e:
        logging.getLogger("uvicorn.error").warning("MongoDB users index: %s", e)
    yield



from AI_BACKEND.rag_retriever import (
    fetch_questions_for_role_random_mix,
    list_roles,
    load_vectordb,
)
from AI_BACKEND.evaluator import evaluate_technical_answer
from AI_BACKEND.nlp_analysis import analyze_communication

# ── Constants ──────────────────────────────────────────────────────────────
CHROMA_DIR = APP_ROOT / "AI_BACKEND" / "chroma_db"
STATIC_DIR = Path(__file__).resolve().parent / "static"

# ── In-memory session store ────────────────────────────────────────────────
_sessions: dict[str, dict[str, Any]] = {}

# ── Lazy-load vector DB ───────────────────────────────────────────────────
_vectordb = None


def _get_vectordb():
    global _vectordb
    if _vectordb is None:
        _vectordb = load_vectordb(CHROMA_DIR)
    return _vectordb


# ── FastAPI app ────────────────────────────────────────────────────────────
app = FastAPI(title="PrepLoom API", lifespan=lifespan)
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── HTML pages (marketing + interview app) ────────────────────────────────
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


@app.get("/app")
async def serve_app():
    return FileResponse(STATIC_DIR / "app.html")


# Mount static files AFTER the root route so /api/* takes precedence
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ═══════════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


@app.get("/api/roles")
async def get_roles():
    """Return available interview roles."""
    try:
        roles = list_roles(_get_vectordb())
    except Exception as e:
        roles = ["Data Scientist", "AI ML Engineer"]
    return {"roles": roles}


@app.post("/api/start")
async def start_interview(
    payload: dict,
    user: dict | None = Depends(get_optional_user),
):
    """Start a new interview session for the given role.

    If the client sends ``Authorization: Bearer <JWT>`` (signed-in user),
    the session is associated with that account for future persistence.
    """
    role = payload.get("role", "")
    name = payload.get("name", "")
    if not role:
        raise HTTPException(400, "role is required")

    try:
        vectordb = _get_vectordb()
        questions = fetch_questions_for_role_random_mix(
            vectordb=vectordb,
            role_tag=role,
            technical_min=6,
            technical_max=7,
            behavioural_count=3,
            seed=None,
        )
    except Exception as e:
        raise HTTPException(500, f"Could not fetch questions: {e}")

    if not questions:
        raise HTTPException(404, f"No questions found for role: {role}")

    session_id = str(uuid.uuid4())
    _sessions[session_id] = {
        "name": name,
        "role": role,
        "user_id": user["id"] if user else None,
        "user_email": user["email"] if user else None,
        "questions": questions,
        "question_idx": 0,
        "evaluations": [],
        "body_language": None,
    }

    q = questions[0]
    return {
        "session_id": session_id,
        "total_questions": len(questions),
        "question": _question_to_dict(q, 0),
    }


@app.post("/api/submit")
async def submit_answer(payload: dict):
    """Evaluate the user's answer for the current question."""
    sid = payload.get("session_id", "")
    session = _sessions.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    answer = payload.get("answer", "").strip()
    duration = float(payload.get("duration", 7.0))
    bl_data = payload.get("body_language")

    idx = session["question_idx"]
    questions = session["questions"]
    if idx >= len(questions):
        raise HTTPException(400, "All questions already answered")

    q = questions[idx]

    # 1. Technical score (LLM / heuristic)
    tech_eval = evaluate_technical_answer(
        question_text=q.question_text,
        ideal_answer=q.ideal_answer or "",
        user_answer=answer,
        role_tag=q.role_tag,
        difficulty_level=q.difficulty_level,
    )

    # 2. Communication score (NLP)
    comm_eval = analyze_communication(answer, duration)

    # 3. Confidence score (body language)
    confidence_score = None
    bl_summary = "No body language data captured for this question."
    if bl_data and not bl_data.get("error") and bl_data.get("pose_visible_fraction", 0) > 0:
        o = float(bl_data.get("openness", 0.5))
        e = float(bl_data.get("engagement", 0.5))
        p = float(bl_data.get("posture", 0.5))
        f = float(bl_data.get("fidgeting", 0.5))
        confidence_score = int(round(np.clip((o + e + p + (1.0 - f)) / 4.0, 0.0, 1.0) * 100))
        bl_summary = bl_data.get("summary", "")

    combined = {
        "question_text": q.question_text,
        "user_answer": answer,
        "technical_score": tech_eval.get("technical_score"),
        "strengths": tech_eval.get("strengths", []),
        "improvements": tech_eval.get("improvements", []),
        "missing_points": tech_eval.get("missing_points", []),
        "short_feedback": tech_eval.get("short_feedback", ""),
        "communication_score": comm_eval.get("communication_score"),
        "filler_count": comm_eval.get("filler_count", 0),
        "wpm": comm_eval.get("wpm", 0),
        "comm_details": comm_eval.get("details", ""),
        "confidence_score": confidence_score,
        "bl_summary": bl_summary,
    }

    session["evaluations"].append(combined)
    return {"evaluation": combined}


@app.post("/api/next")
async def next_question(payload: dict):
    """Advance to the next question in the session."""
    sid = payload.get("session_id", "")
    session = _sessions.get(sid)
    if not session:
        raise HTTPException(404, "Session not found")

    idx = session["question_idx"] + 1
    questions = session["questions"]

    if idx >= len(questions):
        return {"done": True, "message": "Interview complete"}

    session["question_idx"] = idx
    session["body_language"] = None
    q = questions[idx]
    return {
        "done": False,
        "question": _question_to_dict(q, idx),
    }


@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    """Transcribe uploaded WAV audio using Whisper."""
    from AI_BACKEND.audio_capture import transcribe_audio
    import tempfile

    content = await audio.read()
    tmp_dir = Path(tempfile.gettempdir())
    wav_path = tmp_dir / f"upload_{uuid.uuid4().hex}.wav"
    wav_path.write_bytes(content)

    try:
        text = transcribe_audio(wav_path, model_name="base", lang="en")
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    finally:
        wav_path.unlink(missing_ok=True)

    return {"transcript": text}


@app.post("/api/analyze-posture")
async def analyze_posture(image: UploadFile = File(...)):
    """Analyze body language from uploaded JPEG/PNG image."""
    try:
        from AI_BACKEND.video_capture import analyze_camera_snapshot_rgb
    except ImportError as e:
        raise HTTPException(500, f"Video module import failed: {e}")

    content = await image.read()
    try:
        img = Image.open(io.BytesIO(content)).convert("RGB")
        rgb = np.asarray(img, dtype=np.uint8)
    except Exception as e:
        raise HTTPException(400, f"Could not decode image: {e}")

    raw = analyze_camera_snapshot_rgb(rgb, draw_skeleton=False)
    # Remove non-serializable fields
    result = {k: v for k, v in raw.items() if k not in ("annotated_rgb",)}
    return result


@app.websocket("/ws/analyze-posture")
async def websocket_analyze_posture(websocket: WebSocket):
    """
    WebSocket endpoint for continuous frame-by-frame posture analysis.
    
    Client sends messages with base64-encoded JPEG frames.
    Server responds with real-time metrics.
    
    Message format: {"frame": "base64_jpeg_data"}
    Response format: {"metrics": {...}, "summary": "...", "timestamp": ...}
    """
    await websocket.accept()
    frame_count = 0
    error_count = 0
    
    try:
        from AI_BACKEND.video_capture import analyze_camera_snapshot_rgb
    except ImportError as e:
        await websocket.send_json({"error": f"Video module import failed: {e}"})
        await websocket.close()
        return

    try:
        while True:
            try:
                # Receive frame data
                data = await websocket.receive_text()
                msg = json.loads(data)
                frame_data = msg.get("frame", "")
                
                if not frame_data:
                    await websocket.send_json({"error": "No frame data provided"})
                    continue
                
                # Decode base64 JPEG
                try:
                    image_bytes = base64.b64decode(frame_data)
                    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                    rgb = np.asarray(img, dtype=np.uint8)
                except Exception as e:
                    error_count += 1
                    await websocket.send_json({"error": f"Could not decode frame: {e}"})
                    if error_count > 10:
                        await websocket.close()
                        break
                    continue
                
                # Analyze pose
                try:
                    raw = analyze_camera_snapshot_rgb(rgb, draw_skeleton=False)
                    result = {k: v for k, v in raw.items() if k not in ("annotated_rgb",)}
                    
                    # Add frame counter
                    frame_count += 1
                    result["frame_count"] = frame_count
                    result["timestamp"] = time.time()
                    
                    # Send metrics back
                    await websocket.send_json(result)
                    error_count = 0  # Reset error count on success
                    
                except Exception as e:
                    error_count += 1
                    await websocket.send_json({
                        "error": f"Analysis failed: {str(e)}",
                        "frame_count": frame_count,
                        "timestamp": time.time()
                    })
                    if error_count > 10:
                        await websocket.close()
                        break
                
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON format"})
                continue
                
    except WebSocketDisconnect:
        logging.getLogger("uvicorn.error").info(f"WebSocket disconnected after {frame_count} frames")
    except Exception as e:
        logging.getLogger("uvicorn.error").error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass


@app.get("/api/report/{session_id}")
async def get_report(session_id: str):
    """Return aggregate report for a finished interview."""
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    evals = session["evaluations"]
    if not evals:
        return {"error": "No answers submitted yet"}

    tech_scores = [e["technical_score"] for e in evals if e.get("technical_score") is not None]
    comm_scores = [e["communication_score"] for e in evals if e.get("communication_score") is not None]
    conf_scores = [e["confidence_score"] for e in evals if e.get("confidence_score") is not None]

    avg_tech = int(round(sum(tech_scores) / max(1, len(tech_scores)))) if tech_scores else 0
    avg_comm = int(round(sum(comm_scores) / max(1, len(comm_scores)))) if comm_scores else 0
    avg_conf = int(round(sum(conf_scores) / max(1, len(conf_scores)))) if conf_scores else 0
    overall = int(round(avg_tech * 0.45 + avg_comm * 0.30 + avg_conf * 0.25))

    tips = []
    if avg_tech < 60:
        tips.append("📚 Technical knowledge: Review core concepts, practice explaining them out loud.")
    if avg_comm < 60:
        tips.append("🗣️ Communication: Reduce filler words, aim for 130-160 WPM, use structured answers (STAR method).")
    if avg_conf < 60:
        tips.append("📹 Body language: Maintain eye contact, sit upright, keep hands visible and relaxed.")
    if not tips:
        tips.append("🌟 Great performance! Keep practicing to maintain consistency.")

    return {
        "name": session.get("name", ""),
        "role": session.get("role", ""),
        "user_id": session.get("user_id"),
        "total_answered": len(evals),
        "overall": overall,
        "avg_technical": avg_tech,
        "avg_communication": avg_comm,
        "avg_confidence": avg_conf,
        "evaluations": evals,
        "tips": tips,
    }


# ── Helpers ────────────────────────────────────────────────────────────────

def _question_to_dict(q, idx: int) -> dict:
    return {
        "index": idx,
        "question_text": q.question_text,
        "difficulty_level": q.difficulty_level or "—",
        "subtopic": q.subtopic or "—",
        "role_tag": q.role_tag or "—",
        "ideal_answer": q.ideal_answer or "",
    }
