# Cas — User Context

## Training goals
Reduce patellar tendonitis > strength development > cardiovascular endurance > muscle growth

## Training architecture
Weekly microcycle: **3-6 resistance training units** + **3-5 sports units**.

**Primary tracking lifts:**
- Weighted pull-ups
- Romanian deadlifts
- Dumbbell rows
- Incline dumbbell press
- Weighted dips
- Strict overhead press
- Squats
- Vertical jumps

**Sport units:**
- Badminton ×1-4 — fixed external sessions, treat as unmodifiable high-fatigue boulders. Extreme eccentric patellar load via deep lunges and jumps.
- VO2max ×1 — hill sprints, group sessions, max-intensity intervals.
- Zone 2 ×1-2 — Running if cumulative KPS allows; Cycling otherwise (default fallback).

Separate high-impact knee days (Badminton, hill sprints) from lower-body resistance days by at least 24–48 hours where possible.

## Patellar tendonitis protocol

### Knee Pain Score (KPS) — 0–10 daily scale
- **0:** Pain-free.
- **1–3 (Mild):** Dull ache that warms up. Acceptable for training; monitor for post-session worsening.
- **4–5 (Moderate):** Noticeable pain during movement. Stabilise or reduce volume; consider exercise modifications.
- **6+ (Severe):** Sharp/throbbing pain in daily tasks (e.g., stairs). Trigger immediate autoregulation protocols.

### Autoregulation rules
- **24-hour pain rule:** If KPS does not return to ≤3 within 24h post-session, cut subsequent lower-body volume 30–50% or substitute isometric holds.
- **BSS autoregulation:**
  - KPS 1–3: Full ROM dynamic exercises, weighted.
  - KPS 4–5: Reduce load 20%; slow eccentric (3–4s) for tendon remodeling.
  - KPS 6+: Eliminate dynamic quad loading. Replace with patellar isometrics.
- **Zone 2 modality:** KPS ≤3 → Running permitted. KPS ≥4 → Cycling mandatory.

## Patellar loading model
Formula: `strain_factor × weight × log₁₀(10 + sets × reps)` (bodyweight = 85 kg added for free-weight exercises). Cardio: `loading_min × intensity_scale × √duration`.

$IMPACT scale: maximal ≥100 | very high 65–100 | high 40–65 | medium to high 22–40 | medium 12–22 | low to medium 6–12 | low 2–6 | very low 0.5–2 | none <0.5

Sessions can include `$IMPACT=<level>` in notes to override the computed value.
