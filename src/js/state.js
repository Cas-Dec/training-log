// ── STATE ──────────────────────────────────────────────────────────
const WORKER = 'https://claude-proxy.casdecancq.workers.dev';
let sessions = [];
let currentUser = 'Cas';
const CARDIO_TYPES = ['Rugby', 'Badminton', 'Swimming', 'Running', 'Cycling'];
const SPEED_CARDIO_TYPES = ['Running', 'Cycling', 'Swimming'];
let BODYWEIGHT_KG = 85;
const IMPACT_MIDPOINTS = {
  'maximal':120,'very high':80,'high':52,
  'medium to high':31,'medium':17,
  'low to medium':9,'low':4,'very low':1,'none':0,
};
let lookup = { exercises: {}, cardio: {} };
let bodyweightLog = [];
let coreInstructions = '';
let userContextMd = '';
let wikiExercises = [];
