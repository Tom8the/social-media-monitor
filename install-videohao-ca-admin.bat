@echo off
setlocal
set "CA=%~dp0server\tmp\videohao-proxy-ca\certs\ca.pem"

if not exist "%CA%" (
  echo Videohao proxy CA not found:
  echo %CA%
  echo.
  echo Start the project once and run Videohao add/capture once to generate the CA, then run this file as Administrator.
  pause
  exit /b 1
)

echo Installing Videohao local proxy CA to LocalMachine Root...
echo Removing old NodeMITMProxyCA entries if present...
certutil.exe -delstore Root NodeMITMProxyCA >nul 2>nul

echo Installing current CA:
certutil.exe -hashfile "%CA%" SHA1
certutil.exe -addstore Root "%CA%"
if errorlevel 1 (
  echo.
  echo Install failed. Right click this file and choose "Run as administrator".
  pause
  exit /b 1
)

echo.
echo Install completed.
pause
