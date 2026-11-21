@echo off
rem Flor de Pitanga - encerra o aplicativo.
if not defined FDP_PORT set FDP_PORT=1971
set ENCONTROU=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%FDP_PORT% .*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
  set ENCONTROU=1
)
echo Flor de Pitanga encerrado. Seus dados estao salvos.
timeout /t 2 /nobreak >nul
