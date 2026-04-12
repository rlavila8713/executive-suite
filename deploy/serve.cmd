@echo off
REM Serve dist at http://localhost:4173 (Windows)
cd /d "%~dp0.."
if not exist dist\index.html (
  echo Run deploy\build.cmd or npm run build first.
  exit /b 1
)
call npm run start:dist
