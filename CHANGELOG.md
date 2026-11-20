# Changelog

## 2026-11-20

### Neu
- **QR-Codes im DJ-Dashboard:** Neuer Abschnitt „QR-Codes“ mit dem WLAN-QR-Code
  (automatischer Beitritt) und dem QR-Code zur Songwunsch-Seite. Ein Klick auf
  den QR-Code lädt ihn als SVG herunter.
- **WLAN-Name (SSID) im Dashboard festlegbar:** wird in `settings.json`
  gespeichert; `WIFI_SSID` gilt nur noch als Startwert. Speichern per Icon.
- **Uhrzeit pro Wunsch:** „gewünscht um HH:MM Uhr“ unter jedem Titel, im
  Dashboard zusätzlich „zuletzt erneut …“ bei wiederholten Wünschen.
- **„Nicht gefunden“ für Gäste sichtbar:** Der rechte Button wird zu einem
  anklickbaren Fragezeichen („Der Titel wurde leider nicht gefunden“), der
  Wunsch rutscht in der Liste (Gäste und Dashboard) ganz nach unten.
- **„Gespielt“ rückgängig machen:** Hinweis mit „Rückgängig“ nach dem Klick
  (neue Route `POST /api/wishes/:id/unplayed`).

### Geändert
- QR-Code aus der Gäste-Ansicht (Musikwunsch-Seite) entfernt.
- WLAN-QR-Code liegt jetzt unter `/api/dashboard/wifi-qr.svg` und ist nur nach
  Dashboard-Login erreichbar (vorher öffentlich unter `/api/wifi-qr.svg`).
- Eigenen Wunsch löschen ist zweistufig („Wirklich löschen?“ beim ersten Tipp).

- Umrandete Buttons behalten ihre Farben; die kurz eingeführte einheitlich
  gelbe Umrandung wurde zurückgenommen.
- Fokus-Umrandung nutzt überall die Textfarbe (`currentColor`) statt des
  Akzents (im Dashboard war er pink); bei gefüllten Buttons (Reset, Zähler-Chip)
  die Füllfarbe.
- Dashboard: Eingabefelder schwarz mit weißem Text, QR-Karte dunkel (vorher
  hell auf hell, schlecht lesbar / BFSG).
- Dashboard-Abschnitt „WLAN“: nur noch ein kleiner, anklickbarer QR-Code
  (SVG-Download) neben dem Speichern-Icon; QR-Code zur Songwunsch-Seite entfernt.

### Behoben
- **Fehlklicks durch springende Listen:** Neue Daten werden nicht gezeichnet,
  solange jemand auf einen Button zielt, tippt oder wischt (`render-gate.js`).
  Verhindert, dass man versehentlich den falschen oder den eigenen Wunsch
  löscht bzw. den falschen Song als gespielt markiert.
