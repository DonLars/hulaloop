// Beobachtet Serato DJ Pros Datenbank (SQLite) und meldet Songs aus der
// `history_entry`-Tabelle, sobald sie wirklich gespielt wurden.
//
// Wichtige Einschränkung: Serato legt einen history_entry offenbar schon
// beim bloßen LADEN eines Songs auf ein Deck an, nicht erst beim
// tatsächlichen Abspielen (ähnliches Problem wie bei VirtualDJs
// database.xml) – und das auch, wenn der DJ nur kurz vorhören will. Ein
// Live-"Gerade läuft"/"Als Nächstes" für Gäste würde also auch reines
// Vorhören/Cuen zeigen, was niemand sehen muss. Deshalb meldet dieses Modul
// nur noch EIN Signal, `onSongPlayed`, und das ausschließlich NACHTRÄGLICH:
// erst wenn der nächste Song geladen wurde UND der vorherige mindestens
// `minPlaySeconds` lang "aktuell" war (filtert kurze Lade-Korrekturen bzw.
// reines Vorhören raus, das nie wirklich lief) – erst dann wandert er
// wirklich in die Gespielt-Liste.
//
// Läuft komplett lokal (Datei auf demselben Rechner), braucht kein Internet.

const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DB_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Serato',
  'Library',
  'master.sqlite'
);
const POLL_INTERVAL_MS = 2000;
// Fallback, falls Serato keine Songlänge kennt.
const DEFAULT_SONG_LENGTH_SECONDS = 240;
// Wie lange nach Songende (Songlänge+Puffer) noch gewartet wird, bevor der
// Song endgültig als fertig gespielt bestätigt wird.
const STOP_BUFFER_SECONDS = 90;
// Wie lange ein Song mindestens "aktuell" gewesen sein muss, bevor er als
// wirklich gespielt gilt (filtert kurze Lade-Korrekturen/reines Vorhören raus).
const DEFAULT_MIN_PLAY_SECONDS = 20;

function watchSerato(onSongPlayed, { dbPath = DEFAULT_DB_PATH, minPlaySeconds = DEFAULT_MIN_PLAY_SECONDS } = {}) {
  if (!fs.existsSync(dbPath)) {
    console.log('Serato-Datenbank nicht gefunden, automatische Erkennung deaktiviert:', dbPath);
    return { stop: () => {} };
  }

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.error('Serato-Datenbank konnte nicht geöffnet werden:', err.message);
    return { stop: () => {} };
  }

  const query = db.prepare(
    'SELECT artist, name, start_time, length_sec FROM history_entry ORDER BY start_time DESC LIMIT 1'
  );

  let watermark = 0;
  let baselineReady = false;
  let expiresAt = null;
  let stoppedSignaled = false;
  let pending = null; // zuletzt geladener, noch unbestätigter Song

  const expiryFor = (entry) =>
    entry.start_time + (entry.length_sec || DEFAULT_SONG_LENGTH_SECONDS) + STOP_BUFFER_SECONDS;

  function confirmPending(untilTime) {
    if (pending && untilTime - pending.start_time >= minPlaySeconds) {
      onSongPlayed({ interpret: pending.artist, title: pending.name });
    }
    pending = null;
  }

  function check() {
    try {
      const latest = query.get();
      if (!latest) return;

      if (!baselineReady) {
        watermark = latest.start_time;
        baselineReady = true;
        pending = latest;
        expiresAt = expiryFor(latest);
        console.log('Serato-History-Beobachtung gestartet.');
        return;
      }

      if (latest.start_time > watermark) {
        confirmPending(latest.start_time);
        pending = latest;
        watermark = latest.start_time;
        expiresAt = expiryFor(latest);
        stoppedSignaled = false;
      } else if (!stoppedSignaled && expiresAt && Date.now() / 1000 > expiresAt) {
        stoppedSignaled = true;
        confirmPending(Date.now() / 1000);
      }
    } catch (err) {
      console.error('Fehler beim Prüfen der Serato-History:', err.message);
    }
  }

  check();
  const timer = setInterval(check, POLL_INTERVAL_MS);
  return {
    stop: () => {
      clearInterval(timer);
      db.close();
    }
  };
}

module.exports = { watchSerato };
