const list = document.getElementById('wish-list');
const empty = document.getElementById('empty');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const soundToggle = document.getElementById('sound-toggle');

let soundOn = true;
soundToggle.addEventListener('click', () => {
  soundOn = !soundOn;
  soundToggle.textContent = soundOn ? '🔔 Ton an' : '🔕 Ton aus';
});

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderWish(wish, { prepend = false } = {}) {
  empty.classList.add('hidden');
  const li = document.createElement('li');
  li.className = 'wish';
  li.innerHTML = `
    <span class="wish-time">${formatTime(wish.timestamp)}</span>
    <span class="wish-main"><strong>${escapeHtml(wish.interpret)}</strong> – ${escapeHtml(wish.song)}</span>
    ${wish.nachricht ? `<span class="wish-msg">${escapeHtml(wish.nachricht)}</span>` : ''}
  `;
  if (prepend) {
    list.prepend(li);
  } else {
    list.appendChild(li);
  }
}

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
  const res = await fetch('/api/wishes');
  const wishes = await res.json();
  if (wishes.length === 0) {
    empty.classList.remove('hidden');
  }
  wishes.forEach((wish) => renderWish(wish));
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.addEventListener('open', () => {
    connDot.classList.add('online');
    connText.textContent = 'verbunden';
  });

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'wish') {
      renderWish(data.wish, { prepend: true });
      playBeep();
    }
  });

  ws.addEventListener('close', () => {
    connDot.classList.remove('online');
    connText.textContent = 'getrennt, versuche erneut…';
    setTimeout(connect, 2000);
  });

  ws.addEventListener('error', () => ws.close());
}

loadInitial();
connect();
