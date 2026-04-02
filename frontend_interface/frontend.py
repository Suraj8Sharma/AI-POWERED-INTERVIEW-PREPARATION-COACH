import io
import sys
from pathlib import Path

import numpy as np
import streamlit as st
from PIL import Image

# Ensure project root is on sys.path (Streamlit sets cwd/script dir; this avoids
# ModuleNotFoundError: AI_BACKEND when the app is launched from another folder.)
APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

# Backend: role-based retrieval from Chroma
import pyttsx3
import threading

from AI_BACKEND.rag_retriever import (
    fetch_questions_for_role_exact,
    fetch_questions_for_role_random_mix,
    list_roles,
    load_vectordb,
)
from AI_BACKEND.evaluator import evaluate_technical_answer
from AI_BACKEND.audio_capture import record_audio, transcribe_audio

# Page Configuration
st.set_page_config(page_title="Smart Interview Coach", layout="wide")

st.markdown(
    """
<style>
  /* Clean, readable UI that works with any Streamlit theme */
  /* Streamlit top bar (Deploy/toolbar) can overlap content depending on theme.
     Push the main view container down to ensure nothing hides behind the header. */
  div[data-testid="stAppViewContainer"] { padding-top: 4.2rem; }
  .block-container { padding-top: 0.9rem; padding-bottom: 2.25rem; max-width: 1200px; }

  .card {
    background: rgba(255, 255, 255, 0.70);
    border: 1px solid rgba(15, 23, 42, 0.10);
    border-radius: 14px;
    padding: 16px 16px;
    box-shadow: 0 10px 24px rgba(2, 6, 23, 0.05);
    backdrop-filter: blur(6px);
  }

  .brand {
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    margin: 0.0rem 0 0.15rem 0;
  }

  .headline {
    font-size: 1.55rem;
    font-weight: 850;
    letter-spacing: -0.02em;
    margin: 0.0rem 0 0.25rem 0;
  }

  .subtle { color: rgba(15, 23, 42, 0.65); font-size: 0.95rem; margin: 0 0 0.25rem 0; }

  .kpi {
    display: inline-block;
    padding: 0.28rem 0.55rem;
    border-radius: 999px;
    border: 1px solid rgba(15, 23, 42, 0.10);
    background: rgba(255, 255, 255, 0.72);
    color: rgba(15, 23, 42, 0.88);
    font-size: 0.86rem;
    margin-right: 0.4rem;
  }

  /* Softer buttons (don't fight Streamlit theme) */
  div.stButton > button { border-radius: 10px !important; padding: 0.55rem 0.85rem !important; }

  /* Chat message rounding */
  [data-testid="stChatMessage"] { border-radius: 12px; }
</style>
""",
    unsafe_allow_html=True,
)

CHROMA_DIR = APP_ROOT / "AI_BACKEND" / "chroma_db"


def _camera_input_to_rgb(camera_image) -> np.ndarray | None:
    """Decode ``st.camera_input`` value to RGB uint8 ``ndarray``."""
    if camera_image is None:
        return None
    try:
        img = Image.open(io.BytesIO(camera_image.getvalue()))
        return np.asarray(img.convert("RGB"), dtype=np.uint8)
    except Exception:
        return None


@st.cache_resource
def _get_vectordb():
    return load_vectordb(CHROMA_DIR)

_TTS_LOCK = threading.Lock()

def _get_female_voice_id(engine: pyttsx3.Engine) -> str | None:
    """
    Best-effort female voice selection for Windows (commonly 'Zira').
    Falls back to any voice that looks female, otherwise None.
    """
    try:
        voices = engine.getProperty("voices") or []
    except Exception:
        return None

    def _score(v) -> int:
        text = f"{getattr(v, 'id', '')} {getattr(v, 'name', '')}".lower()
        if "zira" in text:
            return 100
        if "female" in text:
            return 80
        return 0

    best = None
    best_score = 0
    for v in voices:
        s = _score(v)
        if s > best_score:
            best = v
            best_score = s

    return getattr(best, "id", None) if best_score > 0 else None

def _speak(text: str):
    """
    Speak text using local TTS.
    Note: pyttsx3 is not reliably thread-safe across Streamlit reruns,
    so we speak synchronously on button actions.
    """
    if not text:
        return
    with _TTS_LOCK:
        engine = pyttsx3.init()
        female_voice_id = _get_female_voice_id(engine)
        if female_voice_id:
            engine.setProperty("voice", female_voice_id)
        engine.setProperty("rate", 150)
        engine.setProperty("volume", 1.0)
        engine.say(text)
        engine.runAndWait()


st.session_state.setdefault("interview_started", False)
st.session_state.setdefault("question_list", [])
st.session_state.setdefault("question_idx", 0)
st.session_state.setdefault("last_answer", "")
st.session_state.setdefault("evaluations_by_qid", {})
st.session_state.setdefault("current_evaluation", None)
st.session_state.setdefault("stt_status", "")           # status text for mic panel
st.session_state.setdefault("stt_transcript", "")        # last STT transcript
st.session_state.setdefault("body_language", None)      # last MediaPipe metrics dict
st.session_state.setdefault("body_language_status", "")  # idle | capturing | done | error
st.session_state.setdefault("body_language_preview_rgb", None)  # last pose overlay for st.image


#making the sidebar  
with st.sidebar:
    st.markdown('<div class="brand">Smart Interview Coach</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtle">Capstone • Role-based mock interviews</div>', unsafe_allow_html=True)
    st.write("")

    st.markdown("### Candidate")
    name=st.text_input("Full Name", placeholder="Suraj Sharma")
    st.write("")
    st.markdown("### Interview setup")
    speak_questions = st.toggle("Speak questions (TTS)", value=True)

    # Load roles dynamically from the vector DB (exact role matching).
    try:
        _roles = list_roles(_get_vectordb())
    except Exception as e:
        _roles = ["Data Scientist", "AI ML Engineer"]
        st.caption(f"Role list fallback (DB not ready): {e}")

    role=st.selectbox("Target Role", _roles)
    st.write("")

    start = st.button("Start interview", type="primary", use_container_width=True)
    end = st.button("End session", use_container_width=True)
    if end:
        st.warning("Session Ended.Generating Report...")
        st.session_state["interview_started"] = False
        st.session_state["question_list"] = []
        st.session_state["question_idx"] = 0
        st.session_state["last_answer"] = ""
        st.session_state["current_evaluation"] = None
        st.session_state["body_language"] = None
        st.session_state["body_language_status"] = ""
        st.session_state["body_language_preview_rgb"] = None

if start:
    try:
        vectordb = _get_vectordb()
        # Random role-based mix: 6-7 technical + behavioural.
        st.session_state["question_list"] = fetch_questions_for_role_random_mix(
            vectordb=vectordb,
            role_tag=role,
            technical_min=6,
            technical_max=7,
            behavioural_count=3,
            seed=None,
        )
        st.session_state["question_idx"] = 0
        st.session_state["interview_started"] = True
        st.session_state["last_answer"] = ""
        st.session_state["current_evaluation"] = None
        if speak_questions and st.session_state["question_list"]:
            _speak(st.session_state["question_list"][0].question_text)
    except Exception as e:
        st.session_state["interview_started"] = False
        st.error(f"Could not start interview: {e}")



#making the main UI area 
header_left, header_right = st.columns([3, 1])
with header_left:
    st.markdown('<div class="headline">AI Interview Room</div>', unsafe_allow_html=True)
    st.markdown('<div class="subtle">Answer questions, get feedback (evaluation next).</div>', unsafe_allow_html=True)
with header_right:
    status = "Running" if st.session_state["interview_started"] else "Idle"
    st.metric("Status", status)

if st.session_state["interview_started"] and st.session_state["question_list"]:
    q = st.session_state["question_list"][st.session_state["question_idx"]]
    st.markdown(
        f"""
<div style="margin: 0.25rem 0 0.75rem 0;">
  <span class="kpi"><b>Role</b> • {role}</span>
  <span class="kpi"><b>Question</b> • {st.session_state["question_idx"] + 1}/{len(st.session_state["question_list"])}</span>
  <span class="kpi"><b>ID</b> • {q.question_id or "—"}</span>
</div>
""",
        unsafe_allow_html=True,
    )
else:
    st.markdown('<div class="subtle" style="margin: 0.25rem 0 0.75rem 0;">Select a role and start an interview to begin.</div>', unsafe_allow_html=True)

interview_active = (
    st.session_state["interview_started"] and st.session_state["question_list"]
)

# Mic | Video dashboard | Interview chat
col1, col2, col3 = st.columns([1.05, 1.15, 1.0], gap="medium")

with col1:
    st.markdown('<div class="card">', unsafe_allow_html=True)
    st.markdown("### 🎙️ Microphone (Speech-to-Text)")

    # Recording duration slider
    stt_seconds = st.slider(
        "Recording duration (seconds)",
        min_value=3, max_value=30, value=7, step=1,
        disabled=not interview_active,
    )

    # ── 🎤 Speak Answer button ───────────────────────────────
    speak_btn = st.button(
        "🎤 Speak Answer",
        type="primary",
        use_container_width=True,
        disabled=not interview_active,
    )

    if speak_btn and interview_active:
        st.session_state["stt_status"] = "recording"
        st.session_state["stt_transcript"] = ""

        with st.spinner(f"🎙️ Recording for {stt_seconds}s — speak now!"):
            try:
                print(f"[FRONTEND STT] Starting recording for {stt_seconds}s...")
                wav_path = record_audio(seconds=stt_seconds)
                print(f"[FRONTEND STT] Recording done: {wav_path}")
                st.session_state["stt_status"] = "transcribing"
            except Exception as e:
                print(f"[FRONTEND STT] Recording FAILED: {e}")
                st.error(f"Recording failed: {e}")
                st.session_state["stt_status"] = "error"
                wav_path = None

        if wav_path:
            with st.spinner("🔄 Transcribing with Whisper (first time may take ~30s to load model)..."):
                try:
                    print("[FRONTEND STT] Starting transcription...")
                    transcript = transcribe_audio(wav_path, model_name="base", lang="en")
                    print(f"[FRONTEND STT] Transcription result: '{transcript}'")
                except Exception as e:
                    print(f"[FRONTEND STT] Transcription FAILED: {e}")
                    import traceback; traceback.print_exc()
                    st.error(f"Transcription failed: {e}")
                    transcript = ""

            if transcript:
                st.session_state["last_answer"] = transcript
                st.session_state["stt_transcript"] = transcript
                st.session_state["stt_status"] = "done"
                print(f"[FRONTEND STT] ✅ Answer set in session state: '{transcript[:80]}...'")
                st.rerun()
            else:
                st.session_state["stt_status"] = "empty"
                st.warning("No speech detected. Try again, speak louder or closer to the mic.")

    # Show current STT status
    stt_status = st.session_state.get("stt_status", "")
    if stt_status == "done" and st.session_state.get("stt_transcript"):
        st.caption("Last spoken answer:")
        st.info(st.session_state["stt_transcript"][:500])
        mic_label = "Mic • ✅ Answer captured"
    elif stt_status == "recording":
        mic_label = "Mic • 🔴 Recording..."
    elif stt_status == "transcribing":
        mic_label = "Mic • 🔄 Transcribing..."
    elif stt_status == "error":
        mic_label = "Mic • ❌ Error"
    else:
        mic_label = "Mic • Ready"

    st.markdown(f'<span class="kpi">{mic_label}</span>', unsafe_allow_html=True)
    st.caption("💡 Tip: You can also type your answer in the chat column on the right.")

    st.markdown("</div>", unsafe_allow_html=True)

with col2:
    st.markdown('<div class="card">', unsafe_allow_html=True)
    st.markdown("### 📹 Video coach")
    st.caption(
        "Browser camera preview, snapshot analysis with pose overlay, or a multi-second sample."
    )

    if not interview_active:
        st.info(
            "Start an interview from the sidebar to turn on the camera and body-language tools."
        )

    cam = st.camera_input(
        "Interview camera",
        disabled=not interview_active,
        key="dashboard_interview_camera",
        help="Frame your upper body, then use the shutter — your browser streams video here.",
    )

    rs1, rs2 = st.columns(2)
    with rs1:
        snap_btn = st.button(
            "Analyze snapshot",
            use_container_width=True,
            disabled=not (interview_active and cam is not None),
            help="Runs MediaPipe on the current photo and draws a skeleton.",
            key="bl_snapshot_btn",
        )
    with rs2:
        multi_btn = st.button(
            "Multi-second sample",
            use_container_width=True,
            disabled=not interview_active,
            help="Opens the system webcam for several seconds (better fidgeting estimate).",
            key="bl_multi_btn",
        )

    bl_seconds = st.slider(
        "Multi-sample duration (seconds)",
        min_value=3,
        max_value=15,
        value=7,
        step=1,
        key="bl_seconds",
        disabled=not interview_active,
        help="Used only with **Multi-second sample** (native camera window).",
    )

    if snap_btn and interview_active:
        rgb = _camera_input_to_rgb(cam)
        if rgb is None:
            st.warning("Take a picture with the camera widget above first.")
        else:
            with st.spinner("Estimating pose from snapshot…"):
                try:
                    from AI_BACKEND.video_capture import analyze_camera_snapshot_rgb

                    raw = analyze_camera_snapshot_rgb(rgb, draw_skeleton=True)
                    st.session_state["body_language"] = {
                        k: v for k, v in raw.items() if k != "annotated_rgb"
                    }
                    st.session_state["body_language_preview_rgb"] = raw.get(
                        "annotated_rgb"
                    )
                    st.session_state["body_language_status"] = (
                        "error" if raw.get("error") else "done"
                    )
                except Exception as e:
                    st.session_state["body_language"] = {
                        "error": str(e),
                        "summary": str(e),
                    }
                    st.session_state["body_language_preview_rgb"] = None
                    st.session_state["body_language_status"] = "error"

    if multi_btn and interview_active:
        st.session_state["body_language_status"] = "capturing"
        st.session_state["body_language_preview_rgb"] = None
        with st.spinner(
            f"📹 Webcam window — stay in frame for {bl_seconds}s…"
        ):
            try:
                from AI_BACKEND.video_capture import analyze_webcam_session

                st.session_state["body_language"] = analyze_webcam_session(
                    seconds=float(bl_seconds),
                    camera_index=0,
                )
                if st.session_state["body_language"].get("error"):
                    st.session_state["body_language_status"] = "error"
                else:
                    st.session_state["body_language_status"] = "done"
            except Exception as e:
                st.session_state["body_language"] = {"error": str(e), "summary": str(e)}
                st.session_state["body_language_status"] = "error"

    prev = st.session_state.get("body_language_preview_rgb")
    if prev is not None:
        st.image(
            prev,
            caption="Last snapshot — pose overlay",
            use_container_width=True,
        )

    bl = st.session_state.get("body_language")
    if bl and not bl.get("error"):
        pr = bl.get("probabilities") or {}
        m1, m2, m3, m4 = st.columns(4)
        with m1:
            st.metric("Openness", f"{pr.get('openness', bl.get('openness', 0)):.0%}")
        with m2:
            st.metric("Fidgeting", f"{pr.get('fidgeting', bl.get('fidgeting', 0)):.0%}")
        with m3:
            st.metric("Engagement", f"{pr.get('engagement', bl.get('engagement', 0)):.0%}")
        with m4:
            st.metric("Posture", f"{pr.get('posture', bl.get('posture', 0)):.0%}")
        if bl.get("summary"):
            st.caption(bl["summary"])
    elif bl and bl.get("error"):
        st.warning(bl.get("summary") or bl["error"])

    st.markdown("</div>", unsafe_allow_html=True)

with col3:
    st.markdown('<div class="card">', unsafe_allow_html=True)
    st.markdown("### Interview")
    with st.container(height=320, border=True):
        if st.session_state["interview_started"] and st.session_state["question_list"]:
            q = st.session_state["question_list"][st.session_state["question_idx"]]
            st.chat_message("assistant").write(q.question_text)
        else:
            st.chat_message("assistant").write("Select a role and click **Start Interview** to fetch questions.")
    
    user_input = st.chat_input("Type your answer here...")
    if user_input:
        st.session_state["last_answer"] = user_input

    cols = st.columns([1.25, 1, 0.75])
    with cols[0]:
        next_q = st.button(
            "Next question",
            type="primary",
            disabled=not (st.session_state["interview_started"] and st.session_state["question_list"]),
            use_container_width=True,
        )
    with cols[1]:
        show_ideal = st.checkbox(
            "Show ideal answer",
            value=False,
            disabled=not (st.session_state["interview_started"] and st.session_state["question_list"]),
        )
    with cols[2]:
        repeat = st.button(
            "Repeat",
            type="secondary",
            disabled=not (st.session_state["interview_started"] and st.session_state["question_list"]),
            use_container_width=True,
        )

    if st.session_state["interview_started"] and st.session_state["question_list"]:
        q = st.session_state["question_list"][st.session_state["question_idx"]]
        if show_ideal and q.ideal_answer:
            st.caption("Ideal answer (for reference)")
            st.info(q.ideal_answer)

    if next_q and st.session_state["question_list"]:
        st.session_state["question_idx"] = (st.session_state["question_idx"] + 1) % len(
            st.session_state["question_list"]
        )
        st.session_state["last_answer"] = ""
        st.session_state["current_evaluation"] = None
        if speak_questions:
            q = st.session_state["question_list"][st.session_state["question_idx"]]
            _speak(q.question_text)
        st.rerun()

    if repeat and st.session_state["interview_started"] and st.session_state["question_list"]:
        q = st.session_state["question_list"][st.session_state["question_idx"]]
        if speak_questions:
            _speak(q.question_text)
    st.markdown("</div>", unsafe_allow_html=True)

st.write("")
st.markdown('<div class="card">', unsafe_allow_html=True)
st.markdown("### Feedback")

bl_fb = st.session_state.get("body_language")
if bl_fb and not bl_fb.get("error") and bl_fb.get("pose_visible_fraction", 0) > 0:
    o = float(bl_fb.get("openness", 0.5))
    e = float(bl_fb.get("engagement", 0.5))
    p = float(bl_fb.get("posture", 0.5))
    f = float(bl_fb.get("fidgeting", 0.5))
    composite = float(np.clip((o + e + p + (1.0 - f)) / 4.0, 0.0, 1.0))
    st.progress(
        composite,
        text=f"Non-verbal composite (openness, engagement, posture, calm) • {composite:.0%}",
    )
    st.caption(bl_fb.get("summary", ""))
else:
    st.progress(
        0.0,
        text="Use the **Video coach** column during an interview for a non-verbal score.",
    )

if st.session_state["interview_started"] and st.session_state["question_list"]:
    q = st.session_state["question_list"][st.session_state["question_idx"]]
    qid = q.question_id or f"idx:{st.session_state['question_idx']}"

    submit_disabled = not bool(st.session_state.get("last_answer", "").strip())

    if st.button(
        "Submit answer for technical feedback",
        type="primary",
        disabled=submit_disabled,
        use_container_width=True,
    ):
        with st.spinner("Evaluating..."):
            eval_result = evaluate_technical_answer(
                question_text=q.question_text,
                ideal_answer=q.ideal_answer or "",
                user_answer=st.session_state["last_answer"],
                role_tag=q.role_tag,
                difficulty_level=q.difficulty_level,
            )
            st.session_state["evaluations_by_qid"][qid] = eval_result
            st.session_state["current_evaluation"] = eval_result

if st.session_state.get("current_evaluation"):
    ev = st.session_state["current_evaluation"]
    score = ev.get("technical_score", None)
    if score is not None:
        st.success(f"Technical score: {score}/100")
    if ev.get("short_feedback"):
        st.caption(ev["short_feedback"])
    if ev.get("strengths"):
        st.markdown("**Strengths**")
        st.write("\n".join([f"- {s}" for s in ev["strengths"][:3]]))
    if ev.get("improvements"):
        st.markdown("**Improvements**")
        st.write("\n".join([f"- {s}" for s in ev["improvements"][:3]]))
    if ev.get("missing_points"):
        st.markdown("**Missing points (keywords)**")
        st.write("\n".join([f"- {m}" for m in ev["missing_points"][:6]]))
else:
    if st.session_state["last_answer"]:
        st.caption("Answer captured. Submit to get technical feedback.")
    else:
        st.caption("No answer captured yet.")

if st.session_state["last_answer"] and not st.session_state.get("current_evaluation"):
    st.code(st.session_state["last_answer"][:500], language=None)
st.markdown("</div>", unsafe_allow_html=True)