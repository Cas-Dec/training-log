// ── PROGRAM ────────────────────────────────────────────────────────
// A 12-week resistance program built with the coach. Completion is derived
// from the log: a session tagged { program: { id, slot } } fulfils that slot.
// program.json only stores the plan itself and which slots were skipped.
const PROGRAM_WEEKS = 12;
const PROGRAM_GOALS = ['Strength', 'Hypertrophy', 'Power', 'Endurance', 'Injury rehab', 'Maintenance'];
const PROGRAM_TYPES = ['Pull', 'Push', 'Legs', 'Upper body', 'Full body', 'Accessory'];

// Default exercise library for the setup form, so a user without a log still
// has something to pick from. Names follow exercises.json where they overlap.
const EXERCISE_LIBRARY = {
  'Squat & knee': ['squats', 'goblet squats', 'leg press', 'bulgarian split squats', 'step-ups', 'leg extensions', 'spanish squat', 'terminal knee extensions'],
  'Hinge & hamstrings': ['deadlifts', 'romanian deadlifts', 'single leg romanian deadlift', 'good mornings', 'hip thrusts', 'prone leg curls', 'nordic hamstring falls', 'back extensions'],
  'Push': ['bench press', 'flat dumbbell press', 'incline dumbbell press', 'dips', 'push-ups', 'overhead press', 'machine press'],
  'Pull': ['pull-ups', 'chin-ups', 'lat cable pull downs', 'barbell rows', 'dumbbell rows', 'seated machine rows', 'face pulls'],
  'Shoulders & arms': ['lateral raise', 'rear delt fly', 'cable external rotation', 'bicep curls', 'hammer curls', 'skullcrushers', 'triceps push down'],
  'Calves & shins': ['standing calf raises', 'single leg calf raises', 'tibialis raises'],
  'Core': ['plank', 'ab roll out', 'pallof press', 'hanging knees to chest', 'dead bug'],
  'Power & plyometrics': ['power clean', 'clean pulls', 'box jump', 'vertical jumps'],
};

// The planning/adjust chat in progress: { mode: 'create'|'adjust', setup?, messages }.
// Mirrored to localStorage so a reload mid-conversation doesn't lose it.
let programChat = null;
// Without a program, the welcome card is shown until the user picks "set up".
let programSetupChosen = false;

const PROGRAM_FORMAT = `Loading strings use the training log's exact format:
- "<sets>x<reps>@<weight>kg", several set groups comma-separated: "3x8@60kg, 1x6@65kg"
- timed sets: "3x30s@0kg"; bodyweight with no added load: "@0kg"; bands: "3x12@red"
- always prescribe concrete weights, derived from the athlete's recent performance in the log
rpe is a target like "RPE8" (or ""). note is an optional short cue (tempo, rest, substitution rule), else "".
Exercise names are lower-case; reuse a name exactly as it appears in the log when the exercise has been done before.
Session type is one of: ${PROGRAM_TYPES.join(', ')}. Resistance sessions only — sports and cardio are logged separately.
Output JSON compactly (no indentation, no comments) to save space.`;

const PROGRAM_INSTRUCTIONS = `## Task: design a ${PROGRAM_WEEKS}-week program
You are designing a ${PROGRAM_WEEKS}-week resistance training program together with the athlete. Their full user directory (training log, context, loading lookup, bodyweight, …) is included below.

1. First discuss: propose the overall structure (phases, weekly split, progression scheme, deloads) and ask any clarifying questions. Keep it short. Do not output the full program until the athlete agrees with the structure.
2. Once agreed, output the complete program as ONE fenced block tagged \`program\`:
\`\`\`program
{"weeks":[{"week":1,"focus":"Accumulation","sessions":[{"label":"Lower A","type":"Legs","exercises":[{"name":"back squat","loading":"4x5@120kg","rpe":"RPE8","note":""}]}]}]}
\`\`\`
Exactly ${PROGRAM_WEEKS} weeks, each with the requested number of sessions per week.
${PROGRAM_FORMAT}`;

const PROGRAM_ADJUST_INSTRUCTIONS = `## Task: adjust the current program
The athlete's current ${PROGRAM_WEEKS}-week program is included at the end, with each session's status (done / skipped / planned) and, for done sessions, how the logged session deviated from the plan. Help them revise it. Only sessions with status "planned" can be changed.

First discuss briefly. Once agreed, output the changes as ONE fenced block tagged \`program-update\`, containing only the sessions you change (identified by their slot id) and optionally new week focus labels:
\`\`\`program-update
{"sessions":[{"slot":"w5s1","label":"Lower A","type":"Legs","exercises":[{"name":"back squat","loading":"4x4@115kg","rpe":"RPE7","note":""}]}],"weeks":[{"week":5,"focus":"Deload"}]}
\`\`\`
${PROGRAM_FORMAT}`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function programDraftKey() { return `tl_program_draft_${currentUser}`; }

function saveProgramLocally() {
  localStorage.setItem(`tl_program_${currentUser}`, JSON.stringify(program));
  syncProgramToGitHub();
}

// ── Slots & status ──

function programSlots() {
  return program ? program.weeks.flatMap(w => w.sessions) : [];
}

function slotWeek(slot) { return +slot.match(/^w(\d+)/)[1]; }

function slotLabel(s) {
  const [, w, n] = s.slot.match(/^w(\d+)s(\d+)/);
  return `W${w} · S${n}${s.label ? ' · ' + s.label : ''}`;
}

function slotLog(slot) {
  if (!program) return null;
  return sessions.find(s => (s.user || 'Cas') === currentUser
    && s.program?.id === program.id && s.program.slot === slot) || null;
}

function nextSlot() {
  return programSlots().find(s => !s.skipped && !slotLog(s.slot)) || null;
}

// ── Planned vs actual ──

// "4x8@0kg" ≡ "4x8", "120kg" ≡ "120", whitespace and case ignored.
function normLoading(l) {
  return (l || '').toLowerCase().replace(/\s+/g, '').replace(/kg/g, '').replace(/@0(?![\d.])/g, '');
}

function normRpe(r) {
  const m = (r || '').toString().match(/[\d.]+/);
  return m ? String(+m[0]) : '';
}

// Matches exercises by name. Kinds: same | changed | missing | added.
// An RPE difference only counts when both sides recorded one.
function exerciseDeviations(planned, logged) {
  const done = new Map(logged.map(e => [(e.name || '').toLowerCase().trim(), e]));
  const rows = planned.map(p => {
    const key = p.name.toLowerCase().trim();
    const a = done.get(key);
    if (!a) return { kind: 'missing', planned: p };
    done.delete(key);
    const rpeDiffers = p.rpe && a.rpe && normRpe(p.rpe) !== normRpe(a.rpe);
    const same = normLoading(p.loading) === normLoading(a.loading) && !rpeDiffers;
    return { kind: same ? 'same' : 'changed', planned: p, actual: a };
  });
  return [...rows, ...[...done.values()].map(a => ({ kind: 'added', actual: a }))];
}

function slotRows(s) {
  const log = slotLog(s.slot);
  return log
    ? exerciseDeviations(s.exercises, log.exercises || [])
    : s.exercises.map(p => ({ kind: 'planned', planned: p }));
}

function fmtEx(e) { return `${e.loading || '—'}${e.rpe ? ' ' + e.rpe : ''}`; }

// ── Validation ──

function normalizeProgramSession(s, slot) {
  if (!/^w\d+s\d+$/.test(slot || '')) throw new Error('A session has no valid slot id.');
  if (!Array.isArray(s.exercises)) throw new Error(`Session ${slot} has no exercise list.`);
  return {
    slot,
    label: s.label || '',
    type: PROGRAM_TYPES.includes(s.type) ? s.type : 'Full body',
    exercises: s.exercises.map(e => {
      const rpe = normRpe(e.rpe);
      return { name: (e.name || '').toLowerCase().trim(), loading: e.loading || '', rpe: rpe ? `RPE${rpe}` : '', note: e.note || '' };
    }).filter(e => e.name),
    skipped: false,
  };
}

// Slot ids are assigned from position, so they're always unique.
function normalizeProgram(data) {
  const weeks = data?.weeks;
  if (!Array.isArray(weeks) || weeks.length !== PROGRAM_WEEKS)
    throw new Error(`Expected ${PROGRAM_WEEKS} weeks, got ${Array.isArray(weeks) ? weeks.length : 0}.`);
  return weeks.map((w, i) => ({
    week: i + 1,
    focus: w.focus || '',
    sessions: (w.sessions || []).map((s, j) => normalizeProgramSession(s, `w${i + 1}s${j + 1}`)),
  }));
}

// ── View switching ──

function renderProgram() {
  if (!programChat) {
    try { programChat = JSON.parse(localStorage.getItem(programDraftKey()) || 'null'); } catch(e) {}
    if (programChat) restoreProgramThread();
  }
  const view = programChat ? 'chat' : program ? 'outline' : programSetupChosen ? 'setup' : 'welcome';
  ['welcome', 'setup', 'chat', 'outline'].forEach(v =>
    document.getElementById('program-' + v).style.display = v === view ? '' : 'none');

  const subtitle = document.getElementById('program-subtitle');
  if (view === 'welcome') {
    subtitle.textContent = `Plan your next ${PROGRAM_WEEKS} weeks with the coach`;
    const hasHistory = frequentExercises(1).length > 0;
    document.getElementById('program-auto-btn').style.display = hasHistory ? '' : 'none';
    document.getElementById('program-welcome-text').textContent = hasHistory
      ? `Hi there! Looks like you haven't got a program yet. Since you've already logged training sessions, the coach can propose a ${PROGRAM_WEEKS}-week program based on your history. Or, if you prefer, select exercises and training goals from scratch. What would you like to do?`
      : `Hey there! Looks like you're new here. Click the button below to set up your ${PROGRAM_WEEKS}-week program together with the coach.`;
  } else if (view === 'setup') {
    subtitle.textContent = `Plan your next ${PROGRAM_WEEKS} weeks with the coach`;
    if (!document.getElementById('program-library-body').children.length) renderProgramSetup();
  } else if (view === 'chat') {
    subtitle.textContent = programChat.mode === 'adjust' ? 'Adjusting your program with the coach' : 'Planning with the coach';
  } else {
    const slots = programSlots();
    const done = slots.filter(s => slotLog(s.slot)).length;
    subtitle.textContent = `Started ${program.created} · ${done}/${slots.length} sessions done`;
    renderProgramOutline();
  }
}

// ── Setup ──

// Resistance exercises of the current user, most sessions first.
function frequentExercises(n) {
  const counts = new Map();
  sessions
    .filter(s => (s.user || 'Cas') === currentUser && !CARDIO_TYPES.includes(s.type))
    .forEach(s => new Set((s.exercises || []).map(e => (e.name || '').toLowerCase().trim()).filter(Boolean))
      .forEach(name => counts.set(name, (counts.get(name) || 0) + 1)));
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
}

// The logged set group with the highest e1RM — same formula as the History
// progression chart, so for bodyweight-loaded exercises it's the added-weight
// equivalent. Prefers the last 12 weeks; null if no set has a numeric weight.
function bestSet(name) {
  const bodyweight = isBodyweightLoadedExercise(name);
  const mine = sessions.filter(s => (s.user || 'Cas') === currentUser);
  const scan = list => {
    let best = null;
    for (const s of list) for (const e of s.exercises || []) {
      if ((e.name || '').toLowerCase().trim() !== name) continue;
      const bodyweightKg = bodyweight ? nearestBodyweightKg(s.date) : 0;
      for (const part of (e.loading || '').split(',').map(p => p.trim()).filter(Boolean)) {
        if (detectRepMode(part) === 'duration') continue; // timed sets have no e1RM
        const { reps, e1rm } = parseLoading(part, e.rpe, { bodyweight, bodyweightKg });
        if (e1rm === null) continue;
        const value = bodyweight ? e1rm - bodyweightKg : e1rm;
        if (!best || value > best.e1rm)
          best = { reps, weight: +(part.match(/@\s*([\d.]+)/)?.[1] ?? 0), e1rm: value, date: s.date };
      }
    }
    return best;
  };
  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  return scan(mine.filter(s => new Date(s.date).getTime() >= cutoff)) || scan(mine);
}

function fmtBest(name, reps, weight) {
  if (!reps && !weight) return 'no best yet';
  const w = isBodyweightLoadedExercise(name) ? (weight ? `BW+${weight}kg` : 'BW') : `${weight || 0}kg`;
  return `${reps || '?'} × ${w}`;
}

// Fills the setup form: the most frequent exercises as (unselected)
// suggestions, plus anything from `prev` (a deleted program's setup) selected
// with its goal and best restored.
function renderProgramSetup(prev = null) {
  document.getElementById('program-targets').innerHTML = '';
  const prevTargets = prev?.targets || [];
  const frequent = frequentExercises(10);
  // Previous targets that aren't frequent were picked from the library/search: removable
  prevTargets.filter(t => !frequent.includes(t.exercise))
    .forEach(t => addProgramTarget(t, { removable: true }));
  frequent.forEach(name => addProgramTarget({ exercise: name, ...prevTargets.find(t => t.exercise === name) },
    { selected: prevTargets.some(t => t.exercise === name) }));
  if (prev) {
    document.getElementById('program-spw').value = prev.sessionsPerWeek;
    document.getElementById('program-notes').value = prev.notes || '';
  }
  renderProgramLibrary();
  document.getElementById('program-library').open = !frequent.length;
  document.getElementById('program-no-history').style.display = frequent.length ? 'none' : '';
}

function renderProgramLibrary() {
  document.getElementById('program-library-body').innerHTML = Object.entries(EXERCISE_LIBRARY).map(([cat, names]) => `
    <div class="prog-lib-cat">${esc(cat)}</div>
    <div class="prog-lib-items">${names.map(n => `
      <label class="prog-lib-item"><input type="checkbox" data-name="${esc(n)}" onchange="onLibraryCheck(this)"> ${esc(n)}</label>`).join('')}
    </div>`).join('');
  syncLibraryChecks();
}

function targetRow(name) {
  return [...document.querySelectorAll('#program-targets .prog-target')].find(r => targetName(r) === name) || null;
}

// Selects the exercise's row, adding a removable one at the top if there's none.
function addOrSelectTarget(name) {
  name = name.toLowerCase().trim();
  if (!name) return;
  const row = targetRow(name);
  if (row) {
    row.classList.add('selected');
    row.querySelector('.prog-target-head input[type=checkbox]').checked = true;
  } else {
    addProgramTarget({ exercise: name }, { removable: true, prepend: true });
  }
  syncLibraryChecks();
}

function onLibraryCheck(cb) {
  if (cb.checked) { addOrSelectTarget(cb.dataset.name); return; }
  const row = targetRow(cb.dataset.name);
  if (row?.dataset.removable) row.remove();
  else if (row) { row.classList.remove('selected'); row.querySelector('.prog-target-head input[type=checkbox]').checked = false; }
  syncLibraryChecks();
}

function onTargetCheck(cb) {
  cb.closest('.prog-target').classList.toggle('selected', cb.checked);
  syncLibraryChecks();
}

function removeTarget(btn) {
  btn.closest('.prog-target').remove();
  syncLibraryChecks();
}

function syncLibraryChecks() {
  document.querySelectorAll('#program-library-body input[type=checkbox]').forEach(cb =>
    cb.checked = !!targetRow(cb.dataset.name)?.classList.contains('selected'));
}

// Search over the library, the shared exercise list and this user's log.
// A query with no exact match can be added as a custom exercise.
function onProgramSearch() {
  const input = document.getElementById('program-ex-search');
  const box = document.getElementById('program-search-results');
  const q = input.value.toLowerCase().trim();
  if (!q) { box.innerHTML = ''; return; }
  const all = [...new Set([...Object.values(EXERCISE_LIBRARY).flat(), ...knownExerciseNames()])];
  const matches = all.filter(n => n.includes(q))
    .sort((a, b) => a.indexOf(q) - b.indexOf(q) || a.localeCompare(b)).slice(0, 8);
  const items = matches.map(n => ({ name: n, label: esc(n) + (targetRow(n)?.classList.contains('selected') ? ' ✓' : '') }));
  if (!matches.includes(q)) items.push({ name: q, label: `+ add “${esc(q)}”` });
  box.innerHTML = `<div class="ex-suggestions">${items.map((it, i) =>
    `<div class="ex-suggestion${i === 0 ? ' active' : ''}" data-name="${esc(it.name)}" onmousedown="event.preventDefault();pickProgramSearch(this.dataset.name)">${it.label}</div>`).join('')}</div>`;
}

function onProgramSearchKey(e) {
  const items = [...document.querySelectorAll('#program-search-results .ex-suggestion')];
  if (e.key === 'Escape') { e.target.value = ''; onProgramSearch(); return; }
  if (!items.length) return;
  let i = items.findIndex(el => el.classList.contains('active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    i = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((el, j) => el.classList.toggle('active', j === i));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    pickProgramSearch(items[Math.max(i, 0)].dataset.name);
  }
}

function pickProgramSearch(name) {
  addOrSelectTarget(name);
  const input = document.getElementById('program-ex-search');
  input.value = '';
  onProgramSearch();
  input.focus();
}

// One exercise row: include checkbox, goal chips, and a collapsible
// "current best" panel defaulting to the highest-e1RM logged set.
// Rows picked from the library/search are removable; suggestions are not.
function addProgramTarget(t, { selected = true, removable = false, prepend = false } = {}) {
  const best = t.best || bestSet(t.exercise);
  const row = document.createElement('div');
  row.className = 'prog-target' + (selected ? ' selected' : '');
  row.dataset.goal = t.goal || 'strength';
  if (removable) row.dataset.removable = '1';
  row.innerHTML = `
    <div class="prog-target-head">
      <label class="prog-target-check">
        <input type="checkbox"${selected ? ' checked' : ''} onchange="onTargetCheck(this)">
        <span class="prog-target-name">${esc(t.exercise)}</span>
      </label>
      <button type="button" class="prog-best-btn" onclick="this.closest('.prog-target').classList.toggle('best-open')"></button>
      ${removable ? `<button class="rm-btn" onclick="removeTarget(this)">×</button>` : ''}
    </div>
    <div class="prog-goals">${PROGRAM_GOALS.map(g =>
      `<button type="button" class="quick-btn" data-goal="${g.toLowerCase()}" onclick="setTargetGoal(this)">${g}</button>`).join('')}</div>
    <div class="prog-best-panel">
      <span class="prog-best-lbl">Current best</span>
      <select class="prog-best-reps" onchange="updateBestBtn(this)">${numOptions('Reps', 30)}</select>
      <span class="ex-x">×</span>
      <input type="number" class="prog-best-weight" min="0" step="0.5" placeholder="kg" oninput="updateBestBtn(this)">
      <span class="prog-best-src"></span>
    </div>`;
  document.getElementById('program-targets')[prepend ? 'prepend' : 'appendChild'](row);
  syncTargetGoal(row);
  setTargetBest(row, best);
}

function setTargetBest(row, best) {
  row.querySelector('.prog-best-reps').value = best?.reps ?? '';
  row.querySelector('.prog-best-weight').value = best ? best.weight : '';
  row.querySelector('.prog-best-src').textContent = best?.date ? `logged ${best.date}` : '';
  updateBestBtn(row);
}

function targetName(row) {
  return row.querySelector('.prog-target-name').textContent.trim().toLowerCase();
}

function updateBestBtn(el) {
  const row = el.closest('.prog-target');
  const reps = row.querySelector('.prog-best-reps').value;
  const weight = row.querySelector('.prog-best-weight').value;
  row.querySelector('.prog-best-btn').textContent = `${fmtBest(targetName(row), reps, weight)} ▾`;
}

function setTargetGoal(btn) {
  const row = btn.closest('.prog-target');
  row.dataset.goal = btn.dataset.goal;
  syncTargetGoal(row);
}

function syncTargetGoal(row) {
  row.querySelectorAll('.prog-goals .quick-btn').forEach(b => b.classList.toggle('active', b.dataset.goal === row.dataset.goal));
}

function getProgramSetup() {
  return {
    sessionsPerWeek: +document.getElementById('program-spw').value || 0,
    targets: [...document.querySelectorAll('#program-targets .prog-target.selected')].map(r => {
      const reps = +r.querySelector('.prog-best-reps').value;
      const weightStr = r.querySelector('.prog-best-weight').value;
      return {
        exercise: targetName(r),
        goal: r.dataset.goal,
        best: reps || weightStr !== '' ? { reps: reps || null, weight: +weightStr || 0 } : null,
      };
    }).filter(t => t.exercise),
    notes: document.getElementById('program-notes').value.trim(),
  };
}

function startProgramPlanning() {
  const setup = getProgramSetup();
  const status = document.getElementById('program-setup-status');
  if (!setup.targets.length) { status.textContent = 'Select at least one exercise.'; return; }
  if (setup.sessionsPerWeek < 1 || setup.sessionsPerWeek > 7) { status.textContent = 'Sessions per week must be 1–7.'; return; }
  status.textContent = '';

  const q = [
    `Let's build my ${PROGRAM_WEEKS}-week program.`,
    `Resistance sessions per week: ${setup.sessionsPerWeek}`,
    `Target exercises (goal; current best set):\n${setup.targets.map(t =>
      `- ${t.exercise} — ${t.goal}; ${t.best ? fmtBest(t.exercise, t.best.reps, t.best.weight) : 'no best known'}`).join('\n')}`,
    setup.notes ? `Other notes: ${setup.notes}` : '',
    'Propose a structure first.',
  ].filter(Boolean).join('\n\n');

  openProgramChat({ mode: 'create', setup, messages: [] });
  askProgramCoach(q);
}

function showProgramSetup(chosen) {
  programSetupChosen = chosen;
  renderProgram();
}

// Facts the model would otherwise have to dig out of the raw log, which is
// also in the system prompt.
function historySummary() {
  const mine = sessions.filter(s => (s.user || 'Cas') === currentUser && s.type !== 'Rest');
  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  const recent = mine.filter(s => new Date(s.date).getTime() >= cutoff);
  const types = new Map();
  recent.forEach(s => types.set(s.type, (types.get(s.type) || 0) + 1));
  const exercises = frequentExercises(10).map(name => {
    const best = bestSet(name);
    const last = mine.filter(s => (s.exercises || []).some(e => (e.name || '').toLowerCase().trim() === name))
      .reduce((d, s) => s.date > d ? s.date : d, '');
    return `- ${name} — best ${best ? fmtBest(name, best.reps, best.weight) : 'unknown'}; last done ${last}`;
  });
  return [
    `Last 12 weeks: ${recent.length} sessions (~${(recent.length / 12).toFixed(1)}/week): ${[...types].map(([t, n]) => `${t} ${n}`).join(', ') || 'none'}`,
    `Most frequent exercises:\n${exercises.join('\n')}`,
  ].join('\n\n');
}

function startProgramFromHistory() {
  const q = [
    `Let's build my ${PROGRAM_WEEKS}-week program from my training history.`,
    historySummary(),
    'Infer my current split, training frequency and priorities from my log. Propose a structure first, and ask me about anything you can\'t infer (e.g. goals per exercise, sessions per week, schedule).',
  ].join('\n\n');
  openProgramChat({ mode: 'create', setup: null, messages: [] });
  askProgramCoach(q);
}

// ── Chat ──

function openProgramChat(chat, placeholder = '') {
  programChat = chat;
  document.getElementById('program-thread').innerHTML =
    placeholder ? `<p class="ai-placeholder">${placeholder}</p>` : '';
  renderProgram();
}

function startProgramAdjust() {
  openProgramChat({ mode: 'adjust', messages: [] },
    "Describe what to change, e.g. “my knee flared up — lower squat volume for the next three weeks”. The coach sees your adherence and every deviation from the plan.");
}

function closeProgramChat() {
  if (programChat?.mode === 'create' && !confirm('Discard this planning conversation?')) return;
  programChat = null;
  localStorage.removeItem(programDraftKey());
  renderProgram();
}

function restoreProgramThread() {
  const thread = document.getElementById('program-thread');
  thread.innerHTML = '';
  programChat.messages.forEach(m => {
    if (m.role === 'user') appendChatBubble(thread, 'user', m.content);
    else renderProgramReply(appendChatBubble(thread, 'assistant', ''), m.content);
  });
}

// Every .md/.json in users/{User}/, with the files the app keeps live in memory
// swapped for their current (possibly not-yet-synced) state.
async function userDirText() {
  const files = { ...(await loadUserFiles()) };
  files['log.json'] = JSON.stringify(sessions.filter(s => (s.user || 'Cas') === currentUser));
  files['loading_lookup.json'] = JSON.stringify(lookup);
  if (bodyweightLog.length) files['bodyweight.json'] = JSON.stringify(bodyweightLog);
  if (userContextMd) files['user-context.md'] = userContextMd;
  return `USER DIRECTORY users/${currentUser}/\n\n` +
    Object.entries(files).map(([name, text]) => `### ${name}\n${text}`).join('\n\n');
}

function programStatusText() {
  const lines = [`CURRENT PROGRAM (created ${program.created})`, `Setup: ${JSON.stringify(program.setup)}`];
  for (const w of program.weeks) {
    lines.push(`Week ${w.week}${w.focus ? ' — ' + w.focus : ''}`);
    for (const s of w.sessions) {
      const log = slotLog(s.slot);
      lines.push(`  ${s.slot} ${s.label} (${s.type}) [${log ? 'done ' + log.date : s.skipped ? 'skipped' : 'planned'}]`);
      for (const r of slotRows(s)) {
        const name = (r.planned || r.actual).name;
        const note = r.planned?.note ? ` — ${r.planned.note}` : '';
        if (r.kind === 'changed') lines.push(`    ${name}: planned ${fmtEx(r.planned)} → did ${fmtEx(r.actual)}`);
        else if (r.kind === 'missing') lines.push(`    ${name}: planned ${fmtEx(r.planned)} → NOT DONE`);
        else if (r.kind === 'added') lines.push(`    + ${name}: ${fmtEx(r.actual)} (not planned)`);
        else lines.push(`    ${name}: ${fmtEx(r.planned)}${note}`);
      }
    }
  }
  return lines.join('\n');
}

async function programSystemPrompt() {
  const adjust = programChat.mode === 'adjust';
  return [
    { type: 'text', text: [coreInstructions || SYSTEM_PROMPT_FALLBACK, adjust ? PROGRAM_ADJUST_INSTRUCTIONS : PROGRAM_INSTRUCTIONS].join('\n\n---\n\n') },
    { type: 'text', text: await userDirText(), cache_control: { type: 'ephemeral' } },
    ...(adjust && program ? [{ type: 'text', text: programStatusText() }] : []),
  ];
}

async function askProgramCoach(q) {
  const input = document.getElementById('program-q');
  q = q || input.value.trim();
  if (!q || !programChat) return;
  input.value = '';
  const btn = document.getElementById('program-btn');
  btn.disabled = true;

  const thread = document.getElementById('program-thread');
  thread.querySelector('.ai-placeholder')?.remove();
  appendChatBubble(thread, 'user', q);
  const div = appendChatBubble(thread, 'assistant');
  programChat.messages.push({ role: 'user', content: q });

  try {
    // A full 12-week program is ~6–8k output tokens, hence the larger budget.
    const text = await callCoach({ system: await programSystemPrompt(), messages: programChat.messages, maxTokens: 16000 });
    programChat.messages.push({ role: 'assistant', content: text });
    localStorage.setItem(programDraftKey(), JSON.stringify(programChat));
    renderProgramReply(div, text);
  } catch(e) {
    programChat.messages.pop();
    div.textContent = e.message === 'session-expired' ? '' : 'Error: ' + e.message;
  }
  btn.disabled = false;
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

const PROGRAM_BLOCK_RE = /```(program|program-update)\n([\s\S]*?)\n```/g;

// Renders a reply with its program blocks replaced by a collapsible preview and
// a Save/Apply button, instead of a wall of JSON.
function renderProgramReply(div, text) {
  div.innerHTML = marked.parse(text.replace(PROGRAM_BLOCK_RE, ''));
  const blocks = [...text.matchAll(PROGRAM_BLOCK_RE)];
  const warn = msg => div.insertAdjacentHTML('beforeend', `<p class="prog-warn">${esc(msg)}</p>`);

  for (const [, kind, json] of blocks) {
    let data;
    try { data = JSON.parse(json); } catch(e) { warn(`Couldn't parse the ${kind} block (${e.message}). Ask the coach to output it again.`); continue; }

    if (kind === 'program') {
      let weeks;
      try { weeks = normalizeProgram(data); } catch(e) { warn(e.message + ' Ask the coach to fix it.'); continue; }
      div.insertAdjacentHTML('beforeend', `<div class="prog-preview">${weeksHtml(weeks, { preview: true })}</div>`);
      addReplyButton(div, '✓ Save program', () => saveNewProgram(weeks));
    } else {
      if (!program) { warn('There is no active program to update.'); continue; }
      if (!Array.isArray(data.sessions)) { warn('The update has no session list. Ask the coach to fix it.'); continue; }
      let updates;
      try { updates = data.sessions.map(s => normalizeProgramSession(s, s.slot)); } catch(e) { warn(e.message); continue; }
      div.insertAdjacentHTML('beforeend', `<div class="prog-preview">${updates.map(s => sessionHtml(s, { preview: true })).join('')}</div>`);
      addReplyButton(div, '↻ Apply changes', btn => { btn.textContent = applyProgramUpdate(updates, data.weeks || []); });
    }
  }
  if (!blocks.length && /```program/.test(text))
    warn('The program block looks cut off. Ask the coach to output it again, more compactly.');
}

function addReplyButton(div, label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary';
  btn.style.marginTop = '12px';
  btn.textContent = label;
  btn.onclick = () => { btn.disabled = true; onClick(btn); };
  div.appendChild(btn);
}

function saveNewProgram(weeks) {
  program = {
    id: Date.now(),
    created: new Date().toISOString().split('T')[0],
    setup: programChat?.setup || program?.setup || null,
    weeks,
  };
  saveProgramLocally();
  programChat = null;
  programSetupChosen = false; // a later delete shows the welcome card again
  localStorage.removeItem(programDraftKey());
  selectProgramSlot(nextSlot()?.slot || '');
  renderProgram();
}

// Replaces planned sessions only; done/skipped/unknown slots are left alone.
function applyProgramUpdate(updates, weekUpdates) {
  const bySlot = new Map(programSlots().map(s => [s.slot, s]));
  const ignored = [];
  let applied = 0;
  for (const u of updates) {
    const cur = bySlot.get(u.slot);
    if (!cur || cur.skipped || slotLog(u.slot)) { ignored.push(u.slot); continue; }
    Object.assign(cur, u);
    applied++;
  }
  for (const w of weekUpdates) {
    const wk = program.weeks.find(x => x.week === w.week);
    if (wk && w.focus) wk.focus = w.focus;
  }
  saveProgramLocally();
  const selected = document.getElementById('program-slot').value;
  if (updates.some(u => u.slot === selected)) selectProgramSlot(selected);
  else renderProgramBanner(selected);
  return `✓ Applied ${applied} session${applied === 1 ? '' : 's'}${ignored.length ? ` (ignored ${ignored.join(', ')}: done, skipped or unknown)` : ''}`;
}

// ── Outline ──

function devRowHtml(r) {
  const name = esc((r.planned || r.actual).name);
  const note = r.planned?.note ? `<div class="prog-ex-note">${esc(r.planned.note)}</div>` : '';
  if (r.kind === 'changed')
    return `<div class="prog-ex dev"><span class="prog-ex-name">${name}</span><span class="prog-ex-load"><s>${esc(fmtEx(r.planned))}</s> → ${esc(fmtEx(r.actual))}</span>${note}</div>`;
  if (r.kind === 'missing')
    return `<div class="prog-ex dev missing"><span class="prog-ex-name">${name}</span><span class="prog-ex-load"><s>${esc(fmtEx(r.planned))}</s> not done</span>${note}</div>`;
  if (r.kind === 'added')
    return `<div class="prog-ex dev added"><span class="prog-ex-name">+ ${name}</span><span class="prog-ex-load">${esc(fmtEx(r.actual))} · not planned</span></div>`;
  return `<div class="prog-ex"><span class="prog-ex-name">${name}</span><span class="prog-ex-load">${esc(fmtEx(r.planned))}</span>${note}</div>`;
}

function sessionHtml(s, { preview = false, next = null } = {}) {
  const log = preview ? null : slotLog(s.slot);
  const status = preview ? 'planned' : log ? 'done' : s.skipped ? 'skipped' : next?.slot === s.slot ? 'next' : 'planned';
  const rows = preview ? s.exercises.map(p => ({ kind: 'planned', planned: p })) : slotRows(s);
  const devs = rows.filter(r => r.kind !== 'same' && r.kind !== 'planned').length;
  const badge = { done: `✓ ${log?.date}`, skipped: '– skipped', next: '→ next', planned: '' }[status]
    + (devs ? ` · ${devs} Δ` : '');
  const actions = preview || log ? '' : `
    <div class="prog-actions">
      <button class="btn btn-ghost" onclick="toggleSkip('${s.slot}')">${s.skipped ? 'Unskip' : 'Skip'}</button>
      ${s.skipped ? '' : `<button class="btn btn-ghost" onclick="logProgramSlot('${s.slot}')">Log this →</button>`}
    </div>`;
  return `
    <details class="prog-session prog-${status}">
      <summary><span>${esc(slotLabel(s))} <span class="prog-type">${esc(s.type)}</span></span><span class="prog-status${devs ? ' has-dev' : ''}">${badge}</span></summary>
      <div class="prog-ex-list">${rows.map(devRowHtml).join('') || '<div class="prog-ex-note">No exercises.</div>'}</div>
      ${actions}
    </details>`;
}

function weeksHtml(weeks, { preview = false } = {}) {
  const next = preview ? null : nextSlot();
  const openWeek = next ? slotWeek(next.slot) : null;
  return weeks.map(w => {
    const count = preview
      ? `${w.sessions.length} sessions`
      : `${w.sessions.filter(s => slotLog(s.slot)).length}/${w.sessions.length}`;
    return `
    <details class="prog-week"${w.week === openWeek ? ' open' : ''}>
      <summary><span>Week ${w.week}${w.focus ? ` · ${esc(w.focus)}` : ''}</span><span class="prog-count">${count}</span></summary>
      ${w.sessions.map(s => sessionHtml(s, { preview, next })).join('')}
    </details>`;
  }).join('');
}

function renderProgramOutline() {
  document.getElementById('program-weeks').innerHTML = weeksHtml(program.weeks);
}

function toggleSkip(slot) {
  const s = programSlots().find(x => x.slot === slot);
  if (!s || slotLog(slot)) return;
  s.skipped = !s.skipped;
  saveProgramLocally();
  const selected = document.getElementById('program-slot').value;
  if (s.skipped && selected === slot) selectProgramSlot(nextSlot()?.slot || '');
  else renderProgramBanner(selected);
  renderProgram();
}

function logProgramSlot(slot) {
  showPage('log');
  selectProgramSlot(slot);
}

// Two confirmations: a dialog, then typing DELETE. Logged sessions keep their
// program tag but no longer count toward anything.
function deleteProgram() {
  if (!confirm('Delete the current program? Logged sessions are kept, but the plan and its progress tracking are removed.')) return;
  if ((prompt('This cannot be undone from the app. Type DELETE to confirm.') || '').trim().toUpperCase() !== 'DELETE') {
    showToast('Program not deleted.');
    return;
  }
  const prevSetup = program.setup;
  program = null;
  saveProgramLocally();
  selectProgramSlot('');
  renderProgramSetup(prevSetup);
  renderProgram();
  showToast('Program deleted.');
}

// ── Log tab integration ──

// Options: "Off-program" first so it's easy to find, then every open (not done, not skipped) slot.
function renderProgramBanner(selected) {
  const banner = document.getElementById('program-banner');
  const select = document.getElementById('program-slot');
  const open = programSlots().filter(s => !s.skipped && !slotLog(s.slot));
  if (!open.length) {
    banner.style.display = 'none';
    select.innerHTML = '';
    return;
  }
  banner.style.display = '';
  select.innerHTML = '<option value="">Off-program</option><option disabled>──────────</option>'
    + open.map(s => `<option value="${s.slot}">${esc(slotLabel(s))}</option>`).join('');
  select.value = open.some(s => s.slot === selected) ? selected : '';
  const s = open.find(x => x.slot === select.value);
  const notes = s ? s.exercises.filter(e => e.note).map(e => `<div><strong>${esc(e.name)}:</strong> ${esc(e.note)}</div>`).join('') : '';
  document.getElementById('program-slot-notes').innerHTML = notes;
  document.getElementById('program-skip-btn').style.display = s ? '' : 'none';
}

// Points the log form at a program slot (pre-filling the planned session), or
// at "Off-program" ('') which falls back to the usual last-session pre-fill.
function selectProgramSlot(slot) {
  renderProgramBanner(slot);
  const s = programSlots().find(x => x.slot === slot && !x.skipped && !slotLog(x.slot));
  if (!s) { onTypeChange(); return; }
  document.getElementById('session-type').value = s.type;
  onTypeChange();
  document.getElementById('exercises').innerHTML = '';
  exCount = 0;
  (s.exercises.length ? s.exercises : [{}]).forEach(e => addExercise({ name: e.name, loading: e.loading, rpe: e.rpe }));
}

function onProgramSlotChange() {
  selectProgramSlot(document.getElementById('program-slot').value);
}

// Changing the type by hand means this isn't the planned session.
function onSessionTypeSelect() {
  if (document.getElementById('program-banner').style.display !== 'none') renderProgramBanner('');
  onTypeChange();
}

function skipSelectedSlot() {
  const slot = document.getElementById('program-slot').value;
  if (!slot) return;
  toggleSkip(slot);
}
