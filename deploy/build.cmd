@echo off
REM Build production assets into dist\ (Windows)
cd /d "%~dp0.."
if exist node_modules\ (
  call npm run build
) else (
  call npm ci
  call npm run build
)
echo.
echo Build OK: dist folder ready.
echo Next: deploy\serve.cmd   or   npm run start:dist
