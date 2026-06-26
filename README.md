# supervuoto-wanderer

A goalless, in-browser walking experience built with **three.js**. Wander an
endless moonlit world whose terrain, sky, water, and creatures breathe in real
time with a music track (live Web Audio frequency analysis — works with any track).

Inspired by the calm, aimless feel of [messenger.abeto.co](https://messenger.abeto.co).

See [SUPERVUOTO-WANDERER.md](./SUPERVUOTO-WANDERER.md) for the full feature/architecture write-up.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173), click to enter, and walk.

## Deploy to GitHub Pages

The repo ships a workflow at `.github/workflows/deploy.yml` that builds and
publishes to GitHub Pages on every push to `main`.

1. Push the repo to GitHub.
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push to `main` (or run the workflow manually); the site publishes at
   `https://<user>.github.io/<repo>/`.

`vite.config.js` uses `base: "./"` so the build works under the project subpath.
Add your track as `public/music.mp3` (committed) to ship it with the site.

> **Desktop only.** It needs a keyboard, mouse-look and pointer-lock, so it
> doesn't work on phones/tablets (the start screen shows a notice on touch devices).

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Walk |
| Mouse | Look around |
| `Space` | Jump |
| `Shift` | Stroll (move slowly) |
| `V` | Toggle third / first person (third is default) |
| `1` / `2` | Switch world (Moonlit Hills / Infinite Plane) |
| `[` / `]` or slider | Waveform-ribbon width |
| `P` | Photo mode |
| `Esc` | Release mouse |

Press `1` / `2` anytime to switch worlds live.

## Music

- Put a **`music.mp3`** in `public/` and it auto-loads (use your 1h track).
- Or load any audio file from the start screen's file picker.
- With no track, a generative ambient pad plays so visuals still react.

The audio is analysed live: **bass** drives terrain motion / shape pulsing,
**mids** drive sky & fog color, **treble** drives particles & glow, and detected
**beats** flash the lighting.

## Structure

- `src/main.js` — renderer, loop, world switching, start flow
- `src/audio.js` — Web Audio engine: file streaming + analyser + generative fallback
- `src/controls.js` — pointer-lock WASD wander controls
- `src/noise.js` — simplex noise + fbm for the terrain
- `src/worlds/pastel.js` — soft low-poly pastel hills
- `src/worlds/plane.js` — dreamy infinite reflective grid
