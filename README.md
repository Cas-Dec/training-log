# Training Log

A lightweight training tracker with an AI coaching layer. Logs to a JSON file in this repo, accessible from any browser including mobile. Check it out: https://cas-dec.github.io/training-log/

## Setup
Go to the **Coach** tab, scroll to **Settings**, and fill in:
- Anthropic API key
- GitHub token
- GitHub username
- Repo name (`training-log`)

Hit **Test GitHub connection** to verify.

## How it works

- **Log tab** — fill in your session, hit Save. Data writes directly to `log.json` in this repo via the GitHub API.
- **History tab** — all sessions in reverse order, with stats. Export to JSON or CSV any time.
- **Coach tab** — ask the AI anything. It reads your full `log.json` before responding.
- **Merge** — on every save, the app fetches the current `log.json`, merges new sessions, and pushes back. No duplicates.

## Editing the project

Clone the repo, edit `index.html`, push. That's it — no build step.

```bash
git clone https://github.com/YOUR-USERNAME/training-log
cd training-log
# edit index.html
git add . && git commit -m "Update" && git push
```

## Data

All sessions live in `log.json` at the root of this repo. It's plain JSON — you can edit it directly on GitHub or import it anywhere.

## Privacy

API keys and GitHub token are stored in your browser's localStorage only. They are sent directly to Anthropic and GitHub respectively — never to any third party.
