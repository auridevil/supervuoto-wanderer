# Implementation Plan — supervuoto-wanderer

Scope agreed with the user:
- **Gameplay:** wayfinding + height-aware jumps
- **Audio:** keep generative; add the ability to inject a SoundCloud URL
- **Visuals:** day/night arc; biome-specific props
- **Perf:** terrain rebuild hitch; resource disposal
- **Polish:** all four (reduce-motion, motion-comfort/FOV, LOFI UI, photo mode)

---

## Work packages

### WP1 — Height-aware jumps  ·  *small*
**Files:** `src/controls.js`, `src/worlds/pastel.js`
- Add a top-height (`hy` = world Y of the wall's top) to each entry in `this.solids`.
- `solveCollision(pos, radius, feetY)` — skip a solid when `feetY > solid.top - margin`, so jumping clears low walls but tall walls/towers still block.
- `controls.update`: pass `this.groundY + this.jumpOffset` as `feetY`.
- Acceptance: can hop over broken pillars / low ruins; cannot clear towers or labyrinth walls.

### WP2 — Wayfinding  ·  *medium*  ·  self-contained
**Files:** `src/wayfinding.js` (new), `index.html` (HUD chips), `src/main.js` (wire), uses exported `desertMask`/`snowMask`.
- Throttled (~2/s) sampling of the biome fields along 16 compass directions at rising distances; pick the bearing of strongest desert and of strongest snow.
- Two HUD chips ("Desert", "Snow ▲") that rotate to point relative to camera yaw, with a coarse distance hint; fade when you're inside that biome.
- Optional in-world cue: faint horizon glow in that bearing (stretch).

### WP3 — Day/night arc  ·  *medium*
**Files:** `src/audio.js` (expose `progress()` = currentTime/duration, or a virtual 60-min clock for generative), `src/main.js` (pass progress), `src/worlds/pastel.js` (palette from progress).
- Map progress 0→1 to a sunset → deep-night → dawn keyframe ramp for `skyTop/skyBot`, fog color/density, moon intensity, water tint. Music reaction layers on top.
- Lantern/firefly/aura brightness scales up at "night".

### WP4 — Biome-specific props  ·  *medium-large*
**Files:** `src/worlds/pastel.js` (+ optional `src/props.js` for builders).
- Desert pool: cacti (cylinder + arms), bleached bones, dead shrubs. Snow pool: dark pines with snow caps, snowy boulders. Grass keeps current trees/mushrooms.
- Reuse the wrap system; on wrap, a prop shows only where its biome mask is high (others hidden) so each region reads distinct.

### WP5 — Terrain rebuild hitch  ·  *medium*
**Files:** `src/worlds/pastel.js` (`_rebuild`).
- Replace the synchronous full-grid recompute + `computeVertexNormals` with: (a) **analytic normals** from height-field finite differences (drops the O(n) normal pass), and (b) **incremental** rebuild spread over a few frames when crossing a cell.
- Acceptance: no frame spike when walking across cell boundaries.

### WP6 — Resource disposal audit  ·  *small-medium*
**Files:** `src/worlds/pastel.js`, `src/worlds/plane.js`, `src/main.js`.
- Verify every geometry/material/texture (grain, shaders, props, waveform, path) is freed on `dispose`; log `renderer.info.memory` across world switches in dev to confirm no growth.

### WP7 — Polish: reduce-motion / photosensitivity  ·  *medium*
**Files:** `src/worlds/pastel.js`, `src/character.js`, `src/main.js`, `index.html` (settings).
- A `settings.reduceMotion` flag scales down beat flashes (terrain emissive, pickup white flash, sky glow), disables shooting-star strobes, and damps particle bursts. Respect `prefers-reduced-motion` by default. Persist to `localStorage`.

### WP8 — Polish: motion comfort  ·  *small*
**Files:** `src/main.js`, `index.html`.
- FOV slider (updates `camera.fov`); toggle for sprint/FOV behaviour; persisted.

### WP9 — Polish: LOFI controls  ·  *small*
**Files:** `src/main.js`, `index.html`, `src/lofi.js`.
- Settings sliders for `pixelSize`, `levels`, grain, `amount`, plus an on/off toggle wired to the `lofiPass` uniforms (and bypass the pass when off). Persisted.

### WP10 — Polish: photo mode  ·  *medium*
**Files:** `src/main.js`, `index.html`.
- Key `P`: hide HUD/reticle/panel, optionally freeze, allow look; capture button renders a frame and downloads a PNG (composer output via canvas `toBlob`).

### WP11 — Audio: inject a SoundCloud URL  ·  **SKIPPED (user decision)**
Dropped. Keep the existing file upload + generative pad. CORS analysis below kept
for the record / future revisit.

---

## SoundCloud feasibility (the honest answer)

**Short version: yes, it's complex — full real-time reactivity from a SoundCloud
stream is essentially blocked in the browser.** Why:
- New SoundCloud API keys are effectively closed; playback relies on a public
  `client_id` scraped from their web player, which rotates and is fragile/ToS-gray.
- The dealbreaker is **CORS**: SoundCloud's audio streams aren't CORS-enabled for
  arbitrary origins, so `createMediaElementSource` + `AnalyserNode` returns **all
  zeros** — the whole bass/mid/treble + beat reactivity (and the waveform ribbon)
  can't read the samples. You can't fix this client-side without a proxy server
  that re-streams the audio with permissive CORS (a backend + more ToS risk).

**Options (pick one):**
- **C — Widget + waveform envelope (recommended).** Play via the SoundCloud
  **Widget API** (iframe) and fetch the track's **`waveform.json`** (a ~1800-point
  amplitude envelope SC publishes per track). Drive visuals from playback position →
  envelope: gives real, music-synced **loudness/beat** motion, but **not** true
  frequency bands (bass/mid/treble are approximated from the envelope). No backend.
  *Medium effort, somewhat fragile (depends on resolvable client_id).*
- **D — Direct audio URL only.** Paste a URL to a **CORS-accessible audio file**
  (own hosting, some cloud direct links). Full reactivity, trivial to build —
  but **SoundCloud links won't work.** *Small effort.*
- **B — Widget playback only.** SoundCloud plays, visuals fall back to the
  generative/idle reaction (no analysis). *Small effort, breaks the "reacts to the
  song" promise.*
- **A — Skip SoundCloud.** Keep file upload + generative. *No effort.*

Recommendation: **C** (best music-reactive result without a server), with **D**
added cheaply alongside it (paste any direct audio URL → full reactivity).

---

## Rolling this out with ruflo (parallelization & conflicts)

`src/worlds/pastel.js` and `src/main.js` are shared by many WPs, so naive parallel
agents would collide. Plan:

- **Parallel island (independent / new files):** WP2 (`wayfinding.js`) and
  WP9 (`lofi.js`) — run concurrently in worktrees. (WP11 skipped.)
- **Sequential `pastel.js` chain (one agent or ordered stages):**
  WP5 (hitch) → WP1 (jumps) → WP4 (biome props) → WP3 (day/night) → WP7 (reduce-motion) → WP6 (disposal).
- **Integration pass:** a final agent wires `main.js` + `index.html` (settings
  panel hosting WP7/8/9/10 + WP2 chips + WP11 input), then `npm run build` must pass.
- Each stage ends with a build check; the integration stage is the only place
  `index.html`/`main.js` are edited to avoid churn.

**Suggested order of value:** WP1 + WP5 first (feel + smoothness), then WP3 +
WP4 (the big visual upgrade), then polish WP7–10, then WP11 per the chosen option.
