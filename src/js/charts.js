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

// Earliest timestamp among a list of 'YYYY-MM-DD' date keys.
function earliestMs(dateKeys) {
  return Math.min(...dateKeys.map(d => new Date(d).getTime()));
}

// Aggregate (via `aggregate`, e.g. max/min/mean) of values logged in the
// last 2 weeks, and the same aggregate over the reference window 10-12
// weeks before that (falling back to the first 2 weeks of recorded data if
// there's under 12 weeks of history). Returns null if either is unavailable.
function computeWindowAggregates(valueByDate, aggregate) {
  const DAY_MS = 864e5;
  const dateKeys = Object.keys(valueByDate);
  if (!dateKeys.length) return null;

  const times = dateKeys.map(d => new Date(d).getTime());
  const lastTime = Math.max(...times);
  const firstTime = Math.min(...times);

  const aggInWindow = (startMs, endMs) => {
    const vals = dateKeys
      .filter(d => { const t = new Date(d).getTime(); return t >= startMs && t <= endMs; })
      .map(d => valueByDate[d]);
    return vals.length ? aggregate(vals) : null;
  };

  const recent = aggInWindow(lastTime - 14 * DAY_MS, lastTime);

  const hasFullTwelveWeeks = (lastTime - firstTime) >= 84 * DAY_MS;
  const ref = hasFullTwelveWeeks
    ? aggInWindow(lastTime - 84 * DAY_MS, lastTime - 70 * DAY_MS)
    : aggInWindow(firstTime, firstTime + 14 * DAY_MS);

  if (recent == null || ref == null) return null;
  return { recent, ref };
}

function computeWindowDelta(valueByDate, aggregate) {
  const agg = computeWindowAggregates(valueByDate, aggregate);
  return agg ? agg.recent - agg.ref : null;
}

// Percent change of the recent-2-week aggregate relative to the reference
// window aggregate. Null if there's no reference data or it's zero.
function computeWindowPercentChange(valueByDate, aggregate) {
  const agg = computeWindowAggregates(valueByDate, aggregate);
  if (!agg || agg.ref === 0) return null;
  return ((agg.recent - agg.ref) / agg.ref) * 100;
}

const maxOf  = vals => Math.max(...vals);
const minOf  = vals => Math.min(...vals);
const meanOf = vals => vals.reduce((a, b) => a + b, 0) / vals.length;

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

// Writes a delta badge (e.g. "+3.0 kg") into `deltaEl`, colored to match
// the chart's line, or clears it if there isn't enough data for a delta.
function renderDeltaBadge(deltaEl, delta, color, { decimals = 1, unit = ' kg' } = {}) {
  if (delta == null) {
    deltaEl.textContent = '';
    return;
  }
  deltaEl.textContent = `${delta > 0 ? '+' : ''}${delta.toFixed(decimals)}${unit}`;
  deltaEl.style.color = color;
}

function renderProgressionChart() {
  const exercise = document.getElementById('progression-exercise').value;
  const wrap = document.getElementById('progression-chart-wrap');
  const empty = document.getElementById('progression-empty');
  const deltaEl = document.getElementById('progression-delta');

  const cutoff = Date.now() - TWELVE_WEEKS_MS;
  const byDate = {};
  const e1rmByDate = {};
  sessions
    .filter(s => (s.user || 'Cas') === currentUser && new Date(s.date).getTime() >= cutoff)
    .forEach(s => (s.exercises || [])
      .filter(e => e.name === exercise)
      .forEach(e => {
        const { e1rm, volume } = parseLoading(e.loading, e.rpe);
        const value = progressionMetric === 'volume' ? volume : e1rm;
        if (value !== null) byDate[s.date] = value;
        if (e1rm !== null && (e1rmByDate[s.date] === undefined || e1rm > e1rmByDate[s.date])) {
          e1rmByDate[s.date] = e1rm;
        }
      }));
  const hasData = Object.keys(byDate).length > 0;

  if (progressionChart) { progressionChart.destroy(); progressionChart = null; }

  if (!exercise || !hasData) {
    wrap.style.display = 'none';
    empty.style.display = '';
    empty.textContent = `No ${progressionMetric === 'e1rm' ? 'e1RM' : 'volume'} data for this exercise in the last 12 weeks.`;
    deltaEl.textContent = '';
    return;
  }
  wrap.style.display = '';
  empty.style.display = 'none';

  renderDeltaBadge(deltaEl, computeWindowDelta(e1rmByDate, maxOf), '#c8f542');

  const days = denseDayRange(earliestMs(Object.keys(byDate)), Date.now());

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
  const deltaEl = document.getElementById('bw-delta');

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
    deltaEl.textContent = '';
    return;
  }
  wrap.style.display  = '';
  empty.style.display = 'none';

  renderDeltaBadge(deltaEl, computeWindowDelta(byDate, minOf), '#c8f542');

  const days = denseDayRange(earliestMs(Object.keys(byDate)), Date.now());

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
  const tolDeltaEl = document.getElementById('tolerance-delta');

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

  const recentDates = Object.keys(dayMap).filter(d => new Date(d).getTime() >= cutoff);

  if (kpsLoadingChart)   { kpsLoadingChart.destroy();   kpsLoadingChart = null; }
  if (kpsKpsChart)       { kpsKpsChart.destroy();       kpsKpsChart = null; }
  if (kpsToleranceChart) { kpsToleranceChart.destroy(); kpsToleranceChart = null; }

  if (!recentDates.length) {
    wrapLoad.style.display = 'none';
    wrapKps.style.display  = 'none';
    wrapTol.style.display  = 'none';
    empty.style.display    = '';
    empty.textContent = 'No sessions in the last 12 weeks.';
    tolDeltaEl.textContent = '';
    return;
  }
  wrapLoad.style.display = '';
  wrapKps.style.display  = '';
  wrapTol.style.display  = '';
  empty.style.display    = 'none';

  const dates = denseDayRange(earliestMs(recentDates), Date.now());

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

  // Third: for each calendar day, take its peak KPS (the higher of morning/post, whichever were
  // logged), then the day-over-day rise = next day's peak − today's peak, walking every
  // consecutive calendar day across full history regardless of whether either day had a
  // session. Per calendar month, sum only the *positive* rises (a drop or hold contributes
  // nothing — recoveries can't cancel out flare-ups) and divide by that month's total patellar
  // load. Lower = more tolerant. This fixes two issues with a plain daily-delta approach: gating
  // on "did today have a session" silently drops the KPS change across rest days, and letting
  // negative deltas net against positive ones hides real flare-ups behind unrelated relief.
  const allDates = denseDayRange(earliestMs(Object.keys(dayMap)), Date.now());
  const peakKps = d => {
    const m = dayMap[d]?.morningKps, p = dayMap[d]?.postKps;
    if (m == null) return p;
    if (p == null) return m;
    return Math.max(m, p);
  };

  const monthAgg = {};
  allDates.forEach(d => {
    const key = d.slice(0, 7); // 'YYYY-MM'
    if (!monthAgg[key]) monthAgg[key] = { sumRise: 0, sumLoad: 0 };
    monthAgg[key].sumLoad += dayMap[d]?.loading || 0;
  });
  allDates.forEach((d, i) => {
    const next = allDates[i + 1];
    if (!next) return;
    const before = peakKps(d), after = peakKps(next);
    if (before == null || after == null) return;
    const rise = after - before;
    if (rise > 0) monthAgg[next.slice(0, 7)].sumRise += rise;
  });

  const monthKeys = Object.keys(monthAgg).sort();
  const monthLabels = monthKeys.map(k => {
    const [y, m] = k.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  });
  const monthSensitivity = monthKeys.map(k => monthAgg[k].sumLoad > 0 ? monthAgg[k].sumRise / monthAgg[k].sumLoad : null);

  const validMonthVals = monthSensitivity.filter(v => v != null);
  let monthDeltaPct = null;
  if (validMonthVals.length >= 2 && validMonthVals[0] !== 0) {
    monthDeltaPct = ((validMonthVals[validMonthVals.length - 1] - validMonthVals[0]) / Math.abs(validMonthVals[0])) * 100;
  }
  renderDeltaBadge(tolDeltaEl, monthDeltaPct, '#4fd1c5', { decimals: 0, unit: '%' });

  kpsToleranceChart = new Chart(document.getElementById('kps-tolerance-chart'), {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Load sensitivity (KPS rises ÷ load, per month)',
        data: monthSensitivity.map(v => v !== null ? +v.toFixed(4) : null),
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
