# Cas — User Context

## Stats
Male, 24y/o, 85kg, vast training experience.

## Training goals
Reduce patellar tendonitis > strength development > cardiovascular endurance > muscle growth

## Training architecture
Weekly microcycle: **3-6 resistance training units** + **3-5 sports units**.

Typical schedule:
Monday | resistance training + badminton
Tuesday | resistance training + VO2 max training
Wednesday | resistance training
Thursday | resistance training + badminton
Friday | resistance training
Saturday | resistance training + zone 2 training
Sunday | rest

**Primary tracking lifts:**
- Pull-ups
- Squats
- Clean pulls
- Dumbbell rows
- Incline dumbbell press

**Sport units:**
- Badminton — Fixed external sessions, treat as unmodifiable high-fatigue boulders.
- VO2max — Hill sprints.
- Zone 2 — Running if cumulative KPS allows; Cycling otherwise (default fallback).

## Patellar tendonitis protocol

### Knee Pain Score (KPS) — 0–10 daily scale
- **0:** Pain-free.
- **1–3 (Mild):** Dull ache that warms up.
- **4–5 (Moderate):** Noticeable pain during movement.
- **6+ (Severe):** Sharp/throbbing pain in daily tasks (e.g., stairs).

### Autoregulation rules
- **24-hour pain rule:** If KPS does not return to ≤3 within 24h post-session, cut subsequent lower-body volume 30–50% or substitute isometric holds.
- **BSS autoregulation:**
  - KPS 1–3: Full ROM dynamic exercises, weighted.
  - KPS 4–5: Reduce load 20%; slow eccentric (3–4s) for tendon remodeling.
  - KPS 6+: Eliminate dynamic quad loading. Replace with patellar isometrics.
- **Zone 2 modality:** KPS ≤3 → Running permitted. KPS ≥4 → Cycling mandatory.

## Patellar loading model
Formula: `strain_factor × weight × √(sets × reps)` (bodyweight = 85 kg added for free-weight exercises). Cardio: `loading_min × √duration`.

$IMPACT scale: maximal ≥100 | very high 90–100 | high 75–90 | medium to high 60–75 | medium 45–60 | low to medium 30–45 | low 15–30 | very low 0.5–15 | none <0.5

Sessions can include `$IMPACT=<level>` in notes to override the computed value.