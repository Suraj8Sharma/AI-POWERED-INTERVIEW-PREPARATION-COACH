# PrepLoom Deployment Guide - Free Resources (No Docker)

## Overview
This guide deploys PrepLoom to **free-tier** cloud services without Docker. We'll use:
- **Backend**: Render (FastAPI)
- **Frontend**: Vercel (Static HTML/JS)
- **Database**: Supabase (already configured)
- **AI Models**: HuggingFace Inference API (free)

---

## ✅ Pre-Deployment Checklist

- [ ] Git repository created (push to GitHub)
- [ ] Python 3.9+ installed locally
- [ ] GitHub account
- [ ] Free cloud accounts (Render, Vercel)
- [ ] HuggingFace token (you already have this)
- [ ] All API keys in `.env` (not committed to git)

---

## Part 1: Prepare Code for Deployment

### Step 1.1: Create `.gitignore`
```
__pycache__/
*.pyc
.env
myenv/
.DS_Store
*.egg-info/
dist/
build/
.pytest_cache/
*.db
chroma.sqlite3
```

### Step 1.2: Create `Procfile` (for Render/Railway)
```
web: uvicorn web.api:app --host 0.0.0.0 --port $PORT
```

### Step 1.3: Create `runtime.txt` (for Render)
```
python-3.11.7
```

### Step 1.4: Update `requirements.txt` - Remove Heavy Dependencies

Remove or comment out these for deployment:
- `opencv-contrib-python` (not needed on server)
- `mediapipe` (requires GPU/webcam)
- `pyttsx3` (desktop-only)
- Jupyter notebooks (not needed)

Keep only:
- FastAPI
- Uvicorn
- LangChain
- OpenAI Whisper (lighter, or use API)
---

## Part 2: Database Setup (Already Done!)

Your project uses **Supabase** for all persistent data storage. Your credentials are already in `.env`:
- ✅ SUPABASE_URL
- ✅ SUPABASE_ANON_KEY
- ✅ SUPABASE_SERVICE_ROLE_KEY

**MongoDB is NOT needed** - Supabase handles all user profiles, sessions, and results storage.

See [MONGODB_EXPLAINED.md](./MONGODB_EXPLAINED.md) for details.

---

## Part 3: Deploy Backend to Render

### Step 3.1: Push Code to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/preploom.git
git branch -M main
git push -u origin main
```

### Step 3.2: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New +" → "Web Service"
4. Connect to your repository

### Step 3.3: Configure Render Deployment
- **Name**: `preploom-api`
- **Environment**: `Python 3`
- **Region**: `Frankfurt` (or closest to you)
- **Branch**: `main`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn web.api:app --host 0.0.0.0 --port 10000`

### Step 3.4: Add Environment Variables in Render
In the Render dashboard, go to **Environment** and add:
```
HF_TOKEN=your_huggingface_token
MONGODB_URI=your_mongodb_uri
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=your_secret_key_min_32_chars
```

### Step 3.5: Deploy
Click "Deploy" and wait 5-10 minutes. Your backend will be live at:
```
https://preploom-api.onrender.com
```

---

## Part 4: Deploy Frontend to Vercel

### Step 4.1: Update Frontend for Vercel
Create `vercel.json` in project root:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "web/static/index.html",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "https://preploom-api.onrender.com/api/$1"
    },
    {
      "src": "/(.*)(?!\\.js$|\\.css$|\\.png$|\\.jpg$|\\.svg$)",
      "dest": "/index.html"
    }
  ]
}
```

### Step 4.2: Update Frontend Config
In `web/static/index.html`, update API base URL:
```html
<script>
  const API_URL = 'https://preploom-api.onrender.com';
</script>
```

### Step 4.3: Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Add environment variables:
   - `REACT_APP_API_URL=https://preploom-api.onrender.com`
5. Click "Deploy"

Your frontend will be live at:
```
https://preploom.vercel.app
```

---

## Part 5: Set Up Free AI Models (HuggingFace Inference API)

### Step 5.1: Get HF Token
1. Go to [huggingface.co](https://huggingface.co)
2. Sign up (free)
3. Settings → Access Tokens → New Token (read)
4. Copy token to `HF_TOKEN` in `.env` (already done)

### Step 5.2: Update Code to Use Free Models
In `AI_BACKEND/rag_backend.ipynb` or wherever you load LLMs:

```python
from langchain_huggingface import HuggingFaceEndpoint

# Use free HF models instead of local llama
llm = HuggingFaceEndpoint(
    repo_id="meta-llama/Llama-2-7b-chat-hf",  # Free option
    huggingface_api_token=os.getenv("HF_TOKEN"),
    task="text-generation"
)
```

---

## Part 6: Configure Supabase Auth

Supabase is already in your `.env`. Verify these keys work:

```bash
curl -H "Authorization: Bearer YOUR_ANON_KEY" \
  https://zhthhveqnbhinunfjfzt.supabase.co/rest/v1/profiles
```

If you get a 200, you're good!

---

## Part 7: Deploy ChromaDB (Vector Store)

### Option A: Use Hosted Supabase (Recommended)
- Already configured
- No extra setup needed

### Option B: Self-Host on Render
1. Create a separate Python service that exposes ChromaDB as a REST API
2. Run on Render
3. Update connection string

For now, stick with **Option A** (Supabase).

---

## Part 8: Test Deployment

### Test Backend
```bash
curl https://preploom-api.onrender.com/health
# Should return: {"status": "ok"}
```

### Test Auth
```bash
curl -X POST https://preploom-api.onrender.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Test RAG
```bash
curl https://preploom-api.onrender.com/api/questions?role=Data%20Scientist&limit=1
# Should return interview questions
```

---

## Part 9: Domain Setup (Optional)

### Connect Custom Domain to Vercel
1. In Vercel: Settings → Domains → Add domain
2. Point DNS to Vercel nameservers
3. Wait 24-48 hours for propagation

### Connect Custom Domain to Render
1. In Render: Settings → Custom Domains
2. Add domain with SSL
3. Update DNS records

---

## Part 10: Monitor & Maintain

### Monitor Logs
- **Render**: Dashboard → Logs
- **Vercel**: Analytics → Logs
- **MongoDB**: Atlas Dashboard → Monitoring

### Common Issues

| Issue | Solution |
|-------|----------|
| 503 Service Unavailable | Render free tier spins down after 15 min of inactivity. Wait 30 sec for restart |
| Database connection refused | Check MongoDB IP whitelist is `0.0.0.0/0` |
| CORS errors | Add frontend URL to CORS in `web/api.py` |
| Missing env vars | Verify all keys in cloud dashboard match local `.env` |

---

## Part 11: Production Checklist

Before going live:

- [ ] Change JWT_SECRET to a strong random string (32+ chars)
- [ ] Enable HTTPS (automatic on Vercel/Render)
- [ ] Set up error logging (Sentry, LogRocket)
- [ ] Test with real users
- [ ] Monitor Supabase storage (free tier: 2 GB)
- [ ] Test all API endpoints thoroughly

---

## Estimated Costs

| Service | Free Tier | Cost |
|---------|-----------|------|
| Render | 750 hours/month | $0/month* |
| Vercel | 100 GB bandwidth/month | $0/month |
| Supabase | 2 GB storage | $0/month |
| HuggingFace | 30k requests/month | $0/month |
| **Total** | | **$0/month** |

*Render free tier includes 750 hours/month (limits to ~1 concurrent app). Upgrade to $7/month if needed.

---

## Next Steps

1. **Immediately**: Create `.gitignore`, `Procfile`, `runtime.txt`
2. **Within 1 hour**: Push to GitHub, set up Render + Vercel
3. **Test thoroughly**: All endpoints working
4. **Monitor**: Watch logs for first 24 hours
5. **Share**: Get user feedback

---

## Support

For issues:
- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment)
