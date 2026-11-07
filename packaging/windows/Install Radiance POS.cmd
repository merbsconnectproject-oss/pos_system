@echo off
rem Radiance POS installer launcher - NFR-13.
rem
rem A Windows account with a space in its name ("Shop Admin") can be handed
rem TEMP=C:\Users\SHOPAD~1\AppData\Local\Temp, and on a PC with 8.3 short names
rem switched off that folder does not exist. The installer unpacks itself into
rem TEMP before any of our code runs, so it stopped with "path not found" and
rem the only way through was typing commands. This does the same thing for the
rem person at the counter: elevate first, then point TEMP at the Windows temp
rem folder, which always exists, and run the installer from there.
setlocal

rem Elevate before touching TEMP. A process Windows elevates for us is built
rem from the account's own environment, so a TEMP set before that is lost.
fltmc >nul 2>&1
if errorlevel 1 (
    set "RADIANCE_SELF=%~f0"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath $env:RADIANCE_SELF -Verb RunAs"
    exit /b
)

set "TEMP=%SystemRoot%\Temp"
set "TMP=%SystemRoot%\Temp"

rem The installer beside this file. The AppWindow build wins when both sit
rem together; the browser build is for troubleshooting.
set "SETUP="
for %%F in ("%~dp0Radiance-POS-Setup-*.exe") do set "SETUP=%%~fF"
for %%F in ("%~dp0Radiance-POS-Setup-*.exe") do (
    echo %%~nF | findstr /i /c:"-browser" >nul || set "SETUP=%%~fF"
)
if not defined SETUP (
    echo The Radiance POS installer was not found next to this file.
    echo Keep "Install Radiance POS.cmd" in the same folder as Radiance-POS-Setup-*.exe.
    pause
    exit /b 2
)

start "" /wait "%SETUP%" %*
exit /b %errorlevel%
