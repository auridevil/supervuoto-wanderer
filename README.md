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
- Or pass a URL: **`?track=<direct-audio-url>`** (e.g.
  `?track=https://host/mix.mp3`). With no track, a generative ambient pad plays.

### Loading a mix by URL — CORS matters

The visuals react by analysing the audio through Web Audio, which requires the
host to send permissive **CORS** headers (`Access-Control-Allow-Origin`). Pick
the host accordingly:

- ✅ **Works, reactive:** a file in this app's `public/` (same-origin); Dropbox
  direct links (`?track=<dropbox share link>` — auto-rewritten to
  `dl.dropboxusercontent.com`); S3 / Cloudflare R2 / Backblaze with a CORS rule.
- ⚠️ **Plays but not reactive:** hosts that serve audio without CORS — the mix
  is audible, the world just animates on its own (no music reaction).
- ❌ **Google Drive does _not_ work.** `?gdrive=<share link or id>` is accepted
  and rewritten, but Drive returns **403 to in-browser requests** (it blocks
  cross-origin browser fetches), so it falls back to the ambient pad. Host the
  mix on Dropbox / S3 / R2 instead. (curl can fetch Drive; browsers cannot.)

The audio is analysed live: **bass** drives terrain motion / shape pulsing,
**mids** drive sky & fog color, **treble** drives particles & glow, and detected
**beats** flash the lighting.

## Recording a video (YouTube-ready mp4)

Capture the autopilot "walk the line" demo, in sync with a track, straight from
the browser:

1. Load with **`?record=1`** and a track — e.g.
   `http://localhost:5173/?record=1&track=https://host/mix.mp3`, or drop your
   file in `public/music.mp3` and open `?record=1`.
2. Click **enter**. The chrome hides, the sage walks the line, and capture
   starts automatically. Leave the tab focused and in the foreground.
3. When the track ends, a **`.webm`** downloads (canvas video + the exact track
   audio, already in sync). The output resolution follows your window size, so
   size the window to what you want (e.g. a 1920×1080 window ≈ 1080p).

Then convert the `.webm` to an H.264/AAC `.mp4` YouTube accepts:

```bash
ffmpeg -i supervuoto-walk-*.webm \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow \
  -c:a aac -b:a 320k -movflags +faststart \
  walk.mp4
```

Notes:
- Capture runs in **real time** — a 4-minute track takes 4 minutes.
- Audio is captured only on the **reactive (analysed) path** — a local file, a
  same-origin `public/` track, or a CORS mix (see below). A play-only fallback
  (non-CORS host) plays but won't be captured; use a local file instead.
- Keep the tab in the foreground; background tabs throttle the render loop.
- Need to stop a take early? Run `stopWalkRecording()` in the devtools console —
  it saves what's captured so far.

## Structure

- `src/main.js` — renderer, loop, world switching, start flow
- `src/audio.js` — Web Audio engine: file streaming + analyser + generative fallback
- `src/controls.js` — pointer-lock WASD wander controls
- `src/noise.js` — simplex noise + fbm for the terrain
- `src/worlds/pastel.js` — soft low-poly pastel hills
- `src/worlds/plane.js` — dreamy infinite reflective grid
