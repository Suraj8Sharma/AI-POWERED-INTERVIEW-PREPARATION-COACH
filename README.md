# PrepLoom: AI-Powered Interview Preparation Coach

PrepLoom is a comprehensive, multimodal AI-driven platform designed to help candidates master their interview skills. By combining Large Language Models (LLMs), Computer Vision, and Speech Processing, PrepLoom provides a realistic interview experience with deep, actionable feedback across three critical dimensions: Technical Proficiency, Communication Quality, and Body Language Confidence.

---

## 🌟 Key Features

### 1. Smart Question Retrieval (RAG)
- **Role-Specific Coaching:** Tailored questions for roles like Data Scientist, AI/ML Engineer, Software Engineer, and more.
- **Vector Search:** Uses **ChromaDB** and **LangChain** to retrieve a mix of technical and behavioral questions from a curated dataset.
- **Difficulty Scaling:** Questions ranging from Basic to Advanced.

### 2. Multimodal "3D" Scoring
PrepLoom doesn't just grade your answer; it grades *you*.
- **Technical Score (LLM):** Powered by **Llama-3.1-8B**, the system evaluates the accuracy, depth, and completeness of your technical responses.
- **Communication Score (NLP):** Analyzes speaking pace (WPM), detects filler words ("um", "uh", "like"), and measures overall fluency.
- **Confidence Score (Vision):** Uses **MediaPipe** to analyze body language in real-time, tracking posture, engagement, and eye contact.

### 3. Interactive Voice Experience
- **Speech-to-Text (STT):** Answer questions naturally using your microphone, transcribed accurately via **OpenAI Whisper**.
- **Text-to-Speech (TTS):** Questions are read aloud by an AI interviewer using **pyttsx3**, creating an immersive environment.

### 4. Modern Dashboard & Analytics
- **Personalized Accounts:** Secure authentication and profile management via **Supabase**.
- **Performance Reports:** Detailed post-session summaries with "Strengths", "Improvements", and "Missing Points".
- **Customizable UI:** Support for multiple themes (Dark, Light, Amethyst) and accessibility features like reduced motion.

---

## 🛠️ Tech Stack

- **Backend:** FastAPI (Python), LangChain, HuggingFace Inference API.
- **Frontend:** HTML5, CSS3, Vanilla JavaScript, Streamlit (Prototype).
- **AI/ML Models:** 
    - **Llama-3.1-8B** (Technical Evaluation)
    - **OpenAI Whisper** (Speech Recognition)
    - **MediaPipe Pose** (Body Language Analysis)
    - **pyttsx3** (Voice Synthesis)
- **Database:** 
    - **ChromaDB** (Vector Store for RAG)
    - **Supabase** (Authentication & User Metadata)

---

## 📂 Project Structure

```text
PrepLoom/
├── AI_BACKEND/             # Core AI logic and modules
│   ├── audio_capture/      # Whisper STT implementation
│   ├── video_capture/      # MediaPipe body language analysis
│   ├── rag_retriever.py    # ChromaDB search logic
│   ├── evaluator.py        # LLM-based technical scoring
│   └── nlp_analysis.py     # Communication & fluency metrics
├── web/                    # Web Application (FastAPI)
│   ├── api.py              # Main REST & WebSocket endpoints
│   ├── auth_routes.py      # Supabase Auth integration
│   └── static/             # Frontend assets (HTML, CSS, JS)
├── frontend_interface/     # Streamlit-based hardware prototype
├── requirements.txt        # Python dependencies
└── .env                    # Environment configuration
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- A HuggingFace API Token (for Llama-3.1-8B)
- A Supabase Project (for Authentication)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/ai-powered-interview-coach.git
   cd ai-powered-interview-coach
   ```

2. **Set up a virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   HF_TOKEN=your_huggingface_token
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Running the Application

**Option A: Modern Web App (Recommended)**
```bash
python -m uvicorn web.api:app --reload --port 8000
```
Then visit `http://localhost:8000` in your browser.

**Option B: Streamlit Prototype (For Hardware Testing)**
```bash
streamlit run frontend_interface/frontend.py
```

---

## 📝 Roadmap
- [ ] **Database Persistence:** Migrate session history from in-memory to PostgreSQL.
- [ ] **Resume Parsing:** Upload a resume to generate custom interview questions.
- [ ] **Peer Comparison:** Benchmark your scores against community averages.
- [ ] **Mobile App:** Flutter/React Native version for on-the-go practice.

## ⚖️ License
This project is licensed under the MIT License - see the LICENSE file for details.
