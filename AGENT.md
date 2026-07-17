# AGENT.md — PrepLoom (AI-Powered Interview Preparation Coach)

This file orients an AI coding agent (or a new engineer) working in this repo. It describes what the
project actually does, how the pieces fit together, and where the rough edges are — based on reading
the source, not just the marketing docs.

## 1. What this project is

PrepLoom is a mock-interview web app. A candidate picks a role (e.g. "Data Scientist", "AI ML
Engineer"), gets a mixed set of technical / coding / behavioural questions, answers by voice or text
(optionally on camera), and receives per-question and aggregate scores across three axes:

- **Technical score** — an LLM (Llama-3.1-8B via HuggingFace Inference) grades the answer against a
  reference "ideal answer", or falls back to a keyword-overlap heuristic if the LLM call fails.
- **Communication score** — pure NLP on the transcript: words-per-minute and filler-word ratio.
- **Confidence score** — MediaPipe Pose landmarks from webcam frames turned into openness /
  engagement / posture / fidgeting metrics.

**The frontend is the webpage** — `web/static/` (hand-written HTML/CSS/vanilla-JS, served by the
FastAPI app in `web/api.py`). Marketing pages (`index.html`, `features.html`, `about.html`) plus the
actual interview app live at `/app` (`app.html` + `js/app.js`). This is the only user-facing surface
of the deployed product — all frontend work belongs here.

`frontend_interface/frontend.py` is **not a frontend for this product** — it's a separate Streamlit
script that calls `AI_BACKEND` functions directly (no HTTP layer, no auth, no Supabase). The README
labels it a "hardware testing prototype." It exists for local testing of the AI modules in isolation
and is not deployed, not linked from the webpage, and not something to extend when adding product
features — those changes go in `web/static/` + `web/api.py`.

## 2. Architecture at a glance

```
Browser (web/static/*.html + js/app.js)
   │  fetch() to /api/*,  WebSocket to /ws/*
   ▼
FastAPI app  (web/api.py)  ── mounts ──  web/auth_routes.py (Supabase auth)
   │
   ├─ AI_BACKEND/rag_retriever.py   → ChromaDB (vector store of interview questions)
   ├─ AI_BACKEND/evaluator.py       → HuggingFace Inference API (Llama-3.1-8B) for technical scoring
   ├─ AI_BACKEND/nlp_analysis.py    → pure-Python WPM / filler-word scoring
   ├─ AI_BACKEND/audio_capture/     → OpenAI Whisper STT (local model, not an API call)
   ├─ AI_BACKEND/video_capture/     → MediaPipe PoseLandmarker body-language scoring
   │
   └─ Supabase (external)          → auth (users/JWT), Postgres table `interview_reports`,
                                       Storage bucket `interview-reports` (PDF files)
```

Everything about a live interview session (question list, running index, per-question evaluations)
lives in a **process-local Python dict** (`_sessions` in `web/api.py`) — there is no session
persistence across restarts. Only the *final report* is optionally persisted to Supabase, and only if
the caller is authenticated.

## 3. Directory map

```
AI_BACKEND/                  Core AI logic, framework-agnostic (used by both web/ and frontend_interface/)
├── rag_retriever.py          ChromaDB question retrieval + role listing + "random mix" set builder
├── evaluator.py               LLM-based technical answer grading (+ heuristic fallback)
├── nlp_analysis.py             Communication scoring (WPM, filler words) — no external calls
├── audio_capture/
│   └── record_and_transcribe.py   Whisper STT: record_audio(), transcribe_audio(), transcribe_audio_bytes()
├── video_capture/
│   └── video_analysis.py       MediaPipe Pose → BodyLanguageAnalyzer (openness/fidgeting/engagement/posture)
├── questions.csv               Source dataset for the vector DB (~169 rows, messy CSV — some fields
│                                contain embedded newlines/commas, don't assume clean columns)
├── rag_backend.ipynb            Notebook that builds AI_BACKEND/chroma_db/ from questions.csv
│                                 (chroma_db/ is gitignored — it must be regenerated locally, it is
│                                 NOT checked into the repo and does not exist in a fresh clone)
├── add_coding_questions.py     One-off script to inject coding questions into an existing chroma_db
└── dataset_csv.ipynb, debug_whisper.py, test*.py, HELLO.py   Scratch/debug scripts, not part of the app

web/                          FastAPI backend + static frontend (the deployed product)
├── api.py                     All REST + WebSocket endpoints, in-memory session store, Supabase report persistence
├── auth_routes.py              Supabase-only auth: register/login/me/update-profile/delete-account
├── pdf_generator.py             ReportLab PDF generation for interview reports
├── profile_manager.py           ProfileManager class (Supabase profile/report CRUD) — see §6, unused
├── profile_routes.py             Byte-for-byte duplicate of profile_manager.py — see §6, unused
├── mongo_db.py                   Empty file — legacy leftover, see §6
├── preview_server.py              Tiny static-file server, unrelated to the FastAPI app
└── static/                     Frontend: index/features/about/app/settings/revision .html + css/ + js/
    └── js/app.js                The interview-room UI: mic recording, live transcription over
                                   WebSocket, webcam capture, Monaco code editor for coding questions,
                                   score rendering, PDF/report history — this is the biggest single file (~1600 lines)

frontend_interface/
└── frontend.py                 Streamlit prototype UI, calls AI_BACKEND functions directly (no FastAPI)

supabase_migration.sql        SQL to create `interview_reports` table + RLS policies + storage bucket
requirements.txt              Full local/dev dependency set (Whisper, MediaPipe, Streamlit, etc.)
requirements-prod.txt         Meant to be a slimmed Render deployment set — see §6, currently stale
Procfile                      `web: uvicorn web.api:app --host 0.0.0.0 --port $PORT` (Render)
vercel.json                   Routes /api/* to a hardcoded Render URL, serves web/static/ elsewhere
runtime.txt                   python-3.11.7
DEPLOYMENT_*.md, QUICK_START.md, LOCAL_VS_PRODUCTION.md, ...   Deployment walkthroughs (Render + Vercel + MongoDB Atlas)
```

## 4. Request flow for one interview

1. `GET /api/roles` — lists distinct `role_tag` values present in the Chroma vector store.
2. `POST /api/start {role, name}` — `fetch_questions_for_role_random_mix()` builds a set of
   **7 technical (5 standard + 2 coding) + 3 behavioural = 10 questions** by metadata-filtering the
   vector store (no embedding similarity search in the normal path — that's only a fallback when the
   DB doesn't have enough coding questions). Creates a session, keyed by a UUID, stored in `_sessions`.
   If an `Authorization: Bearer <supabase JWT>` header is present, the session is tagged with that
   user's id/email.
3. Client renders the question (`renderQuestion` in `app.js`), starts mic capture and (optionally)
   webcam capture.
4. Live transcription: browser sends base64 audio chunks over `WS /ws/transcribe-audio`; server runs
   Whisper (`model="tiny"`) per chunk and streams back partial transcripts. Live posture: browser sends
   base64 JPEG frames over `WS /ws/analyze-posture`; server runs `PoseLandmarker.detect_for_video()`
   per frame in a worker thread (`asyncio.to_thread`) and streams back openness/fidgeting/engagement/
   posture.
5. `POST /api/submit {session_id, answer, duration, body_language, code_submission}` — combines:
   - confidence score from the last body-language sample (simple average of 4 sub-metrics),
   - technical score from `evaluate_technical_answer()` (LLM prompt is different for coding vs.
     conceptual questions — see `evaluator.py`),
   - communication score from `analyze_communication()`.
   Result is appended to `session["evaluations"]`.
6. `POST /api/next` advances `question_idx`; when it runs past the end, the client calls
   `GET /api/report/{session_id}` which averages all per-question scores
   (`overall = 45% technical + 30% communication + 25% confidence`), generates a PDF
   (`pdf_generator.py`), and — **only if authenticated** — uploads the PDF to Supabase Storage and
   inserts a row into `interview_reports`. Anonymous sessions get a report response but nothing is
   persisted; refreshing the page loses everything.

## 5. External services / environment variables

No `.env` file exists in this checkout (it's gitignored, and correctly so). To run this locally you
need to create one at the repo root with at least:

```
HF_TOKEN=...                     # HuggingFace Inference API token — used by evaluator.py (Llama-3.1-8B)
                                  #   and rag_retriever.py (sentence-transformers/all-MiniLM-L6-v2 embeddings)
SUPABASE_URL=...                 # also accepted: SUPABASE_PROJECT_URL / supabase_url
SUPABASE_ANON_KEY=...             # also accepted: SUPABASE_PUBLISHABLE_KEY / supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=...     # required for report persistence + account deletion (server-side only)
```

`web/api.py` loads both `.ENV` and `.env` (in that order) via `load_dotenv`, so either filename works.

Other runtime dependencies that aren't env vars:
- **ChromaDB store** (`AI_BACKEND/chroma_db/`) does not exist until you run `AI_BACKEND/rag_backend.ipynb`
  once. Without it, `/api/roles` and `/api/start` fail (api.py catches the roles failure and falls
  back to a hardcoded 2-role list, but `/api/start` will 500).
- **MediaPipe pose model** (`AI_BACKEND/video_capture/models/pose_landmarker_full.task`) is
  auto-downloaded from Google's CDN on first use (`ensure_pose_model_path()`); override with
  `MEDIAPIPE_POSE_MODEL` env var to point at a local file instead.
- **Whisper models** are downloaded via the `openai-whisper` package on first transcription call and
  cached in-process (`_WHISPER_CACHE`); `web/api.py` always uses the `"tiny"` model for the live
  endpoints.
- **ffmpeg** is only needed as a Whisper fallback; WAV files recorded by this app are decoded in-process
  via `scipy.io.wavfile` and don't need it (see `record_and_transcribe._load_wav_for_whisper`).

## 6. Known inconsistencies / dead code (worth knowing before you touch these areas)

- **`web/profile_manager.py` and `web/profile_routes.py` are byte-identical** and neither is imported
  anywhere (`api.py` implements report/profile logic inline instead). If you need profile/report CRUD
  helpers, either wire one of these in properly and delete the other, or just extend `api.py` to match
  the existing pattern — don't edit both files expecting them to diverge.
- **`web/mongo_db.py` is a 0-byte file.** `auth_routes.py`'s docstring explicitly says "the legacy
  MongoDB path has been removed" — auth is Supabase-only. Despite this, `requirements-prod.txt` still
  lists `pymongo`, and several top-level docs (`MONGODB_EXPLAINED.md`, `WHY_NO_MONGODB.md`,
  `DEPLOYMENT_*.md`) describe a MongoDB Atlas step. Treat those docs as partially stale; the current
  code path does not touch MongoDB at all.
- **`requirements-prod.txt` doesn't match the actual code**: it pins `langchain==0.0.354` /
  `langchain-openai` / `chromadb==0.4.10` / `supabase==1.0.3`, while `requirements.txt` (and the
  imports actually used, e.g. `langchain_huggingface`, `langchain_community.vectorstores.Chroma`) are
  on much newer, different package families (`langchain-core==1.2.23`, `chromadb==1.5.5`,
  `supabase==2.10.0`). If you're touching deployment, reconcile against `requirements.txt`, which
  reflects what the code actually imports.
- **`vercel.json` hardcodes** `https://preploom-api.onrender.com` as the API backend. If the Render
  service URL changes, this file needs a manual update (there's no templating).
- **CORS is wide open** (`allow_origins=["*"]` in `web/api.py`) — fine for a hobby/demo deploy, worth
  flagging if this ever handles real user data.
- **In-memory session store**: `_sessions` in `web/api.py` is a plain dict with no eviction. Long
  running processes will leak memory across many interviews; a restart wipes all in-progress (but not
  yet reported) sessions. The README's roadmap already lists "migrate session history from in-memory
  to PostgreSQL" as a known gap.
- **`AI_BACKEND/questions.csv`** has messy structure — some `ideal_answer`/other fields contain
  embedded commas/newlines that make naive `cut -d,` inspection misleading. Always go through
  `rag_retriever.py`'s loader (via the notebook) rather than parsing the CSV by hand.

## 7. Conventions observed in the codebase

- AI_BACKEND modules are framework-agnostic — they don't import FastAPI or Streamlit, and both
  frontends import functions from them directly. Keep new AI logic there, not inline in `web/api.py`.
- LLM calls always try the real model first and fall back to a cheap heuristic on any exception
  (`evaluator._heuristic_score`, and `list_roles`'s hardcoded fallback in `api.py`). Follow this
  pattern for new AI-backed endpoints so the app degrades gracefully without HF_TOKEN/network.
- Scoring is always 0–100 ints on the wire; weighting constants (45/30/25 for
  technical/communication/confidence) are duplicated in `web/api.py` in both `/api/user/stats` and
  `/api/report/{id}` — if you change one, change both.
- Auth is fully delegated to Supabase's REST API using raw `urllib` calls run in worker threads
  (`asyncio.to_thread`) rather than the `supabase-py` client, specifically inside `auth_routes.py`
  (see `_supabase_post`, `_supabase_get_user`). `web/api.py` itself uses the `supabase-py` `Client`
  (`get_supabase()`) for Postgres/storage operations. Don't assume one client abstraction is used
  everywhere — it's split by concern.
- Most endpoints accept a plain `dict` as the request body (`payload: dict`) rather than Pydantic
  models, except in `auth_routes.py` which uses Pydantic (`UserRegister`, `UserLogin`, etc.). New
  auth-adjacent endpoints should follow the Pydantic pattern; new interview-flow endpoints follow the
  existing loose-dict pattern already used by `/api/start`, `/api/submit`, `/api/next`.

## 8. Running it locally

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# create .env with HF_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# open AI_BACKEND/rag_backend.ipynb and run it once to build AI_BACKEND/chroma_db/
python -m uvicorn web.api:app --reload --port 8000
# visit http://localhost:8000  (marketing pages)  and  http://localhost:8000/app (interview room)
```

Streamlit prototype (separate, optional): `streamlit run frontend_interface/frontend.py`.

## 9. Deployment (as documented, current target)

Render (backend, via `Procfile` + `requirements-prod.txt` — reconcile per §6 before trusting it
as-is) + Vercel (static frontend, via `vercel.json`) + Supabase (auth, Postgres, storage) +
HuggingFace Inference (LLM + embeddings). See `DEPLOYMENT_GUIDE.md` / `QUICK_START.md` /
`DEPLOYMENT_STEPS.md` for the walkthrough; treat any MongoDB Atlas step in those docs as obsolete
per §6.