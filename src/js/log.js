// ── LOG ────────────────────────────────────────────────────────────
let editingId = null; // id of the history session being edited in the log form

// Loads a logged session into the log form; saving then replaces it.
function editSession(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  showPage('log');
  renderProgramBanner(''); // its slot is already done; saveSession keeps s.program
  const set = (el, v) => { document.getElementById(el).value = v ?? ''; };
  set('date', s.date);
  set('session-type', s.type);
  onTypeChange();
  set('cardio-duration', s.duration); set('cardio-intensity', s.intensity || 'medium');
  set('cardio-hr-avg', s.hr?.avg);    set('cardio-hr-max', s.hr?.max);
  set('cardio-speed-avg', s.speed?.avg); set('cardio-speed-max', s.speed?.max);
  document.getElementById('exercises').innerHTML = '';
  exCount = 0;
  (s.exercises?.length ? s.exercises : [{}]).forEach(e => addExercise(e));
  if (s.energy) set('energy', s.energy);
  if (s.sleep) set('sleep', s.sleep);
  set('recovery', s.recovery || 'normal');
  set('kps-morning', s.kps?.morning); set('kps-post', s.kps?.post);
  set('notes', s.notes);
  editingId = id;
  document.getElementById('save-btn').textContent = 'Update session';
  document.getElementById('cancel-edit-btn').style.display = '';
  setStatus(`Editing session of ${s.date}`, 'pending');
  window.scrollTo(0, 0);
}

async function deleteSession(id) {
  const s = sessions.find(x => x.id === id);
  if (!s || !confirm(`Delete ${s.type} session of ${s.date}?`)) return;
  const del = deletedIds(); del.add(id); setDeletedIds(del);
  const pending = pendingIds(); pending.delete(id); setPendingIds(pending);
  sessions = sessions.filter(x => x.id !== id);
  localStorage.setItem('tl_sessions', JSON.stringify(sessions));
  if (editingId === id) resetForm();
  renderHistory();
  if (!await syncToGitHub().catch(() => false)) alert('Deleted locally. GitHub sync failed — will retry on next save.');
}

function cancelEdit() {
  resetForm();
  setStatus('', 'ok');
}
function saveBodyweight() {
  const date = document.getElementById('bw-date').value;
  const weight = parseFloat(document.getElementById('bw-weight').value);
  if (!date || isNaN(weight) || weight <= 0) return;
  bodyweightLog = bodyweightLog.filter(e => e.date !== date);
  bodyweightLog.push({ date, weight });
  bodyweightLog.sort((a, b) => b.date.localeCompare(a.date));
  BODYWEIGHT_KG = bodyweightLog[0].weight;
  localStorage.setItem('tl_bodyweight', JSON.stringify(bodyweightLog));
  syncBodyweightToGitHub();
  document.getElementById('bw-weight').value = '';
  renderBwRecent();
}

function renderBwRecent() {
  const el = document.getElementById('bw-recent');
  if (!el) return;
  el.innerHTML = bodyweightLog.slice(0, 5).map(e =>
    `<span class="bw-entry">${e.date} <strong>${e.weight} kg</strong></span>`
  ).join('');
}

function onTypeChange() {
  const type = document.getElementById('session-type').value;
  const isCardio = CARDIO_TYPES.includes(type);
  const isSpeedType = SPEED_CARDIO_TYPES.includes(type);
  document.getElementById('exercises-section').style.display = isCardio ? 'none' : '';
  document.getElementById('cardio-section').style.display = isCardio ? '' : 'none';
  document.getElementById('cardio-speed-section').style.display = isSpeedType ? '' : 'none';
  const last = sessions.filter(s => (s.user || 'Cas') === currentUser && s.type === type)[0];
  if (isCardio) {
    if (last?.duration)   document.getElementById('cardio-duration').value  = last.duration;
    if (last?.intensity)  document.getElementById('cardio-intensity').value = last.intensity;
    if (last?.hr?.avg)    document.getElementById('cardio-hr-avg').value    = last.hr.avg;
    if (last?.hr?.max)    document.getElementById('cardio-hr-max').value    = last.hr.max;
    if (isSpeedType) {
      const isPace = type === 'Running';
      const unit = type === 'Running' ? 'mm:ss/km' : type === 'Swimming' ? 'min/100m' : 'km/h';
      const label = type === 'Cycling' ? 'speed' : 'pace';
      document.getElementById('cardio-speed-avg-label').textContent = `Avg ${label} (${unit})`;
      document.getElementById('cardio-speed-max-label').textContent = `Max ${label} (${unit})`;
      const avgInput = document.getElementById('cardio-speed-avg');
      const maxInput = document.getElementById('cardio-speed-max');
      avgInput.type = isPace ? 'text' : 'number';
      maxInput.type = isPace ? 'text' : 'number';
      avgInput.placeholder = isPace ? 'e.g. 4:45' : 'optional';
      maxInput.placeholder = isPace ? 'e.g. 4:30' : 'optional';
      document.getElementById('cardio-speed-hint').style.display = isPace ? '' : 'none';
      if (last?.speed?.avg) avgInput.value = last.speed.avg;
      if (last?.speed?.max) maxInput.value = last.speed.max;
    }
  } else {
    document.getElementById('exercises').innerHTML = '';
    exCount = 0;
    (last?.exercises?.length ? last.exercises : [{}]).forEach(e => addExercise(e));
  }
}

async function saveSession() {
  const date = document.getElementById('date').value;
  if (!date) { setStatus('Please set a date.', 'err'); return; }

  const type = document.getElementById('session-type').value;
  const isCardio = CARDIO_TYPES.includes(type);

  if (type === 'Running') {
    const pacePattern = /^\d{1,2}:[0-5]\d$/;
    const avgPace = document.getElementById('cardio-speed-avg').value.trim();
    const maxPace = document.getElementById('cardio-speed-max').value.trim();
    if ((avgPace && !pacePattern.test(avgPace)) || (maxPace && !pacePattern.test(maxPace))) {
      setStatus('Pace must be in mm:ss format, e.g. 4:45.', 'err');
      return;
    }
  }

  const session = {
    id: editingId || Date.now(),
    user: currentUser,
    date,
    type,
    ...(isCardio ? {
      duration:  document.getElementById('cardio-duration').value || null,
      intensity: document.getElementById('cardio-intensity').value || null,
      hr: {
        avg: document.getElementById('cardio-hr-avg').value || null,
        max: document.getElementById('cardio-hr-max').value || null,
      },
      ...(SPEED_CARDIO_TYPES.includes(type) ? { speed: {
        avg: document.getElementById('cardio-speed-avg').value || null,
        max: document.getElementById('cardio-speed-max').value || null,
      }} : {}),
      exercises: [],
    } : {
      exercises: getExercises(),
    }),
    energy: document.getElementById('energy').value,
    sleep: document.getElementById('sleep').value,
    recovery: document.getElementById('recovery').value,
    ...(currentUser === 'Cas' ? {
      kps: {
        morning: document.getElementById('kps-morning').value || null,
        post: document.getElementById('kps-post').value || null,
      }
    } : {}),
    notes: document.getElementById('notes').value.trim(),
  };
  const slot = document.getElementById('program-slot').value;
  const original = editingId && sessions.find(s => s.id === editingId);
  if (slot && program && !isCardio) session.program = { id: program.id, slot };
  else if (original?.program) session.program = original.program;

  // Detect never-logged exercises before this session joins `sessions`.
  const toCalibrate = newPatellarCandidates(session.exercises);

  // Register any new exercise names in the shared wiki.
  // Awaited (not fire-and-forget) so this commit lands before the log
  // commit below starts — two concurrent PUTs to the same GitHub branch
  // race for the ref update and the second one can fail with a 409.
  const newNames = (session.exercises || [])
    .map(e => e.name)
    .filter(n => n && !wikiExercises.includes(n));
  if (newNames.length) {
    wikiExercises = [...new Set([...wikiExercises, ...newNames])].sort();
    await syncWikiToGitHub();
  }

  // Save locally first
  sessions = [session, ...sessions.filter(s => s.id !== session.id)];
  sessions.sort((a, b) => b.date.localeCompare(a.date));
  localStorage.setItem('tl_sessions', JSON.stringify(sessions));
  markPending(session.id);
  setStatus('Saved locally…', 'pending');

  // Sync to GitHub via Worker
  const ok = await syncToGitHub().catch(() => false);
  if (ok) setStatus('✓ Synced to GitHub', 'ok');
  else setStatus('Saved locally. GitHub sync failed.', 'err');

  resetForm();
  startStrainCalibration(toCalibrate);
}

function setStatus(msg, type) {
  const el = document.getElementById('save-status');
  el.textContent = msg;
  el.className = 'status-'+type;
}

function resetForm() {
  editingId = null;
  document.getElementById('save-btn').textContent = 'Save session';
  document.getElementById('cancel-edit-btn').style.display = 'none';
  document.getElementById('recovery').value = 'normal';
  document.getElementById('notes').value = '';
  document.getElementById('kps-morning').value = '';
  document.getElementById('kps-post').value = '';
  document.getElementById('cardio-duration').value = '';
  document.getElementById('cardio-intensity').value = 'medium';
  document.getElementById('cardio-hr-avg').value = '';
  document.getElementById('cardio-hr-max').value = '';
  document.getElementById('cardio-speed-avg').value = '';
  document.getElementById('cardio-speed-max').value = '';
  // Pre-fills the next program session, or (no program) the last session of this type
  selectProgramSlot(nextSlot()?.slot || '');
}
