@echo off
echo Starting 9Router (background)...
start "9Router" cmd /k "npx 9router"
 
echo Waiting for 9Router to start...
timeout /t 5 /nobreak > nul
 
echo Starting Claude Code...
set ANTHROPIC_BASE_URL=http://localhost:20128/v1
set ANTHROPIC_API_KEY=sk-free
claude --model free-forever
 