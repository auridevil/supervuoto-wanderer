import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AudioEngine } from "./audio.js";
import { WalkControls } from "./controls.js";
import { TouchControls } from "./touch-controls.js";
import { IS_MOBILE, PERF } from "./perf.js";
import { PastelWorld } from "./worlds/pastel.js";
import { PlaneWorld } from "./worlds/plane.js";
import { Wizard } from "./character.js";
import { LofiShader } from "./lofi.js";
import { Wayfinding } from "./wayfinding.js";
import { Journey } from "./journey.js";
import { randomHaiku } from "./haiku.js";

const app = document.getElementById("app");

// ---- renderer / scene / camera ----
// preserveDrawingBuffer lets photo mode read the composed canvas back reliably
// (toBlob after a render won't return a cleared buffer).
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERF.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic color; exposure set via settings
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);

// ---- LOFI post-processing ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Bloom — soft glow on bright/emissive pixels (lanterns, rings, crystals,
// aurora, the waveform ribbon, the moon). Runs before the LOFI stylization.
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.72);
composer.addPass(bloomPass);
const lofiPass = new ShaderPass(LofiShader);
composer.addPass(lofiPass);
function syncResolution() {
  const v = renderer.getDrawingBufferSize(new THREE.Vector2());
  lofiPass.uniforms.resolution.value.copy(v);
}
syncResolution();

const controls = new WalkControls(camera, renderer.domElement);
const audio = new AudioEngine();

// The Night Journey: a real-time one-hour arc (companion wisp, meteor shower,
// lantern festival, sky whale, aurora storm, spirit herd, comet, sunrise) that
// drives the worlds' day/night progress and the stats chip.
const journey = new Journey(scene);

// Ring pickups feed the journey (wisp growth, stats) and ring a soft chime
// that the analyser hears — so the world reacts to your own collecting.
function onRingCollected() {
  journey.collectRing();
  audio.chime(journey.rings - 1);
}

// A waystone/monolith kindled on approach — toast + a running tally in the top bar.
function onLandmark(text, ms) {
  flashWorldName(text, ms);
  journey.litMonolith();
}

// A wonder responded. The payoff sound plays every time; the toast + quiet tally
// happen only on the first encounter (`first`). No profit, ever.
function onWonder(kind, text, first) {
  if (first) { flashWorldName(text, 3600); journey.witnessWonder(); }
  switch (kind) {
    case "monastery": audio.bell(); break;
    case "singing": case "giant": audio.drone(); break;
    case "well": audio.chime(1); break;
    case "cairn": audio.chime(2); break;
    case "door": audio.chime(0); break;
    default: audio.chime(3);
  }
}

// ---- wayfinding HUD chips ----
const wayfinding = new Wayfinding();
const wayfind = document.getElementById("wayfind");
const wfDesert = document.getElementById("wf-desert");
const wfSnow = document.getElementById("wf-snow");
const wfDesertArrow = wfDesert && wfDesert.querySelector(".wf-arrow");
const wfSnowArrow = wfSnow && wfSnow.querySelector(".wf-arrow");
const wfDesertDist = wfDesert && wfDesert.querySelector(".wf-dist");
const wfSnowDist = wfSnow && wfSnow.querySelector(".wf-dist");

// Rotate a chip's arrow to point toward its biome, or hide the chip when the
// target is unknown / you're already inside it (result is null).
function updateChip(chip, arrow, distEl, rel) {
  if (!chip) return;
  if (!rel) {
    chip.style.opacity = "0";
    return;
  }
  chip.style.opacity = "1";
  // angleRelToCamera: 0 = dead ahead. Arrow glyph points up; rotate clockwise
  // for targets to the right (negate the CCW-positive world angle).
  if (arrow) arrow.style.transform = `rotate(${-rel.angleRelToCamera}rad)`;
  if (distEl) distEl.textContent = rel.distanceLabel;
}

// The sage-wizard-buddha avatar — shown in third person (the default view).
const wizard = new Wizard();
scene.add(wizard.group);
controls.thirdPerson = true;
wizard.group.visible = true;

// ---- worlds ----
const worlds = { pastel: new PastelWorld(), plane: new PlaneWorld() };
let active = null;

function setWorld(key) {
  if (active === worlds[key]) return;
  if (active) active.dispose(scene);
  active = worlds[key];
  active.init(scene);
  controls.heightAt = active.heightAt;
  controls.collide = typeof active.solveCollision === "function" ? active.solveCollision.bind(active) : null;
  controls.pathAt = typeof active.pathAt === "function" ? active.pathAt.bind(active) : null;
  if ("waveWidth" in active) active.waveWidth = waveWidth;
  if ("reduceMotion" in active) active.reduceMotion = settings.reduceMotion;
  if ("onCollect" in active) active.onCollect = onRingCollected;
  if ("onLandmark" in active) active.onLandmark = onLandmark;
  if ("onWonder" in active) active.onWonder = onWonder;
  if ("onToast" in active) active.onToast = flashWorldName;
  flashWorldName(active.name);
}

// ---- settings (persisted to localStorage) ----
const SETTINGS_KEY = "sw-settings";
const prefersReducedMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const settings = {
  waveWidth: 0.12, // slim by default (lower bound)
  moveSpeed: 16, // default is fast/running; Shift strolls slowly
  exposure: 1.1,
  reduceMotion: prefersReducedMotion, // default ON if the OS asks for it
  fov: 70,
  lofiOn: true,
  pixelSize: 2,
  levels: 26,
  grain: 0.55,
  bloomOn: true,
  bloomStrength: 0.2,
  chimeVolume: 0.18, // ring-pickup meditation bell (0..1), soft by default
};
// Mobile perf profile: bloom is the priciest pass, default it off on phones.
// Saved settings (loadSettings below) still win if the user flipped it back on.
if (IS_MOBILE) settings.bloomOn = false;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (err) {
    console.warn("Settings load failed:", err);
  }
}
let saveTimer;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn("Settings save failed:", err);
    }
  }, 150);
}
loadSettings();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// DOM refs
const panel = document.getElementById("panel");
const waveWidthInput = document.getElementById("waveWidth");
const wwVal = document.getElementById("wwVal");
const setReduceMotion = document.getElementById("setReduceMotion");
const setFov = document.getElementById("setFov");
const fovVal = document.getElementById("fovVal");
const setLofiOn = document.getElementById("setLofiOn");
const lofiGroup = document.getElementById("lofi-group");
const setPixel = document.getElementById("setPixel");
const pixelVal = document.getElementById("pixelVal");
const setLevels = document.getElementById("setLevels");
const levelsVal = document.getElementById("levelsVal");
const setGrain = document.getElementById("setGrain");
const grainVal = document.getElementById("grainVal");
const setBloomOn = document.getElementById("setBloomOn");
const bloomGroup = document.getElementById("bloom-group");
const setBloomStrength = document.getElementById("setBloomStrength");
const bloomVal = document.getElementById("bloomVal");
const setSpeed = document.getElementById("setSpeed");
const speedVal = document.getElementById("speedVal");
const setExposure = document.getElementById("setExposure");
const exposureVal = document.getElementById("exposureVal");
const setChime = document.getElementById("setChime");
const chimeVal = document.getElementById("chimeVal");

// ---- appliers (each pushes one setting into the live engine) ----
let waveWidth = settings.waveWidth; // kept as a top-level binding for the [ ] keys
function setWaveWidth(v) {
  waveWidth = clamp(v, 0.05, 4);
  settings.waveWidth = waveWidth;
  if (waveWidthInput) waveWidthInput.value = waveWidth;
  if (wwVal) wwVal.textContent = waveWidth.toFixed(1);
  if (active && "waveWidth" in active) active.waveWidth = waveWidth;
  saveSettings();
}

function applyReduceMotion() {
  if (active && "reduceMotion" in active) active.reduceMotion = settings.reduceMotion;
  wizard.reduceMotion = settings.reduceMotion;
  journey.reduceMotion = settings.reduceMotion;
  if (setReduceMotion) setReduceMotion.checked = settings.reduceMotion;
}

function applyFov() {
  settings.fov = clamp(settings.fov, 60, 100);
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
  if (setFov) setFov.value = settings.fov;
  if (fovVal) fovVal.textContent = String(Math.round(settings.fov));
}

function applyMoveSpeed() {
  settings.moveSpeed = clamp(settings.moveSpeed, 4, 30);
  controls.speed = settings.moveSpeed; // Shift still applies the slow stroll multiplier
  if (setSpeed) setSpeed.value = settings.moveSpeed;
  if (speedVal) speedVal.textContent = String(Math.round(settings.moveSpeed));
}

function applyExposure() {
  settings.exposure = clamp(settings.exposure, 0.5, 2);
  renderer.toneMappingExposure = settings.exposure;
  if (setExposure) setExposure.value = settings.exposure;
  if (exposureVal) exposureVal.textContent = settings.exposure.toFixed(2);
}

function applyChimeVolume() {
  settings.chimeVolume = clamp(settings.chimeVolume, 0, 1);
  audio.chimeVolume = settings.chimeVolume;
  if (setChime) setChime.value = settings.chimeVolume;
  if (chimeVal) chimeVal.textContent = settings.chimeVolume.toFixed(2);
}

function applyLofi() {
  // When off, zero the mix so the pass is a passthrough; otherwise push uniforms.
  lofiPass.uniforms.amount.value = settings.lofiOn ? settings.grain : 0;
  lofiPass.uniforms.pixelSize.value = settings.pixelSize;
  lofiPass.uniforms.levels.value = settings.levels;
  lofiPass.uniforms.grain.value = settings.grain;
  lofiPass.enabled = settings.lofiOn;
  if (setLofiOn) setLofiOn.checked = settings.lofiOn;
  if (setPixel) setPixel.value = settings.pixelSize;
  if (pixelVal) pixelVal.textContent = String(settings.pixelSize);
  if (setLevels) setLevels.value = settings.levels;
  if (levelsVal) levelsVal.textContent = String(settings.levels);
  if (setGrain) setGrain.value = settings.grain;
  if (grainVal) grainVal.textContent = settings.grain.toFixed(2);
  if (lofiGroup) lofiGroup.classList.toggle("off", !settings.lofiOn);
}

function applyBloom() {
  bloomPass.enabled = settings.bloomOn;
  bloomPass.strength = settings.bloomStrength;
  if (setBloomOn) setBloomOn.checked = settings.bloomOn;
  if (setBloomStrength) setBloomStrength.value = settings.bloomStrength;
  if (bloomVal) bloomVal.textContent = settings.bloomStrength.toFixed(2);
  if (bloomGroup) bloomGroup.classList.toggle("off", !settings.bloomOn);
}

// ---- wire DOM -> settings ----
if (waveWidthInput) waveWidthInput.addEventListener("input", () => setWaveWidth(parseFloat(waveWidthInput.value)));
if (setReduceMotion)
  setReduceMotion.addEventListener("change", () => {
    settings.reduceMotion = setReduceMotion.checked;
    applyReduceMotion();
    saveSettings();
  });
if (setFov)
  setFov.addEventListener("input", () => {
    settings.fov = parseFloat(setFov.value);
    applyFov();
    saveSettings();
  });
function onLofiInput() {
  settings.lofiOn = setLofiOn ? setLofiOn.checked : settings.lofiOn;
  if (setPixel) settings.pixelSize = parseInt(setPixel.value, 10);
  if (setLevels) settings.levels = parseInt(setLevels.value, 10);
  if (setGrain) settings.grain = parseFloat(setGrain.value);
  applyLofi();
  saveSettings();
}
[setLofiOn, setPixel, setLevels, setGrain].forEach((el) => {
  if (el) el.addEventListener("input", onLofiInput);
});
function onBloomInput() {
  settings.bloomOn = setBloomOn ? setBloomOn.checked : settings.bloomOn;
  if (setBloomStrength) settings.bloomStrength = parseFloat(setBloomStrength.value);
  applyBloom();
  saveSettings();
}
[setBloomOn, setBloomStrength].forEach((el) => {
  if (el) el.addEventListener("input", onBloomInput);
});
if (setSpeed)
  setSpeed.addEventListener("input", () => {
    settings.moveSpeed = parseFloat(setSpeed.value);
    applyMoveSpeed();
    saveSettings();
  });
if (setExposure)
  setExposure.addEventListener("input", () => {
    settings.exposure = parseFloat(setExposure.value);
    applyExposure();
    saveSettings();
  });
let chimePreviewAt = 0;
if (setChime)
  setChime.addEventListener("input", () => {
    settings.chimeVolume = parseFloat(setChime.value);
    applyChimeVolume();
    saveSettings();
    // Preview the bell as you drag, throttled so it doesn't pile up.
    const now = performance.now();
    if (now - chimePreviewAt > 220) { chimePreviewAt = now; audio.chime(2); }
  });

// Collapsible settings section (default collapsed to stay compact).
// Toggle on pointerup with a small movement threshold rather than click: the
// mobile panel scrolls (overflow-y: auto), and iOS suppresses the synthetic
// click when a tap is read as a scroll-start — so `click` never fired to close it.
const settingsHead = document.getElementById("settings-head");
if (settingsHead) {
  panel.classList.add("collapsed");
  let downX = 0, downY = 0;
  settingsHead.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
  settingsHead.addEventListener("pointerup", (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 10) panel.classList.toggle("collapsed");
  });
}

// Explicit "Done" button collapses the settings (mainly for touch). Uses the same
// pointerup + movement threshold as the header, since iOS suppresses the synthetic
// click when a tap inside the scrollable panel is read as a scroll-start.
const settingsDone = document.getElementById("settingsDone");
if (settingsDone) {
  let dX = 0, dY = 0;
  settingsDone.addEventListener("pointerdown", (e) => { dX = e.clientX; dY = e.clientY; });
  settingsDone.addEventListener("pointerup", (e) => {
    if (Math.hypot(e.clientX - dX, e.clientY - dY) < 10) panel.classList.add("collapsed");
  });
}

// Push restored values into UI + engine. applyReduceMotion runs again after the
// first world is created (setWorld) so the active world picks it up.
setWaveWidth(settings.waveWidth);
applyMoveSpeed();
applyExposure();
applyChimeVolume();
applyFov();
applyLofi();
applyBloom();
applyReduceMotion();

const worldNameEl = document.getElementById("worldName");
let nameTimer;
function flashWorldName(name, ms = 2200) {
  worldNameEl.textContent = name;
  worldNameEl.style.opacity = "1";
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => (worldNameEl.style.opacity = "0"), ms);
}
journey.toast = flashWorldName; // journey events announce themselves up top

// ---- start flow ----
const overlay = document.getElementById("overlay");
const hud = document.getElementById("hud");
const reticle = document.getElementById("reticle");
const trackInput = document.getElementById("trackInput");
const wfWonderChip = document.getElementById("wf-wonder");
const restHaikuEl = document.getElementById("restHaiku");
let started = false;
let pendingFile = null;

// Touch devices: no pointer-lock; a virtual joystick + drag-to-look instead.
if (IS_MOBILE) {
  document.getElementById("mobileNote")?.classList.add("show");
  const btn = overlay.querySelector(".start-btn");
  if (btn) btn.textContent = "Start your journey";
  document.body.classList.add("touch");
  controls.touchMode = true;
  new TouchControls(controls, {
    layer: document.getElementById("touchLayer"),
    joy: document.getElementById("joy"),
    stick: document.getElementById("joyStick"),
    jump: document.getElementById("tJump"),
  });
  // Wire the on-screen buttons to the same actions as the keyboard.
  const tap = (id, fn) =>
    document.getElementById(id)?.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
  tap("tView", toggleView);
  tap("tWorld", () => setWorld(active === worlds.pastel ? "plane" : "pastel"));
  tap("tPhoto", () => setPhotoMode(!photoMode));
  tap("tDemo", () => setDemo(!controls.demo));
  tap("tRest", () => setRest(!resting));
  // Help modal: ? opens it, tapping the backdrop or "Got it" dismisses it.
  const helpEl = document.getElementById("help");
  const openHelp = () => helpEl?.classList.add("show");
  const closeHelp = () => helpEl?.classList.remove("show");
  tap("tHelp", openHelp);
  document.getElementById("helpClose")?.addEventListener("click", (e) => { e.stopPropagation(); closeHelp(); });
  helpEl?.addEventListener("click", (e) => { if (e.target === helpEl) closeHelp(); });
  // iOS suspends the context / pauses the unmute element on interruptions;
  // nudge both back on touch and when returning to the tab.
  document.addEventListener("touchend", () => { if (started) audio.keepAlive(); }, { passive: true });
  document.addEventListener("visibilitychange", () => { if (started && !document.hidden) audio.keepAlive(); });
}

trackInput.addEventListener("change", (e) => {
  pendingFile = e.target.files[0] || null;
});

// ---- ?track= / ?gdrive= querystring: load a mix by URL ----
// Turn a pasted link into a direct audio URL. Google Drive share/file links
// (and bare file ids) are rewritten to Drive's download endpoint — note this
// is best-effort: Drive currently returns 403 to in-browser cross-origin
// requests, so it falls back gracefully. CORS-clean hosts (Dropbox direct
// links, S3/R2 with CORS, or a file in this app's /public) work fully.
function resolveTrackUrl(raw) {
  if (!raw) return null;
  raw = decodeURIComponent(String(raw).trim());
  const drive =
    raw.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ||
    raw.match(/[?&]id=([\w-]+)/) ||
    (/^[A-Za-z0-9_-]{25,}$/.test(raw) ? [null, raw] : null);
  if (drive) return `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download`;
  if (/dropbox\.com/.test(raw)) {
    let u = raw.replace(/\/\/(www\.)?dropbox\.com/, "//dl.dropboxusercontent.com").replace(/[?&]dl=\d/, "");
    return u + (u.includes("?") ? "&" : "?") + "dl=1";
  }
  return raw; // assume it's already a direct audio URL
}

const trackParam = (() => {
  try {
    const p = new URLSearchParams(location.search);
    return p.get("track") || p.get("gdrive") || null;
  } catch { return null; }
})();
const trackUrl = resolveTrackUrl(trackParam);
const trackIsDrive = /google\.com/.test(trackParam || "") || /^[A-Za-z0-9_-]{25,}$/.test((trackParam || "").trim());

// A URL mix is already the track — hide the "load your own track" picker.
if (trackUrl) {
  document.getElementById("fileRow")?.style.setProperty("display", "none");
  document.getElementById("padNote")?.style.setProperty("display", "none");
}

// Try reactive (CORS) first; fall back to play-only (no CORS, no analysis);
// return "reactive" | "playonly" | null so start() can message the outcome.
async function loadTrackUrl(url) {
  try {
    await audio.playFile(url, { crossOrigin: "anonymous", analyse: true });
    return "reactive";
  } catch (e1) {
    console.warn("Reactive load failed, trying play-only:", e1);
    try {
      await audio.playFile(url, { crossOrigin: null, analyse: false });
      return "playonly";
    } catch (e2) {
      console.warn("Play-only load failed too:", e2);
      return null;
    }
  }
}

// ---- loader (URL-track download progress) ----
const loaderEl = document.getElementById("loader");
const loaderFill = document.getElementById("loaderFill");
const loaderPct = document.getElementById("loaderPct");
const fmtMB = (b) => (b / 1048576).toFixed(1) + " MB";
function showLoader() { if (loaderEl) { loaderEl.classList.add("show"); setLoaderProgress(0, 0, 0); } }
function hideLoader() { if (loaderEl) loaderEl.classList.remove("show"); }
function setLoaderProgress(frac, received = 0, total = 0) {
  if (!loaderEl) return;
  if (frac == null) { // unknown size / streaming — indeterminate sliver
    loaderEl.classList.add("indeterminate");
    if (loaderPct) loaderPct.textContent = received ? fmtMB(received) + " buffered…" : "buffering…";
    return;
  }
  loaderEl.classList.remove("indeterminate");
  const pct = Math.round(frac * 100);
  if (loaderFill) loaderFill.style.width = pct + "%";
  if (loaderPct) loaderPct.textContent = total ? `${pct}%  ·  ${fmtMB(received)} / ${fmtMB(total)}` : `${pct}%`;
}

// Download the whole mix with a progress bar (CORS hosts), then play it from a
// blob — the file is fully ready, playback is gapless, and the analyser drives
// the visuals. Non-CORS hosts can't be fetched, so fall back to streaming with
// an indeterminate spinner until the element can play.
async function loadTrackWithProgress(url, onProgress) {
  try {
    const resp = await fetch(url);
    if (!resp.ok || !resp.body) throw new Error("http " + resp.status);
    const total = +(resp.headers.get("content-length") || 0);
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(total ? received / total : null, received, total);
    }
    const blob = new Blob(chunks, { type: resp.headers.get("content-type") || "audio/mpeg" });
    await audio.playFile(URL.createObjectURL(blob), { crossOrigin: null, analyse: true });
    return "reactive";
  } catch (e) {
    console.warn("Progressive fetch failed, streaming instead:", e);
    onProgress(null); // indeterminate while the media element buffers
    return await loadTrackUrl(url);
  }
}

// Reveal the in-world UI (HUD, settings, wayfinding, touch controls).
function revealUI() {
  hud.classList.remove("hidden");
  panel.classList.remove("hidden");
  reticle.classList.remove("hidden");
  if (wayfind) wayfind.classList.remove("hidden");
  if (IS_MOBILE) {
    document.getElementById("touchLayer")?.classList.remove("hidden");
    document.getElementById("touchButtons")?.classList.remove("hidden");
  }
}

async function start() {
  if (started) return;
  started = true;
  audio.unlock(); // synchronous, still inside the tap gesture — unlocks iOS audio
  overlay.classList.add("hidden");

  await audio.resume();
  try {
    if (pendingFile) {
      // A user-picked local file is same-origin (object URL) — always reactive.
      revealUI();
      await audio.playFile(pendingFile);
    } else if (trackUrl) {
      // ?track= / ?gdrive= — show a loader while the mix downloads, then start
      // the world only once the file is ready.
      showLoader();
      const mode = await loadTrackWithProgress(trackUrl, setLoaderProgress);
      hideLoader();
      revealUI();
      if (mode === "playonly") {
        flashWorldName("playing your track — visuals won't react (host sent no CORS headers)", 6000);
      } else if (!mode) {
        audio.startPlaceholder();
        flashWorldName(
          trackIsDrive
            ? "google drive blocks in-browser playback — host the mix on dropbox / s3 instead"
            : "couldn't load that track — playing the ambient pad",
          7000
        );
      }
    } else {
      // Try a track shipped in /public, else fall back to the generative pad.
      revealUI();
      const res = await fetch("music.mp3", { method: "HEAD" }).catch(() => null);
      if (res && res.ok) await audio.playFile("music.mp3");
      else audio.startPlaceholder();
    }
  } catch (err) {
    console.warn("Audio init failed, using placeholder:", err);
    hideLoader();
    revealUI();
    audio.startPlaceholder();
  }

  controls.lock();
  journey.begin();
  if (demoParam) setDemo(true); // demo/attract by default (see demoParam)
}

overlay.addEventListener("click", start);

// ---- demo / attract mode ----
// The sage autopilots onto the waveform line and walks it forever, in third
// person. Only the pastel world has a path; switch to it when enabling.
// Demo is the default mode on open — the sage walks the line until you take
// over (any movement key / screen touch exits it). Opt out with ?demo=0.
const demoParam = (() => {
  try { const v = new URLSearchParams(location.search).get("demo"); return v !== "0" && v !== "false"; }
  catch { return true; }
})();
function setDemo(on) {
  if (on && active !== worlds.pastel) setWorld("pastel");
  controls.demo = on;
  if (on) {
    controls.thirdPerson = true;
    wizard.group.visible = true;
    flashWorldName("Demo — the traveler walks the line", 2600);
  } else {
    flashWorldName("Autopilot off — you have the control of your life", 2200);
  }
}

// Re-lock the pointer on click after Esc.
renderer.domElement.addEventListener("click", () => {
  if (started && !controls.enabled) controls.lock();
});

// ---- photo mode ----
// Toggling hides every UI chrome element (HUD, reticle, settings panel,
// wayfinding chips) by adding .photo to <body>; a small Capture button + hint
// fade in. Capture renders one frame then downloads the composed canvas as PNG.
const photoBar = document.getElementById("photoBar");
const captureBtn = document.getElementById("captureBtn");
let photoMode = false;

function setPhotoMode(on) {
  photoMode = on;
  document.body.classList.toggle("photo", on);
}

// ---- rest ----
// A contemplative pause: fade the chrome, letterbox in, a haiku drifts up, and
// the sky time-lapses (journey.restBoost). Any movement rises you again.
let resting = false;
const restAnchor = new THREE.Vector3();
function setRest(on) {
  if (on === resting) return;
  resting = on;
  document.body.classList.toggle("rest", on);
  journey.restBoost = on ? 15 : 1;
  if (on) {
    if (controls.demo) setDemo(false);          // sit still, not on autopilot
    if (restHaikuEl) restHaikuEl.textContent = randomHaiku();
    restAnchor.copy(controls.position);
  }
}

function capturePhoto() {
  // Render one fresh frame so preserveDrawingBuffer holds the composed image,
  // then read the canvas back. The Capture button is hidden during photo mode's
  // chrome rules anyway, so nothing UI bleeds into the PNG.
  composer.render();
  renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `supervuoto-${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

if (captureBtn) captureBtn.addEventListener("click", capturePhoto);

function toggleView() {
  controls.thirdPerson = !controls.thirdPerson;
  wizard.group.visible = controls.thirdPerson;
  flashWorldName(controls.thirdPerson ? "Third Person — the Traveler" : "First Person");
}

// ---- world switch keys ----
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
window.addEventListener("keydown", (e) => {
  if (!started) return;
  // Any manual movement while the demo drives hands control back to the user.
  if (controls.demo && MOVE_KEYS.has(e.code)) { setDemo(false); return; }
  if (e.code === "Digit1") setWorld("pastel");
  if (e.code === "Digit2") setWorld("plane");
  if (e.code === "KeyV") toggleView();
  if (e.code === "KeyG") setDemo(!controls.demo);
  if (e.code === "KeyP") setPhotoMode(!photoMode);
  if (e.code === "KeyR") { setRest(!resting); return; }
  if (e.code === "BracketLeft") setWaveWidth(waveWidth - 0.2);
  if (e.code === "BracketRight") setWaveWidth(waveWidth + 0.2);
});

// ---- resize ----
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  syncResolution();
});

// ---- main loop ----
setWorld("pastel");
const clock = new THREE.Clock();
let pump = 0; // smoothed kick energy -> a brief bloom + FOV pulse on the beat

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  const bands = audio.update(dt);
  controls.update(dt);
  if (resting && controls.position.distanceTo(restAnchor) > 0.4) setRest(false); // move to rise

  // Beat pump: kicks give a subtle FOV nudge so the frame breathes with the music.
  // (No bloom pump — it blew out the bright/additive elements.) Base FOV stays the
  // user's setting; reduce-motion damps it; ease toward the kick so it's a pulse.
  const pumpFm = settings.reduceMotion ? 0.25 : 1;
  pump += (audio.beat - pump) * Math.min(1, dt * 12);
  const fovPump = pump * 1.5 * pumpFm;
  if (Math.abs(camera.fov - (settings.fov + fovPump)) > 0.01) {
    camera.fov = settings.fov + fovPump;
    camera.updateProjectionMatrix();
  }

  // Day/night arc: the Night Journey drives it — a true one-hour night that
  // ends in dawn, regardless of track length (guarded — not every world
  // exposes a progress property).
  if (active && "progress" in active) {
    active.progress = journey.progress;
  }
  journey.update(dt, elapsed, bands, audio.beat, camera, controls, active);

  // Wayfinding: self-throttling sample, then rotate the HUD chips.
  wayfinding.update(dt, camera.position, controls.yaw);
  const wf = wayfinding.result();
  updateChip(wfDesert, wfDesertArrow, wfDesertDist, wf.desert);
  updateChip(wfSnow, wfSnowArrow, wfSnowDist, wf.snow);

  // Wonders: occasional curiosity chip when a gem is nearby.
  if (wfWonderChip) wfWonderChip.classList.toggle("hidden", !active.wonderHint);

  active.update(dt, elapsed, bands, audio.beat, camera.position, audio.wave);
  if (controls.thirdPerson) {
    wizard.update(dt, elapsed, controls.position, controls.groundY, controls.yaw,
      controls.currentSpeed, controls.velocity, bands, audio.beat, controls.jumpOffset, active.onWave || 0, active.flash || 0);
  }
  lofiPass.uniforms.time.value = elapsed;
  composer.render();
}
animate();
