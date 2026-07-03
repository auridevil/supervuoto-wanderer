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
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.6);
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
  if ("waveWidth" in active) active.waveWidth = waveWidth;
  if ("reduceMotion" in active) active.reduceMotion = settings.reduceMotion;
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
  bloomStrength: 0.8,
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

// Collapsible settings section (default collapsed to stay compact).
const settingsHead = document.getElementById("settings-head");
if (settingsHead) {
  panel.classList.add("collapsed");
  settingsHead.addEventListener("click", () => panel.classList.toggle("collapsed"));
}

// Push restored values into UI + engine. applyReduceMotion runs again after the
// first world is created (setWorld) so the active world picks it up.
setWaveWidth(settings.waveWidth);
applyMoveSpeed();
applyExposure();
applyFov();
applyLofi();
applyBloom();
applyReduceMotion();

const worldNameEl = document.getElementById("worldName");
let nameTimer;
function flashWorldName(name) {
  worldNameEl.textContent = name;
  worldNameEl.style.opacity = "1";
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => (worldNameEl.style.opacity = "0"), 2200);
}

// ---- start flow ----
const overlay = document.getElementById("overlay");
const hud = document.getElementById("hud");
const reticle = document.getElementById("reticle");
const trackInput = document.getElementById("trackInput");
let started = false;
let pendingFile = null;

// Touch devices: no pointer-lock; a virtual joystick + drag-to-look instead.
if (IS_MOBILE) {
  document.getElementById("mobileNote")?.classList.add("show");
  const btn = overlay.querySelector(".start-btn");
  if (btn) btn.textContent = "Tap to enter";
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
  // iOS suspends the AudioContext on interruptions; nudge it back on touch.
  document.addEventListener("touchend", () => { if (started) audio.resume(); }, { passive: true });
}

trackInput.addEventListener("change", (e) => {
  pendingFile = e.target.files[0] || null;
});

async function start() {
  if (started) return;
  started = true;
  overlay.classList.add("hidden");
  hud.classList.remove("hidden");
  panel.classList.remove("hidden");
  reticle.classList.remove("hidden");
  if (wayfind) wayfind.classList.remove("hidden");
  if (IS_MOBILE) {
    document.getElementById("touchLayer")?.classList.remove("hidden");
    document.getElementById("touchButtons")?.classList.remove("hidden");
  }

  await audio.resume();
  try {
    if (pendingFile) {
      await audio.playFile(pendingFile);
    } else {
      // Try a track shipped in /public, else fall back to the generative pad.
      const res = await fetch("music.mp3", { method: "HEAD" }).catch(() => null);
      if (res && res.ok) await audio.playFile("music.mp3");
      else audio.startPlaceholder();
    }
  } catch (err) {
    console.warn("Audio init failed, using placeholder:", err);
    audio.startPlaceholder();
  }

  controls.lock();
}

overlay.addEventListener("click", start);

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
window.addEventListener("keydown", (e) => {
  if (!started) return;
  if (e.code === "Digit1") setWorld("pastel");
  if (e.code === "Digit2") setWorld("plane");
  if (e.code === "KeyV") toggleView();
  if (e.code === "KeyP") setPhotoMode(!photoMode);
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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  const bands = audio.update(dt);
  controls.update(dt);

  // Day/night arc: feed playback progress to the active world (guarded — not
  // every world exposes a progress property / audio a progress method).
  if (active && "progress" in active && typeof audio.progress === "function") {
    active.progress = audio.progress();
  }

  // Wayfinding: self-throttling sample, then rotate the HUD chips.
  wayfinding.update(dt, camera.position, controls.yaw);
  const wf = wayfinding.result();
  updateChip(wfDesert, wfDesertArrow, wfDesertDist, wf.desert);
  updateChip(wfSnow, wfSnowArrow, wfSnowDist, wf.snow);

  active.update(dt, elapsed, bands, audio.beat, camera.position, audio.wave);
  if (controls.thirdPerson) {
    wizard.update(dt, elapsed, controls.position, controls.groundY, controls.yaw,
      controls.currentSpeed, controls.velocity, bands, audio.beat, controls.jumpOffset, active.onWave || 0, active.flash || 0);
  }
  lofiPass.uniforms.time.value = elapsed;
  composer.render();
}
animate();
