# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file, no-build training tracker with an AI coaching layer. The entire app lives in `index.html` (HTML + CSS + vanilla JS). Data is stored in `log.json` at the repo root and synced via the GitHub Contents API. There is no backend, no framework, no package manager, and no build step.

## Development workflow

Edit `index.html`, then push:
```bash
git add index.html && git commit -m "..." && git push
```

The app is served as a GitHub Pages static site. Changes are live as soon as the push lands.

To preview locally, open `index.html` directly in a browser — it works without a server.

## Architecture

### Data layer
- `log.json` — canonical data store; plain JSON array of session objects, sorted newest-first.
- `localStorage['tl_sessions']` — local mirror of sessions; used as the working copy in the browser.
- `localStorage['tl_cfg']` — user config: `{ apiKey, ghToken, ghUser, ghRepo, instructions }`.

### Sync logic (`syncToGitHub`, `pullFromGitHub`)
On every save, the app:
1. Fetches the current `log.json` from GitHub to get its `sha`.
2. Merges remote sessions with local ones, deduplicating by `session.id` (a `Date.now()` timestamp).
3. Sorts the merged array by date descending.
4. PUTs the merged content back via the GitHub Contents API (requires `sha` to avoid conflicts).

### AI coach (`askCoach`, `buildContext`)
- The coach calls `https://api.anthropic.com/v1/messages` directly from the browser using the user's Anthropic API key.
- Model: `claude-sonnet-4-6`, max 1024 tokens.
- Context is built from `sessions.slice(0, 50)` (last 50 sessions) plus the user's custom instructions from Settings.
- The hardcoded `SYSTEM_PROMPT` (line 575 in `index.html`) is a brief coaching persona; it is separate from `core-instructions.md` and `CAS-specs.md`, which are reference documents for the broader coaching strategy.

### Tabs
Three pages (`log`, `history`, `coach`) are toggled by adding/removing the `active` CSS class. `renderHistory()` is called lazily only when switching to the History tab.

## Key files

| File | Purpose |
|---|---|
| `index.html` | Entire app: HTML structure, CSS styles, all JavaScript |
| `log.json` | All training sessions (source of truth in the repo) |
| `core-instructions.md` | AI coaching persona & weekly training architecture reference |
| `CAS-specs.md` | User-specific coaching addenda: patellar tendonitis protocol, KPS autoregulation rules |

## Session data schema

```json
{
  "id": 1234567890,         // Date.now() — used for dedup
  "date": "2026-06-15",
  "type": "Push",           // Pull | Push | Legs | Full body | Cardio | Rest
  "exercises": [
    { "name": "incline dumbbell press", "loading": "3x8@42kg", "rpe": "RPE9" }
  ],
  "energy": "average",      // above-average | average | below-average
  "sleep": "good",          // good | average | poor
  "kps": { "morning": "4", "post": "4" },  // Knee Pain Score, 0–10
  "notes": ""
}
```

## Coaching context files

`core-instructions.md` defines the coach's persona, the Push/Pull training split, and nutritional context. `CAS-specs.md` adds the patellar tendonitis protocol, including the KPS autoregulation rules (e.g., KPS ≥ 6 eliminates dynamic quad loading and substitutes isometric holds). These files inform manual coaching decisions and can be used to update the `SYSTEM_PROMPT` constant in `index.html` if a richer in-app prompt is desired.
