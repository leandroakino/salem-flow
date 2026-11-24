rem Notebook de BAIXO: painel da TV em tela cheia + impressao automatica da ficha quando a producao inicia.
@echo off
chcp 65001 >nul
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
set FLAGS=--kiosk-printing --autoplay-policy=no-user-gesture-required --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=IntensiveWakeUpThrottling
start "" %CHROME% %FLAGS% --new-window --start-fullscreen "https://sistema.floriculturasalem.com.br/#tv=COLE_AQUI_A_CHAVE_DA_TV"
timeout /t 5 >nul
start "" %CHROME% %FLAGS% --new-window --window-size=460,240 --window-position=0,0 "https://sistema.floriculturasalem.com.br/?estacao=baixo"
