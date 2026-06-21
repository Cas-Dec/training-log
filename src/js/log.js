// ── LOG ────────────────────────────────────────────────────────────
function onTypeChange() {
  const type = document.getElementById('session-type').value;
  const isCardio = CARDIO_TYPES.includes(type);
  document.getElementById('exercises-section').style.display = isCardio ? 'none' : '';
  document.getElementById('cardio-section').style.display = isCardio ? '' : 'none';
  const last = sessions.filter(s => (s.user || 'Cas') === currentUser && s.type === type)[0];
  if (isCardio) {
    if (last?.duration)  document.getElementById('cardio-duration').value  = last.duration;
    if (last?.intensity) document.getElementById('cardio-intensity').value = last.intensity;
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
      duration: document.getElementById('cardio-duration').value || null,
      intensity: document.getElementById('cardio-intensity').value || null,
      exercises: [],
    } : {
      exercises: getExercises(),
    }),
    energy: document.getElementById('energy').value,
    sleep: document.getElementById('sleep').value,
    ...(currentUser === 'Cas' ? {
      kps: {
        morning: document.getElementById('kps-morning').value || null,
        post: document.getElementById('kps-post').value || null,
      }
    } : {}),
    notes: document.getElementById('notes').value.trim(),
  };

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
  document.getElementById('notes').value = '';
  document.getElementById('kps-morning').value = '';
  document.getElementById('kps-post').value = '';
  document.getElementById('cardio-duration').value = '';
  document.getElementById('cardio-intensity').value = 'medium';
  onTypeChange(); // resets exercise section and pre-fills from last session of this type
}
