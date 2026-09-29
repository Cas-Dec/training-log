// ── STRAIN CALIBRATION ─────────────────────────────────────────────
// When Cas logs an exercise that has never been logged before and has no
// lookup entry, a short wizard asks whether the logged weight is added on top
// of bodyweight (e1rm_bodyweight, for the e1RM chart), whether it loads the
// patellar tendon, whether the knee carries bodyweight, and then which IMPACT
// level (LOADING_MODEL.impact_scale) the strain felt like. The level's midpoint
// is used to back-solve the new exercise's strain_factor.
// The same wizard runs from Settings over every logged exercise still missing
// from the lookup (or only missing e1rm_bodyweight), to backfill the database.

let cal = null;

function escHtml(s) {
  return (s + '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Exercises logged in this session that Cas has never logged before and that
// have no lookup entry yet. Must run before the session is added to `sessions`.
function newPatellarCandidates(exercises) {
  if (currentUser !== 'Cas') return [];
  const seen = new Set();
  return (exercises || []).filter(e => {
    const key = (e.name || '').toLowerCase().trim();
    if (!key || seen.has(key) || key in lookup.exercises || findLastExerciseData(key)) return false;
    seen.add(key);
    return true;
  });
}

// Every exercise Cas has logged that has no lookup entry, or whose entry lacks
// e1rm_bodyweight (e1rmOnly: only that question is asked), most recently logged
// first, each with its logged loadings (newest first) to calibrate against.
function missingStrainExercises() {
  const byKey = new Map();
  sessions.forEach(s => {
    if ((s.user || 'Cas') !== 'Cas' || CARDIO_TYPES.includes(s.type)) return;
    (s.exercises || []).forEach(e => {
      const key = (e.name || '').toLowerCase().trim();
      const entry = lookup.exercises[key];
      if (!key || (entry && 'e1rm_bodyweight' in entry)) return;
      if (!byKey.has(key)) byKey.set(key, { name: key, history: [], e1rmOnly: !!entry });
      byKey.get(key).history.push({ loading: e.loading, rpe: e.rpe, date: s.date });
    });
  });
  return [...byKey.values()];
}

function updateStrainBackfillBtn() {
  const btn = document.getElementById('strain-backfill-btn');
  if (!btn) return;
  const n = currentUser === 'Cas' ? missingStrainExercises().length : 0;
  btn.style.display = n ? '' : 'none';
  btn.textContent = `Complete exercise database (${n} exercise${n === 1 ? '' : 's'} incomplete)`;
}

function startStrainBackfill() {
  closeSettings();
  startStrainCalibration(missingStrainExercises(), true);
}

function startStrainCalibration(exercises, backfill = false) {
  if (!exercises.length) return;
  cal = { queue: exercises.slice(), total: exercises.length, backfill };
  nextStrainCalibration();
}

function nextStrainCalibration() {
  const ex = cal?.queue.shift();
  if (!ex) { closeStrainModal(); return; }
  const history = ex.history || [{ loading: ex.loading, rpe: ex.rpe, date: null }];
  cal = {
    queue: cal.queue, total: cal.total, backfill: cal.backfill,
    key: ex.name.toLowerCase().trim(), e1rmOnly: !!ex.e1rmOnly, history, ...history[0],
  };
  document.getElementById('strain-modal').classList.add('active');
  renderStrainStep('e1rm');
}

function setE1rmBodyweight(val) {
  cal.e1rmBw = val;
  if (!cal.e1rmOnly) { renderStrainStep('tendon'); return; }
  applyLookupUpdate({ exercises: { [cal.key]: { e1rm_bodyweight: val } } });
  nextStrainCalibration();
}

function closeStrainModal() {
  document.getElementById('strain-modal').classList.remove('active');
  cal = null;
}

// "today's squats" for a just-logged exercise, "your squats on 2026-09-21" when backfilling.
function strainWhen() {
  return cal.date ? `your ${escHtml(cal.key)} on ${cal.date}` : `today's ${escHtml(cal.key)}`;
}

function strainHeader(title) {
  const lbl = `${escHtml(cal.key)}${cal.loading ? ' · ' + escHtml(cal.loading) : ''}`;
  const done = cal.total - cal.queue.length;
  const progress = cal.total > 1 ? ` <span class="strain-progress">${done}/${cal.total}</span>` : '';
  return `<div class="modal-header"><h3>${title}${progress}</h3>
      <button class="modal-close" onclick="nextStrainCalibration()" aria-label="Skip">×</button></div>
    <p><span class="strain-ex">${lbl}</span></p>`;
}

function strainChoice(label, onclick, cls = 'btn-ghost') {
  return `<button class="btn ${cls} btn-full strain-opt" onclick="${onclick}">${label}</button>`;
}

function renderStrainStep(step, extra) {
  const body = document.getElementById('strain-body');
  if (step === 'e1rm') {
    body.innerHTML = strainHeader(cal.backfill ? 'Exercise database' : 'New exercise logged') +
      `<p>For strength progress (e1RM): is the weight you log added on top of your bodyweight, like weighted pull-ups or dips?</p>` +
      strainChoice('Yes — bodyweight + logged weight', 'setE1rmBodyweight(true)') +
      strainChoice('No — just the logged weight', 'setE1rmBodyweight(false)') +
      strainChoice(cal.queue.length ? 'Skip for now' : 'Ask me later', 'nextStrainCalibration()', 'btn-link') +
      (cal.queue.length ? strainChoice('Stop', 'closeStrainModal()', 'btn-link') : '');
  } else if (step === 'tendon') {
    body.innerHTML = strainHeader('Patellar tendon') +
      `<p>Does this exercise strain your patellar tendon?</p>` +
      strainChoice('Yes', "renderStrainStep('bw')") +
      strainChoice('No', 'saveNoStrain()');
  } else if (step === 'bw') {
    body.innerHTML = strainHeader('Bodyweight on the knee') +
      `<p>Does your knee carry your bodyweight in this exercise (e.g. squats, lunges, jumps — not machines)?</p>` +
      strainChoice('Yes — my bodyweight is loaded', 'cal.bodyweight=true; beginStrainCompare()') +
      strainChoice('No — only the external weight', 'cal.bodyweight=false; beginStrainCompare()');
  } else if (step === 'nobase') {
    body.innerHTML = strainHeader('Can’t calibrate') +
      `<p>No logged loading of this exercise has numeric sets × reps (and weight) the model can use (e.g. bands), so a strain factor can't be derived from it.</p>` +
      strainChoice('Enter a factor manually', "renderStrainStep('result', '')") +
      strainChoice('Skip', 'nextStrainCalibration()', 'btn-link');
  } else if (step === 'result') {
    body.innerHTML = strainHeader('Calibrated') +
      `<p>Strain factor: <input type="number" id="strain-factor-input" step="0.0001" min="0" value="${extra}" style="width:110px;display:inline-block;padding:6px 8px"> ${cal.bodyweight ? '(+ bodyweight)' : ''}</p>` +
      strainChoice('Save to lookup', 'saveStrainFactor()', 'btn-primary') +
      (cal.base ? strainChoice('Pick a different level', 'beginStrainCompare()', 'btn-link') : '');
  }
}

function saveNoStrain() {
  applyLookupUpdate({ exercises: { [cal.key]: { strain_factor: 0, bodyweight: false, e1rm_bodyweight: cal.e1rmBw } } });
  nextStrainCalibration();
}

function saveStrainFactor() {
  const f = parseFloat(document.getElementById('strain-factor-input').value);
  if (isNaN(f) || f < 0) return;
  applyLookupUpdate({ exercises: { [cal.key]: { strain_factor: +f.toFixed(4), bodyweight: cal.bodyweight, e1rm_bodyweight: cal.e1rmBw } } });
  nextStrainCalibration();
}

function beginStrainCompare() {
  // Calibrate against the most recent logged loading the model can compute a
  // strain for (at factor 1) — skipping e.g. band-only entries.
  const unit = { strain_factor: 1, bodyweight: cal.bodyweight };
  const usable = cal.history.find(h => loadingStrain(unit, h.loading, h.rpe) > 0);
  if (!usable) { cal.base = 0; renderStrainStep('nobase'); return; }
  Object.assign(cal, usable);
  cal.base = loadingStrain(unit, cal.loading, cal.rpe);
  renderStrainCompare();
}

function renderStrainCompare() {
  // Low → high, excluding "none" (the Yes/No step covers that).
  cal.levels = LOADING_MODEL.impact_scale.filter(t => t.midpoint > 0).sort((a, b) => a.min - b.min);
  document.getElementById('strain-body').innerHTML =
    strainHeader('Impact') +
    `<p>How much did ${strainWhen()} strain your patellar tendon?</p>` +
    cal.levels.map((t, i) =>
      strainChoice(escHtml(t.name), `pickStrain(${i})`)
    ).join('');
}

function pickStrain(i) {
  renderStrainStep('result', +(cal.levels[i].midpoint / cal.base).toFixed(4));
}
