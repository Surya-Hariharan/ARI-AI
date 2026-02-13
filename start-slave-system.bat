@echo off
REM Startup script for Windows

echo 🚀 Starting Slave Node System...
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Start with Docker Compose
echo 📦 Starting services with Docker Compose...
docker-compose -f docker-compose.slave-nodes.yml up -d

echo.
echo ⏳ Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Check service health
echo.
echo 🔍 Checking service health...
curl -s http://localhost:8000/health

echo.
echo ✅ System started!
echo.
echo 📊 Dashboard: http://localhost:3001
echo 🔌 Backend API: http://localhost:8000
echo 📖 API Docs: http://localhost:8000/docs
echo.
echo 📝 To view logs:
echo    docker-compose -f docker-compose.slave-nodes.yml logs -f
echo.
echo 🛑 To stop:
echo    docker-compose -f docker-compose.slave-nodes.yml down
echo.
pause
