/**
 * Training Log — Cloudflare Worker
 *
 * Deploy this to your Cloudflare Worker (claude-proxy.casdecancq.workers.dev).
 * Set the following environment variables in the Cloudflare dashboard (Settings → Variables):
 *
 *   ANTHROPIC_API_KEY   — your Anthropic API key (sk-ant-…)
 *   GITHUB_TOKEN        — GitHub personal access token (repo scope)
 *   GITHUB_USER         — GitHub username (e.g. Cas-Dec)
 *   GITHUB_REPO         — repository name (e.g. training-log)
 *   CAS_PASSWORD_HASH   — SHA-256 hex hash of Cas's password (see below)
 *   DRIES_PASSWORD_HASH — SHA-256 hex hash of Dries's password
 *   SESSION_SECRET      — a random string ≥ 32 characters
 *
 * To generate a password hash, run this in any browser console:
 *   async function h(pw) {
 *     const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
 *     return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
 *   }
 *   h('your-password').then(console.log);
 *
 * Endpoints:
 *   POST /login   { username, password } → { token, user }   (no auth required)
 *   GET  /log     → { sessions, sha }                        (auth required)
 *   PUT  /log     { sessions, message } → { ok }             (auth required)
 *   POST /chat    Anthropic messages body → Anthropic response (auth required)
 */

const GITHUB_API = 'https://api.github.com';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createToken(user, secret) {
  const payload = btoa(JSON.stringify({ user, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSign(payload, secret);
  if (sig !== expected) return null;
  try {
    const { user, exp } = JSON.parse(atob(payload));
    if (Date.now() > exp) return null;
    return { user };
  } catch {
    return null;
  }
}

async function getSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return token ? verifyToken(token, env.SESSION_SECRET) : null;
}

function githubHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'training-log-worker',
  };
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // ── POST /login ───────────────────────────────────────────────────
    if (url.pathname === '/login' && request.method === 'POST') {
      const { username = '', password = '' } = await request.json().catch(() => ({}));
      const hash = await sha256hex(password);

      let user = null;
      if (username.toLowerCase() === 'cas' && hash === env.CAS_PASSWORD_HASH) user = 'Cas';
      else if (username.toLowerCase() === 'dries' && hash === env.DRIES_PASSWORD_HASH) user = 'Dries';

      if (!user) return jsonResponse({ error: 'Invalid credentials' }, 401);
      const token = await createToken(user, env.SESSION_SECRET);
      return jsonResponse({ token, user });
    }

    // ── Auth gate ─────────────────────────────────────────────────────
    const session = await getSession(request, env);
    if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

    // ── GET /log ──────────────────────────────────────────────────────
    if (url.pathname === '/log' && request.method === 'GET') {
      const res = await fetch(
        `${GITHUB_API}/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/log.json`,
        { headers: githubHeaders(env.GITHUB_TOKEN) }
      );
      if (!res.ok) return jsonResponse({ sessions: [], sha: null });
      const data = await res.json();
      const sessions = JSON.parse(fromBase64(data.content));
      return jsonResponse({ sessions, sha: data.sha });
    }

    // ── PUT /log ──────────────────────────────────────────────────────
    if (url.pathname === '/log' && request.method === 'PUT') {
      const { sessions, message } = await request.json();
      const logUrl = `${GITHUB_API}/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/log.json`;

      let sha = null;
      const existing = await fetch(logUrl, { headers: githubHeaders(env.GITHUB_TOKEN) });
      if (existing.ok) sha = (await existing.json()).sha;

      const content = toBase64(JSON.stringify(sessions, null, 2));
      const res = await fetch(logUrl, {
        method: 'PUT',
        headers: githubHeaders(env.GITHUB_TOKEN),
        body: JSON.stringify({ message: message || 'Update log', content, ...(sha ? { sha } : {}) }),
      });
      return jsonResponse({ ok: res.ok }, res.ok ? 200 : res.status);
    }

    // ── POST /chat ────────────────────────────────────────────────────
    if (url.pathname === '/chat' && request.method === 'POST') {
      const body = await request.text();
      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body,
      });
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
