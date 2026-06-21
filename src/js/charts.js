// ── PROGRESSION CHART ─────────────────────────────────────────────
let progressionChart = null;
let progressionMetric = 'e1rm';

function setProgressionMetric(metric) {
  progressionMetric = metric;
  document.getElementById('metric-btn-e1rm').classList.toggle('active', metric === 'e1rm');
  document.getElementById('metric-btn-volume').classList.toggle('active', metric === 'volume');
  renderProgressionChart();
}

function populateProgressionSelect() {
  const sel = document.getElementById('progression-exercise');
  const names = [...new Set(
    sessions.filter(s => (s.user || 'Cas') === currentUser)
      .flatMap(s => (s.exercises || []).map(e => e.name))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const prev = sel.value;
  sel.innerHTML = names.length
    ? names.map(n => `<option value="${n}">${n}</option>`).join('')
    : '<option value="">No exercises logged yet</option>';
  if (names.includes(prev)) sel.value = prev;
}

function renderProgressionChart() {
  const exercise = document.getElementById('progression-exercise').value;
  const wrap = document.getElementById('progression-chart-wrap');
  const empty = document.getElementById('progression-empty');

  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  const points = sessions
    .filter(s => (s.user || 'Cas') === currentUser && new Date(s.date).getTime() >= cutoff)
    .flatMap(s => (s.exercises || [])
      .filter(e => e.name === exercise)
      .map(e => {
        const { e1rm, volume } = parseLoading(e.loading, e.rpe);
        const value = progressionMetric === 'volume' ? volume : e1rm;
        return { date: s.date, value };
      }))
    .filter(p => p.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (progressionChart) { progressionChart.destroy(); progressionChart = null; }

  if (!exercise || !points.length) {
    wrap.style.display = 'none';
    empty.style.display = '';
    empty.textContent = `No ${progressionMetric === 'e1rm' ? 'e1RM' : 'volume'} data for this exercise in the last 12 weeks.`;
    return;
  }
  wrap.style.display = '';
  empty.style.display = 'none';

  progressionChart = new Chart(document.getElementById('progression-chart'), {
    type: 'line',
    data: {
      labels: points.map(p => p.date),
      datasets: [{
        label: exercise,
        data: points.map(p => p.value),
        borderColor: '#c8f542',
        backgroundColor: 'rgba(200,245,66,0.12)',
        pointBackgroundColor: '#c8f542',
        tension: 0.25,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a7872', font: { size: 11 } }, grid: { color: '#2e2e2e' } },
        y: { ticks: { color: '#7a7872', font: { size: 11 } }, grid: { color: '#2e2e2e' } },
      }
    }
  });
}

// ── KPS SENSITIVITY CHART ──────────────────────────────────────────
let kpsSensitivityChart = null;
let kpsMetric = 'acute';

const KPS_METRIC_DESC = {
  'acute': 'Per session: (post − morning KPS) ÷ patellar loading volume. Captures immediate irritation on the day.',
  'morning-after': 'Per training day: (next-morning KPS − morning KPS) ÷ patellar loading volume. Captures overnight inflammatory response to load; more relevant for tissue adaptation trends.',
};

function setKpsMetric(metric) {
  kpsMetric = metric;
  document.getElementById('kps-metric-btn-acute').classList.toggle('active', metric === 'acute');
  document.getElementById('kps-metric-btn-morning').classList.toggle('active', metric === 'morning-after');
  renderKpsSensitivityChart();
}

function renderKpsSensitivityChart() {
  const wrap = document.getElementById('kps-sensitivity-chart-wrap');
  const empty = document.getElementById('kps-sensitivity-empty');
  document.getElementById('kps-chart-desc').textContent = KPS_METRIC_DESC[kpsMetric];

  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  let points;

  if (kpsMetric === 'acute') {
    points = sessions
      .filter(s => (s.user || 'Cas') === 'Cas' && new Date(s.date).getTime() >= cutoff
        && s.kps?.morning != null && s.kps?.post != null && s.kps.morning !== '' && s.kps.post !== '')
      .map(s => {
        const volume = sessionPatellarVolume(s);
        const deltaKps = (+s.kps.post) - (+s.kps.morning);
        return { date: s.date, value: volume > 0 ? deltaKps / volume : null };
      })
      .filter(p => p.value !== null && !isNaN(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // Build a per-day map: date -> { morningKps, totalPatellarVolume }
    const dayMap = {};
    sessions.filter(s => (s.user || 'Cas') === 'Cas').forEach(s => {
      if (!dayMap[s.date]) dayMap[s.date] = { morningKps: null, patellarVolume: 0 };
      if (s.kps?.morning != null && s.kps.morning !== '' && dayMap[s.date].morningKps === null)
        dayMap[s.date].morningKps = +s.kps.morning;
      dayMap[s.date].patellarVolume += sessionPatellarVolume(s);
    });
    const dates = Object.keys(dayMap).sort();
    points = dates
      .filter(d => new Date(d).getTime() >= cutoff
        && dayMap[d].morningKps !== null && dayMap[d].patellarVolume > 0)
      .map(d => {
        const dMs = new Date(d).getTime();
        const nextDate = dates.find(nd => {
          const diff = (new Date(nd).getTime() - dMs) / 864e5;
          return diff > 0 && diff <= 3 && dayMap[nd].morningKps !== null;
        });
        if (!nextDate) return null;
        const deltaKps = dayMap[nextDate].morningKps - dayMap[d].morningKps;
        return { date: d, value: deltaKps / dayMap[d].patellarVolume };
      })
      .filter(Boolean);
  }

  if (kpsSensitivityChart) { kpsSensitivityChart.destroy(); kpsSensitivityChart = null; }

  if (!points.length) {
    wrap.style.display = 'none';
    empty.style.display = '';
    empty.textContent = kpsMetric === 'acute'
      ? 'No sessions with both KPS and patellar loading in the last 12 weeks.'
      : 'No training days with patellar loading followed by a logged next-morning KPS in the last 12 weeks.';
    return;
  }
  wrap.style.display = '';
  empty.style.display = 'none';

  kpsSensitivityChart = new Chart(document.getElementById('kps-sensitivity-chart'), {
    type: 'line',
    data: {
      labels: points.map(p => p.date),
      datasets: [{
        label: kpsMetric === 'acute' ? 'ΔKPS (same-day) / volume' : 'Δmorning KPS / volume',
        data: points.map(p => p.value),
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255,107,107,0.12)',
        pointBackgroundColor: '#ff6b6b',
        tension: 0.25,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a7872', font: { size: 11 } }, grid: { color: '#2e2e2e' } },
        y: { ticks: { color: '#7a7872', font: { size: 11 } }, grid: { color: '#2e2e2e' } },
      }
    }
  });
}
