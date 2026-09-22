const form = document.getElementById('login-form');
const error = document.getElementById('error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.add('hidden');

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/dashboard/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      throw new Error('Benutzername oder Passwort falsch.');
    }

    location.href = '/dashboard';
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('hidden');
  }
});
