// Every calendar day from startMs to endMs inclusive, as 'YYYY-MM-DD' (UTC).
// Used as chart labels so the x-axis has a fixed day-per-category width instead
// of collapsing gaps between logged days.
function denseDayRange(startMs, endMs) {
  const days = [];
  const start = Math.floor(startMs / 864e5) * 864e5;
  const end   = Math.floor(endMs   / 864e5) * 864e5;
  for (let t = start; t <= end; t += 864e5) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

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
  const byDate = {};
  sessions
    .filter(s => (s.user || 'Cas') === currentUser && new Date(s.date).getTime() >= cutoff)
    .forEach(s => (s.exercises || [])
      .filter(e => e.name === exercise)
      .forEach(e => {
        const { e1rm, volume } = parseLoading(e.loading, e.rpe);
        const value = progressionMetric === 'volume' ? volume : e1rm;
        if (value !== null) byDate[s.date] = value;
      }));
  const hasData = Object.keys(byDate).length > 0;

  if (progressionChart) { progressionChart.destroy(); progressionChart = null; }

  if (!exercise || !hasData) {
    wrap.style.display = 'none';
    empty.style.display = '';
    empty.textContent = `No ${progressionMetric === 'e1rm' ? 'e1RM' : 'volume'} data for this exercise in the last 12 weeks.`;
    return;
  }
  wrap.style.display = '';
  empty.style.display = 'none';

  const days = denseDayRange(cutoff, Date.now());

  progressionChart = new Chart(document.getElementById('progression-chart'), {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: exercise,
        data: days.map(d => byDate[d] ?? null),
        borderColor: '#c8f542',
        backgroundColor: 'rgba(200,245,66,0.12)',
        pointBackgroundColor: '#c8f542',
        tension: 0.25,
        fill: true,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a7872', font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: '#2e2e2e' } },
        y: { ticks: { color: '#7a7872', font: { size: 11 } }, grid: { color: '#2e2e2e' }, min: 0 },
      }
    }
  });
}

// ── BODYWEIGHT CHART ───────────────────────────────────────────────
let bodyweightChart = null;

function renderBodyweightChart() {
  const wrap  = document.getElementById('bw-chart-wrap');
  const empty = document.getElementById('bw-empty');

  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  const byDate = {};
  bodyweightLog
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .forEach(e => { byDate[e.date] = e.weight; });
  const hasData = Object.keys(byDate).length > 0;

  if (bodyweightChart) { bodyweightChart.destroy(); bodyweightChart = null; }

  if (!hasData) {
    wrap.style.display  = 'none';
    empty.style.display = '';
    empty.textContent   = 'No bodyweight logged in the last 12 weeks.';
    return;
  }
  wrap.style.display  = '';
  empty.style.display = 'none';

  const days = denseDayRange(cutoff, Date.now());

  bodyweightChart = new Chart(document.getElementById('bw-chart'), {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        data: days.map(d => byDate[d] ?? null),
        spanGaps: true,
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
        x: { ticks: { color: '#7a7872', font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: '#2e2e2e' } },
        y: { ticks: { color: '#7a7872', font: { size: 11 }, callback: v => v + ' kg' }, grid: { color: '#2e2e2e' } },
      }
    }
  });
}

// ── KPS CHARTS ─────────────────────────────────────────────────────
let kpsLoadingChart = null;
let kpsKpsChart = null;
let kpsToleranceChart = null;

function renderKpsSensitivityChart() {
  const wrapLoad = document.getElementById('kps-loading-chart-wrap');
  const wrapKps  = document.getElementById('kps-kps-chart-wrap');
  const wrapTol  = document.getElementById('kps-tolerance-chart-wrap');
  const empty    = document.getElementById('kps-sensitivity-empty');

  const cutoff = Date.now() - TWELVE_WEEKS_MS;

  // Aggregate per day
  const dayMap = {};
  sessions.filter(s => (s.user || 'Cas') === 'Cas').forEach(s => {
    if (!dayMap[s.date]) dayMap[s.date] = { loading: 0, morningKps: null, postKps: null };
    dayMap[s.date].loading += sessionPatellarVolume(s);
    if (s.kps?.morning != null && s.kps.morning !== '' && dayMap[s.date].morningKps === null)
      dayMap[s.date].morningKps = +s.kps.morning;
    if (s.kps?.post != null && s.kps.post !== '')
      dayMap[s.date].postKps = +s.kps.post;
  });

  const hasRecent = Object.keys(dayMap).some(d => new Date(d).getTime() >= cutoff);

  if (kpsLoadingChart)   { kpsLoadingChart.destroy();   kpsLoadingChart = null; }
  if (kpsKpsChart)       { kpsKpsChart.destroy();       kpsKpsChart = null; }
  if (kpsToleranceChart) { kpsToleranceChart.destroy(); kpsToleranceChart = null; }

  if (!hasRecent) {
    wrapLoad.style.display = 'none';
    wrapKps.style.display  = 'none';
    wrapTol.style.display  = 'none';
    empty.style.display    = '';
    empty.textContent = 'No sessions in the last 12 weeks.';
    return;
  }
  wrapLoad.style.display = '';
  wrapKps.style.display  = '';
  wrapTol.style.display  = '';
  empty.style.display    = 'none';

  const dates = denseDayRange(cutoff, Date.now());

  const xAxis = { ticks: { color: '#7a7872', font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: '#2e2e2e' } };
  const yAxis = { ticks: { color: '#7a7872', font: { size: 11 } }, grid: { color: '#2e2e2e' }, beginAtZero: true };

  // Top: patellar loading per day (bar)
  kpsLoadingChart = new Chart(document.getElementById('kps-loading-chart'), {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Patellar load',
        data: dates.map(d => dayMap[d]?.loading > 0 ? +dayMap[d].loading.toFixed(1) : null),
        backgroundColor: 'rgba(255,107,107,0.55)',
        borderColor: '#ff6b6b',
        borderWidth: 1,
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: xAxis, y: yAxis },
    }
  });

  // Bottom: KPS history (morning + post)
  const morningData = dates.map(d => dayMap[d]?.morningKps ?? null);
  const postData    = dates.map(d => dayMap[d]?.postKps ?? null);
  const hasPost     = postData.some(v => v !== null);

  const kpsDatasets = [{
    label: 'Morning KPS',
    data: morningData,
    borderColor: '#ff6b6b',
    backgroundColor: 'rgba(255,107,107,0.12)',
    pointBackgroundColor: '#ff6b6b',
    tension: 0.25,
    fill: true,
    spanGaps: true,
  }];
  if (hasPost) kpsDatasets.push({
    label: 'Post KPS',
    data: postData,
    borderColor: '#ffb347',
    backgroundColor: 'transparent',
    pointBackgroundColor: '#ffb347',
    borderDash: [4, 3],
    tension: 0.25,
    fill: false,
    spanGaps: true,
  });

  kpsKpsChart = new Chart(document.getElementById('kps-kps-chart'), {
    type: 'line',
    data: { labels: dates, datasets: kpsDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: hasPost, labels: { color: '#7a7872', font: { size: 11 }, boxWidth: 24 } } },
      scales: {
        x: xAxis,
        y: { ...yAxis, min: 1, max: 6, ticks: { ...yAxis.ticks, stepSize: 1 } },
      }
    }
  });

  // Third: patellar load tolerance = today's load / (tomorrow morning KPS − this morning KPS),
  // smoothed with a trailing 7-calendar-day average. Higher = more load tolerated per unit of
  // next-day pain increase. Days with no session, no tomorrow reading, or a flat/improved
  // morning KPS (delta <= 0, i.e. the ratio breaks down), are left as gaps.
  const DAY_MS = 864e5;
  const rawTolerance = dates.map((d, i) => {
    const loading = dayMap[d]?.loading;
    const next = dates[i + 1];
    if (!loading || !next) return null;
    const before = dayMap[d].morningKps;
    const after  = dayMap[next]?.morningKps;
    if (before == null || after == null) return null;
    const delta = after - before;
    return delta > 0 ? loading / delta : null;
  });

  const smoothedTolerance = dates.map((d, i) => {
    const t = new Date(d).getTime();
    let sum = 0, count = 0;
    for (let j = i; j >= 0; j--) {
      if (t - new Date(dates[j]).getTime() > 6 * DAY_MS) break;
      if (rawTolerance[j] != null) { sum += rawTolerance[j]; count++; }
    }
    return count ? sum / count : null;
  });

  kpsToleranceChart = new Chart(document.getElementById('kps-tolerance-chart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Load tolerance (7d avg)',
        data: smoothedTolerance.map(v => v !== null ? +v.toFixed(2) : null),
        borderColor: '#4fd1c5',
        backgroundColor: 'rgba(79,209,197,0.12)',
        pointBackgroundColor: '#4fd1c5',
        tension: 0.25,
        fill: true,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: xAxis, y: yAxis },
    }
  });
}
