@echo off
rem Double-click me to play with someone on the same Wi-Fi (Windows version of "Play with a friend.command").
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 lan.py %*
) else (
  python lan.py %*
)
pause
