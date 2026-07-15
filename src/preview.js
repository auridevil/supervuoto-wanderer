import * as THREE from "three";
import { Wizard } from "./character.js";

// A small live 3D portrait of the sage on the start screen — the actual Wizard,
// turning slowly under warm light, his lantern breathing. Returns a stop() that
// tears down the mini-renderer when the journey begins.
export function startWizardPreview(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return () => {}; // no WebGL for the preview — the start screen still works
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  cam.position.set(0, 1.5, 4.3);
  cam.lookAt(0, 1.12, 0);

  scene.add(new THREE.HemisphereLight("#c6d2ff", "#20263a", 1.0));
  const key = new THREE.DirectionalLight("#ffe9c8", 1.5); key.position.set(2.5, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight("#9fb4ff", 0.7); rim.position.set(-3, 2, -2.5); scene.add(rim);

  const wiz = new Wizard();
  wiz.group.visible = true;
  scene.add(wiz.group);

  const resize = () => {
    const w = canvas.clientWidth || 200, h = canvas.clientHeight || 240;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  const bands = { sub: 0, bass: 0, mid: 0, treble: 0, air: 0, level: 0 };
  let running = true, raf = 0;

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const el = clock.elapsedTime;
    // Gentle breathing so the lantern + halo shimmer without a real track.
    const pulse = 0.5 + 0.5 * Math.sin(el * 0.9);
    bands.bass = 0.12 + pulse * 0.12;
    bands.mid = 0.14 + pulse * 0.08;
    bands.treble = 0.1 + pulse * 0.1;
    bands.level = 0.14;
    // Drive the avatar centred, standing, turning slowly (yaw = -rotation).
    wiz.update(dt, el, { x: 0, y: 0, z: 0 }, 0, -el * 0.4, 0, { x: 0, z: 0 }, bands, 0, 0, 0, 0);
    renderer.render(scene, cam);
  }
  loop();

  return function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    try { renderer.dispose(); renderer.forceContextLoss(); } catch {}
  };
}
