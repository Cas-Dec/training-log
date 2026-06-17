# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file, no-build training tracker with an AI coaching layer. The entire app lives in `index.html` (HTML + CSS + vanilla JS). Auth and API proxying is handled by `worker.js` (Cloudflare Worker). Data is stored per-user under `users/{User}/log.json` and synced via the Worker. There is no backend framework, no package manager, and no build step.

## Development workflow

Edit `index.html`, then push:
```bash
git add index.html && git commit -m "..." && git push
```

The app is served as a GitHub Pages static site. Changes are live as soon as the push lands.

To preview locally, open `index.html` directly in a browser — it works without a server (auth will redirect to login).

When changing `worker.js`, redeploy to Cloudflare manually after pushing.

## Architecture

### Auth
A Cloudflare Worker (`worker.js`) handles login, token issuance (HMAC-signed JWT-like tokens), and proxies all GitHub and Anthropic API calls. The browser never holds the GitHub token or Anthropic API key directly.

### Data layer
- `users/{User}/log.json` — per-user session store; plain JSON array of session objects, sorted newest-first.
- `users/{User}/loading_lookup.json` — per-user patellar loading factors; synced via Worker `/lookup` endpoint.
- `localStorage['tl_sessions']` — local mirror of sessions; used as the working copy in the browser.
- `localStorage['tl_cfg']` — user config: `{ instructions }`.
- `localStorage['tl_lookup']` — local mirror of loading_lookup; seeded on load, updated via Worker.

### Sync logic (`syncToGitHub`, `pullFromGitHub`)
On every save, the app:
1. Fetches `users/{user}/log.json` from GitHub via Worker GET `/log` to get its `sha`.
2. Merges remote sessions with local ones, deduplicating by `session.id` (a `Date.now()` timestamp).
3. Sorts the merged array by date descending.
4. PUTs the merged content back via Worker PUT `/log`.

### Lookup sync (`syncLookupFromWorker`, `syncLookupToGitHub`)
- On `initApp()`, `syncLookupFromWorker()` fetches `GET /lookup` from the Worker, which reads `users/{user}/loading_lookup.json` from GitHub. Falls back to the static file at `./users/{User}/loading_lookup.json`.
- After any calibration change (`applyLookupUpdate`) or reset (`resetLookup`), `syncLookupToGitHub()` PUTs via Worker `/lookup`.

### Coaching context (`loadContextFiles`, `buildContext`, `askCoach`)
- On `initApp()`, `loadContextFiles()` fetches `./core-instructions.md` and `./users/{User}/user-context.md` in parallel.
- `askCoach()` assembles the system prompt as: `[coreInstructions || SYSTEM_PROMPT_FALLBACK, userContextMd, buildContext()]`, joined by `\n\n---\n\n`.
- Model: `claude-sonnet-4-6`, max 2048 tokens. API calls are proxied via Worker `POST /chat`.

### Tabs
Three pages (`log`, `history`, `coach`) are toggled by adding/removing the `active` CSS class. `renderHistory()` is called lazily only when switching to the History tab.

## Key files

| File | Purpose |
|---|---|
| `index.html` | Entire app: HTML structure, CSS styles, all JavaScript |
| `worker.js` | Cloudflare Worker: auth, log sync, lookup sync, Anthropic proxy |
| `core-instructions.md` | AI coaching persona & weekly training architecture (loaded at runtime into every coach prompt) |
| `users/Cas/log.json` | Cas's training sessions |
| `users/Cas/user-context.md` | Cas-specific coaching context: patellar tendonitis protocol, KPS rules, loading model |
| `users/Cas/loading_lookup.json` | Patellar loading factors for Cas's exercises |
| `users/Dries/log.json` | Dries's training sessions |
| `users/Dries/user-context.md` | Dries-specific coaching context (placeholder) |
| `log.json` | Legacy combined log (kept as backup; no longer used by the app) |

## Session data schema

```json
{
  "id": 1234567890,         // Date.now() — used for dedup
  "user": "Cas",            // "Cas" | "Dries"
  "date": "2026-06-15",
  "type": "Push",           // Pull | Push | Legs | Full body | Cardio | Rest
  "exercises": [
    { "name": "incline dumbbell press", "loading": "3x8@42kg, 1x6@45kg", "rpe": "RPE9" }
  ],
  "energy": "average",      // above-average | average | below-average
  "sleep": "good",          // good | average | poor
  "kps": { "morning": "4", "post": "4" },  // Knee Pain Score, 0–10 (Cas only)
  "notes": ""               // May contain $IMPACT=<level> to override patellar load calc
}
```

## Patellar loading model

Formula: `leg_factor × speed_factor × loading_factor × weight × log₁₀(10 + sets × reps)`

- `bodyweight: true` exercises add `BODYWEIGHT_KG` (85 kg) to the bar weight.
- Multi-set loading strings (e.g., `"4x8@60kg, 1x6@65kg"`) are comma-separated; each part is summed.
- Cardio sessions use `loading_min × intensity_scale × duration`.
- Notes with `$IMPACT=<level>` override the computed value with a midpoint from `IMPACT_MIDPOINTS`.
- The coach can suggest factor updates via a `{"type":"lookup-update",...}` JSON block; the app renders an "Apply" button.

## Coaching context files

`core-instructions.md` defines the coach's persona, Push/Pull training split, and nutritional context. `users/Cas/user-context.md` adds the patellar tendonitis protocol and the KPS autoregulation rules (e.g., KPS ≥ 6 eliminates dynamic quad loading). These are fetched at runtime and injected into every coach system prompt — no manual update to `index.html` is needed when editing them.
