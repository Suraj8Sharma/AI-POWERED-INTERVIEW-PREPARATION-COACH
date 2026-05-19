#!/bin/bash
# PrepLoom Deployment Script - Quick Start
# Usage: bash deploy.sh

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     PrepLoom Deployment Assistant - Free Resources         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}[1/8] Checking prerequisites...${NC}"
command -v git >/dev/null 2>&1 || { echo -e "${RED}Git not found. Install from git-scm.com${NC}"; exit 1; }
command -v python >/dev/null 2>&1 || { echo -e "${RED}Python not found. Install Python 3.9+${NC}"; exit 1; }
echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Initialize Git
echo -e "${BLUE}[2/8] Initializing Git repository...${NC}"
if [ ! -d .git ]; then
    git init
    echo -e "${YELLOW}⚠ Repository initialized. Don't forget to:${NC}"
    echo "   git remote add origin https://github.com/YOUR_USERNAME/preploom.git"
    echo "   git branch -M main"
else
    echo -e "${GREEN}✓ Git already initialized${NC}"
fi
echo ""

# Create .gitignore
echo -e "${BLUE}[3/8] Creating .gitignore...${NC}"
cat > .gitignore << 'EOF'
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
venv/
.venv/
*.log
.idea/
.vscode/
.env.local
EOF
echo -e "${GREEN}✓ .gitignore created${NC}"
echo ""

# Check deployment files
echo -e "${BLUE}[4/8] Checking deployment files...${NC}"
FILES=("Procfile" "runtime.txt" "vercel.json" "requirements-prod.txt")
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file exists${NC}"
    else
        echo -e "${YELLOW}⚠ $file missing (create manually)${NC}"
    fi
done
echo ""

# Environment setup
echo -e "${BLUE}[5/8] Setting up environment...${NC}"
if [ ! -f .env ]; then
    if [ -f .env.template ]; then
        cp .env.template .env
        echo -e "${YELLOW}⚠ .env created from template. EDIT IT NOW!${NC}"
    else
        echo -e "${RED}✗ .env.template not found${NC}"
    fi
else
    echo -e "${GREEN}✓ .env already exists${NC}"
fi
echo ""

# Display next steps
echo -e "${BLUE}[6/8] Next steps:${NC}"
echo ""
echo -e "${YELLOW}1. EDIT YOUR .env FILE:${NC}"
echo "   - MongoDB URI from MongoDB Atlas"
echo "   - JWT_SECRET (random 32+ char string)"
echo "   - HF_TOKEN from HuggingFace"
echo "   - Supabase keys (already provided)"
echo ""

echo -e "${YELLOW}2. COMMIT TO GIT:${NC}"
echo "   git add ."
echo "   git commit -m 'Deployment configuration'"
echo "   git remote add origin https://github.com/YOUR_USERNAME/preploom.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""

echo -e "${YELLOW}3. DEPLOY BACKEND (Render):${NC}"
echo "   • Go to render.com"
echo "   • Connect GitHub repo"
echo "   • Create new Web Service"
echo "   • Build: pip install -r requirements-prod.txt"
echo "   • Start: uvicorn web.api:app --host 0.0.0.0 --port \$PORT"
echo "   • Add all .env variables to Render dashboard"
echo ""

echo -e "${YELLOW}4. DEPLOY FRONTEND (Vercel):${NC}"
echo "   • Go to vercel.com"
echo "   • Import GitHub repo"
echo "   • Add REACT_APP_API_URL env var"
echo "   • Deploy"
echo ""

echo -e "${YELLOW}5. UPDATE FRONTEND CONFIG:${NC}"
echo "   • Edit web/static/index.html"
echo "   • Update API_URL to your Render URL"
echo "   • Push to GitHub (auto-redeploy)"
echo ""

echo -e "${YELLOW}6. TEST EVERYTHING:${NC}"
echo "   curl https://your-backend-url/docs"
echo "   Open https://your-frontend-url in browser"
echo ""

# Check if user wants to push now
echo ""
read -p "$(echo -e ${BLUE}Do you want to commit and push now? (y/n)${NC} )" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Make sure:${NC}"
    echo "  1. .env is in .gitignore (it is)"
    echo "  2. You've edited .env with your values"
    echo "  3. You've created GitHub repo and have SSH key set up"
    echo ""
    read -p "Ready to commit? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "Deployment configuration - ready for production"
        echo -e "${YELLOW}Don't forget to push:${NC}"
        echo "  git push -u origin main"
    fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Setup complete! Read DEPLOYMENT_GUIDE.md         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
