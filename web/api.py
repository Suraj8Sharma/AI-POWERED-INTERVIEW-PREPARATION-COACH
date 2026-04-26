"""
PrepLoom — FastAPI backend.

Wraps AI_BACKEND modules as REST endpoints:
  /api/roles, /api/start, /api/submit, /api/next,
  /api/transcribe, /api/analyze-posture, /api/report/{id}

Auth (Supabase):
  POST /api/auth/register, POST /api/auth/login, GET /api/auth/me

Run:
  cd <project root>
  python -m uvicorn web.api:app --reload --port 8000
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

# ── Path setup ─────────────────────────────────────────────────────────────
APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

load_dotenv(APP_ROOT / ".ENV")
load_dotenv(APP_ROOT / ".env")

# ── Local imports (after path + env setup) ────────────────────────────────
from web.auth_routes import get_optional_user, router as auth_router

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
app = FastAPI(title="PrepLoom API")
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── HTML pages ────────────────────────────────────────────────────────────
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


@app.get("/api/public-config")
async def get_public_config():
    return {
        "supabase_url": (
            os.getenv("SUPABASE_URL")
            or os.getenv("SUPABASE_PROJECT_URL")
            or os.getenv("supabase_url")
            or ""
        ).strip(),
        "supabase_anon_key": (
            os.getenv("SUPABASE_ANON_KEY")
            or os.getenv("SUPABASE_PUBLISHABLE_KEY")
            or os.getenv("supabase_anon_key")
            or ""
        ).strip(),
    }


# ═══════════════════════════════════════════════════════════════════════════
#  API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


@app.get("/api/roles")
async def get_roles():
    """Return available interview roles."""
    try:
        roles = list_roles(_get_vectordb())
    except Exception:
        roles = ["Data Scientist", "AI ML Engineer"]
    return {"roles": roles}


@app.post("/api/start")
async def start_interview(
    payload: dict,
    user: dict | None = Depends(get_optional_user),
):
    """Start a new interview session for the given role."""
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
        "user_id": user.get("id") if user else None,
        "user_email": user.get("email") if user else None,
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
    code_submission = payload.get("code_submission", "")

    idx = session["question_idx"]
    questions = session["questions"]
    if idx >= len(questions):
        raise HTTPException(400, "All questions already answered")

    q = questions[idx]

    tech_eval = evaluate_technical_answer(
        question_text=q.question_text,
        ideal_answer=q.ideal_answer or "",
        user_answer=answer,
        code_submission=code_submission,
        role_tag=q.role_tag,
        difficulty_level=q.difficulty_level,
    )

    comm_eval = analyze_communication(answer, duration)

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
    result = {k: v for k, v in raw.items() if k not in ("annotated_rgb",)}
    return result


@app.websocket("/ws/analyze-posture")
async def websocket_analyze_posture(websocket: WebSocket):
    """WebSocket endpoint for continuous frame-by-frame posture analysis."""
    await websocket.accept()
    frame_count = 0
    error_count = 0

    try:
        from AI_BACKEND.video_capture.video_analysis import (
            BodyLanguageAnalyzer,
            _np_rgb_to_mp_image,
            ensure_pose_model_path,
        )
        from mediapipe.tasks.python.core import base_options as base_options_lib
        from mediapipe.tasks.python.vision import (
            PoseLandmarker,
            PoseLandmarkerOptions,
            RunningMode,
        )
    except ImportError as e:
        await websocket.send_json({"error": f"Video module import failed: {e}"})
        await websocket.close()
        return

    try:
        model_path = str(ensure_pose_model_path())
        opts = PoseLandmarkerOptions(
            base_options=base_options_lib.BaseOptions(model_asset_path=model_path),
            running_mode=RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        landmarker = PoseLandmarker.create_from_options(opts)
        analyzer = BodyLanguageAnalyzer(history=20)
        frame_timestamp_ms = 0

        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                frame_data = msg.get("frame", "")

                if not frame_data:
                    await websocket.send_json({"error": "No frame data provided"})
                    continue

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

                try:
                    mp_img = _np_rgb_to_mp_image(rgb)
                    frame_timestamp_ms += 67
                    result = landmarker.detect_for_video(mp_img, frame_timestamp_ms)

                    if not result.pose_landmarks:
                        res: dict[str, Any] = {
                            "openness": 0.5,
                            "fidgeting": 0.5,
                            "engagement": 0.5,
                            "posture": 0.5,
                            "pose_visible_fraction": 0.0,
                            "summary": "No pose detected. Please ensure your upper body is visible.",
                        }
                    else:
                        lm_list = result.pose_landmarks[0]
                        res = analyzer.analyze_pose_landmarks(lm_list)
                        vis_ok = res.get("visibility", 0) >= 0.35
                        res["pose_visible_fraction"] = 1.0 if vis_ok else 0.0
                        o = round(float(res.get("openness", 0.5)), 3)
                        f = round(float(res.get("fidgeting", 0.5)), 3)
                        e = round(float(res.get("engagement", 0.5)), 3)
                        p_ = round(float(res.get("posture", 0.5)), 3)
                        res["probabilities"] = {"openness": o, "fidgeting": f, "engagement": e, "posture": p_}
                        res["summary"] = (
                            f"Live: Openness {o:.0%}, Fidgeting {f:.0%}, "
                            f"Engagement {e:.0%}, Posture {p_:.0%}"
                        )

                    frame_count += 1
                    res["frame_count"] = frame_count
                    res["timestamp"] = time.time()
                    await websocket.send_json(res)
                    error_count = 0

                except Exception as e:
                    error_count += 1
                    await websocket.send_json({
                        "error": f"Analysis failed: {str(e)}",
                        "frame_count": frame_count,
                        "timestamp": time.time(),
                    })
                    if error_count > 10:
                        await websocket.close()
                        break

            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON format"})
                continue

    except WebSocketDisconnect:
        logging.getLogger("uvicorn.error").info(
            f"WebSocket disconnected after {frame_count} frames"
        )
    except Exception as e:
        logging.getLogger("uvicorn.error").error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except Exception:
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


@app.post("/api/report/{session_id}/pdf")
async def generate_report_pdf(session_id: str):
    """Generate PDF report for the session and return as download."""
    try:
        import datetime
        from io import BytesIO

        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise HTTPException(500, "reportlab is not installed. Run: pip install reportlab")

    report = await get_report(session_id)
    if "error" in report:
        raise HTTPException(400, report["error"])

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18
    )
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CustomTitle", parent=styles["Heading1"], fontSize=24, spaceAfter=30,
        alignment=TA_CENTER, textColor=colors.HexColor("#6C63FF"),
    )
    heading_style = ParagraphStyle(
        "CustomHeading2", parent=styles["Heading2"], fontSize=16, spaceAfter=12,
        textColor=colors.black,
    )
    normal_style = ParagraphStyle(
        "CustomNormal", parent=styles["Normal"], fontSize=10, spaceAfter=8,
        textColor=colors.black,
    )

    story.append(Paragraph("PrepLoom Interview Report", title_style))
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        f"Role: {report['role']}<br/><br/>"
        f"Candidate: {report['name'] or 'Anonymous'}<br/><br/>"
        f"Date: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}",
        normal_style,
    ))
    story.append(Spacer(1, 40))
    story.append(Paragraph(
        f"Overall Score: {report['overall']}/100",
        ParagraphStyle(
            "Score", parent=styles["Heading1"], fontSize=48, alignment=TA_CENTER,
            textColor=colors.HexColor(
                "#22c55e" if report["overall"] >= 70
                else "#f59e0b" if report["overall"] >= 45
                else "#ef4444"
            ),
            spaceAfter=30,
        ),
    ))
    story.append(Spacer(1, 20))

    scores_data = [
        ["Metric", "Score", "/100"],
        ["Technical", f"{report['avg_technical']}", "100"],
        ["Communication", f"{report['avg_communication']}", "100"],
        ["Confidence", f"{report['avg_confidence']}", "100"],
    ]
    scores_table = Table(scores_data)
    scores_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 14),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
        ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
        ("GRID", (0, 0), (-1, -1), 1, colors.black),
        ("FONTSIZE", (0, 1), (-1, -1), 12),
    ]))
    story.append(scores_table)
    story.append(Spacer(1, 30))

    story.append(Paragraph("Improvement Tips", heading_style))
    for tip in report["tips"]:
        story.append(Paragraph(f"• {tip}", normal_style))
    story.append(Spacer(1, 20))

    story.append(Paragraph("Question-by-Question", heading_style))
    for i, ev in enumerate(report["evaluations"], 1):
        story.append(Spacer(1, 12))
        story.append(Paragraph(
            f"Q{i}: {ev['question_text'][:80]}...",
            ParagraphStyle("QTitle", parent=normal_style, fontSize=11,
                           spaceAfter=8, fontName="Helvetica-Bold"),
        ))
        q_table = Table(
            [
                [f"Tech: {ev.get('technical_score', '?')}", f"Comm: {ev.get('communication_score', '?')}"],
                [f"Conf: {ev.get('confidence_score', '?')}", ""],
            ],
            colWidths=[2.2 * inch, 2.2 * inch],
        )
        q_table.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ]))
        story.append(q_table)
        if ev.get("short_feedback"):
            story.append(Paragraph(ev["short_feedback"], normal_style))

    doc.build(story)

    filename = (
        f"PrepLoom_Report_{report['role'].replace(' ', '_')}_"
        f"{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    )
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Static files (mounted LAST so /api/* routes always take precedence) ────
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


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