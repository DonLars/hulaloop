const list = document.getElementById('wish-list');
const empty = document.getElementById('empty');
const playedList = document.getElementById('played-list');
const playedEmpty = document.getElementById('played-empty');
const playedMoreBtn = document.getElementById('played-more');
const clearPlayedBtn = document.getElementById('clear-played');
const resetAllBtn = document.getElementById('reset-all');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const soundToggle = document.getElementById('sound-toggle');
const playedToggle = document.getElementById('played-toggle');

let soundOn = true;
let knownIds = new Set();
let firstLoad = true;
let countCache = new Map();

const PLAYED_PREVIEW_COUNT = 10;
let playedExpanded = false;

// Eigene, dünn umrandete Icons (gleicher Stil wie die Daumen in der
// Wunschliste) statt Textlabels für die runden Ton-/Vorschau-Buttons.
const SOUND_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SOUND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';
const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12S5.6 5 12 5s10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12S5.6 5 12 5s10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>';

// Klick auf den (durchgestrichenen) Titel selbst zeigt die Sprechblase
// "Der Titel wurde nicht gefunden" (gleicher Stil wie Wunschliste).
function countChip(count) {
  return `<button type="button" class="wish-count ${count > 1 ? 'wish-count-popular' : ''} has-tip" data-tip="${count}x gewünscht" title="Wie oft gewünscht">${count}x</button>`;
}

document.addEventListener('click', (e) => {
  const tip = e.target.closest('.has-tip');
  document.querySelectorAll('.has-tip.open').forEach((el) => {
    if (el !== tip) el.classList.remove('open');
  });
  if (tip) tip.classList.toggle('open');
});

function renderSoundToggle() {
  soundToggle.innerHTML = soundOn ? SOUND_ON_SVG : SOUND_OFF_SVG;
}

soundToggle.addEventListener('click', () => {
  soundOn = !soundOn;
  renderSoundToggle();
});

renderSoundToggle();

function renderPlayedToggle(showPlayedToGuests) {
  playedToggle.innerHTML = showPlayedToGuests ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
}

renderPlayedToggle(true); // sinnvoller Default, bis die echten Daten geladen sind

playedToggle.addEventListener('click', async () => {
  playedToggle.disabled = true;
  try {
    const res = await fetch('/api/dashboard/played-visibility', { method: 'POST' });
    const data = await res.json();
    renderPlayedToggle(data.showPlayedToGuests);
  } finally {
    playedToggle.disabled = false;
  }
});

function formatDateTime(iso) {
  return `${new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

function requesterLabel(wish) {
  const named = wish.requesters.filter((r) => r.name);
  if (named.length === 0) return null;
  const names = [...new Set(named.map((r) => r.name))];
  return names.join(', ');
}

function renderActive(wishes) {
  const newIds = new Set(wishes.map((w) => w.id));
  const hasNew = !firstLoad && [...newIds].some((id) => !knownIds.has(id));
  const hasCountChange = !firstLoad && wishes.some((w) => w.voters.length > (countCache.get(w.id) || 0));

  if (hasNew || hasCountChange) playBeep();

  countCache = new Map(wishes.map((w) => [w.id, w.voters.length]));
  knownIds = newIds;
  firstLoad = false;

  empty.classList.toggle('hidden', wishes.length > 0);
  list.innerHTML = wishes.map(renderWish).join('');
}

function renderPlayed(wishes) {
  playedEmpty.classList.toggle('hidden', wishes.length > 0);
  const hasMore = wishes.length > PLAYED_PREVIEW_COUNT;
  const visible = playedExpanded ? wishes : wishes.slice(0, PLAYED_PREVIEW_COUNT);
  playedList.innerHTML = visible.map(renderPlayedWish).join('');
  playedList.classList.toggle('played-list-fade', hasMore && !playedExpanded);
  playedMoreBtn.classList.toggle('hidden', !hasMore);
  playedMoreBtn.textContent = playedExpanded ? 'Weniger anzeigen' : 'Alle anzeigen';
  playedMoreBtn.title = playedExpanded ? 'Nur die letzten gespielten Songs anzeigen' : 'Weitere gespielte Songs anzeigen';
}

playedMoreBtn.addEventListener('click', () => {
  playedExpanded = !playedExpanded;
  loadInitial();
});

function renderWish(wish) {
  const names = requesterLabel(wish);
  const lastMessage = wish.messages[wish.messages.length - 1];
  const count = wish.voters.length;
  return `
    <div class="wish-time-divider">${formatDateTime(wish.firstRequestedAt)}</div>
    <li class="wish" data-id="${wish.id}">
      <div class="wish-info">
        <div class="wish-headline">
          ${countChip(count)}
          <span class="wish-main"><strong class="wish-title-text ${wish.notFound ? 'not-found has-tip' : ''}" ${wish.notFound ? 'data-tip="Der Titel wurde leider nicht gefunden"' : ''}>${escapeHtml(wish.title)}</strong></span>
        </div>
        ${lastMessage ? `<span class="wish-msg">${names ? `<strong>${escapeHtml(names)}:</strong> ` : ''}${escapeHtml(lastMessage.text)}</span>` : ''}
      </div>
      <div class="wish-side wish-actions">
        <button class="wish-played" data-id="${wish.id}" title="Song als gespielt markieren">gespielt</button>
        <button class="wish-not-found ${wish.notFound ? 'active' : ''}" data-id="${wish.id}" title="${wish.notFound ? 'Wieder als gefunden markieren' : 'Song konnte nicht gefunden werden'}">nicht gefunden</button>
        <button class="wish-delete" data-id="${wish.id}" title="Diesen Wunsch endgültig löschen">löschen</button>
      </div>
    </li>
  `;
}

function renderPlayedWish(wish) {
  const names = requesterLabel(wish);
  const lastMessage = wish.messages[wish.messages.length - 1];
  return `
    <div class="wish-time-divider">${formatDateTime(wish.playedAt)}</div>
    <li class="wish" data-id="${wish.id}">
      <div class="wish-info">
        <span class="wish-main"><strong>${escapeHtml(wish.title)}</strong>${names ? ` <span class="wish-requested-label" title="Gewünscht von ${escapeHtml(names)}">${escapeHtml(names)}</span>` : ''}</span>
        ${lastMessage ? `<span class="wish-msg">${names ? `<strong>${escapeHtml(names)}:</strong> ` : ''}${escapeHtml(lastMessage.text)}</span>` : ''}
      </div>
      <div class="wish-side wish-side-rotate">
        <button class="wish-delete" data-id="${wish.id}" title="Diesen Eintrag endgültig löschen">löschen</button>
      </div>
    </li>
  `;
}

list.addEventListener('click', async (e) => {
  const playedBtn = e.target.closest('.wish-played');
  if (playedBtn) {
    playedBtn.disabled = true;
    try {
      await fetch(`/api/wishes/${playedBtn.dataset.id}/played`, { method: 'POST' });
    } catch {
      playedBtn.disabled = false;
    }
    return;
  }

  const notFoundBtn = e.target.closest('.wish-not-found');
  if (notFoundBtn) {
    notFoundBtn.disabled = true;
    try {
      await fetch(`/api/wishes/${notFoundBtn.dataset.id}/not-found`, { method: 'POST' });
    } finally {
      notFoundBtn.disabled = false;
    }
    return;
  }

  const deleteBtn = e.target.closest('.wish-delete');
  if (deleteBtn) {
    if (!confirm('Diesen Wunsch wirklich unwiderruflich löschen?')) return;
    deleteBtn.disabled = true;
    try {
      await fetch(`/api/wishes/${deleteBtn.dataset.id}`, { method: 'DELETE' });
    } catch {
      deleteBtn.disabled = false;
    }
  }
});

playedList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.wish-delete');
  if (!btn) return;
  if (!confirm('Diesen Eintrag wirklich unwiderruflich löschen?')) return;
  btn.disabled = true;
  try {
    await fetch(`/api/wishes/${btn.dataset.id}`, { method: 'DELETE' });
  } catch {
    btn.disabled = false;
  }
});

clearPlayedBtn.addEventListener('click', async () => {
  if (!confirm('Wirklich alle gespielten Songs unwiderruflich löschen?')) return;
  clearPlayedBtn.disabled = true;
  try {
    await fetch('/api/wishes/played', { method: 'DELETE' });
  } finally {
    clearPlayedBtn.disabled = false;
  }
});

resetAllBtn.addEventListener('click', async () => {
  if (!confirm('Wirklich ALLES zurücksetzen (aktive Wünsche + komplette History) für eine neue Party?')) return;
  resetAllBtn.disabled = true;
  try {
    await fetch('/api/reset', { method: 'POST' });
  } finally {
    resetAllBtn.disabled = false;
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function playBeep() {
  if (!soundOn) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}

async function loadInitial() {
  const res = await fetch('/api/dashboard/wishes');
  const data = await res.json();
  renderActive(data.active);
  renderPlayed(data.played);
  renderPlayedToggle(data.showPlayedToGuests);
}

let currentWs = null;

// Laptop-Standby/Bildschirmschoner pausiert Timer und lässt WebSockets oft
// "hängen", ohne dass der Browser das close-Event auslöst. Sobald das
// Dashboard-Tab wieder sichtbar/aktiv wird, sofort neu laden und die
// Verbindung bei Bedarf neu aufbauen, statt auf einen manuellen Reload oder
// die nächste 10s-Runde zu warten.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  loadInitial();
  if (!currentWs || currentWs.readyState === WebSocket.CLOSED) {
    connect();
  }
});

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.addEventListener('open', () => {
    connDot.classList.add('online');
    connText.textContent = 'verbunden';
  });

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'wishes') {
      renderActive(data.active);
      renderPlayed(data.played);
      renderPlayedToggle(data.showPlayedToGuests);
    }
  });

  ws.addEventListener('close', () => {
    connDot.classList.remove('online');
    connText.textContent = 'getrennt, versuche erneut…';
    setTimeout(connect, 2000);
  });

  ws.addEventListener('error', () => ws.close());

  currentWs = ws;
}

loadInitial();
connect();

// Sicherheitsnetz: unabhängig vom WebSocket-Status regelmäßig neu laden.
setInterval(loadInitial, 10000);
