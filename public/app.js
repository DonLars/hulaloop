const form = document.getElementById('wish-form');
const success = document.getElementById('success');
const error = document.getElementById('error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.add('hidden');

  const body = {
    interpret: document.getElementById('interpret').value,
    song: document.getElementById('song').value,
    nachricht: document.getElementById('nachricht').value
  };

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
  form.classList.remove('hidden');
  success.classList.add('hidden');
});
