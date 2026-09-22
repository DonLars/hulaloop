const form = document.getElementById('wish-form');
const songInput = document.getElementById('song-input');
const nameInput = document.getElementById('name');
const suggestionsEl = document.getElementById('suggestions');
const success = document.getElementById('success');
const error = document.getElementById('error');

let selected = null; // { songId } | { wishId } | null (freitext)
let debounceTimer = null;

const NAME_KEY = 'hulaloop_name';

function loadSavedName() {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) nameInput.value = saved;
  } catch {
    // localStorage nicht verfügbar (z.B. privates Fenster) – einfach ignorieren.
  }
}

function saveName() {
  try {
    localStorage.setItem(NAME_KEY, nameInput.value.trim());
  } catch {
    // localStorage nicht verfügbar – Name wird dann einfach nicht gemerkt.
  }
}

loadSavedName();

songInput.addEventListener('input', () => {
  selected = null;
  const query = songInput.value.trim();
  clearTimeout(debounceTimer);

  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/songs/search?q=${encodeURIComponent(query)}`);
      const results = await res.json();
      renderSuggestions(results);
    } catch {
      hideSuggestions();
    }
  }, 200);
});

function renderSuggestions(results) {
  if (!results.length) {
    hideSuggestions();
    return;
  }
  suggestionsEl.innerHTML = results
    .map(
      (r, i) => `
      <li data-index="${i}">
        <span>${escapeHtml(r.interpret || '')}${r.interpret ? ' – ' : ''}${escapeHtml(r.title)}</span>
        ${r.source === 'tonight' ? '<span class="badge">schon gewünscht</span>' : ''}
      </li>`
    )
    .join('');
  suggestionsEl.dataset.results = JSON.stringify(results);
  suggestionsEl.classList.remove('hidden');
}

function hideSuggestions() {
  suggestionsEl.classList.add('hidden');
  suggestionsEl.innerHTML = '';
}

suggestionsEl.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const results = JSON.parse(suggestionsEl.dataset.results || '[]');
  const r = results[Number(li.dataset.index)];
  if (!r) return;

  selected = r.source === 'tonight' ? { wishId: r.wishId } : { songId: r.songId };
  songInput.value = `${r.interpret ? r.interpret + ' – ' : ''}${r.title}`;
  hideSuggestions();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.autocomplete')) hideSuggestions();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.add('hidden');

  const body = {
    title: songInput.value,
    songId: selected?.songId || null,
    wishId: selected?.wishId || null,
    name: nameInput.value,
    nachricht: document.getElementById('nachricht').value
  };

  saveName();

  try {
    const res = await fetch('/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Senden fehlgeschlagen, bitte nochmal versuchen.');
    }

    form.classList.add('hidden');
    success.classList.remove('hidden');
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
  }
});

document.getElementById('again').addEventListener('click', () => {
  form.reset();
  loadSavedName();
  selected = null;
  form.classList.remove('hidden');
  success.classList.add('hidden');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
