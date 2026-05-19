# PrepLoom Deployment - Detailed Step-by-Step

This file provides **exactly what to do** in the right order with copy-paste commands.

---

## 🎯 STEP 1: Prepare Your Local Code (15 minutes)

### 1.1: Create `.gitignore`

```bash
# Windows Terminal / PowerShell
New-Item -ItemType File -Name ".gitignore" -Force
```

Add this content to `.gitignore`:
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
*.ipynb_checkpoints
node_modules/
.streamlit/
```

### 1.2: Check if Git is installed

```bash
git --version
```

If not, install from [git-scm.com](https://git-scm.com)

### 1.3: Initialize Git & Push to GitHub

```bash
# Create a NEW repository on GitHub.com first (no README)
# Then run:

git init
git add .
git commit -m "Initial commit - PrepLoom ready for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/preploom.git
git push -u origin main
```

✅ **Expected**: Code now on GitHub

---

## 🎯 STEP 2: Set Up Free Cloud Database (20 minutes)

### 2.1: Create MongoDB Atlas Account

1. Go to **[mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)**
2. Click **"Sign Up"** (choose Free)
3. Fill in: Name, Email, Password
4. Select: **Create a Shared Cluster**
5. Keep defaults, click **"Create Cluster"** (takes 1-2 min)

### 2.2: Get Connection String

1. Cluster created → Click **"Connect"**
2. Choose **"Drivers"** → **"Python"**
3. Copy connection string:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/preploom?retryWrites=true&w=majority
   ```

### 2.3: Allow All IPs (for demo only!)

1. Go to **"Network Access"**
2. Click **"Add IP Address"**
3. Enter: `0.0.0.0/0` → **"Confirm"**

⚠️ **Security Note**: In production, use specific IPs. For now, this works.

### 2.4: Update Your `.env` File

Replace:
```env
MONGODB_URI=mongodb://127.0.0.1:27017
```

With:
```env
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/preploom?retryWrites=true&w=majority
```

✅ **Expected**: Can now connect to cloud MongoDB

---

## 🎯 STEP 3: Deploy Backend to Render (30 minutes)

### 3.1: Create Render Account

1. Go to **[render.com](https://render.com)**
2. Click **"Sign Up"** → Choose **"GitHub"**
3. Authorize Render to access your GitHub

### 3.2: Create New Web Service

1. Dashboard → **"New +"** → **"Web Service"**
2. Select your **`preploom`** repository
3. Choose branch: **`main`**
4. Fill in:
   - **Name**: `preploom-api`
   - **Environment**: `Python 3`
   - **Region**: `Frankfurt` (or closest)
   - **Build Command**: 
     ```
     pip install -r requirements.txt
     ```
   - **Start Command**: 
     ```
     uvicorn web.api:app --host 0.0.0.0 --port 10000
     ```

### 3.3: Add Environment Variables

1. Scroll down to **"Environment"**
2. Add these as **key=value**:

```


```

### 3.4: Deploy

1. Click **"Deploy"**
2. Wait 5-10 minutes (watch the build log)
3. When done, you'll get a URL like:
   ```
   https://preploom-api.onrender.com
   ```

### 3.5: Test Backend

Open in browser:
```
https://preploom-api.onrender.com/docs
```

✅ **Expected**: FastAPI Swagger docs page loads

---

## 🎯 STEP 4: Update Frontend Config (10 minutes)

### 4.1: Update API URL in Frontend

Edit `web/static/index.html` and find this section:

```html
<script>
  const API_URL = 'http://localhost:8000';  // Change this
</script>
```

Replace with:
```html
<script>
  const API_URL = 'https://preploom-api.onrender.com';  // Your Render URL
</script>
```

### 4.2: Update CORS in Backend

Edit `web/api.py` and update CORS:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8000",
        "https://preploom.vercel.app",  # Add your Vercel URL here later
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4.3: Commit & Push

```bash
git add .
git commit -m "Update API URLs for production"
git push
```

✅ **Render will auto-redeploy**

---

## 🎯 STEP 5: Deploy Frontend to Vercel (25 minutes)

### 5.1: Create Vercel Account

1. Go to **[vercel.com](https://vercel.com)**
2. Click **"Sign Up"** → Choose **"GitHub"**
3. Authorize

### 5.2: Import Project

1. Dashboard → **"Add New"** → **"Project"**
2. Select your **`preploom`** repository
3. Leave defaults, click **"Import"**

### 5.3: Add Environment Variables

Before deploying, click **"Environment Variables"** and add:

```
REACT_APP_API_URL=https://preploom-api.onrender.com
```

### 5.4: Deploy

1. Click **"Deploy"**
2. Wait 1-2 minutes
3. You'll get a URL like:
   ```
   https://preploom.vercel.app
   ```

✅ **Expected**: Frontend loads in browser

---

## 🎯 STEP 6: Test Everything (15 minutes)

### 6.1: Test Backend Health

```bash
# Open in browser or curl
https://preploom-api.onrender.com/health
```

Should return:
```json
{"status": "ok"}
```

### 6.2: Test Frontend

```
https://preploom.vercel.app
```

Should load the interview interface.

### 6.3: Test Database Connection

In browser console (F12):
```javascript
fetch('https://preploom-api.onrender.com/api/questions?role=Data%20Scientist&limit=1')
  .then(r => r.json())
  .then(d => console.log(d))
```

Should return interview questions.

### 6.4: Test Sign Up

```bash
curl -X POST https://preploom-api.onrender.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Should return:
```json
{"user_id": "...", "token": "..."}
```

✅ **Expected**: All tests pass

---

## 🎯 STEP 7: Fix Common Issues

### Issue: "503 Service Unavailable"
**Solution**: Render free tier spins down after 15 min. Wait 30 seconds and refresh.

### Issue: "Cannot connect to database"
**Solution**: Check MongoDB whitelist is `0.0.0.0/0`

### Issue: "CORS error in browser"
**Solution**: Add Vercel URL to CORS in `web/api.py` and redeploy

### Issue: "Whisper/MediaPipe not working"
**Solution**: These need GPU/webcam. Use API calls instead on backend.

---

## 🎯 STEP 8: Optional - Add Custom Domain

### Add Domain to Vercel
1. Vercel Dashboard → Settings → Domains
2. Enter your domain (e.g., `preploom.com`)
3. Add DNS records (Vercel shows instructions)
4. Wait 24-48 hours

---

## ✅ FINAL CHECKLIST

- [ ] Code pushed to GitHub
- [ ] MongoDB cluster running
- [ ] Backend deployed on Render (URL in env)
- [ ] Frontend deployed on Vercel (URL in env)
- [ ] CORS updated in `web/api.py`
- [ ] API URLs updated in frontend
- [ ] All 4 tests pass
- [ ] Share frontend URL with users

---

## 🚀 You're Live!

Your app is now accessible to anyone at:
```
Frontend: https://preploom.vercel.app
Backend: https://preploom-api.onrender.com
```

**Total Cost**: $0/month (free tier)

---

## Troubleshooting Commands

```bash
# Check logs on Render
# (Go to dashboard, click your service, scroll to "Logs")

# Check Vercel logs
# (Dashboard → Project → Deployments → View Function Logs)

# Test MongoDB connection
python -c "
from pymongo import MongoClient
client = MongoClient('YOUR_MONGODB_URI')
print('Connected!' if client else 'Failed')
"

# Restart Render service
# (Dashboard → Service → Restart)
```

