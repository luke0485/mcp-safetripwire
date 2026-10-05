@echo off
rem MCP SafeTripwire launcher.
rem   tripwire            -> interactive menu (for the desktop shortcut)
rem   tripwire <command>  -> pass straight through to the CLI
setlocal
set "TW_DIR=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH. Install Node 18 or newer first.
  echo https://nodejs.org/
  pause
  exit /b 127
)

if not "%~1"=="" (
  node "%TW_DIR%src\cli.js" %*
  exit /b %errorlevel%
)

node "%TW_DIR%src\menu.js"
