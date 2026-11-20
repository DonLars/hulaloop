# Changelog

## 2026-11-20

### Neu
- **QR-Codes im DJ-Dashboard:** Neuer Abschnitt „QR-Codes“ mit dem WLAN-QR-Code
  (automatischer Beitritt) und dem QR-Code zur Songwunsch-Seite. Ein Klick auf
  den QR-Code lädt ihn als SVG herunter.
- **WLAN-Name (SSID) im Dashboard festlegbar:** wird in `settings.json`
  gespeichert; `WIFI_SSID` gilt nur noch als Startwert.
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

- Umrandete Buttons (Dashboard-Aktionen, „Alle löschen“, „Alle anzeigen“, CSV,
  Abstimmen/Löschen am Desktop) einheitlich in Gelb (`--outline`).

### Behoben
- **Fehlklicks durch springende Listen:** Neue Daten werden nicht gezeichnet,
  solange jemand auf einen Button zielt, tippt oder wischt (`render-gate.js`).
  Verhindert, dass man versehentlich den falschen oder den eigenen Wunsch
  löscht bzw. den falschen Song als gespielt markiert.
