# Civic Behaviour Monitoring System (CBMS) - Startup Script

Write-Host "--- CBMS Startup Orchestrator ---" -ForegroundColor Cyan

# 1. Setup Backend
Write-Host "`n[1/2] Preparing Backend..." -ForegroundColor Yellow
cd backend

if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv venv
}

Write-Host "Activating venv and installing requirements..."
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# Start Backend in a new window
Write-Host "Launching FastAPI Backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\venv\Scripts\activate; python main.py"

cd ..

# 2. Setup Frontend
Write-Host "`n[2/2] Preparing Frontend..." -ForegroundColor Yellow
cd frontend

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies (this may take a minute)..."
    npm install
}

# Start Frontend in a new window
Write-Host "Launching Next.js Dashboard..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

cd ..

Write-Host "`n--- System Initialized ---" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:8000"
Write-Host "Frontend: http://localhost:3000"
Write-Host "Keep this window open if you want to keep track of the orchestrator state, or close it once the other windows are up."
