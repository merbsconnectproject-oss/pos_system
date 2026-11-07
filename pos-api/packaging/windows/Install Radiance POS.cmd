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
rem
rem No ( ) blocks around anything that expands a path. A folder such as
rem "AppWindow (1)", which is what a second download unzips to, closed the
rem block early and the window vanished without a word. Hence goto.
rem Every way out that is not success pauses and says why.
setlocal

rem Elevate before touching TEMP. A process Windows elevates for us is built
rem from the account's own environment, so a TEMP set before that is lost.
fltmc >nul 2>&1
if not errorlevel 1 goto elevated

echo Radiance POS needs administrator rights to install.
echo Windows will ask for permission now. If no prompt appears, look for a
echo flashing shield icon in the taskbar and click it.
set "RADIANCE_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath $env:RADIANCE_SELF -Verb RunAs -ErrorAction Stop } catch { exit 1 }"
if errorlevel 1 goto denied
exit /b 0

:denied
echo.
echo Windows did not give administrator rights, so nothing was installed.
echo Run this file again and choose Yes, or right-click it and choose
echo "Run as administrator".
pause
exit /b 1

:elevated
set "TEMP=%SystemRoot%\Temp"
set "TMP=%SystemRoot%\Temp"

rem The installer beside this file. The AppWindow build wins when both sit
rem together; the browser build is for troubleshooting.
set "SETUP="
for %%F in ("%~dp0Radiance-POS-Setup-*.exe") do set "SETUP=%%~fF"
for %%F in ("%~dp0Radiance-POS-Setup-*.exe") do echo %%~nF| findstr /i /c:"-browser" >nul || set "SETUP=%%~fF"
if not defined SETUP goto missing

echo Starting the Radiance POS installer...
start "" /wait "%SETUP%" %*
set "CODE=%errorlevel%"
if "%CODE%"=="0" exit /b 0
echo.
echo The installer stopped with code %CODE%.
echo If you cancelled it, run this file again. Otherwise send a photo of this
echo window and of any message the installer showed.
pause
exit /b %CODE%

:missing
echo The Radiance POS installer was not found next to this file.
echo Keep "Install Radiance POS.cmd" in the same folder as Radiance-POS-Setup-*.exe.
pause
exit /b 2
