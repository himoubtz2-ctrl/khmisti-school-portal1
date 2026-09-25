@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo   Khmisti High School - one-time local setup
echo ============================================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 if exist "%LOCALAPPDATA%\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\nodejs;%PATH%"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.5+ is required. Install it, then run setup.bat again.
  pause
  exit /b 1
)

node -e "if (parseFloat(process.versions.node) < 22.5) process.exit(1)"
if errorlevel 1 (
  echo Node.js 22.5+ is required. Install it, then run setup.bat again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm.cmd was not found. Reinstall Node.js with npm enabled.
  pause
  exit /b 1
)

echo [1/4] Creating local environment secrets if needed...
node scripts\init-env.mjs
if errorlevel 1 goto :failed

echo.
echo [2/4] Installing server dependencies...
pushd server
call npm.cmd install --omit=dev
if errorlevel 1 (popd & goto :failed)
popd

echo.
echo [3/4] Installing client dependencies...
pushd client
call npm.cmd install
if errorlevel 1 (popd & goto :failed)
popd

echo.
echo [4/4] Building the production client...
pushd client
call npm.cmd run build
if errorlevel 1 (popd & goto :failed)
popd

echo.
echo Setup complete.
echo Start development with run.bat, or serve production with:
echo   set NODE_ENV=production
echo   cd server
echo   node index.js
echo.
echo Keep server\.env private. Do not ZIP it or upload it publicly.
pause
exit /b 0

:failed
echo.
echo Setup failed. Review the error above and try again.
pause
exit /b 1
