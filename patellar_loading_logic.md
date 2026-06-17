# Patellar tendon loading model

---

## Resistance exercises

**Loading = leg_factor × speed_factor × loading_factor × weight × volume**

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

**volume = log₁₀(10 + sets × reps)**

The base-10 logarithm reflects diminishing stress with additional repetitions — going from 5 to 10 reps adds more tendon stress than going from 50 to 55. Ranges from ~1.0 (1 rep) to ~2.6 (10×10 = 100 reps).

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
| Lunge | 1.0 | 0.6 | 0.70 |
| Step-up | 1.0 | 0.6 | 0.70 |
| Clean & jerk / power clean (catch) | 0.5 | 1.0 | 1.00 |
| Clean pull / snatch pull | 0.5 | 1.0 | 0.20 |
| Romanian deadlift | 0.5 | 0.6 | 0.20 |
| Vertical jump / box jump | 0.5 | 1.0 | 0.90 |
| Wall sit / isometric hold | 0.5 | 0.2 | 0.85 |
| Upper body (bench, row, curl, press) | 0.0 | — | 0.00 |

*For unlisted exercises: match to the nearest row by movement pattern.*

---

### Calibration

Two reference workouts anchor the "maximal" end of the scale:

| Reference workout | Calculation | Loading |
|-------------------|-------------|---------|
| Clean & jerk 150 kg, 1×1 | 0.5 × 1.0 × 1.0 × 235 × log₁₀(11) | ≈ **122** |
| 5×5 back squat 180 kg | 0.5 × 0.6 × 0.85 × 265 × log₁₀(35) | ≈ **104** |

Both come in at ≥ 100, calibrating the top of the scale.

---

## $IMPACT scale

Continuous loading values map to categorical levels for merging with cardio and for the note override:

| $IMPACT | Loading range | Midpoint |
|---------|--------------|---------|
| maximal | ≥ 100 | 120 |
| very high | 65–100 | 80 |
| high | 40–65 | 52 |
| medium to high | 22–40 | 31 |
| medium | 12–22 | 17 |
| low to medium | 6–12 | 9 |
| low | 2–6 | 4 |
| very low | 0.5–2 | 1 |
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

**Total cardio loading = loading_per_min × duration (min)**

Examples: 60 min cycling → 9 (low to medium); 90 min badminton → 67.5 (very high); 45 min running → 22.5 (medium to high).

---

## Override: $IMPACT flag in notes

Any session note can include `$IMPACT=<level>` to replace the computed loading for that session with the midpoint of the corresponding band. Useful for race days, unusual sport intensity, or activities not in the table:

```
Felt like a hard session. $IMPACT=very-high
```

Parsing: extract `$IMPACT=(\S+)` from the notes string; if present, look up the midpoint and use it as the total session loading, ignoring the formula.

---

## Merging resistance and cardio

Total session patellar loading = **sum of all exercise loadings + cardio loading**.

For sessions with both (e.g. a warm-up run before weights), compute each component and add. A `$IMPACT` note flag overrides the full session total, not individual exercises.
