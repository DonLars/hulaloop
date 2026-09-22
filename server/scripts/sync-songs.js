// Baut die lokale Song-Datenbank für die Offline-Autocomplete (server/data/songs.json).
//
// Läuft NUR vorab, während der PC normal Internet hat (z.B. im Büro des DJs).
// Während der Party selbst braucht der Server danach kein Internet mehr, die
// Autocomplete-Suche läuft komplett gegen die hier erzeugte Datei.
//
// Aufruf: node server/scripts/sync-songs.js

const fs = require('fs');
const path = require('path');

const OUT_FILE = path.join(__dirname, '..', 'data', 'songs.json');
const COUNTRY = 'de';

// Aktuelle Charts (Apple Marketing Tools, kein API-Key nötig).
const CHARTS_URL = `https://rss.applemarketingtools.com/api/v2/${COUNTRY}/music/most-played/100/songs.json`;

// Zusätzliche Suchbegriffe für Genre-/Ären-/Anlass-Vielfalt, die in den
// aktuellen Charts sonst fehlen würde (Partys laufen selten nur nach Top-40).
const SEARCH_TERMS = [
  // Ären
  '60s hits',
  '70s hits',
  '80s party hits',
  '90s party hits',
  '2000s party hits',
  '2010s party hits',
  // Genres
  'rock classics',
  'hard rock classics',
  'punk rock hits',
  'metal classics',
  'hip hop hits',
  'deutschrap hits',
  'r&b hits',
  'soul classics',
  'funk classics',
  'disco classics',
  'house hits',
  'techno hits',
  'edm party hits',
  'reggaeton hits',
  'latin party hits',
  'k-pop hits',
  'indie hits',
  'country hits',
  'schlager party hits',
  'volksmusik hits',
  // Anlässe
  'hochzeit party hits',
  'junggesellenabschied hits',
  'geburtstag party hits',
  'karneval party hits',
  'oktoberfest hits',
  'ballermann hits',
  'charts hits',
  // Bekannte Evergreen-/Party-Interpreten, die in reinen Chart-/Themen-Suchen
  // sonst fehlen würden.
  'Queen',
  'ABBA',
  'Michael Jackson',
  'The Beatles',
  'Beyoncé',
  'Rihanna',
  'Ed Sheeran',
  'Adele',
  'Coldplay',
  'Bruno Mars',
  'Robbie Williams',
  'Helene Fischer',
  'Die Ärzte',
  'Die Toten Hosen',
  'Take That',
  'Whitney Houston',
  'Madonna',
  'Eminem',
  'Shakira',
  'David Guetta',
  'Rolling Stones',
  'Elton John',
  'Stevie Wonder',
  'Prince',
  'Fleetwood Mac',
  'Bee Gees',
  'Earth Wind and Fire',
  'Daft Punk',
  'Calvin Harris',
  'Katy Perry',
  'Lady Gaga',
  'Britney Spears',
  'Backstreet Boys',
  'Spice Girls',
  'Justin Timberlake',
  'Justin Bieber',
  'Ariana Grande',
  'Dua Lipa',
  'The Weeknd',
  'Drake',
  'Kanye West',
  'Snoop Dogg',
  'Kendrick Lamar',
  'Post Malone',
  'Amy Winehouse',
  'AC/DC',
  'Metallica',
  'Nirvana',
  'Guns N Roses',
  'Bon Jovi',
  'U2',
  'Red Hot Chili Peppers',
  'Green Day',
  'Linkin Park',
  'Sido',
  'Cro',
  'Marteria',
  'Peter Fox',
  'Seeed',
  'Culcha Candela',
  'Mark Forster',
  'Wincent Weiss',
  'Namika',
  'Andrea Berg',
  'Roland Kaiser',
  'DJ Ötzi',
  'Mickie Krause',
  'Jürgen Drews'
];

async function fetchJson(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// `rank` = Position innerhalb der jeweiligen Charts-/Suchergebnisse. Beide
// Apple-Endpunkte liefern ihre Treffer bereits nach Popularität/Relevanz
// sortiert, das nutzen wir später für die Autocomplete-Reihenfolge, statt
// z.B. alle ABBA-Songs willkürlich nach Fundstelle im Text zu ordnen.
async function fetchCharts() {
  const data = await fetchJson(CHARTS_URL);
  return (data.feed?.results || []).map((r, rank) => ({
    id: `itunes-${r.id}`,
    interpret: r.artistName,
    title: r.name,
    rank
  }));
}

async function fetchSearchTerm(term) {
  // 200 ist das praktische Maximum, das die iTunes-Search-API pro Anfrage liefert.
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=200&country=${COUNTRY}`;
  const data = await fetchJson(url);
  return (data.results || []).map((r, rank) => ({
    id: `itunes-${r.trackId}`,
    interpret: r.artistName,
    title: r.trackName,
    rank
  }));
}

async function main() {
  const batches = [await fetchCharts()];

  for (const term of SEARCH_TERMS) {
    try {
      batches.push(await fetchSearchTerm(term));
    } catch (err) {
      console.warn(`Warnung: Suchbegriff "${term}" fehlgeschlagen (${err.message}), wird übersprungen.`);
    }
  }

  // Nach Interpret+Titel deduplizieren (nicht nur nach Track-ID), damit
  // Album-/Live-/Remaster-Versionen desselben Songs nicht mehrfach als
  // eigene Autocomplete-Vorschläge auftauchen.
  const byKey = new Map();
  for (const song of batches.flat()) {
    if (!song.id || !song.interpret || !song.title) continue;
    const key = `${song.interpret}|${song.title}`.trim().toLowerCase();
    const existing = byKey.get(key);
    if (!existing || song.rank < existing.rank) byKey.set(key, song);
  }

  const songs = Array.from(byKey.values()).sort((a, b) =>
    `${a.interpret} ${a.title}`.localeCompare(`${b.interpret} ${b.title}`, 'de')
  );

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(songs, null, 2));
  console.log(`${songs.length} Songs gespeichert in ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((err) => {
  console.error('Sync fehlgeschlagen:', err.message);
  process.exit(1);
});
