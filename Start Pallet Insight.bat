@echo off
cd /d "%~dp0"

where pyw >nul 2>nul
if %errorlevel%==0 (
    start "" pyw -3 launcher.py
    exit /b 0
)

where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw launcher.py
    exit /b 0
)

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 launcher.py
    exit /b %errorlevel%
)

where python >nul 2>nul
if %errorlevel%==0 (
    python launcher.py
    exit /b %errorlevel%
)

echo Python 3 is niet gevonden.
echo Installeer Python via https://www.python.org/downloads/ en vink "Add Python to PATH" aan.
pause
