"""
AI-Powered Interview Preparation Coach — Streamlit Frontend
Real interview window with live video, speech capture, and 3-dimensional scoring.
"""

import io
import sys
import time
from pathlib import Path

import numpy as np
import streamlit as st
from PIL import Image

# ── Path setup ─────────────────────────────────────────────────────────────
APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

import pyttsx3
import threading

from AI_BACKEND.rag_retriever import (
    fetch_questions_for_role_random_mix,
    list_roles,
    load_vectordb,
)
from AI_BACKEND.evaluator import evaluate_technical_answer
from AI_BACKEND.audio_capture import record_audio, transcribe_audio
from AI_BACKEND.nlp_analysis import analyze_communication

# ── Page Config ────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="AI Interview Coach",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── CSS — Premium dark interview-room aesthetic ────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

/* Root variables */
:root {
    --bg-primary: #0f1117;
    --bg-card: rgba(26, 28, 36, 0.85);
    --bg-card-hover: rgba(36, 39, 50, 0.9);
    --border: rgba(255,255,255,0.07);
    --accent: #6C63FF;
    --accent-glow: rgba(108,99,255,0.25);
    --green: #22c55e;
    --amber: #f59e0b;
    --red: #ef4444;
    --text-primary: #f1f5f9;
    --text-secondary: rgba(241,245,249,0.6);
    --text-muted: rgba(241,245,249,0.35);
}

* { font-family: 'Inter', sans-serif !important; }
div[data-testid="stAppViewContainer"] { padding-top: 3.5rem; }
.block-container { padding-top: 0.5rem; padding-bottom: 1.5rem; max-width: 1400px; }

/* Cards */
.iv-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    transition: all 0.2s ease;
}
.iv-card:hover { border-color: rgba(108,99,255,0.2); box-shadow: 0 8px 32px var(--accent-glow); }

/* Header */
.iv-header {
    font-size: 1.6rem; font-weight: 800; letter-spacing: -0.03em;
    background: linear-gradient(135deg, #6C63FF 0%, #a78bfa 50%, #818cf8 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin: 0 0 0.15rem 0;
}
.iv-sub { color: var(--text-secondary); font-size: 0.88rem; margin: 0 0 0.5rem 0; }

/* Score pill */
.score-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 999px;
    font-weight: 700; font-size: 0.82rem;
    border: 1px solid var(--border);
    background: var(--bg-card);
}
.score-pill.green  { color: var(--green); border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.08); }
.score-pill.amber  { color: var(--amber); border-color: rgba(245,158,11,0.25); background: rgba(245,158,11,0.08); }
.score-pill.red    { color: var(--red);   border-color: rgba(239,68,68,0.25);  background: rgba(239,68,68,0.08); }

/* KPI row */
.kpi-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 0.5rem 0; }
.kpi {
    padding: 4px 12px; border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 0.78rem; font-weight: 500;
}

/* Question bubble */
.q-bubble {
    background: linear-gradient(135deg, rgba(108,99,255,0.12) 0%, rgba(129,140,248,0.08) 100%);
    border: 1px solid rgba(108,99,255,0.2);
    border-radius: 14px; padding: 16px 20px;
    color: var(--text-primary); font-size: 1.05rem; line-height: 1.55;
    margin: 0.5rem 0;
}

/* Section label */
.section-label {
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-muted); margin: 1rem 0 0.35rem 0;
}

/* Score card in dashboard */
.score-card {
    text-align: center; padding: 20px 12px;
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 14px;
}
.score-card .value { font-size: 2.2rem; font-weight: 900; }
.score-card .label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; }

/* Streamlit overrides */
div.stButton > button {
    border-radius: 12px !important; padding: 0.55rem 0.85rem !important;
    font-weight: 600 !important; transition: all 0.15s ease !important;
}
div.stButton > button:hover { transform: translateY(-1px) !important; }
[data-testid="stChatMessage"] { border-radius: 14px; }
div.stProgress > div > div { border-radius: 999px; }
</style>
""", unsafe_allow_html=True)

# ── Constants / singletons ─────────────────────────────────────────────────
CHROMA_DIR = APP_ROOT / "AI_BACKEND" / "chroma_db"
_TTS_LOCK = threading.Lock()


@st.cache_resource
def _get_vectordb():
    return load_vectordb(CHROMA_DIR)


def _camera_input_to_rgb(camera_image) -> np.ndarray | None:
    if camera_image is None:
        return None
    try:
        img = Image.open(io.BytesIO(camera_image.getvalue()))
        return np.asarray(img.convert("RGB"), dtype=np.uint8)
    except Exception:
        return None


# ── TTS helpers ────────────────────────────────────────────────────────────
def _get_female_voice_id(engine: pyttsx3.Engine) -> str | None:
    try:
        voices = engine.getProperty("voices") or []
    except Exception:
        return None
    for v in voices:
        text = f"{getattr(v, 'id', '')} {getattr(v, 'name', '')}".lower()
        if "zira" in text:
            return getattr(v, "id", None)
        if "female" in text:
            return getattr(v, "id", None)
    return None


def _speak(text: str):
    if not text:
        return
    with _TTS_LOCK:
        engine = pyttsx3.init()
        fid = _get_female_voice_id(engine)
        if fid:
            engine.setProperty("voice", fid)
        engine.setProperty("rate", 150)
        engine.setProperty("volume", 1.0)
        engine.say(text)
        engine.runAndWait()


def _score_color(score: int) -> str:
    if score >= 70:
        return "green"
    if score >= 45:
        return "amber"
    return "red"


# ── Session state defaults ─────────────────────────────────────────────────
_DEFAULTS = {
    "interview_started": False,
    "question_list": [],
    "question_idx": 0,
    "last_answer": "",
    "answer_duration": 0.0,
    "evaluations": [],          # list of dicts per question
    "current_eval": None,       # latest per-question eval dict
    "stt_status": "",
    "stt_transcript": "",
    "body_language": None,
    "body_language_status": "",
    "body_language_preview_rgb": None,
    "show_report": False,
}
for k, v in _DEFAULTS.items():
    st.session_state.setdefault(k, v)


# ═══════════════════════════════════════════════════════════════════════════
#  SIDEBAR — Lean config
# ═══════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown('<div class="iv-header">🎯 AI Interview Coach</div>', unsafe_allow_html=True)
    st.markdown('<div class="iv-sub">Multimodal mock-interview preparation</div>', unsafe_allow_html=True)
    st.divider()

    st.markdown("#### 👤 Candidate")
    name = st.text_input("Full Name", placeholder="Your name")

    st.markdown("#### 🎯 Interview Setup")
    speak_questions = st.toggle("🔊 Read questions aloud (TTS)", value=True)
    try:
        _roles = list_roles(_get_vectordb())
    except Exception as e:
        _roles = ["Data Scientist", "AI ML Engineer"]
        st.caption(f"⚠️ Role fallback: {e}")
    role = st.selectbox("Target Role", _roles)

    st.divider()
    c1, c2 = st.columns(2)
    with c1:
        start_btn = st.button("▶ Start", type="primary", use_container_width=True)
    with c2:
        end_btn = st.button("⏹ End", use_container_width=True)

    if end_btn and st.session_state["interview_started"]:
        st.session_state["interview_started"] = False
        st.session_state["show_report"] = True
        st.rerun()

    if start_btn:
        try:
            vectordb = _get_vectordb()
            st.session_state["question_list"] = fetch_questions_for_role_random_mix(
                vectordb=vectordb, role_tag=role,
                technical_min=6, technical_max=7, behavioural_count=3, seed=None,
            )
            st.session_state["question_idx"] = 0
            st.session_state["interview_started"] = True
            st.session_state["last_answer"] = ""
            st.session_state["current_eval"] = None
            st.session_state["evaluations"] = []
            st.session_state["show_report"] = False
            st.session_state["body_language"] = None
            st.session_state["stt_status"] = ""
            st.session_state["stt_transcript"] = ""
            if speak_questions and st.session_state["question_list"]:
                _speak(st.session_state["question_list"][0].question_text)
        except Exception as e:
            st.session_state["interview_started"] = False
            st.error(f"Could not start: {e}")


# ═══════════════════════════════════════════════════════════════════════════
#  SESSION REPORT (shown after End)
# ═══════════════════════════════════════════════════════════════════════════
if st.session_state.get("show_report") and st.session_state.get("evaluations"):
    evals = st.session_state["evaluations"]
    st.markdown('<div class="iv-header">📊 Interview Report</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="iv-sub">Candidate: {name or "—"} &nbsp;|&nbsp; Role: {role} &nbsp;|&nbsp; Questions answered: {len(evals)}</div>', unsafe_allow_html=True)

    # Aggregate scores
    tech_scores = [e.get("technical_score", 0) for e in evals if e.get("technical_score") is not None]
    comm_scores = [e.get("communication_score", 0) for e in evals if e.get("communication_score") is not None]
    conf_scores = [e.get("confidence_score", 0) for e in evals if e.get("confidence_score") is not None]

    avg_tech = int(round(sum(tech_scores) / max(1, len(tech_scores))))
    avg_comm = int(round(sum(comm_scores) / max(1, len(comm_scores))))
    avg_conf = int(round(sum(conf_scores) / max(1, len(conf_scores))))
    overall = int(round((avg_tech * 0.45 + avg_comm * 0.30 + avg_conf * 0.25)))

    st.write("")
    r1, r2, r3, r4 = st.columns(4)
    with r1:
        st.markdown(f"""<div class="score-card">
            <div class="value" style="color: var(--accent);">{overall}</div>
            <div class="label">Overall Score</div>
        </div>""", unsafe_allow_html=True)
    with r2:
        st.markdown(f"""<div class="score-card">
            <div class="value" style="color: var(--green);">{avg_tech}</div>
            <div class="label">Technical</div>
        </div>""", unsafe_allow_html=True)
    with r3:
        st.markdown(f"""<div class="score-card">
            <div class="value" style="color: var(--amber);">{avg_comm}</div>
            <div class="label">Communication</div>
        </div>""", unsafe_allow_html=True)
    with r4:
        st.markdown(f"""<div class="score-card">
            <div class="value" style="color: #818cf8;">{avg_conf}</div>
            <div class="label">Confidence</div>
        </div>""", unsafe_allow_html=True)

    st.write("")
    st.markdown("#### Per-Question Breakdown")
    for i, ev in enumerate(evals):
        with st.expander(f"Q{i+1}: {ev.get('question_text', '—')[:80]}…", expanded=False):
            sc1, sc2, sc3 = st.columns(3)
            with sc1:
                ts = ev.get("technical_score", "—")
                st.metric("Technical", f"{ts}/100")
            with sc2:
                cs = ev.get("communication_score", "—")
                st.metric("Communication", f"{cs}/100")
            with sc3:
                cfs = ev.get("confidence_score", "—")
                st.metric("Confidence", f"{cfs}/100")

            if ev.get("short_feedback"):
                st.caption(ev["short_feedback"])
            if ev.get("strengths"):
                st.markdown("**Strengths:** " + ", ".join(ev["strengths"][:3]))
            if ev.get("improvements"):
                st.markdown("**Improvements:** " + ", ".join(ev["improvements"][:3]))
            if ev.get("comm_details"):
                st.caption(f"🗣️ {ev['comm_details']}")
            if ev.get("bl_summary"):
                st.caption(f"📹 {ev['bl_summary']}")

    st.write("")
    # Improvement tips
    st.markdown("#### 💡 Personalized Improvement Tips")
    tips: list[str] = []
    if avg_tech < 60:
        tips.append("📚 **Technical knowledge**: Review core concepts, practice explaining them out loud.")
    if avg_comm < 60:
        tips.append("🗣️ **Communication**: Reduce filler words, aim for 130-160 WPM, use structured answers (STAR method).")
    if avg_conf < 60:
        tips.append("📹 **Body language**: Maintain eye contact, sit upright, keep hands visible and relaxed.")
    if not tips:
        tips.append("🌟 Great performance! Keep practicing to maintain consistency.")
    for t in tips:
        st.markdown(t)

    if st.button("🔄 Start New Interview", type="primary", use_container_width=True):
        st.session_state["show_report"] = False
        st.session_state["evaluations"] = []
        st.rerun()

    st.stop()


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN INTERVIEW WINDOW
# ═══════════════════════════════════════════════════════════════════════════
interview_active = st.session_state["interview_started"] and st.session_state["question_list"]

# ── Header bar ─────────────────────────────────────────────────────────────
hdr_left, hdr_right = st.columns([3, 1])
with hdr_left:
    st.markdown('<div class="iv-header">AI Interview Room</div>', unsafe_allow_html=True)
    if interview_active:
        q = st.session_state["question_list"][st.session_state["question_idx"]]
        st.markdown(f"""<div class="kpi-row">
            <span class="kpi"><b>Role</b> • {role}</span>
            <span class="kpi"><b>Q</b> • {st.session_state["question_idx"]+1}/{len(st.session_state["question_list"])}</span>
            <span class="kpi"><b>Level</b> • {q.difficulty_level or "—"}</span>
            <span class="kpi"><b>Topic</b> • {q.subtopic or "—"}</span>
        </div>""", unsafe_allow_html=True)
    else:
        st.markdown('<div class="iv-sub">Select a role and click Start to begin your mock interview.</div>', unsafe_allow_html=True)
with hdr_right:
    status = "🟢 Live" if interview_active else "⚪ Idle"
    st.metric("Status", status)

# ── Two-column layout: Video | Interview ───────────────────────────────────
col_video, col_interview = st.columns([1.1, 1.0], gap="medium")

# ═══════════ LEFT: VIDEO COACH ═══════════════════════════════════════════
with col_video:
    st.markdown('<div class="iv-card">', unsafe_allow_html=True)
    st.markdown("##### 📹 Video Coach")

    if not interview_active:
        st.info("Start an interview to enable the camera.")

    cam = st.camera_input(
        "Interview Camera",
        disabled=not interview_active,
        key="main_cam",
        label_visibility="collapsed",
    )

    # Analyze snapshot button
    snap_btn = st.button(
        "🔍 Analyze Posture",
        use_container_width=True,
        disabled=not (interview_active and cam is not None),
        help="Runs MediaPipe on the current photo for body-language metrics.",
    )

    if snap_btn and interview_active:
        rgb = _camera_input_to_rgb(cam)
        if rgb is None:
            st.warning("Take a picture first using the camera above.")
        else:
            with st.spinner("Analyzing body language…"):
                try:
                    from AI_BACKEND.video_capture import analyze_camera_snapshot_rgb
                    raw = analyze_camera_snapshot_rgb(rgb, draw_skeleton=True)
                    st.session_state["body_language"] = {k: v for k, v in raw.items() if k != "annotated_rgb"}
                    st.session_state["body_language_preview_rgb"] = raw.get("annotated_rgb")
                    st.session_state["body_language_status"] = "error" if raw.get("error") else "done"
                except Exception as e:
                    st.session_state["body_language"] = {"error": str(e), "summary": str(e)}
                    st.session_state["body_language_preview_rgb"] = None
                    st.session_state["body_language_status"] = "error"

    # Show pose overlay
    prev = st.session_state.get("body_language_preview_rgb")
    if prev is not None:
        st.image(prev, caption="Pose overlay", use_container_width=True)

    # Body language metrics
    bl = st.session_state.get("body_language")
    if bl and not bl.get("error"):
        pr = bl.get("probabilities") or bl
        m1, m2, m3, m4 = st.columns(4)
        with m1:
            st.metric("Openness", f"{pr.get('openness', 0):.0%}")
        with m2:
            st.metric("Fidgeting", f"{pr.get('fidgeting', 0):.0%}")
        with m3:
            st.metric("Engage", f"{pr.get('engagement', 0):.0%}")
        with m4:
            st.metric("Posture", f"{pr.get('posture', 0):.0%}")
        if bl.get("summary"):
            st.caption(bl["summary"])
    elif bl and bl.get("error"):
        st.warning(bl.get("summary") or bl["error"])

    st.markdown('</div>', unsafe_allow_html=True)


# ═══════════ RIGHT: INTERVIEW PANEL ═════════════════════════════════════
with col_interview:
    st.markdown('<div class="iv-card">', unsafe_allow_html=True)
    st.markdown("##### 💬 Interview")

    if interview_active:
        q = st.session_state["question_list"][st.session_state["question_idx"]]

        # Question bubble
        st.markdown(f'<div class="q-bubble">🤖 {q.question_text}</div>', unsafe_allow_html=True)

        # ── Mic / type answer ──────────────────────────────────
        st.markdown('<div class="section-label">Your Answer</div>', unsafe_allow_html=True)

        stt_seconds = st.slider(
            "Recording duration (s)", min_value=3, max_value=60, value=7, step=1,
            label_visibility="collapsed",
        )

        mic_col, type_col = st.columns([1, 1])
        with mic_col:
            speak_btn = st.button("🎤 Speak Answer", type="primary", use_container_width=True)
        with type_col:
            show_ideal = st.checkbox("Show ideal answer", value=False)

        if speak_btn:
            st.session_state["stt_status"] = "recording"
            st.session_state["stt_transcript"] = ""
            wav_path = None

            with st.spinner(f"🎙️ Recording for {stt_seconds}s — speak now!"):
                try:
                    t0 = time.time()
                    wav_path = record_audio(seconds=stt_seconds)
                    rec_duration = time.time() - t0
                    st.session_state["stt_status"] = "transcribing"
                except Exception as e:
                    st.error(f"Recording failed: {e}")
                    st.session_state["stt_status"] = "error"
                    rec_duration = 0.0

            if wav_path:
                with st.spinner("🔄 Transcribing with Whisper…"):
                    try:
                        transcript = transcribe_audio(wav_path, model_name="base", lang="en")
                    except Exception as e:
                        st.error(f"Transcription failed: {e}")
                        transcript = ""

                if transcript:
                    st.session_state["last_answer"] = transcript
                    st.session_state["stt_transcript"] = transcript
                    st.session_state["answer_duration"] = rec_duration
                    st.session_state["stt_status"] = "done"
                    st.rerun()
                else:
                    st.session_state["stt_status"] = "empty"
                    st.warning("No speech detected. Try speaking louder or closer to the mic.")

        # Show last spoken transcript
        if st.session_state.get("stt_transcript"):
            st.text_area(
                "Transcribed answer (editable):",
                value=st.session_state["stt_transcript"],
                height=100,
                key="transcript_display",
                disabled=True,
            )

        # Typed answer fallback
        user_input = st.chat_input("Or type your answer here…")
        if user_input:
            st.session_state["last_answer"] = user_input
            st.session_state["answer_duration"] = max(1.0, len(user_input.split()) / 2.5)  # rough estimate

        if show_ideal and q.ideal_answer:
            with st.expander("📝 Ideal answer", expanded=False):
                st.info(q.ideal_answer)

        # ── Action buttons ─────────────────────────────────
        b1, b2, b3 = st.columns(3)
        has_answer = bool(st.session_state.get("last_answer", "").strip())

        with b1:
            submit_btn = st.button("✅ Submit", type="primary", disabled=not has_answer, use_container_width=True)
        with b2:
            next_btn = st.button("⏭ Next Q", use_container_width=True)
        with b3:
            repeat_btn = st.button("🔁 Repeat", use_container_width=True)

        # ── Submit: evaluate all 3 dimensions ──────────────
        if submit_btn and has_answer:
            with st.spinner("🧠 Evaluating your answer across all dimensions…"):
                # 1. Technical score (LLM / heuristic)
                tech_eval = evaluate_technical_answer(
                    question_text=q.question_text,
                    ideal_answer=q.ideal_answer or "",
                    user_answer=st.session_state["last_answer"],
                    role_tag=q.role_tag,
                    difficulty_level=q.difficulty_level,
                )

                # 2. Communication score (NLP)
                duration = st.session_state.get("answer_duration", 7.0)
                comm_eval = analyze_communication(st.session_state["last_answer"], duration)

                # 3. Confidence score (body language)
                bl_data = st.session_state.get("body_language")
                if bl_data and not bl_data.get("error") and bl_data.get("pose_visible_fraction", 0) > 0:
                    o = float(bl_data.get("openness", 0.5))
                    e = float(bl_data.get("engagement", 0.5))
                    p = float(bl_data.get("posture", 0.5))
                    f = float(bl_data.get("fidgeting", 0.5))
                    confidence_score = int(round(np.clip((o + e + p + (1.0 - f)) / 4.0, 0.0, 1.0) * 100))
                    bl_summary = bl_data.get("summary", "")
                else:
                    confidence_score = None
                    bl_summary = "No body language data captured for this question."

                # Combined per-question result
                combined = {
                    "question_text": q.question_text,
                    "user_answer": st.session_state["last_answer"],
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
                st.session_state["current_eval"] = combined
                st.session_state["evaluations"].append(combined)

        # ── Next question ──────────────────────────────────
        if next_btn and st.session_state["question_list"]:
            idx = st.session_state["question_idx"] + 1
            if idx >= len(st.session_state["question_list"]):
                st.session_state["interview_started"] = False
                st.session_state["show_report"] = True
                st.rerun()
            st.session_state["question_idx"] = idx
            st.session_state["last_answer"] = ""
            st.session_state["current_eval"] = None
            st.session_state["stt_transcript"] = ""
            st.session_state["stt_status"] = ""
            st.session_state["body_language"] = None
            st.session_state["body_language_preview_rgb"] = None
            if speak_questions:
                nq = st.session_state["question_list"][idx]
                _speak(nq.question_text)
            st.rerun()

        if repeat_btn and speak_questions and interview_active:
            _speak(q.question_text)

    else:
        st.markdown("""
        <div style="text-align:center; padding: 3rem 1rem;">
            <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎯</div>
            <div style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">
                Ready to practice?
            </div>
            <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.3rem;">
                Select a role in the sidebar and click <b>Start</b> to begin your AI mock interview.
            </div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown('</div>', unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════════
#  FEEDBACK PANEL (below the two columns)
# ═══════════════════════════════════════════════════════════════════════════
if interview_active:
    st.write("")
    st.markdown('<div class="iv-card">', unsafe_allow_html=True)
    st.markdown("##### 📊 Feedback")

    ev = st.session_state.get("current_eval")
    if ev:
        # ── 3D Score pills ─────────────────────────────────
        sc1, sc2, sc3, sc4 = st.columns(4)
        ts = ev.get("technical_score", 0) or 0
        cs = ev.get("communication_score", 0) or 0
        cfs = ev.get("confidence_score")
        overall_parts = [ts, cs]
        if cfs is not None:
            overall_parts.append(cfs)
        ov = int(round(sum(overall_parts) / max(1, len(overall_parts))))

        with sc1:
            st.markdown(f'<div class="score-pill {_score_color(ov)}">🎯 Overall: {ov}/100</div>', unsafe_allow_html=True)
        with sc2:
            st.markdown(f'<div class="score-pill {_score_color(ts)}">📚 Technical: {ts}/100</div>', unsafe_allow_html=True)
        with sc3:
            st.markdown(f'<div class="score-pill {_score_color(cs)}">🗣️ Communication: {cs}/100</div>', unsafe_allow_html=True)
        with sc4:
            if cfs is not None:
                st.markdown(f'<div class="score-pill {_score_color(cfs)}">📹 Confidence: {cfs}/100</div>', unsafe_allow_html=True)
            else:
                st.markdown('<div class="score-pill">📹 Confidence: —</div>', unsafe_allow_html=True)

        # ── Detailed feedback ──────────────────────────────
        d1, d2 = st.columns(2)
        with d1:
            if ev.get("short_feedback"):
                st.caption(f"💬 {ev['short_feedback']}")
            if ev.get("strengths"):
                st.markdown("**Strengths:** " + " • ".join(ev["strengths"][:3]))
            if ev.get("improvements"):
                st.markdown("**To improve:** " + " • ".join(ev["improvements"][:3]))
            if ev.get("missing_points"):
                st.markdown("**Missing:** " + ", ".join(ev["missing_points"][:5]))
        with d2:
            if ev.get("comm_details"):
                st.caption(f"🗣️ {ev['comm_details']}")
            fc = ev.get("filler_count", 0)
            wpm = ev.get("wpm", 0)
            if fc or wpm:
                st.markdown(f"**Fillers:** {fc} &nbsp;|&nbsp; **Pace:** {wpm} WPM")
            if ev.get("bl_summary"):
                st.caption(f"📹 {ev['bl_summary']}")

    elif st.session_state.get("last_answer"):
        st.caption("Answer captured. Click **Submit** to get 3D feedback.")
        st.code(st.session_state["last_answer"][:400], language=None)
    else:
        st.caption("Speak or type your answer, then Submit for evaluation.")

    st.markdown('</div>', unsafe_allow_html=True)