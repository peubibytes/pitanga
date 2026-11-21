@echo off
rem Flor de Pitanga - inicia o aplicativo a partir do codigo-fonte e abre o navegador.
setlocal
cd /d "%~dp0"
set NODE_ENV=production
if not defined FDP_PORT set FDP_PORT=1971
if not defined FDP_DATA_DIR set "FDP_DATA_DIR=%LOCALAPPDATA%\FlorDePitanga"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node 22 ou superior em https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias, aguarde...
  call npm install
  if errorlevel 1 goto erro
)

if not exist apps\api\dist\main.js (
  echo Compilando o aplicativo, aguarde...
  call npm run build
  if errorlevel 1 goto erro
)

echo Iniciando o Flor de Pitanga... (nao feche esta janela enquanto estiver usando)
echo Seus dados ficam em: %FDP_DATA_DIR%
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:%FDP_PORT%"
node apps\api\dist\main.js
if errorlevel 1 goto erro
exit /b 0

:erro
echo.
echo Algo deu errado. Veja a mensagem acima ou o log em %FDP_DATA_DIR%\logs.
pause
exit /b 1
