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

// ── BODYWEIGHT CHART ───────────────────────────────────────────────
let bodyweightChart = null;

function renderBodyweightChart() {
  const wrap  = document.getElementById('bw-chart-wrap');
  const empty = document.getElementById('bw-empty');

  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  const points = bodyweightLog
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (bodyweightChart) { bodyweightChart.destroy(); bodyweightChart = null; }

  if (!points.length) {
    wrap.style.display  = 'none';
    empty.style.display = '';
    empty.textContent   = 'No bodyweight logged in the last 12 weeks.';
    return;
  }
  wrap.style.display  = '';
  empty.style.display = 'none';

  bodyweightChart = new Chart(document.getElementById('bw-chart'), {
    type: 'line',
    data: {
      labels: points.map(p => p.date),
      datasets: [{
        data: points.map(p => p.weight),
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

function renderKpsSensitivityChart() {
  const wrapLoad = document.getElementById('kps-loading-chart-wrap');
  const wrapKps  = document.getElementById('kps-kps-chart-wrap');
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

  const dates = Object.keys(dayMap)
    .filter(d => new Date(d).getTime() >= cutoff)
    .sort();

  if (kpsLoadingChart) { kpsLoadingChart.destroy(); kpsLoadingChart = null; }
  if (kpsKpsChart)     { kpsKpsChart.destroy();     kpsKpsChart = null; }

  if (!dates.length) {
    wrapLoad.style.display = 'none';
    wrapKps.style.display  = 'none';
    empty.style.display    = '';
    empty.textContent = 'No sessions in the last 12 weeks.';
    return;
  }
  wrapLoad.style.display = '';
  wrapKps.style.display  = '';
  empty.style.display    = 'none';

  const xAxis = { ticks: { color: '#7a7872', font: { size: 11 }, maxTicksLimit: 10 }, grid: { color: '#2e2e2e' } };
  const yAxis = { ticks: { color: '#7a7872', font: { size: 11 } }, grid: { color: '#2e2e2e' }, beginAtZero: true };

  // Top: patellar loading per day (bar)
  kpsLoadingChart = new Chart(document.getElementById('kps-loading-chart'), {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Patellar load',
        data: dates.map(d => dayMap[d].loading > 0 ? +dayMap[d].loading.toFixed(1) : null),
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
  const morningData = dates.map(d => dayMap[d].morningKps);
  const postData    = dates.map(d => dayMap[d].postKps);
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
        y: { ...yAxis, min: 0, max: 10, ticks: { ...yAxis.ticks, stepSize: 2 } },
      }
    }
  });
}
