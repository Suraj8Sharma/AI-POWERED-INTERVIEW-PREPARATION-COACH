import streamlit as st
import numpy as np
from pathlib import Path

# Backend: role-based retrieval from Chroma
import pyttsx3
import threading

from AI_BACKEND.rag_retriever import (
    fetch_questions_for_role_exact,
    list_roles,
    load_vectordb,
)

# Page Configuration
st.set_page_config(page_title="Smart Interview Coach", layout="wide")

st.markdown(
    """
<style>
  /* Clean, professional theme (minimal glass) */
  .block-container { padding-top: 1.25rem; padding-bottom: 2.25rem; max-width: 1200px; }
  .stApp { background: #0b1220; }
  section[data-testid="stSidebar"] { background: #0b1220; border-right: 1px solid rgba(148,163,184,0.14); }
  section[data-testid="stSidebar"] * { color: rgba(226,232,240,0.92); }

  .card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(148,163,184,0.16);
    border-radius: 14px;
    padding: 16px 16px;
  }
  .brand {
    font-size: 1.15rem;
    font-weight: 750;
    letter-spacing: -0.01em;
    margin: 0.1rem 0 0.25rem 0;
    color: rgba(226,232,240,0.95);
  }
  .headline {
    font-size: 1.65rem;
    font-weight: 780;
    letter-spacing: -0.02em;
    margin: 0.1rem 0 0.35rem 0;
    color: rgba(226,232,240,0.96);
  }
  .subtle { color: rgba(148,163,184,0.95); font-size: 0.95rem; margin: 0 0 0.25rem 0; }
  .kpi {
    display: inline-block;
    padding: 0.3rem 0.6rem;
    border-radius: 999px;
    border: 1px solid rgba(148,163,184,0.18);
    background: rgba(2,6,23,0.25);
    color: rgba(226,232,240,0.92);
    font-size: 0.86rem;
    margin-right: 0.4rem;
  }

  /* Buttons: primary/secondary */
  div.stButton > button {
    border-radius: 10px !important;
    padding: 0.55rem 0.85rem !important;
    border: 1px solid rgba(148,163,184,0.24) !important;
  }
  div.stButton > button[kind="primary"] {
    background: linear-gradient(90deg, #6366f1, #22c55e) !important;
    border: none !important;
    color: white !important;
    font-weight: 650 !important;
  }
  div.stButton > button[kind="secondary"] {
    background: rgba(255,255,255,0.04) !important;
    color: rgba(226,232,240,0.92) !important;
  }
  div.stButton > button:disabled {
    opacity: 0.55 !important;
  }

  /* Make containers look consistent */
  [data-testid="stChatMessage"] { border-radius: 12px; }
</style>
""",
    unsafe_allow_html=True,
)

APP_ROOT = Path(__file__).resolve().parents[1]
CHROMA_DIR = APP_ROOT / "AI_BACKEND" / "chroma_db"


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
    end = st.button("End session", type="secondary", use_container_width=True)
    if end:
        st.warning("Session Ended.Generating Report...")
        st.session_state["interview_started"] = False
        st.session_state["question_list"] = []
        st.session_state["question_idx"] = 0
        st.session_state["last_answer"] = ""

if start:
    try:
        vectordb = _get_vectordb()
        # Exact role-based fetch: no seed query.
        st.session_state["question_list"] = fetch_questions_for_role_exact(
            vectordb=vectordb,
            role_tag=role,
            limit=50,
        )
        st.session_state["question_idx"] = 0
        st.session_state["interview_started"] = True
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

#basically it tells the width of the two containers
col1,col2=st.columns([1.1, 1.0], gap="large")

with col1:
    st.markdown('<div class="card">', unsafe_allow_html=True)
    st.markdown("### Camera / Microphone")
    st.caption("Placeholder now. We’ll plug OpenCV + Whisper here next.")
    st.image("https://via.placeholder.com/640x420.png?text=Camera+Feed")
    st.markdown('<span class="kpi">Mic • Listening</span>', unsafe_allow_html=True)
    st.markdown("</div>", unsafe_allow_html=True)

with col2:
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
st.markdown("### Feedback (placeholder)")
st.caption("Next: LLM scoring + suggestions will appear here.")
st.progress(75, text="Confidence Level")
if st.session_state["last_answer"]:
    st.caption("Last answer captured (not evaluated yet)")
    st.code(st.session_state["last_answer"][:500], language=None)
else:
    st.caption("No answer captured yet.")
st.markdown("</div>", unsafe_allow_html=True)