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
let coreInstructions = '';
let userContextMd = '';
let wikiExercises = [];
