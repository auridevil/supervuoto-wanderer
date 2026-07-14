import * as THREE from "three";

// Fleeting encounters — chance moments that appear, play out, and vanish. No
// profit, nothing to catch. One at a time, on a gentle random cadence.
//   fox    — trots ahead in your direction of travel, waits, then curls & fades
//   ghost  — a translucent pilgrim walks the path, nods as they pass
//   slip   — a prayer slip flutters on the ground; read it, it lifts away
//   kite   — a lone kite drifts across the far sky, no one holding the string

const rand = (a, b) => a + Math.random() * (b - a);

const SLIP_NOTES = [
  "“I left the door open for you.”",
  "“walk slower — you'll arrive sooner.”",
  "“the mountain remembers your name.”",
  "“thank you for the light you didn't know you gave.”",
  "“everything you're looking for is looking back.”",
  "“rest here. the road will wait.”",
  "“the stars are closer than they seem.”",
  "“you are exactly as lost as you should be.”",
];

export class Encounters {
  // ctx: { surfaceHeight, pathZ, onToast }
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this._disp = [];
    this.objects = [];
    this.built = {};
    this.active = null;
    this.t = 0;
    this.next = rand(35, 60);            // first encounter after a little wandering
    this.kinds = ["fox", "ghost", "slip", "kite"];
  }

  _track(geo, matOrArr) {
    if (geo) this._disp.push(geo);
    if (Array.isArray(matOrArr)) this._disp.push(...matOrArr);
    else if (matOrArr) this._disp.push(matOrArr);
  }

  _ensure(kind) {
    if (!this.built[kind]) {
      const e = this["_build_" + kind]();
      e.group.visible = false;
      this.scene.add(e.group);
      this.objects.push(e.group);
      this.built[kind] = e;
    }
    return this.built[kind];
  }

  update(dt, elapsed, cam, heading, bands, beat) {
    if (this.active) {
      const e = this.active;
      e.phase += dt;
      const done = e.update(dt, elapsed, cam, heading, bands, beat);
      if (done) { e.group.visible = false; this.active = null; this.t = 0; this.next = rand(45, 110); }
      return;
    }
    this.t += dt;
    if (this.t >= this.next) {
      this.t = 0;
      const kind = this.kinds[Math.floor(Math.random() * this.kinds.length)];
      const e = this._ensure(kind);
      e.group.visible = true;
      e.phase = 0;
      e.spawn(cam, heading);
      this.active = e;
    }
  }

  // ---------- fox ----------
  _build_fox() {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: "#c9743a", roughness: 1, flatShading: true, transparent: true, opacity: 0 });
    const furL = new THREE.MeshStandardMaterial({ color: "#e8d8c0", roughness: 1, flatShading: true, transparent: true, opacity: 0 });
    this._track(null, [fur, furL]);
    const sph = new THREE.SphereGeometry(0.5, 10, 8); this._track(sph);
    const body = new THREE.Mesh(sph, fur); body.scale.set(1.6, 0.7, 0.7); body.position.set(0, 0.55, 0); g.add(body);
    const head = new THREE.Mesh(sph, fur); head.scale.set(0.7, 0.7, 0.7); head.position.set(0.95, 0.7, 0); g.add(head);
    const snoutGeo = new THREE.ConeGeometry(0.18, 0.5, 6); this._track(snoutGeo);
    const snout = new THREE.Mesh(snoutGeo, fur); snout.rotation.z = -Math.PI / 2; snout.position.set(1.4, 0.65, 0); g.add(snout);
    const earGeo = new THREE.ConeGeometry(0.14, 0.34, 5); this._track(earGeo);
    for (const sz of [-0.18, 0.18]) { const ear = new THREE.Mesh(earGeo, fur); ear.position.set(0.9, 1.05, sz); g.add(ear); }
    const tail = new THREE.Mesh(sph, fur); tail.scale.set(1.0, 0.4, 0.4); tail.position.set(-0.95, 0.7, 0); g.add(tail);
    const tailTip = new THREE.Mesh(sph, furL); tailTip.scale.set(0.4, 0.35, 0.35); tailTip.position.set(-1.4, 0.8, 0); g.add(tailTip);
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#ffe6a0", blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }); this._track(null, eyeMat);
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 5); this._track(eyeGeo);
    for (const sz of [-0.16, 0.16]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(1.15, 0.78, sz); g.add(e); }
    const pos = new THREE.Vector3(); let yaw = 0;
    const setOp = (op) => { fur.opacity = op; furL.opacity = op; eyeMat.opacity = op * 0.9; };
    return {
      group: g,
      spawn: (cam, h) => { pos.copy(cam).addScaledVector(h, 9); pos.y = this.ctx.surfaceHeight(pos.x, pos.z); g.position.copy(pos); },
      update: (dt, elapsed, cam, h) => {
        const life2 = this.active.phase; // seconds since this encounter spawned
        const target = cam.clone().addScaledVector(h, 7);
        const to = target.sub(pos); to.y = 0; const dist = to.length();
        let moving = 0;
        if (dist > 1.2) { to.normalize(); pos.addScaledVector(to, Math.min(dist, 4.5) * dt); yaw = Math.atan2(to.x, to.z); moving = 1; }
        pos.y = this.ctx.surfaceHeight(pos.x, pos.z);
        g.position.copy(pos);
        g.rotation.y = yaw - Math.PI / 2; // body built facing +x
        body.position.y = 0.55 + Math.abs(Math.sin(elapsed * 10)) * 0.06 * moving;
        tail.rotation.y = Math.sin(elapsed * 6) * 0.4;
        let op = life2 < 1.5 ? life2 / 1.5 : 1;
        if (life2 > 30) op = Math.max(0, 1 - (life2 - 30) / 4);
        g.scale.setScalar(life2 > 30 ? 0.7 + op * 0.3 : 1);
        setOp(op);
        return life2 > 34;
      },
    };
  }

  // ---------- ghost pilgrim ----------
  _build_ghost() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: "#bcd0e6", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this._track(null, mat);
    const cloakGeo = new THREE.ConeGeometry(0.6, 2.0, 8); this._track(cloakGeo);
    const cloak = new THREE.Mesh(cloakGeo, mat); cloak.position.y = 1.0; g.add(cloak);
    const headGeo = new THREE.SphereGeometry(0.28, 10, 8); this._track(headGeo);
    const head = new THREE.Mesh(headGeo, mat); head.position.y = 2.1; g.add(head);
    const hatGeo = new THREE.ConeGeometry(0.5, 0.4, 10); this._track(hatGeo);
    const hat = new THREE.Mesh(hatGeo, mat); hat.position.y = 2.35; g.add(hat);
    const staffGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5); this._track(staffGeo);
    const staff = new THREE.Mesh(staffGeo, mat); staff.position.set(0.5, 1.1, 0); g.add(staff);
    let x = 0, toasted = false;
    return {
      group: g,
      spawn: (cam) => { x = cam.x + 45; toasted = false; },
      update: (dt, elapsed, cam) => {
        x -= 1.6 * dt;
        const z = this.ctx.pathZ(x);
        g.position.set(x, this.ctx.surfaceHeight(x, z) + Math.abs(Math.sin(elapsed * 4)) * 0.06, z);
        g.rotation.y = -Math.PI / 2;
        const d = Math.abs(x - cam.x);
        if (d < 6) { head.rotation.x = Math.sin(elapsed * 3) * 0.15; if (!toasted) { toasted = true; this.ctx.onToast && this.ctx.onToast("a pilgrim passes, and nods", 3000); } }
        const fade = THREE.MathUtils.clamp(1 - d / 42, 0, 1) * (this.active.phase < 1.5 ? this.active.phase / 1.5 : 1);
        mat.opacity = fade * 0.7;
        return x < cam.x - 32 || this.active.phase > 60;
      },
    };
  }

  // ---------- prayer slip ----------
  _build_slip() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: "#e8e2d0", roughness: 1, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    this._track(null, mat);
    const paperGeo = new THREE.PlaneGeometry(0.4, 0.6); this._track(paperGeo);
    const paper = new THREE.Mesh(paperGeo, mat); g.add(paper);
    const pos = new THREE.Vector3(); let read = false, vy = 0, groundY = 0;
    return {
      group: g,
      spawn: (cam, h) => {
        read = false; vy = 0;
        pos.copy(cam).addScaledVector(h, 6); pos.x += rand(-2, 2); pos.z += rand(-2, 2);
        groundY = this.ctx.surfaceHeight(pos.x, pos.z) + 0.4; pos.y = groundY; g.position.copy(pos);
      },
      update: (dt, elapsed, cam) => {
        paper.rotation.set(Math.sin(elapsed * 2) * 0.3, elapsed * 1.2, Math.cos(elapsed * 1.7) * 0.3);
        const d = Math.hypot(cam.x - pos.x, cam.z - pos.z);
        if (!read && d < 3) { read = true; this.ctx.onToast && this.ctx.onToast(SLIP_NOTES[Math.floor(Math.random() * SLIP_NOTES.length)], 5000); }
        if (read) { vy += dt * 0.8; pos.y += vy * dt * 2; pos.x += Math.sin(elapsed) * dt * 0.5; g.position.copy(pos); }
        const fadeIn = this.active.phase < 1 ? this.active.phase : 1;
        const rise = read ? Math.max(0, 1 - (pos.y - groundY) / 6) : 1;
        mat.opacity = fadeIn * rise;
        return (read && rise <= 0.02) || this.active.phase > 45;
      },
    };
  }

  // ---------- kite ----------
  _build_kite() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: "#e86a5a", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this._track(null, mat);
    const kiteGeo = new THREE.PlaneGeometry(2, 2.6); this._track(kiteGeo);
    const kite = new THREE.Mesh(kiteGeo, mat); g.add(kite);
    const tailMat = new THREE.PointsMaterial({ color: "#ffd27a", size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); this._track(null, tailMat);
    const TN = 8, tp = new Float32Array(TN * 3);
    for (let i = 0; i < TN; i++) { tp[3 * i] = 0; tp[3 * i + 1] = -2 - i * 0.6; tp[3 * i + 2] = 0; }
    const tgeo = new THREE.BufferGeometry(); tgeo.setAttribute("position", new THREE.BufferAttribute(tp, 3)); this._track(tgeo);
    g.add(new THREE.Points(tgeo, tailMat));
    let cx = 0, cz = 0, dir = 1;
    return {
      group: g,
      spawn: (cam) => { dir = Math.random() < 0.5 ? 1 : -1; cx = cam.x + rand(-30, 30); cz = cam.z - 90; },
      update: (dt, elapsed, cam) => {
        const life = this.active.phase;
        const x = cx + dir * life * 4, y = 48 + Math.sin(elapsed * 0.8) * 4;
        g.position.set(x, y, cz);
        g.rotation.y = Math.atan2(cam.x - x, cam.z - cz);
        kite.rotation.z = Math.PI / 4 + Math.sin(elapsed * 1.2) * 0.2;
        const op = (life < 2 ? life / 2 : 1) * (life > 26 ? Math.max(0, 1 - (life - 26) / 4) : 1);
        mat.opacity = op * 0.9; tailMat.opacity = op * 0.7;
        return life > 30;
      },
    };
  }

  dispose(scene) {
    for (const o of this.objects) scene.remove(o);
    for (const d of this._disp) { try { d.dispose(); } catch {} }
    this._disp = []; this.objects = []; this.built = {}; this.active = null;
  }
}
