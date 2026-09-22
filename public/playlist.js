const list = document.getElementById('wish-list');
const empty = document.getElementById('empty');
const playedSection = document.getElementById('played-section');
const playedList = document.getElementById('played-list');
const playedEmpty = document.getElementById('played-empty');
const playedMoreBtn = document.getElementById('played-more');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');

const PLAYED_PREVIEW_COUNT = 10;
let playedExpanded = false;

// Eigenes, dünn umrandetes Daumen-Icon (kein Standard-Emoji) für die mobile
// Abstimmen-Spalte. "Runter" ist dieselbe Form, im eigenen viewBox gespiegelt.
const THUMB_UP_SVG = `<svg class="btn-thumb" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z"/><path d="M7 11l3.6-6.7c.3-.6 1-.9 1.7-.7c1 .3 1.6 1.4 1.2 2.4L12.5 9H18a2 2 0 0 1 1.9 2.6l-1.9 6A2 2 0 0 1 16.1 19H7"/></svg>`;
const THUMB_DOWN_SVG = `<svg class="btn-thumb" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="translate(0,24) scale(1,-1)"><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z"/><path d="M7 11l3.6-6.7c.3-.6 1-.9 1.7-.7c1 .3 1.6 1.4 1.2 2.4L12.5 9H18a2 2 0 0 1 1.9 2.6l-1.9 6A2 2 0 0 1 16.1 19H7"/></g></svg>`;
// Gleiche Strichstärke/Stil wie die Daumen-Icons, damit Größe & Optik angeglichen sind.
const CLOSE_SVG = `<svg class="btn-thumb" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

function countChip(count) {
  return `<button type="button" class="wish-count ${count > 1 ? 'wish-count-popular' : ''} has-tip" data-tip="${count}x gewünscht" title="Wie oft gewünscht">${count}x</button>`;
}

// Klick auf Info-Icon/Zähler-Chip zeigt/versteckt die Sprechblase; Klick woanders schließt sie.
document.addEventListener('click', (e) => {
  const tip = e.target.closest('.has-tip');
  document.querySelectorAll('.has-tip.open').forEach((el) => {
    if (el !== tip) el.classList.remove('open');
  });
  if (tip) tip.classList.toggle('open');
});

function renderList(wishes) {
  empty.classList.toggle('hidden', wishes.length > 0);
  list.innerHTML = wishes.map(renderWish).join('');
}

function renderPlayedList(played, showPlayedToGuests) {
  playedSection.classList.toggle('hidden', !showPlayedToGuests);
  if (!showPlayedToGuests) return;
  playedEmpty.classList.toggle('hidden', played.length > 0);
  const hasMore = played.length > PLAYED_PREVIEW_COUNT;
  const visible = playedExpanded ? played : played.slice(0, PLAYED_PREVIEW_COUNT);
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

function renderPlayedWish(wish) {
  return `
    <li class="wish">
      <div class="wish-info">
        <div class="wish-title-row">
          <span class="wish-time">${formatDateTime(wish.playedAt)}</span>
          <span class="wish-main">${escapeHtml(wish.title)}</span>
        </div>
      </div>
    </li>
  `;
}

function formatDateTime(iso) {
  return `${new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

function renderWish(wish) {
  const voteTitle = wish.votedByMe ? 'Stimme zurückziehen' : 'Nach oben schieben';
  const action = wish.isMine
    ? `<button class="wish-remove-mine" data-id="${wish.id}" title="Deinen Wunsch zurückziehen" aria-label="Deinen Wunsch zurückziehen"><span class="btn-icon">X</span>${CLOSE_SVG}</button>`
    : `<button class="wish-vote ${wish.votedByMe ? 'minus' : 'plus'}" data-id="${wish.id}" title="${voteTitle}" aria-label="${voteTitle}"><span class="btn-icon">${wish.votedByMe ? '−' : '+'}</span>${wish.votedByMe ? THUMB_DOWN_SVG : THUMB_UP_SVG} <span class="btn-label">${wish.votedByMe ? 'zurücknehmen' : 'abstimmen'}</span></button>`;
  return `
    <li class="wish" data-id="${wish.id}">
      <div class="wish-info">
        <div class="wish-headline">
          ${countChip(wish.count)}
          <span class="wish-main"><span class="wish-title-text ${wish.notFound ? 'not-found has-tip' : ''}" ${wish.notFound ? 'data-tip="Der Titel wurde leider nicht gefunden"' : ''}>${escapeHtml(wish.title)}</span></span>
        </div>
      </div>
      <div class="wish-side ${wish.isMine ? 'wish-side-remove' : 'wish-side-vote'}">${action}</div>
    </li>
  `;
}

list.addEventListener('click', async (e) => {
  const voteBtn = e.target.closest('.wish-vote');
  if (voteBtn) {
    voteBtn.disabled = true;
    try {
      const res = await fetch(`/api/wishes/${voteBtn.dataset.id}/vote`, { method: 'POST' });
      if (!res.ok) throw new Error();
      loadInitial(); // sofortiges Update, unabhängig vom WebSocket-Status
    } catch {
      voteBtn.disabled = false;
    }
    return;
  }

  const removeBtn = e.target.closest('.wish-remove-mine');
  if (removeBtn) {
    removeBtn.disabled = true;
    try {
      const res = await fetch(`/api/wishes/${removeBtn.dataset.id}/mine`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      loadInitial();
    } catch {
      removeBtn.disabled = false;
    }
  }
});

// Mobiles Wischen (Touch-Events, laufen auf Desktop ohne Touchscreen gar
// nicht erst an): bei fremden Wünschen nach links = abstimmen, nach rechts =
// Stimme zurückziehen; bei eigenen Wünschen nach links = löschen.
// Nutzt denselben Button/Klick-Handler wie oben, nur programmatisch ausgelöst.
const SWIPE_THRESHOLD = 70;
let swipe = null;

list.addEventListener('touchstart', (e) => {
  const li = e.target.closest('.wish');
  if (!li) return;
  const voteBtn = li.querySelector('.wish-vote');
  const removeBtn = li.querySelector('.wish-remove-mine');
  const btn = voteBtn || removeBtn;
  if (!btn) return;
  const touch = e.touches[0];
  swipe = { li, btn, mode: voteBtn ? 'vote' : 'remove', startX: touch.clientX, startY: touch.clientY, dx: 0, horizontal: null };
  li.style.transition = 'none';
}, { passive: true });

list.addEventListener('touchmove', (e) => {
  if (!swipe) return;
  const touch = e.touches[0];
  const dx = touch.clientX - swipe.startX;
  const dy = touch.clientY - swipe.startY;
  if (swipe.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
    swipe.horizontal = Math.abs(dx) > Math.abs(dy);
  }
  if (!swipe.horizontal) return;
  e.preventDefault();
  let active;
  if (swipe.mode === 'vote') {
    const canVote = swipe.btn.classList.contains('plus');
    const canRetract = swipe.btn.classList.contains('minus');
    active = (dx < 0 && canVote) || (dx > 0 && canRetract);
  } else {
    active = dx < 0; // Löschen geht nur nach links
  }
  const clamped = Math.max(-120, Math.min(120, dx));
  swipe.dx = active ? clamped : clamped * 0.25; // Widerstand, wenn die Richtung nichts auslöst
  swipe.li.style.transform = `translateX(${swipe.dx}px)`;
  swipe.li.classList.toggle('swipe-vote', swipe.mode === 'vote' && active && dx < 0);
  swipe.li.classList.toggle('swipe-retract', swipe.mode === 'vote' && active && dx > 0);
}, { passive: false });

function endSwipe(trigger) {
  if (!swipe) return;
  const { li, btn, mode, dx } = swipe;
  li.style.transition = 'transform 0.2s ease';
  li.style.transform = '';
  li.classList.remove('swipe-vote', 'swipe-retract');
  if (trigger) {
    if (mode === 'vote') {
      const canVote = btn.classList.contains('plus');
      const canRetract = btn.classList.contains('minus');
      if (dx <= -SWIPE_THRESHOLD && canVote) btn.click();
      else if (dx >= SWIPE_THRESHOLD && canRetract) btn.click();
    } else if (dx <= -SWIPE_THRESHOLD) {
      btn.click();
    }
  }
  swipe = null;
}

list.addEventListener('touchend', () => endSwipe(true));
list.addEventListener('touchcancel', () => endSwipe(false));

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadInitial() {
  const res = await fetch('/api/wishes');
  const data = await res.json();
  renderList(data.wishes);
  renderPlayedList(data.played, data.showPlayedToGuests);
}

let currentWs = null;

// Mobile Browser pausieren WebSockets oft, sobald der Tab in den Hintergrund
// geht (Bildschirm aus, App-Wechsel). Sobald die Seite wieder sichtbar wird,
// sofort neu laden und die Verbindung bei Bedarf neu aufbauen, statt auf
// einen manuellen Reload zu warten.
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
      renderList(data.wishes);
      renderPlayedList(data.played, data.showPlayedToGuests);
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
// Verhindert, dass die Seite dauerhaft veraltet bleibt, falls die
// Live-Verbindung aus irgendeinem Grund lautlos hängen bleibt.
setInterval(loadInitial, 10000);
