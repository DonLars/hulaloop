# hulaloop

Offline Musikwunsch-App für DJs. Gäste verbinden sich mit einem lokalen WLAN
ohne Internet, bekommen automatisch ein Formular angezeigt (wie ein
Hotel-WLAN-Login) und können dort Songwünsche einreichen. Wünscht sich jemand
einen bereits vorhandenen Song erneut, zählt der Wunsch hoch und rutscht in
der Liste nach oben, statt doppelt aufzutauchen. Der DJ sieht die Wünsche
live mit Uhrzeit auf einem geschützten Dashboard, inklusive Ton-Signal, und
markiert Titel als "gespielt" (wandern in eine eigene History mit
Lösch-Button, CSV-Export und "alle löschen") oder "nicht gefunden"
(durchgestrichene Anzeige). Gäste können die aktuelle Wunschliste
zusätzlich einsehen und per Daumen-hoch mitwünschen (`/playlist`).

## Software starten

```bash
npm install
npm start
```

Standardmäßig läuft der Server auf Port 80 (`http://0.0.0.0:80`). Einen
anderen Port über die Umgebungsvariable `PORT` setzen, z.B. `PORT=8080 npm start`.

Das Dashboard ist per Login-Seite mit Benutzername + Passwort geschützt
(Standard: `hulaloop` / `hulaloop`). Für die Party unbedingt eigene Werte
setzen:

```bash
DASHBOARD_USERNAME=eigener-name DASHBOARD_PASSWORD=eigenes-passwort npm start
```

- Formular für Gäste: `http://<server-ip>/`
- Öffentliche Wunschliste (nur lesen, keine Namen): `http://<server-ip>/playlist`
- Live-Dashboard für den DJ (Passwort nötig): `http://<server-ip>/dashboard`

Alle eingereichten Wünsche werden in `server/data/wishes.json` gespeichert
und bleiben über einen Neustart hinweg erhalten.

## Song-Autocomplete (lokale Datenbank, kein Internet zur Partyzeit nötig)

Das Songfeld im Gäste-Formular schlägt Titel aus einer lokalen Katalog-Datei
(`server/data/songs.json`) sowie bereits heute Abend gewünschten Songs vor.
Wählt ein Gast einen schon gewünschten Song aus den Vorschlägen aus, zählt
der bestehende Wunsch hoch, statt einen neuen anzulegen.

Die Katalog-Datei wird **vorab, solange der PC noch normal Internet hat**,
mit den aktuellen Charts plus ein paar Genre-/Ären-Suchen über die
iTunes-Search-API befüllt:

```bash
node server/scripts/sync-songs.js
```

Während der Party selbst braucht der Server dafür kein Internet mehr, die
Suche läuft komplett gegen die zuvor erzeugte lokale Datei.

Ist beim Suchen zusätzlich Internet verfügbar (z.B. beim Testen zuhause/im
Büro), fragt der Server parallel live beim kompletten Apple-Music-Katalog
nach (kurzer Timeout, kein Blockieren) und ergänzt die Vorschläge – so sind
auch Songs abgedeckt, die nicht im vorab gebauten Katalog stecken. Am
Partyort ohne Internet läuft die Live-Anfrage einfach ins Leere und es
bleibt bei den lokalen Vorschlägen.

## Lokal testen (macOS)

Die App ist plattformunabhängig (Node.js, Express, reines HTML/CSS/JS),
`npm install && npm start` läuft auf dem Mac genauso wie auf dem
Windows-Produktiv-PC. Ein Unterschied: macOS verlangt für Port 80
Admin-Rechte, für reines Testen daher einen höheren Port nutzen:

```bash
PORT=8080 npm start
```

Formular dann unter `http://<mac-ip>:8080/`, Dashboard unter
`http://<mac-ip>:8080/dashboard`. Für den echten Party-Einsatz auf dem
Windows-PC bleibt Port 80 wie oben beschrieben.

**Captive-Portal-Verhalten mit vorhandener FRITZ!Box testen:** Das
Gastnetzwerk der FRITZ!Box lässt keinen eigenen DNS-Server zu (sie verteilt
immer sich selbst als DNS-Server). Der Wildcard-DNS-Hijack-Trick
funktioniert daher nur über das **reguläre WLAN** der FRITZ!Box, nicht über
das isolierte Gastnetz:

1. FRITZ!Box vom Internet trennen (WAN-Kabel raus), Mac per LAN-Kabel
   anschließen, feste IP vergeben.
2. Normales WLAN (nicht Gastnetz) nutzen, unter *Heimnetz → Netzwerk →
   Netzwerkeinstellungen → IPv4-Adressen* den lokalen DNS-Server auf die IP
   des Macs setzen.
3. Auf dem Mac ein dnsmasq-artiges Tool mit der Wildcard-Zeile aus
   [`network-setup/dnsmasq-phase1-single-router.conf`](network-setup/dnsmasq-phase1-single-router.conf)
   laufen lassen.
4. Node-Server wie oben starten.

Das nutzt das normale Heimnetz statt eines isolierten Gastnetzes (unkritisch
für einen reinen Funktionstest). Ohne DNS-Hijack-Setup lässt sich die App
auch einfach testen, indem man die lokale IP des Macs manuell im
Handy-Browser aufruft, nur der automatische Popup-Effekt bleibt dann aus.

## Netzwerk-Architektur (Offline-Party-WLAN)

Der DJ-PC läuft komplett offline, es gibt keinen Internet-Uplink am
Partyort. Zwei physisch getrennte Netzwerk-Schnittstellen:

- **WLAN des PCs**: bleibt frei für normale Nutzung (z.B. im Büro des DJs
  mit Internet), wird während der Party nicht verwendet.
- **Ethernet des PCs**: fest verbunden mit dem Party-Netz (Router bzw.
  später Switch + Access Points). Darüber läuft ausschließlich das
  Party-Netz.

Der Aufbau ist bewusst in zwei Phasen gedacht: klein starten, bei Bedarf
skalieren. Die Node-App selbst ändert sich zwischen beiden Phasen nicht,
nur die Netzwerk-Infrastruktur drumherum.

### Phase 1 (Start): ein einzelner WLAN-Router

Für den Einstieg reicht ein einzelner Reise-Router mit eigener Firmware, der
DHCP, DNS-Hijack und WLAN in einem Gerät übernimmt, der Windows-PC braucht
dafür keinen eigenen DHCP-Server.

**Empfehlung: GL.iNet AR300M Shadow, konkret die Variante GL-AR300M16-Ext
(~35-38 €)** mit zwei abnehmbaren RP-SMA-Antennen. Wichtig beim Bestellen:
GL.iNet verkauft "Shadow" in mehreren Varianten, nur die "-Ext"-Variante hat
die externen, abnehmbaren Antennen. Bei einem Partyraum von ca. 50-80 m²,
zusätzlich gedämpft durch eine Menschenmenge (Körper schlucken
2,4-GHz-Signal teilweise), macht das einen spürbaren Unterschied: Die
gesetzlich erlaubte Sendeleistung (20 dBm / 100 mW) ist bei allen kleinen
GL.iNet-Routern gleich, aber eine externe Antenne strahlt effizienter ab
als die winzigen internen Antennen kompakterer Modelle, das bringt real
mehr Reichweite bei identischer Sendeleistung. Bonus: die Antennen lassen
sich bei Bedarf gegen höhere Gain-Varianten tauschen. Zusätzlich bestätigt
die offizielle [OpenWrt Table of Hardware](https://toh.openwrt.org/) für
den GL-AR300M16(-Ext) durchgängigen, aktuellen Mainline-Support (21.02.0
bis heute), also aktive Community-Pflege statt nur Hersteller-Fork.

Alternative Modelle: GL.iNet Mango (GL-MT300N-V2, ~30-45 €, noch kompakter,
aber nur interne Antennen, für die Raumgröße eher an der unteren Grenze)
oder GL.iNet Beryl AX (GL-MT3000, ~87-110 €, mehr Leistungsreserve, aber
deutlich größer). Siehe
[Phase 2](#phase-2-skalierung-mehrere-access-points) für größere/verwinkelte
Flächen oder deutlich mehr Gäste.

1. DJ-PC per Ethernet-Kabel an einen **LAN-Port** des Routers anschließen
   (nicht den WAN-Port, es gibt keinen Internet-Uplink).
2. Im Router-Webinterface eine feste IP-Reservierung für den PC einrichten,
   z.B. `192.168.8.100` (Static Lease über die MAC-Adresse des PCs).
3. Unter *Network → DHCP and DNS → Advanced Settings* die Zeile aus
   [`network-setup/dnsmasq-phase1-single-router.conf`](network-setup/dnsmasq-phase1-single-router.conf)
   eintragen, das leitet jede Domain-Anfrage im WLAN automatisch auf den PC
   um.
4. Gäste-WLAN nur auf 2,4 GHz, offen ohne Passwort einrichten (siehe unten).
5. Node-Server auf dem PC starten (`npm start`), lauscht bereits auf
   `0.0.0.0`, keine Code-Änderung nötig.

### Phase 2 (Skalierung): mehrere Access Points

Wird die Kapazität eines einzelnen Routers knapp (z.B. bei deutlich mehr
Gästen oder größerer/verwinkelter Fläche), auf ein zentral verwaltetes
Multi-AP-System umsteigen:

- 2–3x TP-Link EAP613 (Wi-Fi 6 Access Points), im Raum verteilt für
  Abdeckung und Kapazität
- 1x einfacher Netzwerk-Switch statt des Einzel-Routers
- Omada Software Controller (kostenlos) läuft auf demselben Windows-PC wie
  dieser Node-Server
- DHCP und DNS-Hijack laufen jetzt auf dem PC selbst (z.B. über ein
  leichtgewichtiges DHCP/DNS-Tool für Windows), da die EAP613 im Gegensatz
  zum Phase-1-Router keine eigene DHCP/DNS-Funktion mitbringen

### Gäste-WLAN-Konfiguration (beide Phasen)

- Nur 2,4-GHz-Band (bessere Wanddurchdringung durch Beton, breitere
  Geräte-Kompatibilität auch mit älteren Handys)
- Offenes WLAN ohne Passwort (kein Internet-Risiko, da ohnehin offline;
  vermeidet WPA3-Kompatibilitätsprobleme mit älteren Geräten)

### Captive Portal / automatisches Formular-Popup

1. DHCP im Party-Netz weist Clients eine IP zu.
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
