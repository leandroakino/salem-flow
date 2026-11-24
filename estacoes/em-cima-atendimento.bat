rem Computador de CIMA (atendimento): impressao automatica da ficha quando um pedido e liberado.
@echo off
chcp 65001 >nul
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
set FLAGS=--kiosk-printing --autoplay-policy=no-user-gesture-required --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=IntensiveWakeUpThrottling
start "" %CHROME% %FLAGS% --new-window "https://salem-flow.pages.dev/?estacao=cima"
