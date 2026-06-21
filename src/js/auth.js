// ── AUTH ───────────────────────────────────────────────────────────
function getTokenPayload() {
  const token = localStorage.getItem('tl_token');
  if (!token) return null;
  try {
    const { user, exp } = JSON.parse(atob(token.split('.')[0]));
    if (Date.now() > exp) { localStorage.removeItem('tl_token'); return null; }
    return { user };
  } catch { return null; }
}

async function authFetch(url, options = {}) {
  const token = localStorage.getItem('tl_token');
  const headers = { ...(options.headers || {}), 'Authorization': `Bearer ${token}` };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('tl_token');
    document.getElementById('login-overlay').style.display = 'flex';
    throw new Error('session-expired');
  }
  return res;
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  if (!username || !password) { err.textContent = 'Please enter username and password.'; return; }
  btn.disabled = true; err.textContent = '';
  try {
    const res = await fetch(`${WORKER}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) { err.textContent = 'Invalid username or password.'; return; }
    const { token, user } = await res.json();
    localStorage.setItem('tl_token', token);
    currentUser = user;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('login-password').value = '';
    initApp();
  } catch(e) {
    err.textContent = 'Network error. Try again.';
  } finally {
    btn.disabled = false;
  }
}

function logout() {
  localStorage.removeItem('tl_token');
  location.reload();
}

// ── SYNC ───────────────────────────────────────────────────────────
async function syncLookupFromWorker() {
  try {
    const res = await authFetch(`${WORKER}/lookup`);
    if (res.ok) {
      const { lookup: remote } = await res.json();
      lookup = remote;
      localStorage.setItem('tl_lookup', JSON.stringify(lookup));
      return;
    }
  } catch(e) {}
  // Fallback: user static file
  try {
    const res = await fetch(`./users/${currentUser}/loading_lookup.json`);
    if (res.ok) { lookup = await res.json(); localStorage.setItem('tl_lookup', JSON.stringify(lookup)); }
  } catch(e) {}
}

async function syncLookupToGitHub() {
  try {
    await authFetch(`${WORKER}/lookup`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookup, message: 'Update loading lookup' }),
    });
  } catch(e) {}
}

async function syncContextToGitHub(content) {
  try {
    await authFetch(`${WORKER}/context`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, message: 'Update user context' }),
    });
  } catch(e) {}
}

async function syncToGitHub() {
  try {
    // Merge with remote before writing
    const getRes = await authFetch(`${WORKER}/log`);
    if (getRes.ok) {
      const { sessions: remote } = await getRes.json();
      const remoteIds = new Set(remote.map(s => s.id));
      const merged = [...sessions.filter(s => !remoteIds.has(s.id)), ...remote];
      merged.sort((a,b) => b.date.localeCompare(a.date));
      sessions = merged;
      localStorage.setItem('tl_sessions', JSON.stringify(sessions));
    }
    const putRes = await authFetch(`${WORKER}/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions, message: `Add session ${sessions[0]?.date || ''}` }),
    });
    return putRes.ok;
  } catch(e) { return false; }
}

async function pullFromGitHub() {
  try {
    const res = await authFetch(`${WORKER}/log`);
    if (!res.ok) return;
    const { sessions: remote } = await res.json();
    // Remote wins on ID conflicts — GitHub is the source of truth for pulls
    const remoteIds = new Set(remote.map(s => s.id));
    const merged = [...sessions.filter(s => !remoteIds.has(s.id)), ...remote];
    merged.sort((a,b) => b.date.localeCompare(a.date));
    sessions = merged;
    localStorage.setItem('tl_sessions', JSON.stringify(sessions));
  } catch(e) {}
}

function applyContextUpdate(content) {
  userContextMd = content;
  const preview = document.getElementById('user-context-preview');
  if (preview) preview.innerHTML = marked.parse(userContextMd);
  syncContextToGitHub(content);
}

async function resetLookup() {
  localStorage.removeItem('tl_lookup');
  lookup = { exercises: {}, cardio: {} };
  try {
    const res = await fetch(`./users/${currentUser}/loading_lookup.json`);
    if (res.ok) lookup = await res.json();
  } catch(e) {}
  localStorage.setItem('tl_lookup', JSON.stringify(lookup));
  syncLookupToGitHub();
  closeSettings();
  if (document.getElementById('page-history').classList.contains('active')) renderHistory();
}

function applyLookupUpdate(update) {
  if (update.exercises) Object.entries(update.exercises).forEach(([name, vals]) => {
    const key = name.toLowerCase().trim();
    lookup.exercises[key] = { ...(lookup.exercises[key] || {}), ...vals };
  });
  if (update.cardio) Object.entries(update.cardio).forEach(([type, vals]) => {
    lookup.cardio[type] = { ...(lookup.cardio[type] || {}), ...vals };
  });
  localStorage.setItem('tl_lookup', JSON.stringify(lookup));
  syncLookupToGitHub();
}

async function loadContextFiles() {
  try {
    const [coreRes, ctxRes] = await Promise.all([
      fetch('./core-instructions.md'),
      fetch(`./users/${currentUser}/user-context.md`),
    ]);
    if (coreRes.ok) coreInstructions = await coreRes.text();
    if (ctxRes.ok) userContextMd = await ctxRes.text();
  } catch(e) {}
}
