@echo off
rem Loja - sobe o servidor local (http://localhost:5510) e o sincronizador de fotos, e abre o site.
cd /d "%~dp0"
start "" /min powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "_dev\serve.ps1" -Port 5510
start "" /min powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "tools\sincronizar-fotos.ps1"
timeout /t 2 >nul
start "" http://localhost:5510/
