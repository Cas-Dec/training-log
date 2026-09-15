// ── STATE ──────────────────────────────────────────────────────────
// LOADING_MODEL and IMPACT_MIDPOINTS are injected by build.py from src/loading_model.json
const WORKER = 'https://claude-proxy.casdecancq.workers.dev';
let sessions = [];
let currentUser = 'Cas';
const CARDIO_TYPES = ['Rugby', 'Badminton', 'Swimming', 'Running', 'Cycling'];
const SPEED_CARDIO_TYPES = ['Running', 'Cycling', 'Swimming'];
let BODYWEIGHT_KG = 85;

function patellarVol(sets, reps) {
  return LOADING_MODEL.volume_formula === 'sqrt'
    ? Math.sqrt(sets * reps)
    : Math.log10(10 + sets * reps);
}
let lookup = { exercises: {}, cardio: {} };
let bodyweightLog = [];

// Exercises where the base resistance is the lifter's own bodyweight and a logged
// "@Wkg" is weight ADDED on top of it (e.g. weighted pull-ups/dips) — distinct from
// lookup.exercises[...].bodyweight, which marks whether a *patellar-loading* exercise
// also moves bodyweight through space (used for the tendon-load model, not e1RM).
const BODYWEIGHT_LOADED_EXERCISES = new Set(['pull-ups', 'chin-ups', 'dips', 'push-ups', 'muscle-ups']);

function isBodyweightLoadedExercise(name) {
  return BODYWEIGHT_LOADED_EXERCISES.has((name || '').toLowerCase().trim());
}

// Bodyweight logged closest in time to `dateStr`, falling back to the current
// BODYWEIGHT_KG if nothing has been logged yet.
function nearestBodyweightKg(dateStr) {
  if (!bodyweightLog.length) return BODYWEIGHT_KG;
  const target = new Date(dateStr).getTime();
  let best = bodyweightLog[0], bestDiff = Infinity;
  for (const e of bodyweightLog) {
    const diff = Math.abs(new Date(e.date).getTime() - target);
    if (diff < bestDiff) { bestDiff = diff; best = e; }
  }
  return best.weight;
}
let coreInstructions = '';
let userContextMd = '';
let wikiExercises = [];
