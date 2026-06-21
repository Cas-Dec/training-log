// ── NAVIGATION ─────────────────────────────────────────────────────
function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('page-'+p).classList.add('active');
  document.querySelectorAll('.nav-tab')[['log','history','coach'].indexOf(p)].classList.add('active');
  if (p==='history') renderHistory();
}

// ── SETTINGS ───────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('settings-modal').classList.add('active');
  const preview = document.getElementById('user-context-preview');
  preview.innerHTML = userContextMd
    ? marked.parse(userContextMd)
    : '<span style="color:var(--muted);font-style:italic">No user context loaded — use Edit with Coach to create one.</span>';
}

function closeSettings() { document.getElementById('settings-modal').classList.remove('active'); }

// ── EXPORT ─────────────────────────────────────────────────────────
function exportJSON() {
  dl(JSON.stringify(sessions, null, 2), 'training-log.json', 'application/json');
}

function exportCSV() {
  const rows = [['date','type','energy','sleep','recovery','kps_morning','kps_post','exercises','notes']];
  sessions.forEach(s => rows.push([s.date, s.type, s.energy||'', s.sleep||'', s.recovery||'',
    s.kps?.morning||'', s.kps?.post||'',
    (s.exercises||[]).map(e=>`${e.name} ${e.loading} ${e.rpe}`).join('; '),
    (s.notes||'').replace(/"/g,"'")]));
  dl(rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n'), 'training-log.csv', 'text/csv');
}

function dl(content, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type}));
  a.download = filename; a.click();
}

// ── INIT ───────────────────────────────────────────────────────────
function updateKPSVisibility() {
  const isCas = currentUser === 'Cas';
  document.getElementById('kps-section').style.display = isCas ? '' : 'none';
  document.getElementById('calibrate-btn').style.display = isCas ? '' : 'none';
}

function initApp() {
  document.getElementById('nav-user').textContent = currentUser;
  updateKPSVisibility();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date').value    = today;
  document.getElementById('bw-date').value = today;
  onTypeChange();
  loadContextFiles();
  // Render history only after BOTH lookup and sessions are ready, so patellar loads are correct
  Promise.all([syncLookupFromWorker(), pullFromGitHub(), syncBodyweightFromWorker()]).then(() => {
    renderBwRecent();
    if (document.getElementById('page-history').classList.contains('active')) renderHistory();
  });
}

async function loadAll() {
  try { sessions = JSON.parse(localStorage.getItem('tl_sessions') || '[]'); } catch(e) { sessions = []; }
  // Seed lookup from localStorage while we wait for the worker; discard stale pre-Running/Cycling cache
  try {
    const s = localStorage.getItem('tl_lookup');
    if (s) {
      const cached = JSON.parse(s);
      const isStale = cached.cardio?.Cardio && !cached.cardio?.Running;
      if (isStale) localStorage.removeItem('tl_lookup');
      else lookup = cached;
    }
  } catch(e) {}

  const payload = getTokenPayload();
  if (!payload) { document.getElementById('login-overlay').style.display = 'flex'; return; }
  currentUser = payload.user;
  initApp();
}

loadAll();
