@echo off
setlocal EnableExtensions
set "PATH=%LOCALAPPDATA%\nodejs;%PATH%"
cd /d "%~dp0"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.5+ is required. Run setup.bat first.
  pause
  exit /b 1
)
node -e "if (parseFloat(process.versions.node) < 22.5) process.exit(1)"
if errorlevel 1 (
  echo Node.js 22.5+ is required. Run setup.bat first.
  pause
  exit /b 1
)
if not exist "server\.env" (
  echo Creating server\.env with local secrets...
  node scripts\init-env.mjs
  if errorlevel 1 (pause & exit /b 1)
)

echo ============================================================
echo   Lycee Mohamed Khemisti - Khmisti High School
echo ============================================================
echo.
echo   Starting the API server  (port 5000) ...
echo   Starting the web client (Vite, port 5173) ...
echo.
echo   Open:  http://localhost:5173
echo   Admin: use the secret URL shown in the server window
echo.

start "Khmisti API Server" cmd /k "cd /d ""%~dp0server"" ^&^& node index.js"
start "Khmisti Web Client" cmd /k "cd /d ""%~dp0client"" ^&^& npm run dev"

echo  Both windows are open. Close them together when done.
echo ============================================================
pause