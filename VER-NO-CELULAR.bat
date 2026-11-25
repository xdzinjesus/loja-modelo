@echo off
rem Loja - abre o site para ver no CELULAR (servidor so de leitura, sem admin).
rem Deixe esta janela aberta enquanto usa no celular. Os enderecos aparecem abaixo.
cd /d "%~dp0"
title Loja no celular - deixe esta janela aberta
powershell -ExecutionPolicy Bypass -File "_dev\serve-celular.ps1" -Port 5520
pause
