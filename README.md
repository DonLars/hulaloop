# hulaloop

Offline Musikwunsch-App für DJs. Gäste verbinden sich mit einem lokalen WLAN
ohne Internet, bekommen automatisch ein Formular angezeigt (wie ein
Hotel-WLAN-Login) und können dort Songwünsche einreichen. Der DJ sieht die
Wünsche live mit Uhrzeit auf einem Dashboard, inklusive Ton-Signal.

## Software starten

```bash
npm install
npm start
```

Standardmäßig läuft der Server auf Port 80 (`http://0.0.0.0:80`). Einen
anderen Port über die Umgebungsvariable `PORT` setzen, z.B. `PORT=8080 npm start`.

- Formular für Gäste: `http://<server-ip>/`
- Live-Dashboard für den DJ: `http://<server-ip>/dashboard`

Alle eingereichten Wünsche werden in `server/data/wishes.json` gespeichert
und bleiben über einen Neustart hinweg erhalten.

## Netzwerk-Architektur (Offline-Party-WLAN)

Der DJ-PC läuft komplett offline, es gibt keinen Internet-Uplink am
Partyort. Zwei physisch getrennte Netzwerk-Schnittstellen:

- **WLAN des PCs**: bleibt frei für normale Nutzung (z.B. im Büro des DJs
  mit Internet), wird während der Party nicht verwendet.
- **Ethernet des PCs**: fest verbunden mit einem Switch, an dem die
  Access Points hängen. Darüber läuft ausschließlich das Party-Netz.

### Hardware (für ca. 100–200 Gäste)

- 2–3x TP-Link EAP613 (Wi-Fi 6 Access Points), im Partykeller verteilt für
  Abdeckung und Kapazität
- 1x einfacher Netzwerk-Switch
- Omada Software Controller (kostenlos) läuft auf demselben Windows-PC wie
  dieser Node-Server

### Gäste-WLAN-Konfiguration

- Nur 2,4-GHz-Band (bessere Wanddurchdringung durch Beton, breitere
  Geräte-Kompatibilität auch mit älteren Handys)
- Offenes WLAN ohne Passwort (kein Internet-Risiko, da ohnehin offline;
  vermeidet WPA3-Kompatibilitätsprobleme mit älteren Geräten)

### Captive Portal / automatisches Formular-Popup

1. DHCP im Party-Netz weist Clients eine IP zu (DHCP-Server läuft auf dem
   Windows-PC, z.B. über ein leichtgewichtiges DHCP-Tool für Windows, da
   kein Omada-Gateway im Einsatz ist).
2. DNS im Party-Netz beantwortet **jede** Domain-Anfrage mit der IP des
   Windows-PCs (Wildcard-DNS-Hijack).
3. Dieser Node-Server antwortet auf **jede** eingehende Anfrage (egal
   welcher Host/Pfad) mit dem Formular (siehe Catch-all-Route in
   `server/index.js`). Das lässt die Connectivity-Checks von iOS, Android
   und Windows fehlschlagen und löst automatisch das Login-Popup aus.

### Kein Internet für Gäste

Es gibt bewusst keinen Internet-Passthrough. Falls Gäste eigenes mobiles
Internet nutzen möchten, übernehmen moderne Smartphones das teils
automatisch (iOS Wi-Fi Assist, Android-Mobilfunk-Fallback), das ist aber
nicht zuverlässig garantiert. Das Formular weist Gäste entsprechend darauf
hin, im Zweifel WLAN zu deaktivieren.
