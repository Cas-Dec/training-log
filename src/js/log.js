// ── LOG ────────────────────────────────────────────────────────────
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
      if (last?.speed?.avg) document.getElementById('cardio-speed-avg').value = last.speed.avg;
      if (last?.speed?.max) document.getElementById('cardio-speed-max').value = last.speed.max;
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
  const session = {
    id: Date.now(),
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

  // Register any new exercise names in the shared wiki
  const newNames = (session.exercises || [])
    .map(e => e.name)
    .filter(n => n && !wikiExercises.includes(n));
  if (newNames.length) {
    wikiExercises = [...new Set([...wikiExercises, ...newNames])].sort();
    syncWikiToGitHub();
  }

  // Save locally first
  sessions.unshift(session);
  localStorage.setItem('tl_sessions', JSON.stringify(sessions));
  setStatus('Saved locally…', 'pending');

  // Sync to GitHub via Worker
  const ok = await syncToGitHub().catch(() => false);
  if (ok) setStatus('✓ Synced to GitHub', 'ok');
  else setStatus('Saved locally. GitHub sync failed.', 'err');

  resetForm();
}

function setStatus(msg, type) {
  const el = document.getElementById('save-status');
  el.textContent = msg;
  el.className = 'status-'+type;
}

function resetForm() {
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
  onTypeChange(); // resets exercise section and pre-fills from last session of this type
}
