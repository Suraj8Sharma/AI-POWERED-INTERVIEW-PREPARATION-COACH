# Side-by-Side: Local vs Production Architecture

## 🎯 The Simple Truth

**Your app has TWO parts:**

1. **What runs on YOUR computer** (during development)
2. **What runs on the SERVER** (when deployed live)

MediaPipe, OpenCV, etc. only work in part 1.

---

## 🏠 PART 1: LOCAL DEVELOPMENT (Your Computer)

```
YOUR COMPUTER
───────────────────────────────────────────────────

Frontend (Browser)
└─ Streamlit interface
   ├─ Camera preview
   ├─ Questions display
   └─ Real-time scores

Backend (Python on your PC)
└─ web/api.py runs locally
   ├─ MediaPipe ✅ WORKS
   │  └─ Analyzes video frames from your webcam
   ├─ OpenCV ✅ WORKS
   │  └─ Processes video in real-time
   ├─ pyttsx3 ✅ WORKS
   │  └─ Reads questions through your speakers
   ├─ LangChain ✅ WORKS
   │  └─ Evaluates answers
   └─ Supabase ✅ WORKS
      └─ Stores user data

Your Resources:
├─ CPU: Intel/AMD ✅
├─ GPU: (if available) ✅
├─ Camera: Your webcam ✅
├─ Microphone: Your mic ✅
├─ Speakers: Your speakers ✅
├─ Storage: Your hard drive ✅
└─ Bandwidth: Your internet ✅

Command to run:
python -m uvicorn web.api:app --reload --port 8000

File used:
requirements.txt ← Has ALL packages
```

---

## ☁️ PART 2: CLOUD DEPLOYMENT (Render Server)

```
RENDER SERVER (Cloud Computer)
───────────────────────────────────────────────────

Frontend (Browser - User's Machine)
└─ Vercel hosts static HTML/CSS/JS
   ├─ Camera preview (in USER's browser)
   ├─ Questions display
   └─ Real-time scores

Backend (Python on Render)
└─ web/api.py runs on cloud
   ├─ MediaPipe ❌ REMOVED
   │  └─ No camera on server!
   ├─ OpenCV ❌ REMOVED
   │  └─ No video processing on server!
   ├─ pyttsx3 ❌ REMOVED
   │  └─ No speakers on server!
   ├─ LangChain ✅ WORKS
   │  └─ Evaluates answers (API call to HF)
   └─ Supabase ✅ WORKS
      └─ Stores user data (cloud DB)

Server Resources:
├─ CPU: Shared Linux server ✅
├─ GPU: None (not needed) ✅
├─ Camera: NONE ❌
├─ Microphone: NONE ❌
├─ Speakers: NONE ❌
├─ Storage: Limited (512 MB free tier) ✅
└─ Bandwidth: Shared with others ✅

Command to run:
uvicorn web.api:app --host 0.0.0.0 --port 10000

File used:
requirements-prod.txt ← Only essential packages
```

---

## 🔄 DATA FLOW COMPARISON

### LOCAL (Your Computer)
```
Your Browser
    ↓ (localhost:8000)
Your Python Backend (with MediaPipe, OpenCV, pyttsx3)
    ↓ (local file system)
ChromaDB (questions)
    ↓ (network)
Supabase (user data)
    ↓
HuggingFace (LLM API)
```

### PRODUCTION (Deployed)
```
User's Browser (Vercel - their computer)
    ↓ (https://preploom.vercel.app)
    ├─ Captures camera (in user's browser)
    ├─ Captures audio (in user's browser)
    └─ Shows real-time scores
    ↓ (HTTPS to Render)
Render Server (Python backend, NO MediaPipe/OpenCV/pyttsx3)
    ↓ (internal)
ChromaDB (questions)
    ↓ (network)
Supabase (user data)
    ↓
HuggingFace (LLM API)
```

---

## 📦 PACKAGE SIZES (Why They Matter)

```
LOCAL DEPLOYMENT (requirements.txt):
├─ mediaipe           500 MB (compiles differently)
├─ opencv-python     200 MB
├─ opencv-contrib    100 MB
├─ pyttsx3            20 MB
├─ librosa            50 MB
├─ FastAPI            10 MB
├─ Supabase            5 MB
├─ LangChain          20 MB
└─ Others            100 MB
━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                ~1 GB ✅
(Takes 5-10 min to install locally)

PRODUCTION DEPLOYMENT (requirements-prod.txt):
├─ FastAPI            10 MB
├─ Supabase            5 MB
├─ LangChain          20 MB
├─ Pydantic            5 MB
├─ PyMongo            20 MB
├─ Others             40 MB
━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:               ~100 MB ✅
(Takes 30 seconds to install on server)
```

**That's why removing them matters!** 10x faster deployment ⚡

---

## 🎬 VIDEO ANALYSIS WORKFLOW

### LOCAL (Your Computer)
```
Step 1: You open browser
Step 2: Browser shows camera feed
Step 3: Python backend (MediaPipe) analyzes frames
Step 4: Results displayed in real-time
Step 5: Everything stored locally first, then to Supabase
```

### PRODUCTION (User's Browser)
```
Step 1: User opens browser
Step 2: Browser shows camera feed (in THEIR browser)
Step 3: Browser sends frames to server (when needed)
Step 4: Server processes (lightweight, no MediaPipe)
Step 5: Results sent back to browser
Step 6: Browser displays in real-time
Step 7: Everything stored in Supabase
```

**Key difference**: Analysis can happen in browser instead of server!

---

## 🎤 AUDIO WORKFLOW

### LOCAL
```
pyttsx3 library reads question → Your speakers
User speaks answer → Your microphone
Whisper API transcribes
Backend evaluates
```

### PRODUCTION
```
Question text sent to browser
Browser uses Web Audio API/TTS
User speaks (browser records)
Browser sends audio to Whisper API
Backend evaluates
```

**No pyttsx3 needed on server!** ✅

---

## ✅ What STAYS the Same

| Feature | Local | Production | Works? |
|---------|-------|-----------|--------|
| Interview questions | ✅ | ✅ | YES |
| User authentication | ✅ | ✅ | YES |
| Answer evaluation | ✅ | ✅ | YES |
| Score calculation | ✅ | ✅ | YES |
| Result storage | ✅ | ✅ | YES |
| Body language analysis | ✅ | ✅ | YES (in browser) |
| Text-to-speech | ✅ | ✅ | YES (in browser) |
| Real-time video | ✅ | ✅ | YES (in browser) |

**Everything still works!** Just in different places.

---

## 🚀 Why This Architecture?

```
Old way (all on server):
├─ Expensive: Servers with GPUs cost $$$
├─ Slow: 10+ minutes to deploy
├─ Complicated: Many dependencies
├─ Limited: Only works with high-end servers
└─ Result: $500+/month

New way (split between browser + server):
├─ Free: Render free tier works ✅
├─ Fast: 30 seconds to deploy ✅
├─ Simple: Lightweight dependencies ✅
├─ Scalable: Works on cheap servers ✅
└─ Result: $0/month
```

---

## 📋 REQUIREMENTS FILES EXPLAINED

### requirements.txt (Local Development)
**When to use**: `pip install -r requirements.txt`
```python
# Everything you need to develop locally
fastapi==0.109.0
mediapipe==0.10.32        # For body language
opencv-python==4.13.0.92  # For video capture
pyttsx3==2.90              # For text-to-speech
```

### requirements-prod.txt (Production Server)
**When to use**: Automatically on Render
```python
# Only what the server needs
fastapi==0.109.0
# NO mediapipe - server has no camera
# NO opencv - no video on server
# NO pyttsx3 - no speakers on server
```

---

## 🎯 The Decision Tree

```
Question: "Do I need this package?"

├─ Does it require user's camera?
│  └─ YES → Remove from requirements-prod.txt
│     (MediaPipe, OpenCV, cv2)
│
├─ Does it require user's microphone?
│  └─ YES → Remove from requirements-prod.txt
│     (Whisper if run locally)
│
├─ Does it require speakers?
│  └─ YES → Remove from requirements-prod.txt
│     (pyttsx3)
│
├─ Does it run on server?
│  └─ YES → Keep in requirements-prod.txt
│     (FastAPI, Supabase, LangChain)
│
└─ Is it huge (>50 MB)?
   └─ YES → Test if it breaks deployment
      If yes → Remove from requirements-prod.txt
```

---

## ✨ RESULT

✅ **Your local setup**: Has everything, works perfectly  
✅ **Server setup**: Lightweight, deploys in 30 seconds  
✅ **User experience**: Exactly the same!  
✅ **Cost**: $0/month instead of $500+/month  

---

## 🔗 How They Work Together

```
LOCAL DEVELOPMENT
(Full features, slow internet is ok)
        ↓
        ↓ When ready to deploy
        ↓
PRODUCTION (Split architecture)
├─ Browser (user's computer)
│  ├─ Camera capture ✅
│  ├─ Audio capture ✅
│  ├─ Video playback ✅
│  └─ Real-time display ✅
│
└─ Server (Render)
   ├─ API endpoints ✅
   ├─ Answer evaluation ✅
   ├─ Data storage ✅
   └─ LLM calls ✅
```

---

## 🎓 KEY TAKEAWAY

**You don't "remove" them from your project.**

You have TWO requirements files:
1. **requirements.txt** = What YOU need locally
2. **requirements-prod.txt** = What the SERVER needs

Render automatically uses the production one.

Your local development is UNAFFECTED. ✅

---

**Everything works! Both files are right!** 🚀
