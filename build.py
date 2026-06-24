#!/usr/bin/env python3
"""Assemble index.html from src/shell.html, src/style.css, and src/js/*.js."""

import json
from pathlib import Path

ROOT = Path(__file__).parent
SRC  = ROOT / "src"
OUT  = ROOT / "index.html"

JS_MODULES = [
    "state.js",
    "auth.js",
    "exercises.js",
    "log.js",
    "history.js",
    "charts.js",
    "coach.js",
    "main.js",
]

# Inject loading model as the first JS constant so all modules can reference it
_model = json.loads((SRC / "loading_model.json").read_text(encoding="utf-8"))
_model_preamble = (
    "// ── LOADING MODEL (src/loading_model.json) ────────────────────────\n"
    f"const LOADING_MODEL = {json.dumps(_model, separators=(',', ':'))};\n"
    "const IMPACT_MIDPOINTS = Object.fromEntries("
    "LOADING_MODEL.impact_scale.map(function(t){return[t.name,t.midpoint];}));\n"
)

shell = (SRC / "shell.html").read_text(encoding="utf-8-sig")
css   = (SRC / "style.css").read_text(encoding="utf-8-sig")
js    = _model_preamble + "\n" + "\n".join(
    (SRC / "js" / name).read_text(encoding="utf-8-sig")
    for name in JS_MODULES
)

if "{{STYLES}}" not in shell or "{{SCRIPTS}}" not in shell:
    raise ValueError("shell.html is missing {{STYLES}} or {{SCRIPTS}} markers")

result = shell.replace("{{STYLES}}", css).replace("{{SCRIPTS}}", js)
if not result.endswith("\n"):
    result += "\n"
OUT.write_text(result, encoding="utf-8")
print(f"Built {OUT.name}  ({len(result):,} bytes)  [{', '.join(JS_MODULES)}]")
