const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 80;
const DATA_FILE = path.join(__dirname, 'data', 'wishes.json');

function loadWishes() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveWishes(wishes) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(wishes, null, 2));
}

const wishes = loadWishes();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('/api/wishes', (req, res) => {
  res.json(wishes);
});

app.post('/api/wishes', (req, res) => {
  const interpret = (req.body.interpret || '').trim().slice(0, 200);
  const song = (req.body.song || '').trim().slice(0, 200);
  const nachricht = (req.body.nachricht || '').trim().slice(0, 500);

  if (!interpret || !song) {
    return res.status(400).json({ error: 'Interpret und Song sind Pflichtfelder.' });
  }

  const wish = {
    id: crypto.randomUUID(),
    interpret,
    song,
    nachricht,
    timestamp: new Date().toISOString()
  };

  wishes.unshift(wish);
  saveWishes(wishes);
  broadcast(wish);

  res.status(201).json(wish);
});

// Captive-Portal-Verhalten: JEDE andere GET-Anfrage (egal welche Domain/URL das
// Betriebssystem beim WLAN-Connectivity-Check aufruft) liefert das Formular aus.
// Das lässt die Connectivity-Checks von iOS/Android/Windows fehlschlagen und
// löst dadurch automatisch das Login-Popup aus.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(wish) {
  const payload = JSON.stringify({ type: 'wish', wish });
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
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
});
