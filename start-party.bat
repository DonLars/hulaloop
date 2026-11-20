@echo off
setlocal

REM Vor der ersten Party unbedingt anpassen (nicht die Standardwerte
REM hulaloop/hulaloop fuer den echten Partybetrieb verwenden):
set DASHBOARD_USERNAME=change-me
set DASHBOARD_PASSWORD=change-me
REM Startwert für den WLAN-Namen (SSID); im Dashboard änderbar, dort gibt es auch den QR-Code:
set WIFI_SSID=Musikwunsch

REM Nur aktivieren, falls der automatische Standardpfad (macOS) auf diesem
REM Windows-PC nicht existiert. Erst den echten Pfad der Serato-Datenbank
REM auf diesem Rechner finden und testen, siehe README-WINDOWS.md.
REM set SERATO_DB_PATH=C:\Users\%USERNAME%\Music\_Serato_\Library\master.sqlite

echo Starte hulaloop auf http://0.0.0.0:80 ...
npm start

endlocal
