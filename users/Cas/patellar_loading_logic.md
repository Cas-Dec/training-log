# Patellar tendon loading model

---

## Resistance exercises

**Loading = leg_factor × speed_factor × loading_factor × weight × volume × rpe_mult**

---

### leg_factor

Fraction of body load borne by one patellar tendon:

| Value | Applies to |
|-------|-----------|
| 1.0 | Single-leg (lunge, Bulgarian split squat, step-up, single-leg press) |
| 0.5 | Bilateral (squat, leg press, leg extension, clean, jerk) |
| 0.0 | No knee load (upper body, pure hip hinge) |

---

### speed_factor

Scales for rate of force development — peak patellar tendon force is much higher during explosive movements than controlled ones:

| Value | Applies to |
|-------|-----------|
| 1.0 | Maximal explosive / plyometric (jump, sprint, jerk drive, Olympic catch) |
| 0.6 | Standard strength cadence (most weighted exercises) |
| 0.3 | Slow / tempo training |
| 0.2 | Isometric hold (wall sit, terminal knee extension) |

---

### loading_factor

Scales with knee-flexion angle and patellar tendon moment arm at the point of peak load:

| Value | Applies to |
|-------|-----------|
| 1.0 | Leg extension (maximum isolated moment arm) |
| 1.0 | Clean & jerk catch (calibration anchor — see note below) |
| 0.9 | Squat / front squat |
| 0.85 | Leg press (~90° flexion) |
| 0.7 | Lunge, Bulgarian split squat, step-up (partial range, variable angle) |
| 0.2 | Romanian deadlift, clean pull (minimal knee flexion, primarily hip) |
| 0.0 | Negligible knee component (upper body, hip thrust) |

**Note on clean & jerk (loading_factor = 1.0):** this is a calibration choice. The jerk catch involves a maximal-rate quad contraction at an acutely demanding knee angle. speed_factor and loading_factor are independent dimensions — one captures how fast force develops, the other how mechanically disadvantaged the tendon is at that angle. Using 1.0 for both is defensible for the brief, high-velocity catch. Setting loading_factor lower here would require re-anchoring the entire scale.

---

### weight

- **Free-weight and bodyweight movements** (squat, lunge, Olympic lifts, jump): `85 kg (bodyweight) + added weight`
- **Machine exercises where bodyweight is mechanically bypassed** (leg press, leg extension, cable machine): `added weight only`

---

### volume

**volume = √(sets × reps)**

The square root reflects diminishing stress with additional repetitions — going from 1 to 4 reps doubles the volume term, but going from 25 to 100 reps also only doubles it. Ranges from 1 (1×1) to 10 (10×10 = 100 reps).

---

### rpe_mult

**rpe_mult = exp(max(0, RPE − 8))**

| RPE | Multiplier |
|-----|-----------|
| ≤ 8 | 1.0 |
| 9   | e ≈ 2.72 |
| 10  | e² ≈ 7.39 |

Captures the disproportionate tendon stress of near-maximal efforts: volume alone underweights a 1×1 at competition weight relative to sub-maximal training sets. Calibration anchor: clean 1×1 at 150 kg, RPE 10 → 0.069 × 235 × 1 × 7.39 ≈ 120 (maximal).

Strain factors are calibrated at RPE ≤ 8 (multiplier = 1). When RPE is not logged, multiplier defaults to 1.

For exercises with multiple set groups (e.g. `3x8@80kg, 1x6@90kg`), compute loading separately per group and sum.

---

### Exercise reference table

| Exercise | leg_factor | speed_factor | loading_factor |
|----------|-----------|-------------|---------------|
| Back squat | 0.5 | 0.6 | 0.85 |
| Front squat | 0.5 | 0.6 | 0.90 |
| Leg press | 0.5 | 0.6 | 0.85 |
| Leg extension | 0.5 | 0.6 | 1.00 |
| Bulgarian split squat | 1.0 | 0.6 | 0.70 |
| Front-foot-raised (FFR) Bulgarian split squat | 1.0 | 0.6 | 0.80 |
| Lunge | 1.0 | 0.6 | 0.70 |
| Step-up | 1.0 | 0.6 | 0.70 |
| Goblet squat | 0.5 | 0.6 | 0.90 |
| Clean & jerk / power clean (catch) | 0.5 | 1.0 | 1.00 |
| Clean pull / snatch pull | 0.5 | 1.0 | 0.20 |
| Romanian deadlift | 0.5 | 0.6 | 0.20 |
| Vertical jump / box jump / straight-leg box jump | 0.5 | 1.0 | 0.90 |
| Wall sit / isometric squat / Nordic hold (reverse Nordic, Spanish-squat-style bilateral quad isometric) | 0.5 | 0.2 | 0.85 |
| Single-leg extension | 1.0 | 0.6 | 1.00 |
| Terminal knee extension (short-arc, near full extension) | 1.0 | 0.6 | 0.30 |
| Upper body (bench, row, curl, press) | 0.0 | — | 0.00 |
| Hip-hinge with fixed knee angle (Zercher hip extension, hip thrust, good morning) | 0.5 | — | 0.00 |
| Nordic hamstring curl/fall, prone leg curl (hamstring-dominant, negligible quad/patellar tendon component) | — | — | 0.00 |

*For unlisted exercises: match to the nearest row by movement pattern.*

**Note on "Nordic hold":** this user's log uses "nordic holds" for a bilateral quad isometric (reverse Nordic / Spanish squat — kneeling, leaning back, quads under sustained tension at moderate-deep knee flexion), not the hamstring-dominant Nordic curl. It's grouped with wall sit / isometric squat since all three are bilateral, isometric, similar knee-flexion depth. Log as `sets x duration_sec @ weight` (e.g. `3x30@0kg`) so it parses under the same `SxR@W` volume formula as weighted sets — a bare `N@Wkg` (no rep/duration term) fails the loading parser and silently contributes zero. One existing "nordic holds" entry (2026-08-25 session, `3@0kg`) predates this convention and needs its hold duration filled in manually to compute correctly.

**Note on terminal knee extension / other band-resisted exercises:** loading strings like `3x25@resistance` don't carry a numeric weight, so the parser (`@\s*([\d.]+)`) treats the added weight as 0 and the exercise contributes no loading regardless of its lookup entry. If you want these to actually register, log an estimated resistance-equivalent in kg instead of the literal word "resistance".

**Exercises deliberately left out of the lookup:** movements with negligible patellar tendon involvement are omitted rather than given a token near-zero factor, consistent with how upper-body exercises are already handled. This currently includes Zercher hip extensions, Nordic hamstring falls, and prone leg curls (see table above).

---

### Calibration

Two reference workouts anchor the "maximal" end of the scale:

| Reference workout | Calculation | Loading |
|-------------------|-------------|---------|
| Clean & jerk 150 kg, 1×1 | 0.5 × 1.0 × 1.0 × 235 × √1 | ≈ **118** |
| 5×5 back squat 180 kg | 0.080 × 265 × √25 | ≈ **106** |

Both come in at ≥ 100, calibrating the top of the scale. Note: the back squat factor (0.080) is empirically scaled for typical multi-rep volumes; the theoretical product 0.5 × 0.6 × 0.85 = 0.255 was calibrated for the log₁₀ formula and produces inflated values under √.

**2026-09-15 additions** (FFR Bulgarian split squat, Nordic hold, isometric squat, goblet squat, single-leg extension, terminal knee extension, straight-leg box jump): `strain_factor` for these was derived by taking the closest already-calibrated exercise in the same weight-bearing class (bodyweight vs. machine-added-weight) and scaling its factor by the ratio of new `leg_factor × speed_factor × loading_factor` to the reference row's product — not independently fitted to real sessions. Treat these as starting estimates; once a few sessions with KPS feedback exist, use the coach's lookup-update mechanism to retune them.

---

## $IMPACT scale

Continuous loading values map to categorical levels for merging with cardio and for the note override:

| $IMPACT | Loading range | Midpoint |
|---------|--------------|---------|
| maximal | ≥ 100 | 120 |
| very high | 90–100 | 95 |
| high | 75–90 | 82.5 |
| medium to high | 60–75 | 67.5 |
| medium | 45–60 | 52.5 |
| low to medium | 30–45 | 47.5 |
| low | 15–30 | 22.5 |
| very low | 0.5–15 | 8 |
| none | < 0.5 | 0 |

---

## Cardio / sport sessions

Default loading expressed as loading per minute, so that duration scales the total:

| Activity | $IMPACT level | Loading / min |
|----------|--------------|--------------|
| Badminton | very high | 0.75 |
| Running | high | 0.5 |
| Rugby | medium | 0.3 |
| Cycling | low | 0.15 |

**Total cardio loading = loading_min × √duration (min)**

Examples: 60 min cycling → 4.8 × √60 ≈ 37 (low to medium); 90 min badminton → 9.0 × √90 ≈ 85 (high); 45 min running → 10.0 × √45 ≈ 67 (medium to high).

---

## Override: $IMPACT flag in notes

Any session note can include `$IMPACT=<level>` to replace the computed loading for that session with the midpoint of the corresponding band. Useful for race days, unusual sport intensity, or activities not in the table:

```
Felt like a hard session. $IMPACT=very high
```

Parsing: extract `$IMPACT=([a-z ]+)` from the notes string (label matches the band name as written, e.g. `very high`, `medium to high`); if present, look up the midpoint and use it as the total session loading, ignoring the formula.

---

## Merging resistance and cardio

Total session patellar loading = **sum of all exercise loadings + cardio loading**.

For sessions with both (e.g. a warm-up run before weights), compute each component and add. A `$IMPACT` note flag overrides the full session total, not individual exercises.
