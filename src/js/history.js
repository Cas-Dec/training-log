// ── HISTORY ────────────────────────────────────────────────────────
const TWELVE_WEEKS_MS = 84 * 864e5;

function parseLoading(loading, rpe) {
  loading = loading || '';
  const parts = loading.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return { sets: null, reps: null, e1rm: null, volume: null };
  const rpeNum = rpe ? parseFloat((rpe + '').match(/[\d.]+/)?.[0]) : null;
  const rpeMult = (rpeNum != null && rpeNum >= 1 && rpeNum <= 10) ? 1 + (10 - rpeNum) / 10 : 1;
  let totalVolume = 0, maxE1rm = null, firstSets = null, firstReps = null, volumeValid = true;
  for (const part of parts) {
    const sr = part.match(/^([\d.]+)\s*x\s*([\d.]+)/i);
    const w = part.match(/@\s*([\d.]+)/);
    const sets = sr ? parseFloat(sr[1]) : null;
    const reps = sr ? parseFloat(sr[2]) : null;
    const weight = w ? parseFloat(w[1]) : null;
    if (firstSets === null) { firstSets = sets; firstReps = reps; }
    if (sets !== null && reps !== null && weight !== null) {
      const maxReps = reps * rpeMult;
      totalVolume += sets * maxReps * weight;
      const e1rm = weight * (1 + maxReps / 30);
      if (maxE1rm === null || e1rm > maxE1rm) maxE1rm = e1rm;
    } else {
      volumeValid = false;
    }
  }
  return { sets: firstSets, reps: firstReps, e1rm: maxE1rm, volume: volumeValid && totalVolume > 0 ? totalVolume : null };
}

function sessionPatellarVolume(s) {
  const impactMatch = (s.notes || '').match(/\$IMPACT=([\w-]+)/i);
  if (impactMatch) return IMPACT_MIDPOINTS[impactMatch[1].toLowerCase().replace(/_/g,'-')] ?? 0;

  if (CARDIO_TYPES.includes(s.type)) {
    const entry = lookup.cardio[s.type];
    if (!entry || !s.duration) return 0;
    const scale = entry.intensity_scale?.[s.intensity || 'medium'] ?? 1;
    return entry.loading_min * scale * Math.sqrt(+s.duration);
  }

  return (s.exercises || []).reduce((sum, e) => {
    const entry = lookup.exercises[(e.name || '').toLowerCase().trim()];
    if (!entry || !entry.strain_factor) return sum;
    const parts = (e.loading || '').split(',').map(p => p.trim()).filter(Boolean);
    return sum + parts.reduce((pSum, part) => {
      const sr = part.match(/^([\d.]+)\s*x\s*([\d.]+)/i);
      const w = part.match(/@\s*([\d.]+)/);
      const sets = sr ? parseFloat(sr[1]) : null;
      const reps = sr ? parseFloat(sr[2]) : null;
      if (!sets || !reps) return pSum;
      const added = w ? parseFloat(w[1]) : 0;
      const weight = entry.bodyweight ? BODYWEIGHT_KG + added : added;
      if (!weight) return pSum;
      return pSum + entry.strain_factor * weight * Math.log10(10 + sets * reps);
    }, 0);
  }, 0);
}

function renderHistory() {
  const filtered = sessions.filter(s => (s.user || 'Cas') === currentUser);
  const n = filtered.length;
  const last7 = filtered.filter(s => (Date.now()-new Date(s.date))/864e5 <= 7).length;
  const kpsAll = filtered.flatMap(s => s.kps?.post ? [+s.kps.post] : []).filter(x=>!isNaN(x));
  const avgKPS = kpsAll.length ? (kpsAll.reduce((a,b)=>a+b)/kpsAll.length).toFixed(1) : '–';

  const kpsStat = currentUser === 'Cas'
    ? `<div class="stat-box"><div class="stat-val">${avgKPS}</div><div class="stat-lbl">Avg KPS (post)</div></div>`
    : '';
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-box"><div class="stat-val">${n}</div><div class="stat-lbl">Total sessions</div></div>
    <div class="stat-box"><div class="stat-val">${last7}</div><div class="stat-lbl">Last 7 days</div></div>
    ${kpsStat}`;

  populateProgressionSelect();
  renderProgressionChart();
  renderBodyweightChart();

  const sensitivitySection = document.getElementById('kps-sensitivity-section');
  sensitivitySection.style.display = currentUser === 'Cas' ? '' : 'none';
  if (currentUser === 'Cas') renderKpsSensitivityChart();

  const list = document.getElementById('history-list');
  if (!n) { list.innerHTML = '<div class="empty">No sessions yet. Log your first one.</div>'; return; }

  list.innerHTML = filtered.map(s => {
    const isCardio = CARDIO_TYPES.includes(s.type);
    const activityHtml = isCardio
      ? `<div class="card-meta" style="margin-bottom:6px">
          ${s.duration   ? `<span>${s.duration} min</span>` : ''}
          ${s.intensity  ? `<span>Intensity: ${s.intensity}</span>` : ''}
          ${s.hr?.avg    ? `<span>HR avg ${s.hr.avg} bpm</span>` : ''}
          ${s.hr?.max    ? `<span>HR max ${s.hr.max} bpm</span>` : ''}
          ${s.speed?.avg ? `<span>Avg ${s.speed.avg} ${s.type === 'Running' ? 'min/km' : s.type === 'Swimming' ? 'min/100m' : 'km/h'}</span>` : ''}
          ${s.speed?.max ? `<span>Max ${s.speed.max} ${s.type === 'Running' ? 'min/km' : s.type === 'Swimming' ? 'min/100m' : 'km/h'}</span>` : ''}
        </div>`
      : (s.exercises?.length ? `<div class="ex-chips">${s.exercises.map(e=>`<span class="ex-chip">${e.name} ${e.loading}${e.rpe?' '+e.rpe:''}</span>`).join('')}</div>` : '');
    return `
    <div class="session-card">
      <div class="card-top">
        <span class="card-date">${s.date}</span>
        <span class="badge badge-${s.type.replace(/\s+/g,'')}">${s.type}</span>
      </div>
      ${activityHtml}
      <div class="card-meta">
        ${currentUser === 'Cas' && (s.kps?.morning||s.kps?.post) ? `<span>KPS ${s.kps.morning||'?'} → ${s.kps.post||'?'}</span>` : ''}
        ${s.energy   ? `<span>Energy: ${s.energy}</span>`     : ''}
        ${s.sleep    ? `<span>Sleep: ${s.sleep}</span>`       : ''}
        ${s.recovery ? `<span>Recovery: ${s.recovery}</span>` : ''}
      </div>
      ${s.notes ? `<div class="card-notes">${s.notes}</div>` : ''}
    </div>`;
  }).join('');
}
