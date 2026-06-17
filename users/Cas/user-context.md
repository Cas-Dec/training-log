# Cas — User Context

## Training architecture
Weekly microcycle: **Push/Pull resistance split (4×/week)** + **4 cardio/sport units**.

**Pull days (2×/week) — primary tracking lifts:**
- Weighted pull-ups (added load + reps)
- Romanian deadlifts (posterior chain load)
- Dumbbell rows (unilateral pulling strength)

**Push days (2×/week) — primary tracking lifts:**
- Incline dumbbell press (upper chest)
- Weighted dips (load + sternal/tricep)
- Strict overhead press (vertical pressing)

**Lower body integration:** Bulgarian split squats (leg strength — constrained by knee protocol below).

**Cardio/sport units (4×/week):**
- Badminton ×2 — fixed external sessions, treat as unmodifiable high-fatigue boulders. Extreme eccentric patellar load via deep lunges and jumps.
- VO2max ×1 — hill sprints, group sessions, max-intensity intervals.
- Zone 2 ×1 — Running if cumulative KPS allows; Cycling otherwise (default fallback).

Separate high-impact knee days (Badminton, hill sprints) from lower-body resistance days by at least 24–48 hours where possible.

## Nutrition
High-protein, largely vegetarian. Factor in as exceptional muscular recovery capacity.
- Morning: whey shake (fast leucine bolus post-fast)
- Post-workout: ~30g RTD protein shake
- Pre-sleep: casein shake (sustained overnight amino acid pool for tendon remodeling)

If strength stalls or tendon healing is poor despite optimal loading, probe total energy availability and collagen-synthesis micronutrients (Vitamin C, glycine).

## Patellar tendonitis protocol

### Knee Pain Score (KPS) — 0–10 daily scale
- **0:** Pain-free.
- **1–3 (Mild):** Dull ache that warms up. Acceptable for training; monitor for post-session worsening.
- **4–5 (Moderate):** Noticeable pain during movement. Stabilise or reduce volume; consider exercise modifications.
- **6+ (Severe):** Sharp/throbbing pain in daily tasks (e.g., stairs). Trigger immediate autoregulation protocols.

### Autoregulation rules
- **24-hour pain rule:** If KPS does not return to ≤3 within 24h post-session, cut subsequent lower-body volume 30–50% or substitute isometric holds.
- **BSS autoregulation:**
  - KPS 1–3: Full ROM dynamic BSS, weighted.
  - KPS 4–5: Reduce load 20%; slow eccentric (3–4s) for tendon remodeling.
  - KPS 6+: Eliminate dynamic quad loading. Replace with patellar isometrics (Spanish squat holds or single-leg isometric leg press at 60–90° knee flexion, 4–5×45s high effort).
- **Zone 2 modality:** KPS ≤3 → Running permitted. KPS ≥4 → Cycling mandatory.

## Patellar loading model
Formula: `leg_factor × speed_factor × loading_factor × weight × log₁₀(10 + sets × reps)` (bodyweight = 85 kg added for free-weight exercises).

$IMPACT scale: maximal ≥100 | very-high 65–100 | high 40–65 | medium-to-high 22–40 | medium 12–22 | low-to-medium 6–12 | low 2–6 | very-low 0.5–2 | none <0.5

Sessions can include `$IMPACT=<level>` in notes to override the computed value.
