# Enhancement Analysis — supervuoto-wanderer

Goal: make it **more graphically rich, more magnificent, and (above all) more
reactive to sound** while staying true to the calm, soft low-poly moonlit look.

This doc captures the full proposal. **Tier 1 (reactivity) is being implemented
first** — see status flags below.

---

## Why it doesn't react much today (root cause)

The audio signal is **double-smoothed and un-normalized** before any visual sees it:

1. **Analyser smoothing is high** — `smoothingTimeConstant = 0.8` (`src/audio.js`)
   already low-passes the FFT, killing transients.
2. **Then a second slow lerp** — bands ease toward target at ~11%/frame. Stacked
   on the 0.8, a snare hit is gone before it reaches full value.
3. **No attack/release asymmetry** — visuals should *snap up* on a transient and
   *decay slowly*; up and down currently share the same slow constant, so nothing
   punches.
4. **Fixed gain, hard clamp** — `gain = 1.7` then `min(1, …)`. A loud master pins
   every band at 1.0 (no dynamics left); a quiet one never climbs. The README
   claimed "auto-gain" but there was no actual AGC.
5. **Beat detection ran on the already-smoothed bass** with a fixed threshold — so
   onsets were weak and not musical.

Highest-leverage fix in the whole project: it's isolated to `audio.js`, no
rendering risk, and **every** existing consumer of `bands.*`/`beat` (sky, water,
aurora, crystals, particles, waveform, lanterns, wisp) instantly gets a sharper
signal. The scene already has many reactive hooks — they were just fed a dull feed.

---

## Tier 1 — Reactivity (make what's already there punch)  ·  **SHIPPED**

| # | Change | Where | Status |
|---|--------|-------|--------|
| 1 | **Attack/release envelopes** — fast rise (~snap), slow fall (graceful decay) per band | `audio.js` | ✅ |
| 2 | **Adaptive gain (AGC)** — rolling max loudness → one shared gain; lifts quiet tracks, tames hot masters, preserves inter-band dynamics | `audio.js` | ✅ |
| 3 | **Spectral-flux beat detection** — positive bin-rise sum vs a rolling baseline; separate **kick** (`beat`, 40–180 Hz) and **hat** (`hat`, 4–11 kHz) onsets | `audio.js` | ✅ |
| 4 | **More bands** — `sub / bass / mid / treble / air`; sub→terrain & deep light, air→particle sparkle so reactions vary instead of all tracking bass | `audio.js` + consumers | ✅ |
| 5 | **Beat pump** — brief bloom-strength + FOV kick on kicks (reduce-motion aware) | `main.js` loop | ✅ |
| 6 | **Bass terrain heave** — gentle vertical breathing of the hills via a vertex-shader offset (visual-only, collision untouched), faded out of the flat path corridor | `pastel.js` terrain mat | ✅ |

**Tuning knobs** (if it's too much / too little):
- Punchiness: `attack`/`release` in `audio.js` update() (higher attack = snappier).
- Beat sensitivity: the `* 1.6 + 0.006` (kick) / `* 1.8 + 0.004` (hat) thresholds.
- Overall drive: the AGC target `0.9` and floor `0.06`.
- Beat pump size: `pump * 0.6` (bloom) / `pump * 2.5` (FOV) in `main.js`.
- Heave amount: `* 0.5` in the terrain shader + the `0.8 / 0.4` weights in update().

Items 1–3 are the transformation; 4–6 add variety and drama.

---

## Tier 2 — Magnificence (effects: cheap-ish, big wow)  ·  **MOSTLY SHIPPED**

Prioritized the items that add richness/beauty *without* adding brightness wash
(the project's aesthetic is clean + moonlit, and glow was just dialed down).

| Item | Status | Notes |
|------|--------|-------|
| **Twinkling starfield** | ✅ | New `_buildStarfield` — dome of per-star-phase twinkling points (custom unfogged shader); `air`/treble shimmer, fades at dawn. |
| **Terrain rim-light** | ✅ | Moonlit fresnel edge injected into the terrain fragment shader; stronger at deep night. Sculpts ridges — supports the "clean" look. |
| **Water upgrade** | ✅ | Moonglade reflection streak (points at the moon) + caustic web in the water shader. |
| **Layered aurora curtains** | ✅ | Three overlapping curtain bands in one plane for depth. |
| **Moon god-rays / light shaft** | ⏸ held | Deferred — light shafts risk exactly the wash just removed, and need an extra post pass. Opt-in later, gated low. |
| **Photo-mode depth-of-field** | ⏸ held | Deferred — adds a `BokehPass` to the composer chain; lowest-priority Tier 2 item. |

Note: the Tier 1 "bloom pump" was **removed** in the lighting-rebalance pass (it
blew out the bright/additive elements); the beat now gives a subtle FOV pulse only.

## Tier 3 — Richer world / content  ·  **1–3 SHIPPED**

| Item | Status | Notes |
|------|--------|-------|
| **Instanced swaying grass** | ✅ | One `InstancedMesh` of low-poly blades on grassy, dry, off-path ground; recycled on wrap; sway in the vertex shader (wind + mid/beat). Count via `PERF.grass`. |
| **Biome weather** | ✅ | Snowfall (snow biome), blowing sand (desert), faint mist (grass); opacity follows the biome mask under the walker; camera-anchored, only the active system loops. |
| **Reactive constellations** | ✅ | Hand-authored star patterns on the dome; connecting lines + star size swell on musical peaks; night-gated like the field. |
| **Responsive landmarks** | ✅ | Waystones spaced along the path (recycled); dormant/dark until you approach, then kindle — crystal glow + ground ring + light shaft + point light — and pulse with the music. Fires a toast on first kindle. Non-blocking. |
| **Flocking fauna** | ⏳ | Birds/fish that drift and scatter on strong beats. |

## Cross-cutting

- Everything gated by the `PERF` profile (`src/perf.js`) and `reduceMotion` —
  starfield count, grass density, weather, god-rays scale down on mobile / for
  photosensitivity.
- **FPS auto-scaler** — adjust particle/grass counts + pixel ratio from measured
  frame time (GRAPHICS-PLAN already flags this).

---

## Suggested sequencing

1. **Tier 1** (this pass) — isolated to `audio.js` + light `main.js`/`pastel.js`
   wiring; the whole existing scene comes alive.
2. **Starfield + god-rays + rim-light** (Tier 2) — the visual leap.
3. **Grass + weather** (Tier 3) — richness.
