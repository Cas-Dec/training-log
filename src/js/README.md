# src/js — JavaScript module reference

Vanilla JS, no framework. `build.py` concatenates these files in strict load order into a single `<script>` block in `index.html`. Because everything runs in one global scope, the order below is the dependency order — each module can call functions and read variables defined in any module listed before it.

## Load order & module roles

### 1. `state.js`
Global constants and mutable state. Everything else reads from here.

| Symbol | Type | Purpose |
|---|---|---|
| `WORKER` | const | Cloudflare Worker base URL |
| `sessions` | let | Session array, newest-first. Populated by `pullFromGitHub()`. |
| `currentUser` | let | `'Cas'` or `'Dries'`. Set on login / token parse. |
| `BODYWEIGHT_KG` | let | Active bodyweight (kg). Defaults to 85; updated on `syncBodyweightFromWorker()` and each new bodyweight entry. Used in patellar load calculations. |
| `lookup` | let | Patellar loading factors. Shape: `{ exercises: { name: { strain_factor, bodyweight } }, cardio: { type: { loading_min, intensity_scale? } } }` |
| `bodyweightLog` | let | `[{ date, weight }]`, newest-first. Populated by `syncBodyweightFromWorker()`. |
| `coreInstructions` | let | Loaded from `core-instructions.md` at runtime. |
| `userContextMd` | let | Loaded from `users/{User}/user-context.md` at runtime. |
| `wikiExercises` | let | Sorted string array of known exercise names, from `exercises.json`. Used for autocomplete. |
| `CARDIO_TYPES` | const | Session types that use the cardio form instead of the exercise list. |
| `IMPACT_MIDPOINTS` | const | Numeric midpoints for each `$IMPACT` label, used as override values in `sessionPatellarVolume()`. |

---

### 2. `auth.js`
Login, token handling, and all GitHub/Worker sync functions.

**Auth**
- `login()` — POSTs credentials to `WORKER/login`, stores the returned JWT in `localStorage['tl_token']`, calls `initApp()`.
- `logout()` — clears token, reloads page.
- `authFetch(url, options)` — `fetch` wrapper that injects the Bearer token and redirects to login on 401.
- `getTokenPayload()` — decodes the local JWT without a network call.

**Session sync**
- `syncToGitHub()` — merges local `sessions` with the remote log (dedup by `session.id`) then PUTs the merged array. Called after every `saveSession()`.
- `pullFromGitHub()` — fetches remote log, merges into local `sessions`, updates `localStorage['tl_sessions']`. Called on `initApp()`.

**Lookup sync**
- `syncLookupFromWorker()` — GETs `users/{User}/loading_lookup.json` via Worker; falls back to the static file. Called on `initApp()`.
- `syncLookupToGitHub()` — PUTs current `lookup` to GitHub. Called after `applyLookupUpdate()` and `resetLookup()`.
- `applyLookupUpdate(update)` — merges a `{"type":"lookup-update", exercises:{…}}` object into `lookup`, persists to localStorage and GitHub. Called from the coach's Apply button.
- `resetLookup()` — clears `lookup`, reloads defaults from the static file.

**Bodyweight sync**
- `syncBodyweightFromWorker()` — GETs `users/{User}/bodyweight.json`; falls back to `localStorage['tl_bodyweight']`. Updates `BODYWEIGHT_KG` to the most recent entry weight.
- `syncBodyweightToGitHub()` — PUTs current `bodyweightLog` to GitHub.

**Context / wiki**
- `loadContextFiles()` — fetches `core-instructions.md`, `users/{User}/user-context.md`, and `exercises.json` in parallel.
- `applyContextUpdate(content)` — writes updated user context markdown to `userContextMd` and syncs to GitHub.
- `syncWikiToGitHub()` — PUTs the `wikiExercises` array to `exercises.json`.

---

### 3. `exercises.js`
Exercise card UI and autocomplete.

- `addExercise(e?)` — appends an exercise card to `#exercises`. Optionally pre-fills from a session object `e`.
- `getExercises()` — reads all exercise cards and returns `[{ name, loading, rpe }]`.
- Autocomplete is wired up per-card against `wikiExercises`.

---

### 4. `log.js`
Session and bodyweight logging.

- `onTypeChange()` — shows/hides the exercise vs. cardio form sections based on the selected session type. Pre-fills from the most recent session of the same type.
- `saveSession()` — builds a session object, saves to `sessions`, syncs via `syncToGitHub()`, calls `resetForm()`.
- `resetForm()` — clears form fields, calls `onTypeChange()` to re-pre-fill exercises.
- `saveBodyweight()` — upserts a `{ date, weight }` entry into `bodyweightLog` (one entry per date), updates `BODYWEIGHT_KG`, syncs, and calls `renderBwRecent()`.
- `renderBwRecent()` — renders the last 5 bodyweight entries below the bodyweight input.

---

### 5. `history.js`
Session list and patellar load model.

- `parseLoading(loading, rpe)` — parses a loading string (e.g. `"4x8@100, 1x6@105"`) with optional RPE. Returns `{ sets, reps, e1rm, volume }` where `e1rm` uses the Epley formula with RPE-adjusted max reps, and `volume` is RPE-adjusted tonnage. Fallback when no RPE: multiplier = 1 (equivalent to RPE 10).
- `sessionPatellarVolume(s)` — computes the patellar loading score for a session. Formula for strength: `strain_factor × weight × log₁₀(10 + sets×reps)`, summed across exercises. For cardio: `loading_min × intensity_scale × √duration`. Respects `$IMPACT=<label>` note override.
- `renderHistory()` — renders the stats row, progression chart, bodyweight chart, KPS section, and session card list.

---

### 6. `charts.js`
All Chart.js rendering. Each function destroys its previous chart instance before creating a new one.

- `renderProgressionChart()` — line chart of e1RM or RPE-adjusted volume for the selected exercise, last 12 weeks. Metric toggled by `setProgressionMetric()`.
- `renderBodyweightChart()` — line chart of bodyweight entries, last 12 weeks.
- `renderKpsSensitivityChart()` — two stacked charts: patellar loading per day (bars) and morning/post KPS over time (lines). Cas only.

---

### 7. `coach.js`
AI coaching layer.

- `buildContext()` — assembles the dynamic training log block sent to the API. Format: one pipe-delimited row per session (last 12 weeks), with a header row. Includes a bodyweight section (last 30 days) and a patellar loading model reference for Cas.
- `askCoach(q?)` — sends `q` (or the input field value) to `WORKER/chat`. System prompt is split into a static block (core instructions + user context) and a dynamic block (`buildContext()`), with `cache_control: {type:'ephemeral'}` on the dynamic block to enable Anthropic prompt caching.
- `tuneLoadings()` — opens a coached calibration session. Shows computed loads for recent sessions and asks the user if they match perceived strain, then suggests `strain_factor` updates.
- `editUserContext()` — opens a guided conversation to create or update `user-context.md`.
- `impactLabel(v)` — maps a numeric patellar load score to its impact label string.

---

### 8. `main.js`
Entry point and navigation.

- `loadAll()` — called immediately on script load. Seeds state from `localStorage`, checks the auth token, and calls `initApp()`.
- `initApp()` — sets up the UI for the logged-in user, pre-fills today's date, fires `loadContextFiles()` and a `Promise.all` of the three sync functions (`syncLookupFromWorker`, `pullFromGitHub`, `syncBodyweightFromWorker`). Re-renders history when all three resolve.
- `showPage(p)` — tab navigation; calls `renderHistory()` lazily when switching to the History tab.
- `updateKPSVisibility()` — shows/hides KPS inputs and the Calibrate button based on `currentUser`.

## Data flow summary

```
localStorage (seed)
      │
      ▼
loadAll() → initApp()
                │
                ├── loadContextFiles()          → coreInstructions, userContextMd, wikiExercises
                ├── syncLookupFromWorker()      → lookup, localStorage['tl_lookup']
                ├── pullFromGitHub()            → sessions, localStorage['tl_sessions']
                └── syncBodyweightFromWorker()  → bodyweightLog, BODYWEIGHT_KG, localStorage['tl_bodyweight']

User logs session → saveSession() → sessions[] → syncToGitHub()
User logs weight  → saveBodyweight() → bodyweightLog[], BODYWEIGHT_KG → syncBodyweightToGitHub()
User asks coach   → buildContext() + askCoach() → WORKER/chat → Anthropic API
Coach suggests update → applyLookupUpdate() → lookup → syncLookupToGitHub()
```
