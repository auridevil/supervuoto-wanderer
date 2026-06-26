# supervuoto-wanderer

A goalless, in-browser **exploration walk** built with **three.js + Vite**. You
wander a moonlit, infinite world whose terrain, sky, water and creatures breathe
in real time with a music track. No objective — just walk.

Inspired by the calm, aimless feel of [messenger.abeto.co](https://messenger.abeto.co).

---

## Run it

```bash
npm install
npm run dev          # open the printed localhost URL, click to enter
npm run build        # production build into dist/
```

Drop a long track at **`public/music.mp3`** (your 1-hour mix), or use the
start-screen file picker. With no track, a built-in generative ambient pad
plays so the world still reacts.

---

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Walk |
| Mouse | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| `V` | Toggle third / first person (third is the default) |
| `1` / `2` | Switch world (Moonlit Hills / Infinite Plane) |
| `[` / `]` or slider | Waveform-ribbon width |
| `Esc` | Release the mouse (to use the slider) |

---

## What's in it

### Audio engine (`src/audio.js`)
- Live **Web Audio frequency analysis** split into **bass / mid / treble** bands
  plus a sensitive **beat** onset detector, with auto-gain so quiet tracks still
  drive strong visuals.
- Streams a file (good for hour-long tracks) or plays a **generative ambient
  pad** fallback (rhythmic sub pulse so the demo visibly reacts).
- Also exposes the **time-domain waveform** for the on-path oscilloscope.

### The world — "Moonlit Hills" (`src/worlds/pastel.js`)
- **Infinite low-poly terrain** that recomputes in world-space as you move, with
  mid-scale relief and a **moonlit palette** (indigo valleys → teal slopes →
  pale-lavender ridges) plus a large-scale region tint that drifts hills toward
  teal / blue / violet.
- **Biomes** blended from low-frequency noise:
  - **Desert** — sandy, gently flat (never steep); vegetation hides there.
  - **Snowy peaks** — rarer & farther, ~3.6× amplitude and steep, with rock→snow caps.
- **Water** — animated sea-level plane; valleys become lakes/rivers and the
  player walks *on* its surface (the path becomes a causeway across it).
- **Winding endless path** — a trail that meanders forever through a flattened
  corridor, lined with lantern posts.
- **Live waveform ribbon** — the playing audio drawn as a thick cyan oscilloscope
  down the centre of the path (width adjustable).
- **Structures & a maze** — torii gates, shrines, towers, broken pillars, ruined
  walls and stone **labyrinths**, all with real circle-vs-AABB collision.
- **Collectible rings** — small golden hoops along the path that vanish on
  contact (and flash the sage white).
- **Sky life** — moon with glow, drifting clouds, floating lanterns, green/cyan
  **aurora**, and **shooting stars** on strong beats.
- **Reactive background** — the sky shader has flowing colour movement; its base
  colours evolve over a slow **time** cycle *and* react to the **music**.
- **Beat ripples**, firefly particles, reactive crystals & floating orbs.

### Second world — "Infinite Plane" (`src/worlds/plane.js`)
An endless reflective neon grid under a glowing horizon, with slowly tumbling
emissive shapes — minimal and hypnotic. (`2` to switch to it.)

### The wanderer (`src/character.js`)
A small, earthy **sage-traveler**: pilgrim sun-hat, draped cloak, backpack with
bedroll, boots, a staff with a music-reactive **lantern**, and a faint halo.
Full walk cycle, turns to face travel, hops on jump. Gains an **enlightenment
aura** when walking on the waveform, and **flashes white** when collecting a ring.

### Look & feel
- **LOFI post-processing** (`src/lofi.js`) — subtle pixelation, dithered colour
  banding, film grain, slight desaturation and a vignette (blended ~55%).
- Fancy animated **start screen** (aurora gradient, sheening title).

---

## Architecture

```
index.html            # canvas, overlay/HUD/slider UI, all styles
src/main.js            # renderer, LOFI composer, loop, world switching, input, start flow
src/audio.js           # Web Audio engine: file/placeholder + analyser bands + waveform
src/controls.js        # pointer-lock WASD + jump + 1st/3rd-person camera + collision hook
src/character.js       # the sage-traveler avatar
src/noise.js           # simplex noise + fbm
src/lofi.js            # lo-fi post-processing shader
src/worlds/pastel.js   # Moonlit Hills (terrain, biomes, water, path, structures, sky, fx)
src/worlds/plane.js    # Infinite Plane
public/music.mp3       # (optional) your track
```

**Core ideas**
- A common *world* interface (`init / update / heightAt / dispose`, optional
  `solveCollision`) lets `main.js` swap worlds behind one shared camera + audio.
- "Infinite" comes from recentering geometry on the player each frame
  (terrain re-sampled in world space; props, path, water & sky wrap/follow).
- Everything visual is a function of `(bands, beat, elapsed)` so the whole scene
  is driven by the music and time.

---

## Build journey (the short version)

1. Scaffold: Vite + three, two switchable worlds, live frequency analysis, file/placeholder audio.
2. Made the pastel world richer & clearly reactive; added sky life, scatter, beat ripples.
3. Added third-person **sage** avatar; later jumping.
4. Reworked the avatar from a purple wizard into a smaller, detailed **earthy traveler**.
5. Added **water**, **structures**, **walls/mazes** with collision, and a **winding endless path**.
6. Drew the **live waveform** on the path; boosted reactivity.
7. Went **dark-nature / twilight**; later fixed a green emissive wash → moonlit palette.
8. Added the **waveform-width** control, **on-waveform enlightenment**, path **collectibles**, terrain/path **texture**, and **LOFI**.
9. Polished: rings-only collectibles that vanish on touch with a white flash, biomes (desert + snowy peak), moving music+time background, third-person default.
10. Renamed to **supervuoto-wanderer** with a fancier start screen.
