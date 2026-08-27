// ── EXERCISES ──────────────────────────────────────────────────────
let exCount = 0;

function numOptions(label, max) {
  let o = `<option value="">${label}</option>`;
  for (let i = 1; i <= max; i++) o += `<option value="${i}">${i}</option>`;
  return o;
}

function rpeOptions() {
  let o = '<option value="">RPE</option>';
  for (let i = 5; i <= 10; i += 0.5) o += `<option value="${i}">${i}</option>`;
  return o;
}

// Infer reps/duration and weight/band mode from a stored loading string
// (e.g. autofill from a previous session) so the card renders the right
// controls before the user touches anything.
function detectRepMode(loadingStr) {
  return /x\s*[\d.]+\s*s\b/i.test(loadingStr || '') ? 'duration' : 'reps';
}

function detectLoadMode(loadingStr) {
  const parts = (loadingStr || '').split(',');
  for (const p of parts) {
    const m = p.match(/@\s*(\S+)/);
    if (m && !/^[\d.]+[a-zA-Z]*$/.test(m[1])) return 'band';
  }
  return 'weight';
}

function repsFieldHtml(repMode) {
  return repMode === 'duration'
    ? `<input type="number" min="1" class="ex-reps" placeholder="sec">`
    : `<select class="ex-reps">${numOptions('Reps', 30)}</select>`;
}

function addSetGroup(containerId, loading='', repMode='reps', loadMode='weight') {
  const container = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'ex-set-row';
  const wMatch = loading ? loading.match(/@\s*(\S+)/) : null;
  const weight = wMatch ? wMatch[1] : '';
  row.innerHTML = `
    <select class="ex-sets">${numOptions('Sets', 10)}</select>
    <span class="ex-x">×</span>
    ${repsFieldHtml(repMode)}
    <span class="ex-at">@</span>
    <input type="text" class="ex-weight" placeholder="${loadMode === 'band' ? 'e.g. red' : '20kg'}" value="${weight}">
    <button class="rm-set-btn" onclick="removeSetGroup(this)">−</button>`;
  container.appendChild(row);
  if (loading) {
    const sr = loading.match(/^([\d.]+)\s*x\s*([\d.]+)/i);
    if (sr) { row.querySelector('.ex-sets').value = sr[1]; row.querySelector('.ex-reps').value = sr[2]; }
  }
}

function removeSetGroup(btn) {
  const row = btn.closest('.ex-set-row');
  if (row.parentElement.children.length > 1) row.remove();
}

function addSetGroupForCard(id) {
  const card = document.getElementById('ex-'+id);
  const groupsEl = card.querySelector('.ex-set-groups');
  addSetGroup(groupsEl.id, '', card.dataset.repMode, card.dataset.loadMode);
}

// Reflects card.dataset.repMode/loadMode onto the toggle buttons' active state.
function syncModeButtons(card) {
  card.querySelectorAll('[data-rep-mode]').forEach(b => b.classList.toggle('active', b.dataset.repMode === (card.dataset.repMode || 'reps')));
  card.querySelectorAll('[data-load-mode]').forEach(b => b.classList.toggle('active', b.dataset.loadMode === (card.dataset.loadMode || 'weight')));
}

function setRepMode(id, mode) {
  const card = document.getElementById('ex-'+id);
  card.dataset.repMode = mode;
  syncModeButtons(card);
  card.querySelectorAll('.ex-set-row').forEach(row => {
    const old = row.querySelector('.ex-reps');
    const el = mode === 'duration'
      ? Object.assign(document.createElement('input'), { type: 'number', min: '1', className: 'ex-reps', placeholder: 'sec' })
      : Object.assign(document.createElement('select'), { className: 'ex-reps', innerHTML: numOptions('Reps', 30) });
    old.replaceWith(el);
  });
}

function setLoadMode(id, mode) {
  const card = document.getElementById('ex-'+id);
  card.dataset.loadMode = mode;
  syncModeButtons(card);
  card.querySelectorAll('.ex-weight').forEach(inp => { inp.placeholder = mode === 'band' ? 'e.g. red' : '20kg'; });
}

function knownExerciseNames() {
  const names = new Set(wikiExercises);
  sessions.forEach(s => (s.exercises || []).forEach(e => { if (e.name) names.add(e.name.toLowerCase()); }));
  return [...names].sort();
}

function findLastExerciseData(name) {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  for (const s of sessions) {
    if ((s.user || 'Cas') !== currentUser) continue;
    const ex = (s.exercises || []).find(e => e.name && e.name.toLowerCase() === q);
    if (ex) return ex;
  }
  return null;
}

function applyExerciseAutofill(input) {
  const data = findLastExerciseData(input.value);
  if (!data) return;
  const card = input.closest('.ex-card');
  card.dataset.repMode = detectRepMode(data.loading);
  card.dataset.loadMode = detectLoadMode(data.loading);
  syncModeButtons(card);
  const groupsEl = card.querySelector('.ex-set-groups');
  groupsEl.innerHTML = '';
  const parts = data.loading ? data.loading.split(',').map(p => p.trim()).filter(Boolean) : [];
  if (parts.length) parts.forEach(p => addSetGroup(groupsEl.id, p, card.dataset.repMode, card.dataset.loadMode));
  else addSetGroup(groupsEl.id, '', card.dataset.repMode, card.dataset.loadMode);
  card.querySelector('.ex-rpe').value = data.rpe ? data.rpe.replace('RPE', '') : '';
}

function wireExerciseAutocomplete(input) {
  const row = input.closest('.ex-name-row');
  let activeIdx = -1;

  function removeSuggestions() {
    const el = row.querySelector('.ex-suggestions');
    if (el) el.remove();
    activeIdx = -1;
  }

  function showSuggestions(matches) {
    removeSuggestions();
    if (!matches.length) return;
    const box = document.createElement('div');
    box.className = 'ex-suggestions';
    matches.forEach((m, i) => {
      const item = document.createElement('div');
      item.className = 'ex-suggestion';
      item.textContent = m;
      item.addEventListener('mousedown', e => { e.preventDefault(); input.value = m; removeSuggestions(); applyExerciseAutofill(input); });
      box.appendChild(item);
    });
    row.appendChild(box);
  }

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { removeSuggestions(); return; }
    const matches = knownExerciseNames().filter(n => n.includes(q) && n !== q);
    showSuggestions(matches.slice(0, 6));
    activeIdx = -1;
  });

  input.addEventListener('keydown', e => {
    const items = [...(row.querySelectorAll('.ex-suggestion') || [])];
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      input.value = items[activeIdx].textContent;
      removeSuggestions();
      applyExerciseAutofill(input);
      return;
    } else if (e.key === 'Escape') {
      removeSuggestions(); return;
    } else { return; }
    items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
  });

  input.addEventListener('blur', () => setTimeout(removeSuggestions, 150));
  input.addEventListener('change', () => applyExerciseAutofill(input));
}

function addExercise(d={}) {
  const id = exCount++;
  const groupsId = `ex-${id}-groups`;
  const repMode = detectRepMode(d.loading);
  const loadMode = detectLoadMode(d.loading);
  const card = document.createElement('div');
  card.className = 'ex-card'; card.id = 'ex-'+id;
  card.dataset.repMode = repMode;
  card.dataset.loadMode = loadMode;
  card.innerHTML = `
    <div class="ex-name-row">
      <input type="text" placeholder="e.g. pull-ups" value="${d.name||''}">
      <button class="rm-btn" onclick="document.getElementById('ex-${id}').remove()">×</button>
    </div>
    <div class="ex-mode-row">
      <div class="metric-toggle">
        <button type="button" class="metric-btn" data-rep-mode="reps" onclick="setRepMode(${id},'reps')">Reps</button>
        <button type="button" class="metric-btn" data-rep-mode="duration" onclick="setRepMode(${id},'duration')">Duration</button>
      </div>
      <div class="metric-toggle">
        <button type="button" class="metric-btn" data-load-mode="weight" onclick="setLoadMode(${id},'weight')">Weight</button>
        <button type="button" class="metric-btn" data-load-mode="band" onclick="setLoadMode(${id},'band')">Band</button>
      </div>
    </div>
    <div class="ex-set-groups" id="${groupsId}"></div>
    <div class="ex-footer-row">
      <button class="add-set-btn" onclick="addSetGroupForCard(${id})">+ set</button>
      <select class="ex-rpe">${rpeOptions()}</select>
    </div>`;
  document.getElementById('exercises').appendChild(card);
  syncModeButtons(card);
  wireExerciseAutocomplete(card.querySelector('.ex-name-row input'));
  const parts = d.loading ? d.loading.split(',').map(p => p.trim()).filter(Boolean) : [];
  if (parts.length) parts.forEach(p => addSetGroup(groupsId, p, repMode, loadMode));
  else addSetGroup(groupsId, '', repMode, loadMode);
  if (d.rpe) card.querySelector('.ex-rpe').value = d.rpe.replace('RPE', '');
}

function normalizeWeight(raw) {
  raw = raw.trim();
  if (!raw) return '';
  const m = raw.match(/^([\d.]+)\s*[a-zA-Z]*/);
  // Numeric weight (any unit or no unit) → normalise to kg
  if (m) return `${m[1]}kg`;
  // Non-numeric (e.g. "resistance bands") → keep as-is
  return raw;
}

function getExercises() {
  return [...document.querySelectorAll('#exercises .ex-card')].map(card => {
    const name = card.querySelector('.ex-name-row input').value.trim().toLowerCase();
    const rpe = card.querySelector('.ex-rpe').value;
    const repMode = card.dataset.repMode || 'reps';
    const loadMode = card.dataset.loadMode || 'weight';
    const loadings = [...card.querySelectorAll('.ex-set-row')].map(sr => {
      const sets = sr.querySelector('.ex-sets').value;
      const repsVal = sr.querySelector('.ex-reps').value;
      const rawWeight = sr.querySelector('.ex-weight').value.trim();
      if (!sets && !repsVal && !rawWeight) return null;
      const weight = loadMode === 'band' ? rawWeight : normalizeWeight(rawWeight);
      const repsStr = repsVal ? (repMode === 'duration' ? `${repsVal}s` : repsVal) : '';
      return (sets && repsStr ? `${sets}x${repsStr}` : (sets || repsStr || '')) + (weight ? `@${weight}` : '');
    }).filter(Boolean);
    return { name, loading: loadings.join(', '), rpe: rpe ? `RPE${rpe}` : '' };
  }).filter(e => e.name);
}
