@echo off
rem Flor de Pitanga - MODO SUPORTE: inicia com console e abre o navegador, para diagnostico.
rem No dia a dia use o icone "Flor de Pitanga" (janela propria, sem console).
setlocal
cd /d "%~dp0"
set NODE_ENV=production
if not defined FDP_PORT set FDP_PORT=1971
rem Dados fora de "Program Files" e fora de pastas sincronizadas (OneDrive): nao exige administrador.
if not defined FDP_DATA_DIR set "FDP_DATA_DIR=%LOCALAPPDATA%\FlorDePitanga"
set "NODE=%~dp0..\runtime\node.exe"
if not exist "%NODE%" set "NODE=node"
set "PRINCIPAL=%~dp0..\app\apps\api\dist\main.js"
if not exist "%PRINCIPAL%" set "PRINCIPAL=%~dp0..\..\apps\api\dist\main.js"
if not exist "%PRINCIPAL%" (
  echo Nao encontrei o aplicativo. Rode "npm run build" ou use o pacote gerado por "npm run dist:win".
  pause
  exit /b 1
)
echo Iniciando o Flor de Pitanga... (nao feche esta janela enquanto estiver usando)
echo Seus dados ficam em: %FDP_DATA_DIR%
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:%FDP_PORT%"
"%NODE%" "%PRINCIPAL%"
if errorlevel 1 (
  echo.
  echo O aplicativo parou com erro. Veja a mensagem acima ou o log em %FDP_DATA_DIR%\logs.
  pause
)
