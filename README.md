# Training Log

A personal training tracker with an AI coaching layer. Runs entirely in the browser — no app to install, works on mobile. Sessions are stored in this repo and synced across devices automatically.

Live: https://cas-dec.github.io/training-log/

---

## Logging a session

Open the **Log** tab. Select a session type, fill in the fields, hit **Save**.

**Session types:**
- Resistance: `Pull`, `Push`, `Legs`, `Upper body`, `Full body`, `Accessory`
- Cardio/sport: `Running`, `Cycling`, `Rugby`, `Badminton`

For resistance sessions, add exercises one by one. Each exercise takes one or more set groups (`sets × reps @ weight`) and an RPE. Typing in the exercise name field shows autocomplete suggestions from your history. When you select a session type the form pre-fills from the last session of that type — adjust from there.

For cardio/sport sessions, enter duration (minutes) and intensity (`low` / `medium` / `high`).

Every session also records energy level, sleep quality, and optional notes. Notes support `$IMPACT=<level>` to manually override the patellar loading estimate for that session (see [Patellar loading model](#patellar-loading-model)).

### Knee Pain Score (Cas only)

Two KPS fields appear for Cas: **morning** (before training) and **post** (after). Scale 0–10:

| Score | Meaning |
|-------|---------|
| 0 | Pain-free |
| 1–3 | Dull ache, warms up — acceptable for training |
| 4–5 | Noticeable during movement — stabilise or reduce volume |
| 6+ | Sharp/throbbing in daily tasks — trigger autoregulation protocol |

---

## History tab

All sessions in reverse chronological order. Each card shows session type, date, exercises or cardio data, energy/sleep, KPS scores, patellar loading estimate, and notes.

**Charts:**
- **Exercise progression** — pick any exercise; plots max weight or volume (sets × reps × weight) over the last 12 weeks.
- **KPS & patellar load** (Cas only) — KPS morning/post scores and cumulative session patellar load plotted over time.

**Export:** JSON or CSV download of all sessions.

---

## Coach tab

Ask the AI coach anything about your training. It reads your last 50 sessions before every response and replies in Markdown.

**Quick prompts** (one tap):
- Progression check
- Knee pain trend
- Next session recommendation
- Volume audit per muscle group
- RPE analysis
- Tune loadings (Cas only — see below)

### Tune loadings

Tap **Tune loadings** to open a calibration conversation. The app computes patellar load per exercise for your last 4 resistance sessions and sends the full breakdown to the coach. The coach asks whether the computed loads match your perceived strain and can suggest factor adjustments. When it does, an **Apply** button appears in the chat — one tap to update your lookup and sync it to GitHub.

### Editing your user context

The coach is seeded with a `user-context.md` file containing your training goals, primary lifts, weekly structure, and (for Cas) the patellar protocol. To update it:

1. Open **Settings** (⚙ top right) — the current context is rendered there as Markdown.
2. Tap **Edit with Coach →** — the coach guides you through a structured update.
3. When the coach produces a revised version, an **Apply** button appears in the chat — one tap to write it to GitHub.

---

## Patellar loading model

Every resistance session gets a patellar load estimate, used in the History chart and fed to the coach. The formula per exercise:

```
leg_factor × speed_factor × loading_factor × weight × log₁₀(10 + sets × reps)
```

- `leg_factor`: 1.0 single-leg, 0.5 bilateral, 0.0 upper body
- `speed_factor`: 1.0 explosive/plyometric, 0.6 standard strength, 0.3 slow/tempo, 0.2 isometric
- `loading_factor`: scales with knee-flexion angle and patellar moment arm (1.0 = leg extension or clean catch; 0.0 = upper body)
- `weight`: bar weight + 85 kg bodyweight for free-weight movements; bar weight only for machines
- Volume uses a log scale — going from 5 to 10 reps counts for more than 50 to 55

For cardio/sport, loading is `loading_per_min × duration`. Default rates: Badminton 0.75/min, Running 0.5/min, Rugby 0.3/min, Cycling 0.15/min.

`$IMPACT=<level>` in session notes overrides the computed value with a fixed midpoint. Valid levels: `none`, `very-low`, `low`, `low-to-medium`, `medium`, `medium-to-high`, `high`, `very-high`, `maximal`.

Per-exercise factors live in `users/{User}/loading_lookup.json` and can be tuned via the coach. Full derivation and exercise reference table: [`users/Cas/patellar_loading_logic.md`](users/Cas/patellar_loading_logic.md).

---

## For developers

### Stack

No framework, no build step, no package manager.

| File | Purpose |
|------|---------|
| `index.html` | All HTML, CSS, and JavaScript |
| `worker.js` | Cloudflare Worker: auth, data sync, Anthropic proxy |
| `core-instructions.md` | Coach persona and output format — fetched at runtime |
| `users/{User}/log.json` | Per-user session store |
| `users/{User}/user-context.md` | Per-user coaching context — fetched at runtime |
| `users/{User}/loading_lookup.json` | Per-user patellar loading factors |

CDN dependencies: [marked.js](https://github.com/markedjs/marked) (Markdown rendering), [Chart.js](https://www.chartjs.org/) (charts).

### Auth

`POST /login` takes `{ username, password }`. The Worker SHA-256-hashes the password and compares against `CAS_PASSWORD_HASH` / `DRIES_PASSWORD_HASH` environment variables. On success it returns an HMAC-signed token (base64-encoded payload + signature, 30-day TTL). All subsequent requests send this as `Authorization: Bearer <token>`. The browser never holds the GitHub token or Anthropic API key directly.

### Worker endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/login` | Authenticate; returns token |
| `GET` | `/log` | Fetch `users/{user}/log.json` from GitHub |
| `PUT` | `/log` | Write merged sessions back |
| `GET` | `/lookup` | Fetch `users/{user}/loading_lookup.json` |
| `PUT` | `/lookup` | Write updated loading factors |
| `PUT` | `/context` | Write updated `users/{user}/user-context.md` |
| `POST` | `/chat` | Proxy to Anthropic Messages API |

All write endpoints fetch the file's current `sha` first to prevent overwrite conflicts via the GitHub Contents API.

### Data flow

```
Browser localStorage  ←→  Cloudflare Worker  ←→  GitHub Contents API
      tl_sessions                /log               users/{u}/log.json
      tl_lookup                  /lookup            users/{u}/loading_lookup.json
```

On `initApp()`, `pullFromGitHub()` and `syncLookupFromWorker()` run in parallel. Remote wins on ID conflicts — GitHub is the source of truth. Sessions are deduplicated by `id` (a `Date.now()` timestamp assigned at creation). On save, the app merges local sessions with the current remote, sorts newest-first, and PUTs the result.

### Session schema

```jsonc
{
  "id": 1234567890,           // Date.now() — dedup key
  "user": "Cas",              // "Cas" | "Dries"
  "date": "2026-06-15",
  "type": "Push",             // Pull | Push | Legs | Upper body | Full body | Accessory
                              // | Running | Cycling | Rugby | Badminton
  "exercises": [
    { "name": "incline dumbbell press", "loading": "3x8@42kg, 1x6@45kg", "rpe": "RPE9" }
  ],
  "energy": "average",        // above-average | average | below-average
  "sleep": "good",            // good | average | poor
  "kps": { "morning": "4", "post": "4" },  // Cas only; 0–10
  "notes": ""                 // optional; may contain $IMPACT=<level>
}
```

### Coach system prompt

Assembled on every `/chat` call as:

```
[core-instructions.md]  ⬥  [users/{User}/user-context.md]  ⬥  [buildContext()]
```

`buildContext()` serialises the last 50 sessions for the active user. Both Markdown files are fetched once on `initApp()` and cached in memory.

The coach can emit two structured blocks the app handles specially:

- ` ```lookup-update` — JSON patch to loading factors → renders an **Apply** button that calls `applyLookupUpdate()` and PUTs to `/lookup`
- ` ```user-context` — full replacement of `user-context.md` → renders an **Apply** button that calls `applyContextUpdate()` and PUTs to `/context`

### Editing and deploying

```bash
# Edit the app, then:
git add index.html && git commit -m "..." && git push
# Live on GitHub Pages within seconds
```

`worker.js` changes require a manual redeploy in the Cloudflare dashboard (Workers → your worker → Deploy) after pushing.

### Adding a user

1. Create `users/{Name}/log.json` (empty array `[]`)
2. Create `users/{Name}/user-context.md` with their goals and context
3. Copy `users/Cas/loading_lookup.json` to `users/{Name}/loading_lookup.json` and adjust
4. Add `{Name}_PASSWORD_HASH` to the Cloudflare Worker environment variables
5. Add the login branch in `worker.js` (`/login` handler)
6. Add `{Name}` to the username check in `index.html` (`verifyLogin`)
