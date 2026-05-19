# PrepLoom FREE Deployment - Quick Reference Card

## 🚀 In 30 Minutes to Live Deployment

### What You Need
- GitHub account (free)
- Render account (free - render.com)
- Vercel account (free - vercel.com)
- HuggingFace token (free - huggingface.co) ← You already have this!

**Cost: $0/month** ✅

---

## ⚡ Super Quick Start

```bash
# 1. Edit your secrets
notepad .env

# 2. Git setup
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/preploom.git
git branch -M main
git push -u origin main

# 3. Go to render.com
# → New Web Service
# → Select your preploom repo
# → Deploy

# 4. Go to vercel.com
# → Add Project
# → Select your preploom repo
# → Deploy
```

**Done!** Your app is live 🎉

---

## 📋 Detailed Timeline

### ⏱️ 5 min - Set Up Secrets
1. Edit `.env` file (already has what you need!)
2. Verify HF_TOKEN is present (you already have this)
3. Keep Supabase keys (already provided)
4. **Note**: MongoDB NOT needed - using Supabase instead ✅

### ⏱️ 10 min - Push to GitHub
```bash
git init
git add .
git commit -m "Ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/preploom.git
git push -u origin main
```

### ⏱️ 8 min - Deploy Backend (Render)
1. Go to **render.com** → Sign up
2. **New Web Service** → Connect GitHub
3. **Name**: `preploom-api`
4. **Build**: `pip install -r requirements-prod.txt`
5. **Start**: `uvicorn web.api:app --host 0.0.0.0 --port $PORT`
6. **Add Env Vars**: Copy from your .env
7. **Deploy** → Wait 5 min

Your backend: `https://preploom-api.onrender.com`

### ⏱️ 5 min - Deploy Frontend (Vercel)
1. Go to **vercel.com** → Sign up
2. **Add Project** → Select preploom repo
3. **Add Env Var**: `REACT_APP_API_URL=https://preploom-api.onrender.com`
4. **Deploy** → Wait 2 min

Your frontend: `https://preploom.vercel.app`

### ⏱️ 2 min - Update Frontend Config
Edit `web/static/index.html`:
```html
<!-- Change from: -->
const API_URL = 'http://localhost:8000';

<!-- To: -->
const API_URL = 'https://preploom-api.onrender.com';
```

Push to GitHub → Auto-redeploy on Vercel

---

## ✅ Verify Everything Works

### Backend Health
```
https://preploom-api.onrender.com/docs
```
Should show Swagger UI ✅

### Frontend Loading
```
https://preploom.vercel.app
```
Should load the interview interface ✅

### API Working
In browser console (F12):
```javascript
fetch('https://preploom-api.onrender.com/health')
  .then(r => r.json())
  .then(d => console.log(d))
```
Should show `{status: 'ok'}` ✅

---

## 🔗 Your Live URLs

```
📱 Frontend:  https://preploom.vercel.app
🔧 Backend:   https://preploom-api.onrender.com
📚 API Docs:  https://preploom-api.onrender.com/docs
```

Share the **frontend URL** with users!

---

## ❓ Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| 503 Unavailable | Render free tier sleeps. Wait 30 sec & refresh |
| Database connection error | Check Supabase keys in .env are correct |
| CORS error | Add frontend URL to CORS in `web/api.py` |
| Can't reach backend | Check Render deployment logs |
| Frontend shows 404 | Check API_URL in `web/static/index.html` |

---

## 📊 Free Tier Limits

| Service | Limit | Note |
|---------|-------|------|
| Render | 750 hrs/month (1 app always) | $7/month to upgrade |
| Vercel | 100 GB bandwidth | $20/month to upgrade |
| Supabase | 2 GB storage | $25/month to upgrade |
| HuggingFace | 30k API calls/month | Pay-as-you-go after |
| HuggingFace | 30k inference/month | Pay-as-you-go |

---

## 🔒 Security Checklist

- [ ] Never commit `.env` to Git
- [ ] Change `JWT_SECRET` to a random string
- [ ] Use strong MongoDB password
- [ ] In production: Restrict MongoDB IP (not `0.0.0.0/0`)
- [ ] Enable HTTPS (automatic on Render/Vercel)
- [ ] Rotate API keys regularly

---

## 📞 Support Links

- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [MongoDB Atlas Guide](https://docs.atlas.mongodb.com)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/concepts)
- [Our Full Guide](./DEPLOYMENT_GUIDE.md)

---

## 🎓 What Happens Next?

1. **Monitor**: Watch logs for 24 hours (go to Render dashboard)
2. **Share**: Send frontend URL to beta testers
3. **Collect Feedback**: See what breaks, fix it
4. **Optimize**: Upgrade to paid tiers if needed
5. **Scale**: Add custom domain, enable analytics

---

**Ready? Start with: `notepad .env`**
