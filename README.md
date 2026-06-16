# Training Log

A lightweight training tracker with an AI coaching layer. Logs to a JSON file in this repo, accessible from any browser including mobile. Check it out: https://cas-dec.github.io/training-log/

## Setup
Tap the **⚙** icon (top right of the nav bar) and fill in:
- Anthropic API key
- GitHub token
- GitHub username
- Repo name (`training-log`)

Hit **Test GitHub connection** to verify.

## How it works

- **Log tab** — fill in your session, hit Save. Data writes directly to `log.json` in this repo via the GitHub API.
- **History tab** — all sessions in reverse order, with stats, an exercise progression chart, and (for Cas) a knee-pain-sensitivity chart. Export to JSON or CSV any time.
- **Coach tab** — ask the AI anything. It reads your full `log.json` before responding, rendered as Markdown.
- **Merge** — on every save, the app fetches the current `log.json`, merges new sessions, and pushes back. No duplicates.

## Technical details

The entire app is one static file, `index.html` (HTML + CSS + vanilla JS, no build step, no framework, no package manager). It's served as-is by GitHub Pages — every push to `main` is live within seconds.

### Data storage & sync
- `log.json` at the repo root is the canonical data store: a plain JSON array of session objects, newest first.
- The browser keeps a working copy in `localStorage['tl_sessions']`; config (API key, GitHub token, etc.) lives in `localStorage['tl_cfg']`. Neither ever leaves your device except as described below.
- On save, the app calls the [GitHub Contents API](https://docs.github.com/en/rest/repos/contents): it fetches the current `log.json` (and its `sha`), merges remote and local sessions deduplicating by `id` (a `Date.now()` timestamp), sorts newest-first, then `PUT`s the merged file back using that `sha` to avoid overwriting concurrent changes.
- On page load, it silently pulls `log.json` from GitHub and merges it into the local copy, so multiple devices stay in sync.

### AI coach & the Cloudflare proxy
- The Coach tab sends your training log (last 50 sessions, filtered to the active user) plus a system prompt to Claude (`claude-sonnet-4-6`) via the [Anthropic Messages API](https://docs.anthropic.com/en/api/messages).
- Browsers can't call `api.anthropic.com` directly from a page hosted on a different origin — there's no CORS allowance for that. To get around this, requests are routed through a small Cloudflare Worker (`claude-proxy.casdecancq.workers.dev`) that simply forwards the request to Anthropic and attaches the CORS headers the browser needs. Your Anthropic API key is passed through to Anthropic via this proxy, not stored by it — but note that the proxy's source isn't part of this repo, so that's a statement about how the app calls it, not an independently verifiable guarantee.
- The response (Markdown) is rendered client-side with [marked.js](https://github.com/markedjs/marked), loaded from a CDN.

### Charts
- The History tab's progression and knee-pain charts are drawn with [Chart.js](https://www.chartjs.org/), also loaded from a CDN — no bundler involved.
- **Exercise progression** parses each exercise's `loading` string (e.g. `4x8@20kg`) into sets/reps/weight and plots either max weight or volume (sets × reps × weight) over the last 12 weeks.
- **Knee pain sensitivity** (Cas only) is a proxy for d(KPS)/d(patellar-tendon loading volume): for each session, `(KPS post − KPS morning) ÷ loading volume`, where loading volume sums the strength-exercise volume of knee-dominant movements (squats, lunges, step-ups, leg press, jumps) plus a duration × intensity term for Badminton/Rugby sessions. It's a heuristic trend indicator, not a calibrated clinical metric — see `CAS-specs.md` for the reasoning behind which activities load the patellar tendon.

## Editing the project

Clone the repo, edit `index.html`, push. That's it — no build step.

```bash
git clone https://github.com/Cas-Dec/training-log
cd training-log
# edit index.html
git add . && git commit -m "Update" && git push
```

## Data

All sessions live in `log.json` at the root of this repo. It's plain JSON — you can edit it directly on GitHub or import it anywhere.

## Privacy

API keys and GitHub token are stored in your browser's localStorage only. The GitHub token is sent directly to GitHub. The Anthropic API key and your training data are sent to Anthropic via the Cloudflare proxy described above (which only relays the request — see [Technical details](#technical-details)). Nothing is sent to any other third party.
