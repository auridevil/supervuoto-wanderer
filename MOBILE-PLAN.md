# Mobile Support — scope & estimate

**Status: not started.** Today the game is desktop-only (keyboard + mouse-look +
pointer-lock); touch devices get a notice on the start screen.

**Overall size: medium — not a rewrite.** The engine (three.js render, Web Audio,
the worlds) is platform-agnostic and already runs in mobile browsers. The work is
concentrated in touch input + a mobile performance profile.

## Work packages

### M1 — Touch controls (the bulk) · M
`src/controls.js` assumes pointer-lock + keyboard. Add a touch layer feeding the
*same* yaw/pitch/velocity it already uses:
- **Virtual joystick** (left thumb) → walk/strafe.
- **Drag-to-look** (right half of screen) → yaw/pitch, replacing pointer-lock.
- On-screen **buttons**: jump; optionally view/world toggles (or fold into settings).
- Drop the pointer-lock requirement on touch (tap-to-start already exists).
- New `src/touch-controls.js` (or extend `WalkControls`) + a little on-screen UI in `index.html`.

### M2 — Mobile performance profile (the real risk) · M
Phones are much weaker and we now stack bloom + LOFI + contact shadows +
per-frame terrain rebuild + particles. Detect mobile and:
- lower `pixelRatio`, cut particle/prop counts, default **bloom off** (or cheaper),
- consider reduced terrain resolution / fewer rebuild rows,
- mostly knob-turning since scaling hooks largely exist.
Without this it will stutter / overheat on low-end devices.

### M3 — Responsive UI polish · S
- Size HUD / settings / wayfinding chips for small screens, safe-area insets,
  landscape hint, optional fullscreen on start. (DOM UI already takes touch.)

## Already works on mobile
Audio (tap gesture resumes the AudioContext), the file picker, settings sliders,
the whole render pipeline.

## Verdict
One focused effort (~ a couple of the WPs we already shipped): a `TouchControls`
module + a mobile perf profile + responsive tweaks. **Performance is the main
unknown**; everything else is mechanical. Good candidate for a single ruflo workflow.
