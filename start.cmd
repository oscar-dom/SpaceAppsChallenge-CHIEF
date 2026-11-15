@echo off
rem Install and run CHIEF in one go (Windows). Double-click it, or run: start.cmd [--lite] [--no-agent] [--keep-data] [--no-open]
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required: https://nodejs.org
  pause
  exit /b 1
)
node scripts\start.mjs %*
if errorlevel 1 pause
