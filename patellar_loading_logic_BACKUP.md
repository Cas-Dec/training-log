# How patellar tendon loading volume is computed

---

## Resistance exercises

Resistance Loading = f(single/double legged exercise, execution speed, loading angle, weight, volume),

Where:

single / double legged exercise = f(exercise name),
execution speed = f(exercise name)
loading angle = f(exercise name)

A simple proxy for loading could be:

Loading ~ leg factor x speed factor x loading angle x weight x volume,

Where:

Leg factor = 1 if single legged exercise, 0.5 if double legged, 0 if legs not involved;

Speed factor = 1 for explosive movements (e.g. jumping, sprinting, plyometrics), 0.2 for isometric holds, everything else in between;

loading factor = 1 for jerks, leg extensions, ..., 0.85 for exercises such as squats, ..., down to perhaps 0.2 for exercises such as romanian deadlifts / clean pulls;

weight = 85 (bodyweight) + additional weight;

volume = log(10 + sets x reps)

---

## Other exercises

Defaults:
Badminton -> very high loading
Rugby -> medium loading
Running -> high loading
Cycling -> low loading

Can be overridden by something like a flag in the 'NOTES' section of a log, e.g. $IMPACT=very-high

---

## Standardization

We should be able to merge total patellar loading volume from both resistance and other exercises. To do so, the resistance exercise loading should probably also be mapped to a categorical classification. I propose the following categories:

$IMPACT:
- none
- very low
- low
- low to medium
- medium
- medium to high
- high
- very high
- maximal

Where maximal impact should correspond to e.g. a clean and jerk at 150 kg (leg factor = 0.5, speed factor = 1, loading factor = 1, weight = 235 kg, volume = log(11) => LOADING = 122), or 5x5 squats at 180 kg (leg factor = 0.5, speed factor = 0.6, loading factor = 0.85, weight = 265 kg, volume = log(35) => LOADING = 104). Based on these two examples, I would propose a calibration so that LOADING >= 100 corresponds to maximal impact, loading < 10 to none, and everything else in between.