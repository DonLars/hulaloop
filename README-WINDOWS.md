# hulaloop auf dem Windows-Party-PC einrichten

Diese Anleitung ergänzt die Haupt-`README.md` um die konkreten Schritte für
den echten Windows-Produktiv-PC beim DJ. Sie ist in zwei Phasen aufgeteilt:
Vorbereitung zuhause/im Büro (PC hat noch Internet), und der eigentliche
Party-Abend (PC läuft komplett offline).

## Phase 1: Vorbereitung (mit Internet)

1. **Node.js installieren**, falls noch nicht vorhanden (aktuelle
   LTS-Version von [nodejs.org](https://nodejs.org)).

2. **Projekt auf den PC bringen und Abhängigkeiten installieren:**

   ```bash
   git clone <euer-repo-url>
   cd hulaloop
   npm install
   ```

3. **Song-Katalog vorab befüllen** (braucht einmalig Internet, danach nie
   wieder – siehe Haupt-README, Abschnitt "Song-Autocomplete"):

   ```bash
   node server/scripts/sync-songs.js
   ```

4. **Serato-Datenbankpfad auf Windows herausfinden und testen.** Die
   automatische Erkennung in `server/serato-watch.js` kennt aktuell nur den
   macOS-Standardpfad. Auf Windows müsst ihr den echten Pfad selbst finden
   und über die Umgebungsvariable `SERATO_DB_PATH` setzen, z.B. in
   `start-party.bat` (siehe unten):

   ```bat
   set SERATO_DB_PATH=C:\Users\<name>\Music\_Serato_\Library\master.sqlite
   ```

   Vermutlicher Ort: irgendwo unter `%USERPROFILE%\Music\_Serato_\`. Nach
   dem Setzen unbedingt **vor der Party testen**: Server starten, in Serato
   einen Song abspielen, prüfen ob er im Dashboard unter "gerade läuft"
   bzw. nach dem nächsten Songwechsel als "gespielt" auftaucht.

5. **Eigene Dashboard-Zugangsdaten festlegen.** Die Standardwerte
   `hulaloop`/`hulaloop` sind nur zum lokalen Testen gedacht, nicht für die
   Party. In `start-party.bat` anpassen (siehe unten).

6. **Einmal komplett durchtesten**, bevor der PC zur Party mitgenommen
   wird: Server starten (`start-party.bat`), Formular im Browser öffnen,
   Testwunsch abschicken, Serato-Song abspielen und im Dashboard
   beobachten, ob alles ankommt.

### `start-party.bat`

Im Projekt liegt bereits `start-party.bat`, die die nötigen
Umgebungsvariablen setzt und den Server startet. Vor dem ersten Einsatz
darin `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` auf eigene Werte ändern und
bei Bedarf die `SERATO_DB_PATH`-Zeile aktivieren/anpassen. Danach reicht am
Party-Abend ein Doppelklick auf die Datei.

## Phase 2: Netzwerk-Setup (GL.iNet-Router)

Entspricht dem bereits erfolgreich getesteten Aufbau (siehe Haupt-README,
Abschnitt "Netzwerk-Architektur (Offline-Party-WLAN)"), nur mit dem
Windows-PC statt dem Mac:

1. Windows-PC per Ethernet-Kabel an einen **LAN-Port** des Routers
   anschließen (nicht den WAN-Port).
2. Im Router-Webinterface (`http://192.168.8.1`) unter *Network → DHCP and
   DNS → Static Leases* eine feste IP-Reservierung für die MAC-Adresse des
   PC-Ethernet-Adapters anlegen, z.B. `192.168.8.100`.
3. Unter *Network → DHCP and DNS → Advanced Settings* die
   Wildcard-DNS-Hijack-Zeile prüfen/eintragen (siehe
   [`network-setup/dnsmasq-phase1-single-router.conf`](network-setup/dnsmasq-phase1-single-router.conf)),
   IP muss zur Static Lease aus Schritt 2 passen.
4. Gäste-WLAN: nur 2,4 GHz, offen ohne Passwort.
5. **Wichtig, unbedingt vor der Party prüfen: WAN-Port des Routers muss
   getrennt sein** (kein Kabel zu einem Internet-Router). Mit aktivem
   Internet-Uplink könnten Gäste normales Internet bekommen statt des
   Formulars, und der automatische Popup-Trick funktioniert nicht
   zuverlässig.

## Am Party-Abend selbst

1. Router einschalten, **kein Kabel im WAN-Port**.
2. Windows-PC per Ethernet an den Router-LAN-Port anschließen, PC-WLAN wird
   für das Partynetz nicht benutzt.
3. Serato starten.
4. `start-party.bat` starten (Doppelklick).
5. Kurzer Funktionstest mit einem Handy: mit dem Gäste-WLAN verbinden, das
   Login-Popup sollte automatisch aufgehen.
6. Dashboard vom DJ-Pult aus aufrufen: `http://192.168.8.100/dashboard`,
   mit den eigenen Zugangsdaten aus Schritt 5 (Phase 1) einloggen.

### Falls das Popup beim Testen nicht wieder aufgeht

iOS merkt sich pro WLAN, dass die Anmeldeseite schon einmal aufgerufen
wurde, und zeigt sie bei erneutem Verbinden nicht automatisch wieder an
(normales Verhalten, wie bei jedem Hotel-/Flughafen-WLAN). Zum erneuten
Testen auf dem Handy das Netzwerk einmal "ignorieren" (vergessen) und WLAN
aus/an schalten. Für echte Gäste ist das kein Problem: Formular einmal
sehen reicht, ein späterer manueller Aufruf funktioniert jederzeit über
`http://192.168.8.100` oder eine beliebige andere Adresse im Browser.
