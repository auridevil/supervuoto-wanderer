import * as THREE from "three";

// The Night Journey — a real-time, 30-minute passage from dusk to daylight that
// rewards staying. The day/night sky (worlds' `progress`) is driven by walked
// time, not the track, so night falls, deepens, and lifts into a full sunrise
// exactly at the 30-minute mark. Along the way, timed events appear: a companion
// wisp, a meteor shower, a lantern festival, a sky whale, an aurora, a spirit
// herd, a comet — then daybreak.
//
// All event visuals are owned here (built lazily, camera-anchored) so they
// work over any world; world-specific hooks (auroraBoost, sunrise, onCollect)
// are set only when the active world exposes them.

const SPAN = 1800; // 30 minutes: dusk -> deep night -> daylight
const rand = (a, b) => a + Math.random() * (b - a);

// 0 → 1 → 0 envelope over u∈(0,1): quick fade-in, hold, gentle fade-out.
function envelope(u, inFrac = 0.08, outFrac = 0.82) {
  if (u <= 0 || u >= 1) return 0;
  const rise = Math.min(1, u / inFrac);
  const fall = u > outFrac ? 1 - (u - outFrac) / (1 - outFrac) : 1;
  return Math.max(0, Math.min(rise, fall));
}

export class Journey {
  constructor(scene) {
    this.scene = scene;
    this.started = false;
    this.t = 0;          // seconds walked since begin()
    this.rings = 0;      // collected along the path
    this.distance = 0;   // metres walked
    this.reduceMotion = false; // main.js keeps this in sync with settings
    this.toast = null;   // (text, ms) => void, set by main.js
    this.statsEl = document.getElementById("stats");
    this._statsAcc = 0;
    // Preview/debug: ?tempo=60 makes the hour pass in a minute (journey clock
    // only — movement and music stay real-time).
    this.timeScale = (() => {
      try { return Math.max(0.1, parseFloat(new URLSearchParams(location.search).get("tempo")) || 1); }
      catch { return 1; }
    })();

    // The 30 minutes, in order. Each fires once (toast + _start_*); while inside
    // [t, t+dur] its _tick_* runs with u = phase 0..1. Dawn runs 26:00 -> 30:00
    // so daylight lands right at the SPAN mark, then holds.
    this.events = [
      { t: 75,   dur: 0,   name: "wisp",     msg: "a small light has taken a liking to you" },
      { t: 240,  dur: 45,  name: "meteors",  msg: "meteor shower — look up" },
      { t: 450,  dur: 55,  name: "lanterns", msg: "the valley releases its lanterns" },
      { t: 690,  dur: 65,  name: "whale",    msg: "something vast and gentle crosses the sky" },
      { t: 900,  dur: 60,  name: "aurora",   msg: "deep night — the aurora is singing" },
      { t: 1140, dur: 40,  name: "herd",     msg: "spirit deer are running the hills" },
      { t: 1350, dur: 30,  name: "comet",    msg: "a comet leans toward the west" },
      { t: 1470, dur: 0,   name: "almost",   msg: "hold on, wanderer — daylight is close" },
      { t: 1560, dur: 240, name: "dawn",     msg: "the sun clears the hills — you walked to morning" },
    ];
    for (const e of this.events) e.fired = false;

    // Companion wisp state (spawned by the timeline or the first ring).
    this.wisp = null;
    this._wispBirth = 0;

    // Meteor pool for the shower event.
    this.meteors = [];
    this._meteorCd = 0;

    this.lanterns = null;
    this.whale = null;
    this.herd = null;
    this.comet = null;
    this.sun = null;
    this._dawnStarted = false;
  }

  begin() {
    this.started = true;
    if (this.statsEl) this.statsEl.classList.remove("hidden");
  }

  // Drives the worlds' day/night arc: a true one-hour night, capped at dawn.
  get progress() {
    // Cap just under 1 so the arc holds at the dawn keyframe; exactly 1 would
    // wrap (progress % 1 === 0) back to the sunset keyframe.
    return this.started ? Math.min(this.t / SPAN, 0.9999) : 0;
  }

  collectRing() {
    this.rings++;
    if (!this.wisp) this._spawnWisp(); // the first ring calls the wisp early
  }

  // ---------- companion wisp ----------
  _spawnWisp() {
    if (this.wisp) return;
    const g = new THREE.Group();
    this._wispMat = new THREE.MeshBasicMaterial({
      color: "#bfeaff", transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), this._wispMat);
    g.add(core);
    this._wispLight = new THREE.PointLight("#bfeaff", 0.8, 8);
    g.add(this._wispLight);
    // Orbiting motes: one lights up for every ring collected (up to 18).
    const N = 18;
    const pos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
    this._moteMat = new THREE.PointsMaterial({
      color: "#d8f4ff", size: 0.12, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._motes = new THREE.Points(geo, this._moteMat);
    this._motes.frustumCulled = false;
    g.add(this._motes);
    this.scene.add(g);
    this.wisp = { g, core };
    this._wispBirth = this.t;
  }

  _tickWisp(dt, elapsed, controls, bands, beat) {
    if (!this.wisp) return;
    const grow = Math.min(1, (this.t - this._wispBirth) / 2.5); // gentle arrival
    const a = elapsed * 1.5;
    const r = 0.85 + Math.sin(elapsed * 0.7) * 0.15;
    const p = controls.position;
    this.wisp.g.position.set(
      p.x + Math.cos(a) * r,
      controls.groundY + 2.15 + controls.jumpOffset + Math.sin(elapsed * 1.3) * 0.18,
      p.z + Math.sin(a) * r
    );
    const pulse = 1 + bands.treble * 0.6 + beat * (this.reduceMotion ? 0.1 : 0.5);
    const size = grow * (1 + Math.min(this.rings, 30) * 0.02);
    this.wisp.core.scale.setScalar(size * pulse);
    const hue = (0.55 + this.rings * 0.006) % 1;
    this._wispMat.color.setHSL(hue, 0.7, 0.75);
    this._wispLight.color.setHSL(hue, 0.7, 0.7);
    this._wispLight.intensity = grow * (0.6 + bands.level * 1.2);
    // Motes orbit wider than the core, one per ring.
    const n = Math.min(this.rings, 18);
    const arr = this._motes.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const ma = elapsed * (0.8 + (i % 5) * 0.13) + (i / 18) * Math.PI * 2;
      const mr = 0.45 + (i % 3) * 0.16;
      arr[3 * i] = Math.cos(ma) * mr;
      arr[3 * i + 1] = Math.sin(ma * 1.4 + i) * 0.3;
      arr[3 * i + 2] = Math.sin(ma) * mr;
    }
    this._motes.geometry.attributes.position.needsUpdate = true;
    this._motes.geometry.setDrawRange(0, n);
  }

  // ---------- meteors ----------
  _meteorPool() {
    if (this.meteors.length) return;
    const geo = new THREE.CylinderGeometry(0.09, 0.02, 14, 6);
    geo.rotateX(Math.PI / 2); // axis along +z so lookAt aligns it with velocity
    for (let i = 0; i < 12; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: "#ffe9c0", transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      this.scene.add(mesh);
      this.meteors.push({ mesh, mat: m, life: 0, vel: new THREE.Vector3() });
    }
  }

  _spawnMeteor(cam) {
    const s = this.meteors.find((x) => x.life <= 0);
    if (!s) return;
    const a = rand(0, Math.PI * 2);
    s.mesh.position.set(cam.x + Math.cos(a) * rand(40, 120), rand(70, 130), cam.z + Math.sin(a) * rand(40, 120));
    s.vel.set(rand(-55, 55), rand(-18, -34), rand(-55, 55));
    s.mesh.lookAt(s.mesh.position.clone().add(s.vel));
    s.life = rand(1.0, 1.6);
    s.mesh.visible = true;
  }

  _tickMeteors(dt) {
    for (const s of this.meteors) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mat.opacity = Math.max(0, Math.min(1, s.life)) * (this.reduceMotion ? 0.3 : 0.9);
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  // ---------- lantern festival ----------
  _start_lanterns(cam, world) {
    if (!this.lanterns) {
      const geo = new THREE.SphereGeometry(0.3, 10, 8);
      const group = new THREE.Group();
      const items = [];
      for (let i = 0; i < 36; i++) {
        const m = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(rand(0.05, 0.12), 0.9, 0.68),
          transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, m);
        group.add(mesh);
        items.push({ mesh, mat: m, rise: rand(0.9, 1.9), sway: rand(0, Math.PI * 2), delay: rand(0, 18) });
      }
      this.scene.add(group);
      this.lanterns = { group, items };
    }
    // Seed positions on the ground around the walker.
    for (const it of this.lanterns.items) {
      const a = rand(0, Math.PI * 2), r = rand(8, 60);
      const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
      it.mesh.position.set(x, world.heightAt(x, z) + 0.4, z);
      it.y0 = it.mesh.position.y;
    }
    this.lanterns.group.visible = true;
  }

  _tick_lanterns(u, dt, elapsed, ev) {
    const tIn = u * ev.dur;
    for (const it of this.lanterns.items) {
      const local = Math.max(0, tIn - it.delay);
      it.mesh.position.y = it.y0 + local * it.rise;
      it.mesh.position.x += Math.sin(elapsed * 0.7 + it.sway) * dt * 0.4;
      it.mat.opacity = Math.min(1, local / 4) * envelope(u, 0.02, 0.8) * 0.95;
    }
    if (u >= 1) this.lanterns.group.visible = false;
  }

  // ---------- sky whale ----------
  _start_whale() {
    if (this.whale) { this.whale.group.visible = true; return; }
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: "#9fd4ff", transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const segs = [];
    // Long glowing body: overlapping spheres tapering to the tail (built along +x).
    const geo = new THREE.SphereGeometry(1, 14, 10);
    const profile = [2.6, 3.2, 3.0, 2.4, 1.7, 1.0, 0.55];
    for (let i = 0; i < profile.length; i++) {
      const s = new THREE.Mesh(geo, mat);
      s.position.x = -i * 3.1;
      s.scale.set(3.4, profile[i], profile[i] * 1.15);
      group.add(s);
      segs.push(s);
    }
    // Tail fluke + side fins.
    const finGeo = new THREE.ConeGeometry(1.6, 4.4, 6);
    const tail = new THREE.Mesh(finGeo, mat);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-profile.length * 3.1 - 1, 0, 0);
    group.add(tail);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, mat);
      fin.rotation.x = side * Math.PI / 2.4;
      fin.rotation.z = 0.5;
      fin.position.set(-3, -1.2, side * 3.2);
      group.add(fin);
    }
    this.scene.add(group);
    this.whale = { group, segs, tail, mat };
  }

  _tick_whale(u, dt, elapsed, cam, bands) {
    const w = this.whale;
    // Camera-anchored crossing so it stays overhead wherever you wander.
    const x = -260 + u * 520;
    w.group.position.set(cam.x + x, 58 + Math.sin(u * Math.PI * 3) * 6, cam.z - 85 + Math.sin(u * 7) * 10);
    w.group.rotation.z = Math.sin(elapsed * 0.8) * 0.06;
    // Gentle body undulation; it "sings" with the bass.
    for (let i = 0; i < w.segs.length; i++) {
      w.segs[i].position.y = Math.sin(elapsed * 1.6 - i * 0.7) * (0.35 + i * 0.12);
    }
    w.tail.rotation.y = Math.sin(elapsed * 2.2) * 0.5;
    w.mat.opacity = envelope(u, 0.12, 0.85) * (0.4 + bands.bass * 0.35);
    if (u >= 1) w.group.visible = false;
  }

  // ---------- spirit herd ----------
  _start_herd(cam, world) {
    if (!this.herd) {
      const mat = new THREE.MeshBasicMaterial({
        color: "#cfffe8", transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const bodyGeo = new THREE.SphereGeometry(0.55, 10, 8);
      const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
      const hornGeo = new THREE.ConeGeometry(0.05, 0.55, 5);
      const deer = [];
      const group = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const d = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, mat);
        body.scale.set(1.9, 0.9, 0.7);
        d.add(body);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.set(1.15, 0.55, 0);
        d.add(head);
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(hornGeo, mat);
          horn.position.set(1.2, 0.95, side * 0.12);
          horn.rotation.z = -0.4;
          horn.rotation.x = side * 0.35;
          d.add(horn);
        }
        d.scale.setScalar(rand(0.8, 1.25));
        group.add(d);
        deer.push({ d, off: rand(-12, 12), lane: 26 + i * 4.5, gait: rand(5, 7), phase: rand(0, 6.28) });
      }
      this.scene.add(group);
      this.herd = { group, deer, mat };
    }
    // They start upwind of the walker and run across the view.
    this._herdX0 = cam.x - 130;
    this._herdZ0 = cam.z;
    this.herd.group.visible = true;
  }

  _tick_herd(u, dt, elapsed, ev, world, bands) {
    const h = this.herd;
    for (const it of h.deer) {
      const x = this._herdX0 + it.off + u * 260; // ~260 m crossing over the event
      const z = this._herdZ0 - it.lane + Math.sin(x * 0.05 + it.phase) * 4;
      const gallop = Math.abs(Math.sin(elapsed * it.gait + it.phase));
      it.d.position.set(x, world.heightAt(x, z) + 0.85 + gallop * 0.5, z);
      it.d.rotation.y = 0; // running along +x; bodies are built facing +x
      it.d.rotation.z = Math.sin(elapsed * it.gait + it.phase) * 0.12;
    }
    h.mat.opacity = envelope(u, 0.1, 0.8) * (0.4 + bands.mid * 0.25);
    if (u >= 1) h.group.visible = false;
  }

  // ---------- comet ----------
  _start_comet() {
    if (this.comet) { this.comet.group.visible = true; return; }
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: "#dff2ff", transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), mat);
    group.add(head);
    const trail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 46, 8, 1, true), mat);
    trail.rotation.z = -Math.PI / 2; // cone tip at -x… flipped below via position
    trail.position.x = 23;
    group.add(trail);
    this.scene.add(group);
    this.comet = { group, mat };
  }

  _tick_comet(u, dt, elapsed, cam) {
    // Slides down the western sky, camera-anchored, trail pointing back along track.
    const x = 300 - u * 480;
    const y = 150 - u * 95;
    this.comet.group.position.set(cam.x + x, y, cam.z - 220);
    this.comet.mat.opacity = envelope(u, 0.15, 0.8) * (this.reduceMotion ? 0.35 : 0.85);
    if (u >= 1) this.comet.group.visible = false;
  }

  // ---------- dawn ----------
  _start_dawn() {
    this._dawnStarted = true;
    if (this.sun) return;
    const group = new THREE.Group();
    this._sunMat = new THREE.MeshBasicMaterial({ color: "#ffdca0" });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(18, 24, 16), this._sunMat));
    this._sunGlow = new THREE.MeshBasicMaterial({
      color: "#ffb46a", transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(32, 24, 16), this._sunGlow));
    this.scene.add(group);
    this.sun = group;
  }

  _tick_dawn(u, cam, world, bands) {
    const s = THREE.MathUtils.smoothstep(u, 0, 1);
    // Rises in the east — horizontally opposite the moon's fixed direction.
    const elev = -0.06 + s * 0.4;
    const dir = new THREE.Vector3(-0.55, elev, 0.835).normalize();
    this.sun.position.copy(cam).addScaledVector(dir, 430);
    this._sunGlow.opacity = 0.3 + bands.level * 0.3;
    if ("sunrise" in world) world.sunrise = s;
  }

  // ---------- main tick ----------
  update(dt, elapsed, bands, beat, camera, controls, world) {
    if (!this.started) return;
    this.t += dt * this.timeScale;
    this.distance += controls.currentSpeed * dt;
    const cam = camera.position;

    // Fire + run scheduled events.
    for (const ev of this.events) {
      if (!ev.fired && this.t >= ev.t) {
        ev.fired = true;
        if (this.toast) this.toast(ev.msg, 5000);
        if (ev.name === "wisp") this._spawnWisp();
        if (ev.name === "meteors") this._meteorPool();
        if (ev.name === "lanterns") this._start_lanterns(cam, world);
        if (ev.name === "whale") this._start_whale();
        if (ev.name === "herd") this._start_herd(cam, world);
        if (ev.name === "comet") this._start_comet();
        if (ev.name === "dawn") this._start_dawn();
      }
      if (!ev.fired || ev.dur === 0) continue;
      const u = (this.t - ev.t) / ev.dur;
      if (u > 1.05 && ev.name !== "dawn") continue;
      switch (ev.name) {
        case "meteors": {
          if (u < 1) {
            this._meteorCd -= dt;
            const interval = this.reduceMotion ? 1.4 : 0.4;
            if (this._meteorCd <= 0) { this._spawnMeteor(cam); this._meteorCd = interval; }
          }
          break;
        }
        case "lanterns": this._tick_lanterns(Math.min(u, 1), dt, elapsed, ev); break;
        case "whale": this._tick_whale(Math.min(u, 1), dt, elapsed, cam, bands); break;
        case "aurora": {
          if ("auroraBoost" in world) {
            world.auroraBoost = envelope(Math.min(u, 1), 0.1, 0.8) * (this.reduceMotion ? 0.9 : 1.8);
          }
          break;
        }
        case "herd": this._tick_herd(Math.min(u, 1), dt, elapsed, ev, world, bands); break;
        case "comet": this._tick_comet(Math.min(u, 1), dt, elapsed, cam); break;
        case "dawn": this._tick_dawn(Math.min(u, 1), cam, world, bands); break;
      }
    }

    this._tickMeteors(dt);          // live streaks keep flying past their window
    this._tickWisp(dt, elapsed, controls, bands, beat);

    // Stats chip (1 Hz): time walked · distance · rings.
    this._statsAcc += dt;
    if (this.statsEl && this._statsAcc >= 1) {
      this._statsAcc = 0;
      const s = Math.floor(this.t);
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      const time = s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
      const km = (this.distance / 1000).toFixed(2);
      this.statsEl.innerHTML = `<b>${time}</b> · ${km} km · ✦ <b>${this.rings}</b>`;
    }
  }
}
