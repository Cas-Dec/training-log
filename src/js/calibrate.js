// ── STRAIN CALIBRATION ─────────────────────────────────────────────
// When Cas logs an exercise that has never been logged before and has no
// patellar lookup entry, a short wizard asks whether it loads the tendon,
// whether it is single-leg, whether bodyweight counts, and then which of four
// known exercise/loading combos felt most similar. The chosen combo's modelled
// strain is used to back-solve the new exercise's strain_factor.

const CAL_ROUND1 = [0.35, 0.7, 1.4, 2.8];   // wide spread around the prior guess
const CAL_ROUND2 = [0.6, 0.85, 1.15, 1.6];  // narrow spread around the first pick
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

function startStrainCalibration(exercises) {
  if (!exercises.length) return;
  cal = { queue: exercises.slice() };
  nextStrainCalibration();
}

function nextStrainCalibration() {
  const ex = cal?.queue.shift();
  if (!ex) { closeStrainModal(); return; }
  cal = { queue: cal.queue, key: ex.name.toLowerCase().trim(), loading: ex.loading, rpe: ex.rpe };
  document.getElementById('strain-modal').classList.add('active');
  renderStrainStep('tendon');
}

function closeStrainModal() {
  document.getElementById('strain-modal').classList.remove('active');
  cal = null;
}

function strainHeader(title) {
  const lbl = `${escHtml(cal.key)}${cal.loading ? ' · ' + escHtml(cal.loading) : ''}`;
  return `<div class="modal-header"><h3>${title}</h3>
      <button class="modal-close" onclick="nextStrainCalibration()" aria-label="Skip">×</button></div>
    <p><span class="strain-ex">${lbl}</span></p>`;
}

function strainChoice(label, onclick, cls = 'btn-ghost') {
  return `<button class="btn ${cls} btn-full strain-opt" onclick="${onclick}">${label}</button>`;
}

function renderStrainStep(step, extra) {
  const body = document.getElementById('strain-body');
  if (step === 'tendon') {
    body.innerHTML = strainHeader('New exercise logged') +
      `<p>Does this exercise strain your patellar tendon?</p>` +
      strainChoice('Yes', "renderStrainStep('legs')") +
      strainChoice('No', 'saveNoStrain()') +
      strainChoice('Ask me later', 'nextStrainCalibration()', 'btn-link');
  } else if (step === 'legs') {
    body.innerHTML = strainHeader('Legs') +
      `<p>Is this exercise done one leg at a time, or both legs together?</p>` +
      strainChoice('One leg at a time', 'cal.legs=1; renderStrainStep(\'bw\')') +
      strainChoice('Both legs', 'cal.legs=2; renderStrainStep(\'bw\')');
  } else if (step === 'bw') {
    body.innerHTML = strainHeader('Bodyweight') +
      `<p>Is your bodyweight part of the strain (e.g. squats, lunges, jumps — not machines)?</p>` +
      strainChoice('Yes — my bodyweight is loaded', 'cal.bodyweight=true; beginStrainCompare()') +
      strainChoice('No — only the external weight', 'cal.bodyweight=false; beginStrainCompare()');
  } else if (step === 'nobase') {
    body.innerHTML = strainHeader('Can’t calibrate') +
      `<p>This loading has no numeric weight/reps the model can use (e.g. bands), so a strain factor can't be derived from it. Ask the coach to set one instead.</p>` +
      strainChoice('OK', 'nextStrainCalibration()', 'btn-primary');
  } else if (step === 'result') {
    const f = extra;
    const ref = Object.entries(lookup.exercises)
      .filter(([k, v]) => v.strain_factor > 0 && !!v.bodyweight === cal.bodyweight)
      .sort((a, b) => Math.abs(Math.log(a[1].strain_factor / f)) - Math.abs(Math.log(b[1].strain_factor / f)))
      .slice(0, 3)
      .map(([k, v]) => `${escHtml(k)} ${v.strain_factor}`).join(' · ');
    body.innerHTML = strainHeader('Calibrated') +
      `<p>Strain factor: <input type="number" id="strain-factor-input" step="0.0001" min="0" value="${f}" style="width:110px;display:inline-block;padding:6px 8px"> ${cal.bodyweight ? '(+ bodyweight)' : ''}</p>
       ${ref ? `<p style="font-size:12px">Closest known factors: ${ref}</p>` : ''}` +
      strainChoice('Save to lookup', 'saveStrainFactor()', 'btn-primary') +
      strainChoice('Redo comparisons', 'beginStrainCompare()', 'btn-link');
  }
}

function saveNoStrain() {
  applyLookupUpdate({ exercises: { [cal.key]: { strain_factor: 0, bodyweight: false } } });
  nextStrainCalibration();
}

function saveStrainFactor() {
  const f = parseFloat(document.getElementById('strain-factor-input').value);
  if (isNaN(f) || f < 0) return;
  applyLookupUpdate({ exercises: { [cal.key]: { strain_factor: +f.toFixed(4), bodyweight: cal.bodyweight, legs: cal.legs } } });
  nextStrainCalibration();
}

// Starting guess for the factor: geometric mean of known factors with the same
// bodyweight flag. Single-leg roughly doubles a machine exercise's tendon load
// (cf. leg extensions vs single leg extensions); for bodyweight movements the
// bilateral deficit is smaller.
function strainPrior() {
  const fs = Object.values(lookup.exercises)
    .filter(v => v.strain_factor > 0 && !!v.bodyweight === cal.bodyweight)
    .map(v => v.strain_factor);
  const all = fs.length ? fs : Object.values(lookup.exercises).map(v => v.strain_factor).filter(f => f > 0);
  const gm = all.length ? Math.exp(all.reduce((a, f) => a + Math.log(f), 0) / all.length) : 0.05;
  return gm * (cal.legs === 1 ? (cal.bodyweight ? 1.25 : 2) : 1);
}

function beginStrainCompare() {
  // Modelled strain of the new exercise if its factor were 1.
  cal.base = loadingStrain({ strain_factor: 1, bodyweight: cal.bodyweight }, cal.loading, cal.rpe);
  if (!cal.base) { renderStrainStep('nobase'); return; }
  cal.pool = strainCandidatePool();
  if (!cal.pool.length) { renderStrainStep('result', +strainPrior().toFixed(4)); return; }
  cal.round = 1;
  cal.center = strainPrior() * cal.base;
  renderStrainCompare();
}

// Every known knee-loading exercise × loading combos Cas has actually logged
// (per set-group), plus the same weights at 1–5 sets, with their modelled strain.
// Exercises with no history are left out, and exercises that are ever logged
// with added weight only appear with weight — "snatch 3x15" is meaningless.
function strainCandidatePool() {
  const pool = [], seen = new Set();
  const add = (key, entry, sets, reps, added) => {
    const loading = `${sets}x${reps}` + (added ? `@${added}kg` : '');
    const id = key + '|' + loading;
    if (seen.has(id)) return;
    const strain = loadingStrain(entry, loading, '');
    if (strain > 0) {
      seen.add(id);
      pool.push({ key, loading: added ? loading : `${loading} (bodyweight)`, strain });
    }
  };
  for (const [key, entry] of Object.entries(lookup.exercises)) {
    if (key === cal.key || !(entry.strain_factor > 0)) continue;
    const combos = [];
    sessions.forEach(s => {
      if ((s.user || 'Cas') !== 'Cas') return;
      (s.exercises || []).forEach(e => {
        if ((e.name || '').toLowerCase().trim() !== key) return;
        (e.loading || '').split(',').map(p => p.trim()).forEach(part => {
          const sr = part.match(/^([\d.]+)\s*x\s*([\d.]+)(s?)/i);
          const w = part.match(/@\s*([\d.]+)\s*kg/i);
          if (!sr || sr[3]) return; // skip timed holds — "3x30s" reads oddly as a comparison
          combos.push({ reps: +sr[2], added: w ? +w[1] : 0 });
        });
      });
    });
    const weighted = combos.some(c => c.added > 0);
    combos
      .filter(c => !weighted || c.added > 0)
      .forEach(c => { for (let n = 1; n <= 5; n++) add(key, entry, n, c.reps, c.added); });
  }
  return pool;
}

// Pick one candidate per target strain, preferring distinct exercises.
function pickStrainOptions(targets) {
  const used = new Set(), picked = [];
  for (const t of targets) {
    const dist = c => Math.abs(Math.log(c.strain / t));
    const fresh = cal.pool.filter(c => !used.has(c.key) && !picked.includes(c));
    const src = fresh.length ? fresh : cal.pool.filter(c => !picked.includes(c));
    if (!src.length) break;
    const best = src.reduce((a, b) => dist(b) < dist(a) ? b : a);
    used.add(best.key);
    picked.push(best);
  }
  return picked.sort((a, b) => a.strain - b.strain);
}

function renderStrainCompare() {
  const mults = cal.round === 1 ? CAL_ROUND1 : CAL_ROUND2;
  cal.options = pickStrainOptions(mults.map(m => cal.center * m));
  const letters = 'abcd';
  document.getElementById('strain-body').innerHTML =
    strainHeader(`Compare (${cal.round}/2)`) +
    `<p>Which of these felt <strong>most similar</strong> in patellar tendon strain to today's ${escHtml(cal.key)}?</p>` +
    cal.options.map((o, i) =>
      strainChoice(`<span class="strain-letter">${letters[i]})</span> ${escHtml(o.key)} <span class="strain-load">${escHtml(o.loading)}</span>`, `pickStrain(${i})`)
    ).join('') +
    `<div class="strain-edge">
      <button class="btn btn-link" onclick="shiftStrain(0.25)">Less than all of these</button>
      <button class="btn btn-link" onclick="shiftStrain(4)">More than all of these</button>
    </div>`;
}

function shiftStrain(mult) {
  cal.center *= cal.round === 1 ? mult : Math.sqrt(mult);
  renderStrainCompare();
}

function pickStrain(i) {
  const o = cal.options[i];
  if (cal.round === 1) {
    cal.round = 2;
    cal.center = o.strain;
    renderStrainCompare();
  } else {
    renderStrainStep('result', +(o.strain / cal.base).toFixed(4));
  }
}
