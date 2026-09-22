const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');
const { watchSerato } = require('./serato-watch');

const PORT = process.env.PORT || 80;
const DATA_FILE = path.join(__dirname, 'data', 'wishes.json');
const SONGS_FILE = path.join(__dirname, 'data', 'songs.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');
const DASHBOARD_USERNAME = process.env.DASHBOARD_USERNAME || 'hulaloop';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'hulaloop';

if (!process.env.DASHBOARD_USERNAME || !process.env.DASHBOARD_PASSWORD) {
  console.warn(
    `Achtung: Dashboard-Zugangsdaten nicht gesetzt, benutze Standard "${DASHBOARD_USERNAME}" / "${DASHBOARD_PASSWORD}". ` +
      'Für die Party eigene Werte über DASHBOARD_USERNAME=... und DASHBOARD_PASSWORD=... setzen.'
  );
}

// Zufälliger Session-Token pro Serverstart (kein Login-Screen-Setup nötig,
// einfach nur ein Passwortfeld statt hässlichem Browser-Basic-Auth-Popup).
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');
const SESSION_COOKIE = 'hulaloop_dashboard';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return cookies;
}

function checkDashboardAuth(req) {
  return parseCookies(req)[SESSION_COOKIE] === SESSION_TOKEN;
}

function requireDashboardAuth(req, res, next) {
  if (checkDashboardAuth(req)) return next();
  res.status(401).json({ error: 'Zugriff verweigert.' });
}

// Anonyme Geräte-ID (kein Login), damit jeder Gast einen Song nur einmal
// zählen/hochvoten kann – egal ob per Formular oder per +1 auf der
// Wunschliste. Kein Bezug zu Name/Identität, rein technisch zur Dedup.
const GUEST_COOKIE = 'hulaloop_guest';

function ensureGuestId(req, res, next) {
  const existing = parseCookies(req)[GUEST_COOKIE];
  req.guestId = existing || crypto.randomUUID();
  if (!existing) {
    res.append('Set-Cookie', `${GUEST_COOKIE}=${req.guestId}; Path=/; SameSite=Lax; Max-Age=31536000`);
  }
  next();
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveWishes() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(wishes, null, 2));
}

function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function normalize(str) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Migration: ältere Wünsche kannten nur ein `count`-Feld statt `voters`.
// Mit Platzhalter-IDs auffüllen, damit die bisherige Anzahl erhalten bleibt.
const wishes = loadJson(DATA_FILE, []).map((w) => {
  if (!w.voters) {
    const n = w.count || 1;
    w.voters = Array.from({ length: n }, (_, i) => `legacy-${w.id}-${i}`);
  }
  if (typeof w.notFound !== 'boolean') w.notFound = false;
  if (typeof w.played !== 'boolean') w.played = false;
  if (!('playedAt' in w)) w.playedAt = null;
  if (!w.moodVotes || typeof w.moodVotes !== 'object') w.moodVotes = {};
  delete w.count;
  delete w.djNote;
  return w;
});

// Punktesumme aus Daumen hoch/runter für einen gespielten Song (kann negativ sein).
function moodScore(wish) {
  return Object.values(wish.moodVotes).reduce((sum, v) => sum + (v === 'up' ? 1 : v === 'down' ? -1 : 0), 0);
}
const catalog = loadJson(SONGS_FILE, []);

// Jeder darf seinen eigenen Namen jederzeit ändern, aber zwei Gäste dürfen
// nicht gleichzeitig denselben Namen tragen (sonst lässt sich z.B. bei
// Nachrichten nicht mehr unterscheiden, wer wer ist). guestNames: welchen
// Namen dieses Gerät (Guest-Cookie) gerade trägt. nameOwners: welcher Name
// gerade wem "gehört" (normalisiert, für den Kollisions-Check). Beides wird
// beim DJ-Reset geleert. Anonym (leeres Namensfeld) ist davon unberührt und
// geht immer.
const guestNames = new Map();
const nameOwners = new Map();

// DJ kann "Bereits gespielt" für Gäste komplett aus- und wieder einblenden
// (z.B. wenn nur bestätigt-gespielte Songs, kein Live-Vorhören/Cuen, gezeigt
// werden soll). Persistiert, damit die Wahl einen Serverneustart übersteht.
const settings = loadJson(SETTINGS_FILE, { showPlayedToGuests: true });
if (typeof settings.showPlayedToGuests !== 'boolean') settings.showPlayedToGuests = true;
delete settings.crateName; // Altlast der zurückgebauten Crate-Auswahl

function sortedActiveWishes() {
  return wishes
    .filter((w) => !w.played)
    .sort((a, b) => {
      if (b.voters.length !== a.voters.length) return b.voters.length - a.voters.length;
      return new Date(a.firstRequestedAt) - new Date(b.firstRequestedAt);
    });
}

function sortedPlayedWishes() {
  return wishes.filter((w) => w.played).sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
}

// Gäste sehen "Bereits gespielt" nur, wenn der DJ es nicht komplett
// ausgeblendet hat. Für den CSV-Export bleibt sortedPlayedWishes()
// unverändert die vollständige Historie.
function visiblePlayedWishes() {
  return settings.showPlayedToGuests ? sortedPlayedWishes() : [];
}

// Öffentliche Sicht (Gäste-Wunschliste): keine Namen, keine Nachrichten,
// dafür ein Hinweis, ob dieser Gast (per Cookie) schon selbst gevotet hat.
function toPublicWish(wish, guestId) {
  return {
    id: wish.id,
    title: wish.title,
    count: wish.voters.length,
    firstRequestedAt: wish.firstRequestedAt,
    notFound: wish.notFound,
    votedByMe: Boolean(guestId) && wish.voters.includes(guestId),
    // voters[0] ist immer der Gast, der den Wunsch ursprünglich eingestellt
    // hat (siehe POST /api/wishes) – darauf basiert "von dir" + Löschrecht.
    isMine: Boolean(guestId) && wish.voters[0] === guestId
  };
}

// Öffentliche Sicht auf bereits gespielte Songs: nur Zeit + Titel, ganz ohne
// Namen/Label – dient nur als Verlauf für Gäste, nicht zur Zuordnung. Die
// eigene Daumen-Stimme wird mitgeschickt (fürs Hervorheben des eigenen
// Buttons), der Punktestand aber bewusst nicht – der sieht nur der DJ.
function toPublicPlayedWish(wish, guestId) {
  return {
    id: wish.id,
    title: wish.title,
    playedAt: wish.playedAt,
    myMoodVote: (guestId && wish.moodVotes[guestId]) || null
  };
}

// Bewertet einen Treffer danach, OB die Eingabe zum Künstler oder nur
// zufällig zum Songtitel passt. Verhindert, dass z.B. bei "queen" Songs, die
// bloß "Queen" heißen (aber von einem anderen Interpreten sind), vor echten
// Queen-Songs stehen.
function matchScore(interpret, title, q) {
  const i = normalize(interpret || '');
  const t = normalize(title || '');
  if (i.startsWith(q)) return 0; // Künstlername beginnt mit der Eingabe
  if (t.startsWith(q)) return 1; // Songtitel beginnt mit der Eingabe
  if (i.includes(q)) return 2; // Künstlername enthält die Eingabe
  if (t.includes(q)) return 3; // Songtitel enthält die Eingabe zufällig
  return null;
}

function localSuggestions(query, limit) {
  const q = normalize(query);

  const tonight = wishes
    .filter((w) => !w.played)
    .map((w) => ({
      source: 'tonight',
      wishId: w.id,
      interpret: w.interpret,
      title: w.title,
      // Schon heute Abend gewünschte Songs immer zuoberst (fördert Mitwünschen
      // statt Dubletten), unabhängig von der Popularität im Katalog.
      rank: -1,
      idx: matchScore(w.interpret, w.title, q)
    }))
    .filter((r) => r.idx !== null);

  const fromCatalog = catalog
    .map((s) => ({
      source: 'catalog',
      songId: s.id,
      interpret: s.interpret,
      title: s.title,
      rank: s.rank ?? 999999,
      idx: matchScore(s.interpret, s.title, q)
    }))
    .filter((r) => r.idx !== null);

  // Erst Künstler- vs. Titeltreffer (matchScore), dann Popularität sortieren
  // – z.B. bei "abba" stehen die bekanntesten Songs oben statt einer
  // zufälligen/alphabetischen Reihenfolge.
  return [...tonight, ...fromCatalog]
    .sort((a, b) => a.idx - b.idx || a.rank - b.rank)
    .slice(0, limit);
}

// Live-Nachfrage beim gesamten Apple-Music/iTunes-Katalog, falls gerade
// Internet verfügbar ist (z.B. beim Testen oder vor der Party). Läuft mit
// kurzem Timeout, damit die Suche am Partyort (offline) einfach nur auf den
// lokalen Katalog zurückfällt statt hängen zu bleiben.
async function liveSuggestions(query, q, limit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}&country=de`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    // Apple liefert Live-Suchergebnisse schon relevanzsortiert, die
    // Position übernehmen wir als Rang für den Merge mit dem lokalen Katalog.
    // matchScore sorgt dafür, dass echte Künstlertreffer weiterhin vor
    // zufälligen Titeltreffern stehen (z.B. "queen" vor Songs, die nur so heißen).
    return (data.results || [])
      .map((r, rank) => ({
        source: 'live',
        songId: `itunes-${r.trackId}`,
        interpret: r.artistName,
        title: r.trackName,
        rank,
        idx: matchScore(r.artistName, r.trackName, q)
      }))
      .filter((r) => r.idx !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSuggestions(query, limit = 50) {
  const q = normalize(query);
  if (!q) return [];

  const local = localSuggestions(query, limit);
  const live = await liveSuggestions(query, q, limit);

  const seen = new Set();
  const merged = [];
  for (const r of [...local, ...live].sort((a, b) => a.idx - b.idx || a.rank - b.rank)) {
    // Nach Interpret+Titel deduplizieren, damit Album-/Live-/Remaster-Versionen
    // desselben Songs nicht mehrfach als eigener Vorschlag auftauchen.
    const key = normalize(`${r.interpret || ''} ${r.title}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const { idx, rank, ...rest } = r;
    merged.push(rest);
    if (merged.length >= limit) break;
  }
  return merged;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(ensureGuestId);
// Kein Caching irgendeiner Antwort: kleine Party-App im Heimnetz, dafür sehen
// Geräte nach jedem Neustart sofort die aktuelle Version statt eine alte
// HTML/JS/CSS-Datei aus dem Browser-Cache zu benutzen.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

app.get('/dashboard', (req, res) => {
  const page = checkDashboardAuth(req) ? 'dashboard.html' : 'dashboard-login.html';
  res.sendFile(path.join(__dirname, '..', 'public', page));
});

// QR-Code zur Songwunsch-Seite (öffentlich, steht auf der Songwunsch-Seite
// selbst, damit Gäste von einem gemeinsamen Bildschirm/Tablet aus schnell auf
// ihr eigenes Handy wechseln können). Nutzt den Host, über den die Seite
// gerade aufgerufen wurde (funktioniert automatisch mit der jeweiligen
// Party-IP/Port, ganz ohne Internet).
// Findet eine echte LAN-IPv4-Adresse (z.B. 192.168.x.x), falls die Anfrage
// über "localhost"/"127.0.0.1" kam – die kann ein Handy nicht erreichen.
function findLanAddress() {
  const interfaces = Object.values(os.networkInterfaces()).flat();
  const candidates = interfaces.filter((i) => i && i.family === 'IPv4' && !i.internal);
  const privateRange = candidates.find((i) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address));
  return (privateRange || candidates[0])?.address || null;
}

app.get('/api/qr.svg', async (req, res) => {
  try {
    let host = req.headers.host || '';
    if (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
      const lanAddress = findLanAddress();
      if (lanAddress) host = `${lanAddress}:${PORT}`;
    }
    const url = `http://${host}/`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 200 });
    res.set('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR-Code konnte nicht erzeugt werden.');
  }
});

app.post('/api/dashboard/login', (req, res) => {
  const username = String(req.body.username || '');
  const password = String(req.body.password || '');
  if (username !== DASHBOARD_USERNAME || password !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch.' });
  }
  res.append('Set-Cookie', `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
  res.status(200).json({ ok: true });
});

app.get('/playlist', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'playlist.html'));
});

app.get('/api/songs/search', async (req, res) => {
  res.json(await searchSuggestions(String(req.query.q || '')));
});

// Öffentlich (Gäste-Wunschliste): nur Titel + Anzahl, keine Namen/Nachrichten.
// Gespielte Songs zusätzlich als reiner Verlauf (nur Zeit + Titel), und nur
// wenn der DJ das nicht komplett ausgeblendet hat.
app.get('/api/wishes', (req, res) => {
  res.json({
    wishes: sortedActiveWishes().map((w) => toPublicWish(w, req.guestId)),
    played: visiblePlayedWishes().map(toPublicPlayedWish),
    showPlayedToGuests: settings.showPlayedToGuests
  });
});

// 👍 auf der Gäste-Wunschliste: jeder Gast (per anonymer Geräte-Cookie) kann
// einen Song hoch- und durch erneutes Klicken wieder runtervoten, das
// beeinflusst die Reihenfolge genauso wie ein Songwunsch über das Formular.
app.post('/api/wishes/:id/vote', (req, res) => {
  const wish = wishes.find((w) => w.id === req.params.id);
  if (!wish) {
    return res.status(404).json({ error: 'Wunsch nicht gefunden.' });
  }
  const idx = wish.voters.indexOf(req.guestId);
  if (idx === -1) {
    wish.voters.push(req.guestId);
  } else {
    wish.voters.splice(idx, 1);
  }
  wish.lastRequestedAt = new Date().toISOString();
  saveWishes();
  broadcastWishes();
  res.status(200).json(toPublicWish(wish, req.guestId));
});

// Gast zieht seinen eigenen (selbst eingestellten) Songwunsch zurück – nur
// wer den Wunsch ursprünglich erstellt hat (voters[0]) darf ihn löschen.
app.delete('/api/wishes/:id/mine', (req, res) => {
  const wish = wishes.find((w) => w.id === req.params.id);
  if (!wish) {
    return res.status(404).json({ error: 'Wunsch nicht gefunden.' });
  }
  if (wish.voters[0] !== req.guestId) {
    return res.status(403).json({ error: 'Das ist nicht dein Wunsch.' });
  }
  wishes.splice(wishes.indexOf(wish), 1);
  saveWishes();
  broadcastWishes();
  res.status(204).end();
});

// Für den DJ: vollständige Daten inkl. Namen und Nachrichten, getrennt nach
// aktiven und bereits gespielten Wünschen.
app.get('/api/dashboard/wishes', requireDashboardAuth, (req, res) => {
  res.json({
    active: sortedActiveWishes(),
    played: sortedPlayedWishes(),
    showPlayedToGuests: settings.showPlayedToGuests
  });
});

app.post('/api/wishes', (req, res) => {
  const songId = req.body.songId ? String(req.body.songId).slice(0, 100) : null;
  const wishId = req.body.wishId ? String(req.body.wishId).slice(0, 100) : null;
  const rawTitle = (req.body.title || '').trim().slice(0, 200);
  const submittedName = (req.body.name || '').trim().slice(0, 20) || null;
  const nachricht = (req.body.nachricht || '').trim().slice(0, 500);

  // Eigenen Namen darf man jederzeit ändern, aber zwei Gäste dürfen nicht
  // gleichzeitig denselben Namen tragen. Ist der gewünschte Name schon von
  // jemand anderem belegt, wird der Wunsch stattdessen anonym gesendet.
  // Anonym (leeres Feld) geht immer.
  let name = null;
  if (submittedName) {
    const key = normalize(submittedName);
    const owner = nameOwners.get(key);
    if (!owner || owner === req.guestId) {
      const previousName = guestNames.get(req.guestId);
      if (previousName && normalize(previousName) !== key) {
        nameOwners.delete(normalize(previousName));
      }
      guestNames.set(req.guestId, submittedName);
      nameOwners.set(key, req.guestId);
      name = submittedName;
    }
  }

  let interpret = null;
  let title = rawTitle;

  if (songId) {
    const song = catalog.find((s) => s.id === songId);
    if (song) {
      interpret = song.interpret;
      title = `${song.interpret} – ${song.title}`;
    }
  }

  if (!title && !wishId) {
    return res.status(400).json({ error: 'Song ist ein Pflichtfeld.' });
  }

  const now = new Date().toISOString();
  const requester = { name, timestamp: now };

  // Nur gegen noch aktive (nicht bereits gespielte) Wünsche abgleichen – ein
  // erneuter Wunsch für einen schon gespielten Song startet frisch als neuer
  // Eintrag, statt den alten Verlaufseintrag wiederzubeleben.
  let wish = wishId ? wishes.find((w) => w.id === wishId && !w.played) : null;

  if (!wish && songId) {
    wish = wishes.find((w) => w.songId === songId && !w.played);
  }

  if (!wish && !songId) {
    const key = normalize(title);
    wish = wishes.find((w) => !w.songId && !w.played && normalize(w.title) === key);
  }

  if (wish) {
    if (!wish.voters.includes(req.guestId)) wish.voters.push(req.guestId);
    wish.lastRequestedAt = now;
    wish.requesters.push(requester);
    if (nachricht) wish.messages.push({ text: nachricht, name, timestamp: now });
  } else {
    wish = {
      id: crypto.randomUUID(),
      songId,
      interpret,
      title,
      voters: [req.guestId],
      firstRequestedAt: now,
      lastRequestedAt: now,
      requesters: [requester],
      messages: nachricht ? [{ text: nachricht, name, timestamp: now }] : [],
      notFound: false,
      played: false,
      playedAt: null,
      moodVotes: {}
    };
    wishes.push(wish);
  }

  saveWishes();
  broadcastWishes();

  res.status(201).json(wish);
});

// DJ markiert einen Song als "nicht gefunden" (z.B. nicht in der eigenen
// Bibliothek) – Toggle, nur fürs Dashboard.
app.post('/api/wishes/:id/not-found', requireDashboardAuth, (req, res) => {
  const wish = wishes.find((w) => w.id === req.params.id);
  if (!wish) {
    return res.status(404).json({ error: 'Wunsch nicht gefunden.' });
  }
  wish.notFound = !wish.notFound;
  saveWishes();
  broadcastWishes();
  res.status(200).json(wish);
});

// DJ markiert einen Wunsch als gespielt: wandert von der aktiven Liste in die
// "Gespielte Songs"-Liste, statt sofort gelöscht zu werden.
app.post('/api/wishes/:id/played', requireDashboardAuth, (req, res) => {
  const wish = wishes.find((w) => w.id === req.params.id);
  if (!wish) {
    return res.status(404).json({ error: 'Wunsch nicht gefunden.' });
  }
  wish.played = true;
  wish.playedAt = new Date().toISOString();
  saveWishes();
  broadcastWishes();
  res.status(200).json(wish);
});

function csvEscape(value) {
  const str = String(value ?? '');
  return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Gespielte Songs als CSV (Semikolon-getrennt, mit BOM für Excel-Umlaute).
// Gleiche Logik wie im Dashboard: Name(n) falls angegeben, sonst "Von Gast
// gewünscht" falls es ein echter Gästewunsch war, sonst leer (DJ-Auswahl).
function requestedByLabel(wish) {
  if (wish.voters.length === 0) return '';
  const names = [...new Set(wish.requesters.filter((r) => r.name).map((r) => r.name))];
  return names.length > 0 ? names.join(', ') : 'Von Gast gewünscht';
}

app.get('/api/wishes/played/export.csv', requireDashboardAuth, (req, res) => {
  const rows = sortedPlayedWishes().map((w) => [
    new Date(w.playedAt).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    w.title,
    String(w.voters.length),
    requestedByLabel(w)
  ]);
  const header = ['Uhrzeit gespielt', 'Titel', 'Anzahl Wünsche', 'Von Gast gewünscht / Name'];
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\r\n');

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set(
    'Content-Disposition',
    `attachment; filename="gespielte-songs-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(`﻿${csv}`);
});

// Komplette Gespielt-Liste leeren (unwiderruflich) – vor dem einzelnen
// `/:id`-Löschen registriert, sonst würde "played" als :id interpretiert.
app.delete('/api/wishes/played', requireDashboardAuth, (req, res) => {
  for (let i = wishes.length - 1; i >= 0; i--) {
    if (wishes[i].played) wishes.splice(i, 1);
  }
  saveWishes();
  broadcastWishes();
  res.status(204).end();
});

// Kompletter Reset für eine neue Party: aktive Wünsche und Gespielt-Verlauf
// werden komplett geleert.
app.post('/api/reset', requireDashboardAuth, (req, res) => {
  wishes.length = 0;
  guestNames.clear();
  nameOwners.clear();
  saveWishes();
  broadcastWishes();
  res.status(204).end();
});

// DJ blendet "Bereits gespielt" für Gäste komplett ein oder aus.
app.post('/api/dashboard/played-visibility', requireDashboardAuth, (req, res) => {
  settings.showPlayedToGuests = !settings.showPlayedToGuests;
  saveSettings();
  broadcastWishes();
  res.status(200).json({ showPlayedToGuests: settings.showPlayedToGuests });
});

// Einzelnen Wunsch endgültig löschen (z.B. aus der Gespielt-Liste).
app.delete('/api/wishes/:id', requireDashboardAuth, (req, res) => {
  const idx = wishes.findIndex((w) => w.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Wunsch nicht gefunden.' });
  }
  wishes.splice(idx, 1);
  saveWishes();
  broadcastWishes();
  res.status(204).end();
});

// Captive-Portal-Verhalten: JEDE andere GET-Anfrage (egal welche Domain/URL das
// Betriebssystem beim WLAN-Connectivity-Check aufruft) liefert das Formular aus.
// Das lässt die Connectivity-Checks von iOS/Android/Windows fehlschlagen und
// löst dadurch automatisch das Login-Popup aus.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  const isDashboard = checkDashboardAuth(req);
  const guestId = parseCookies(req)[GUEST_COOKIE] || null;
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.isDashboard = isDashboard;
    ws.guestId = guestId;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    wss.emit('connection', ws, req);
  });
});

// Heartbeat: erkennt "eingeschlafene" Verbindungen (z.B. Handy im Hintergrund,
// Netzwerkwechsel), bei denen der Browser kein "close" meldet und der
// Client-seitige Reconnect deshalb nie greift. Ohne Antwort auf den Ping wird
// die Verbindung hart getrennt, das löst beim Client automatisch den
// Reconnect (inkl. frischem Datenstand) aus.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 20000);

function broadcastWishes() {
  const active = sortedActiveWishes();
  const played = sortedPlayedWishes();
  const full = JSON.stringify({
    type: 'wishes',
    active,
    played,
    showPlayedToGuests: settings.showPlayedToGuests
  });
  // Gäste sehen "Bereits gespielt" nur, wenn der DJ es nicht ausgeblendet hat.
  const publicPlayed = visiblePlayedWishes().map(toPublicPlayedWish);
  wss.clients.forEach((client) => {
    if (client.readyState !== client.OPEN) return;
    if (client.isDashboard) {
      client.send(full);
    } else {
      client.send(
        JSON.stringify({
          type: 'wishes',
          wishes: active.map((w) => toPublicWish(w, client.guestId)),
          played: publicPlayed,
          showPlayedToGuests: settings.showPlayedToGuests
        })
      );
    }
  });
}

server.on('error', (err) => {
  if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} ist nicht nutzbar (${err.code}). Anderen Port über die Umgebungsvariable PORT setzen oder Programm mit passenden Rechten starten.`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`hulaloop läuft auf http://0.0.0.0:${PORT}`);
  console.log(`DJ-Dashboard: http://<server-ip>:${PORT}/dashboard`);
  console.log(`${catalog.length} Songs im lokalen Autocomplete-Katalog.`);
});

// Sobald Serato einen Song startet: passenden aktiven Gästewunsch als
// gespielt markieren, oder – falls niemand ihn gewünscht hat – direkt als
// eigene DJ-Auswahl in die "Gespielte Songs"-Liste eintragen.

// Erst hier (bestätigt: lang genug aktuell, siehe serato-watch.js) wandert
// ein Song wirklich in "Gespielte Songs" bzw. wird einem Gästewunsch
// zugeordnet – reines Laden/kurze Korrekturen erzeugen keinen Eintrag.
watchSerato(
  ({ interpret, title }) => {
    const newTitle = interpret ? `${interpret} – ${title}` : title;
    const needle = normalize(`${interpret} ${title}`);
    const wish = wishes.find(
      (w) =>
        !w.played &&
        interpret &&
        w.interpret &&
        normalize(w.interpret) === normalize(interpret) &&
        needle.includes(normalize(title))
    );

    const now = new Date().toISOString();

    if (wish) {
      wish.played = true;
      wish.playedAt = now;
    } else {
      wishes.push({
        id: crypto.randomUUID(),
        songId: null,
        interpret: interpret || null,
        title: newTitle,
        voters: [],
        firstRequestedAt: now,
        lastRequestedAt: now,
        requesters: [],
        messages: [],
        notFound: false,
        played: true,
        playedAt: now,
        moodVotes: {}
      });
    }

    saveWishes();
    broadcastWishes();
  },
  {
    ...(process.env.SERATO_DB_PATH ? { dbPath: process.env.SERATO_DB_PATH } : {})
  }
);
