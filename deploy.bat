@echo off
REM PrepLoom Deployment Script for Windows
REM Usage: deploy.bat

setlocal enabledelayedexpansion
cls

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║     PrepLoom Deployment Assistant - Free Resources         ║
echo ║                    Windows Version                         ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check Git
echo [1/6] Checking prerequisites...
git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Git not found. Install from https://git-scm.com
    pause
    exit /b 1
)

python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found. Install Python 3.9+
    pause
    exit /b 1
)
echo OK - Prerequisites found
echo.

REM Initialize Git
echo [2/6] Initializing Git repository...
if not exist .git (
    git init
    echo Created new repository
    echo Don't forget to run:
    echo   git remote add origin https://github.com/YOUR_USERNAME/preploom.git
    echo   git branch -M main
) else (
    echo Git already initialized
)
echo.

REM Create .gitignore
echo [3/6] Creating .gitignore...
(
    echo __pycache__/
    echo *.pyc
    echo .env
    echo myenv/
    echo .DS_Store
    echo *.egg-info/
    echo dist/
    echo build/
    echo .pytest_cache/
    echo *.db
    echo chroma.sqlite3
    echo *.ipynb_checkpoints
    echo node_modules/
    echo .streamlit/
    echo venv/
    echo .venv/
    echo *.log
    echo .idea/
    echo .vscode/
    echo .env.local
) > .gitignore
echo .gitignore created
echo.

REM Create .env from template
echo [4/6] Setting up environment...
if not exist .env (
    if exist .env.template (
        copy .env.template .env
        echo .env created from template
        echo.
        echo ^^!^^ IMPORTANT: Edit .env now with your credentials!
        echo.
    ) else (
        echo ERROR: .env.template not found
    )
) else (
    echo .env already exists
)
echo.

REM Show deployment files status
echo [5/6] Checking deployment files...
set FILES=Procfile runtime.txt vercel.json requirements-prod.txt
for %%F in (%FILES%) do (
    if exist %%F (
        echo OK - %%F exists
    ) else (
        echo MISSING - %%F
    )
)
echo.

REM Show next steps
echo [6/6] DEPLOYMENT CHECKLIST
echo.
echo STEP 1 - EDIT YOUR .env FILE (CRITICAL!)
echo =========================================
echo Open .env and update:
echo   - MONGODB_URI (from MongoDB Atlas)
echo   - JWT_SECRET (32+ random characters)
echo   - HF_TOKEN (from HuggingFace)
echo   - SUPABASE keys (already provided)
echo.

echo STEP 2 - COMMIT TO GITHUB
echo ============================
echo Run these commands:
echo   git add .
echo   git commit -m "Deployment configuration"
echo   git remote add origin https://github.com/YOUR_USERNAME/preploom.git
echo   git branch -M main
echo   git push -u origin main
echo.

echo STEP 3 - DEPLOY BACKEND (Render.com)
echo =====================================
echo   1. Go to render.com
echo   2. Sign up with GitHub
echo   3. Click "New +" then "Web Service"
echo   4. Select your preploom repository
echo   5. Set:
echo      Name: preploom-api
echo      Build: pip install -r requirements-prod.txt
echo      Start: uvicorn web.api:app --host 0.0.0.0 --port $PORT
echo   6. Add all variables from .env to Render dashboard
echo   7. Deploy!
echo.

echo STEP 4 - DEPLOY FRONTEND (Vercel.com)
echo ======================================
echo   1. Go to vercel.com
echo   2. Sign up with GitHub
echo   3. Click "Add New" then "Project"
echo   4. Import your preploom repository
echo   5. Add environment variable:
echo      REACT_APP_API_URL=https://your-render-url
echo   6. Deploy!
echo.

echo STEP 5 - UPDATE FRONTEND
echo ==========================
echo   1. Edit web/static/index.html
echo   2. Find: const API_URL = 'http://localhost:8000'
echo   3. Change to: const API_URL = 'https://your-render-url'
echo   4. Save and push to GitHub
echo.

echo STEP 6 - TEST
echo ==============
echo   1. Open https://your-render-url/docs in browser
echo   2. Open https://your-vercel-url in browser
echo   3. Test login and ask a question
echo.

echo ╔════════════════════════════════════════════════════════════╗
echo ║  For detailed help, read DEPLOYMENT_GUIDE.md              ║
echo ║  Press any key to close...                                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

pause

endlocal
