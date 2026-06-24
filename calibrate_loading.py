#!/usr/bin/env python3
"""
Interactively calibrate patellar strain factors in loading_lookup.json.

Presents hypothetical (exercise, loading) scenarios, shows the computed strain
category, and adjusts the strain_factor based on your corrections.

Calibration assumes RPE ≤ rpe_threshold (multiplier = 1). The RPE multiplier
exp(RPE − threshold) is applied automatically in the app for high-RPE efforts.

Usage:
    python calibrate_loading.py
"""

import json
import math
import copy
from pathlib import Path

ROOT        = Path(__file__).parent
LOOKUP_PATH = ROOT / "users" / "Cas" / "loading_lookup.json"
MODEL_PATH  = ROOT / "src" / "loading_model.json"
BODYWEIGHT_KG = 85

MODEL     = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
CATEGORIES = [(t["name"], t["min"]) for t in MODEL["impact_scale"]]
MIDPOINTS  = {t["name"]: t["midpoint"] for t in MODEL["impact_scale"]}
RPE_THRESH = MODEL.get("rpe_threshold", 8)

# Representative (sets, reps, added_kg) scenarios — calibrated for RPE ≤ threshold
SCENARIOS_BW    = [(3, 8, 20), (3, 8, 60), (4, 5, 80), (3, 12, 40)]
SCENARIOS_NO_BW = [(3, 12, 25), (3, 10, 35), (4, 8, 50)]


# ── Maths ──────────────────────────────────────────────────────────────

def patellar_vol(sets: int, reps: int) -> float:
    if MODEL.get("volume_formula") == "sqrt":
        return math.sqrt(sets * reps)
    return math.log10(10 + sets * reps)


def rpe_multiplier(rpe: float) -> float:
    return math.exp(rpe - RPE_THRESH) if rpe > RPE_THRESH else 1.0


def classify(s: float) -> str:
    for name, low in CATEGORIES:
        if s >= low:
            return name
    return "none"


def compute_strain(factor: float, bodyweight: bool, sets: int, reps: int, added: float) -> float:
    weight = (BODYWEIGHT_KG + added) if bodyweight else added
    if weight <= 0:
        return 0.0
    return factor * weight * patellar_vol(sets, reps)


def factor_for_category(category: str, bodyweight: bool, sets: int, reps: int, added: float) -> float:
    """Return the strain_factor that produces the midpoint of `category` at RPE ≤ threshold."""
    weight = (BODYWEIGHT_KG + added) if bodyweight else added
    target = MIDPOINTS[category]
    denom  = weight * patellar_vol(sets, reps)
    if denom <= 0 or target == 0:
        return 0.0
    return target / denom


# ── Input helpers ───────────────────────────────────────────────────────

CATEGORY_NAMES = [name for name, _ in CATEGORIES]


def parse_category(raw: str) -> str | None:
    raw = raw.strip().lower()
    if raw in MIDPOINTS:
        return raw
    matches = [n for n in CATEGORY_NAMES if n.startswith(raw)]
    return matches[0] if len(matches) == 1 else None


# ── Main loop ───────────────────────────────────────────────────────────

def calibrate() -> None:
    lookup  = json.loads(LOOKUP_PATH.read_text(encoding="utf-8"))
    updated = copy.deepcopy(lookup)
    changes: list[tuple[str, float, float]] = []

    vol_label = "√(s×r)" if MODEL.get("volume_formula") == "sqrt" else "log₁₀(10+s×r)"
    rpe9_x  = rpe_multiplier(9)
    rpe10_x = rpe_multiplier(10)

    print("\n=== Patellar Loading Calibration ===")
    print(f"Formula : strain_factor × weight × {vol_label} × exp(max(0, RPE − {RPE_THRESH}))")
    print(f"RPE ref : RPE≤{RPE_THRESH} ×1.0 | RPE{RPE_THRESH+1} ×{rpe9_x:.2f} | RPE{RPE_THRESH+2} ×{rpe10_x:.2f}")
    print("Scenarios calibrated at RPE ≤ threshold (multiplier = 1).")
    print()
    print("For each scenario:")
    print("  Enter      → category is correct")
    print("  <category> → correct category (partial name ok)")
    print("  s          → skip this exercise")
    print()
    print("Categories (low→high):")
    print(" ", " | ".join(reversed(CATEGORY_NAMES)))
    print()

    for ex_name, entry in lookup["exercises"].items():
        factor: float = entry["strain_factor"]
        bodyweight: bool = entry.get("bodyweight", False)
        scenarios = SCENARIOS_BW if bodyweight else SCENARIOS_NO_BW

        print(f"\n{'─' * 60}")
        print(f"  {ex_name.upper()}  (strain_factor = {factor})")
        print(f"{'─' * 60}")

        implied_factors: list[float] = []
        skip = False

        for sets, reps, added in scenarios:
            s   = compute_strain(factor, bodyweight, sets, reps, added)
            cat = classify(s)
            w_label = f"{BODYWEIGHT_KG}+{added}" if bodyweight else str(added)
            raw = input(f"  {sets}x{reps} @ {w_label}kg  →  {s:.1f}  [{cat}]: ").strip().lower()

            if raw == "s":
                skip = True
                break
            elif raw in ("", cat):
                continue

            correct = parse_category(raw)
            if correct is None:
                print(f"    Unknown category — options: {', '.join(CATEGORY_NAMES)}")
                continue

            nf = factor_for_category(correct, bodyweight, sets, reps, added)
            implied_factors.append(nf)
            print(f"    → factor for '{correct}' (midpoint {MIDPOINTS[correct]}): {nf:.4f}")

        if skip or not implied_factors:
            continue

        suggested = sum(implied_factors) / len(implied_factors)
        print(f"\n  Current factor : {factor:.4f}")
        print(f"  Suggested      : {suggested:.4f}  (avg of {len(implied_factors)} correction(s))")

        # RPE reference with suggested factor
        if bodyweight:
            ref_weight = BODYWEIGHT_KG + 60
            ref_label  = f"1×1@{ref_weight - BODYWEIGHT_KG}kg added"
        else:
            ref_weight = 50
            ref_label  = f"1×1@{ref_weight}kg"
        ref_base = suggested * ref_weight * patellar_vol(1, 1)
        print(f"  RPE ref        : {ref_label} base={ref_base:.1f}"
              f"  → RPE9={ref_base*rpe9_x:.1f} [{classify(ref_base*rpe9_x)}]"
              f"  RPE10={ref_base*rpe10_x:.1f} [{classify(ref_base*rpe10_x)}]")

        raw = input("  Apply? [y / n / custom value]: ").strip().lower()

        if raw == "y":
            updated["exercises"][ex_name]["strain_factor"] = round(suggested, 4)
            changes.append((ex_name, factor, suggested))
        elif raw not in ("", "n"):
            try:
                custom = float(raw)
                updated["exercises"][ex_name]["strain_factor"] = round(custom, 4)
                changes.append((ex_name, factor, custom))
            except ValueError:
                print("  Invalid number — skipping.")

    # ── Summary and write ───────────────────────────────────────────────
    if not changes:
        print("\nNo changes to save.")
        return

    print("\n\n=== Pending changes ===")
    for ex_name, old, new in changes:
        print(f"  {ex_name:<30}  {old:.4f}  →  {new:.4f}")

    if input("\nWrite to loading_lookup.json? [y/n]: ").strip().lower() == "y":
        LOOKUP_PATH.write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
        print(f"Saved → {LOOKUP_PATH}")
        print("Remember to push (or sync via the app) to propagate changes.")
    else:
        print("Discarded — no file written.")


if __name__ == "__main__":
    calibrate()
