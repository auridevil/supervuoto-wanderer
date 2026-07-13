import * as THREE from "three";

// Wonders — hidden gems scattered through the endless world. Curiosity is
// rewarded with a moment (a sound, a light, falling leaves), never a prize.
//
// Placement is *seeded*: each wonder type lives on its own sparse jittered grid,
// so a gem has a fixed home in the infinite world (revisit a place, find the same
// one). Only the nearest instance of each type is kept live and repositioned as
// you travel — three persistent groups, no streaming churn.

const rand = (a, b) => a + Math.random() * (b - a);

// Deterministic 0..1 hash of integer grid coords (+ salt per type / per field).
function hash2(ix, iz, salt = 0) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export class Wonders {
  // ctx: { surfaceHeight, heightAt, desertMask, snowMask, pathZ, WATER_LEVEL, onWonder }
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.reduceMotion = false;
    this.witnessed = new Set();  // keys: "kind:ix,iz" — first-encounter memory (session)
    this.prompt = null;          // interact prompt text when in range (or null)
    this.hint = null;            // truthy when the occasional curiosity chip should show
    this._pendingInteract = false;
    this._hintCycle = 0;
    this._disp = [];

    this.types = [
      {
        kind: "monastery", spacing: 380, density: 0.30, salt: 11, interact: true,
        nearR: 14, farR: 150, build: () => this._buildMonastery(),
        biomeOK: (x, z) => ctx.snowMask(x, z) < 0.75 && ctx.desertMask(x, z) < 0.5,
        msg: "the bell of the mountain monastery answers you",
      },
      {
        kind: "tree", spacing: 300, density: 0.5, salt: 23, interact: false,
        nearR: 6.5, farR: 120, build: () => this._buildTree(),
        biomeOK: (x, z) => ctx.desertMask(x, z) < 0.35 && ctx.snowMask(x, z) < 0.35,
        msg: "you rest a while beneath the great tree",
      },
      {
        kind: "waterfall", spacing: 340, density: 0.32, salt: 37, interact: false,
        nearR: 9, farR: 140, build: () => this._buildWaterfall(),
        biomeOK: (x, z) => ctx.desertMask(x, z) < 0.4,
        msg: "you stand in the drifting mist of the falls",
      },
    ];

    this.objects = [];
    for (const t of this.types) {
      const inst = t.build();
      inst.type = t; inst.cell = null; inst.near = 0; inst.payoff = 0; inst.witnessed = false;
      inst.group.visible = false;
      scene.add(inst.group);
      this.objects.push(inst.group);
      t.inst = inst;
    }
  }

  _track(geo, matOrArr) {
    if (geo) this._disp.push(geo);
    if (Array.isArray(matOrArr)) this._disp.push(...matOrArr);
    else if (matOrArr) this._disp.push(matOrArr);
  }

  // ---------- builders ----------
  _buildMonastery() {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#b7b0a0", roughness: 1, flatShading: true });
    const roofM = new THREE.MeshStandardMaterial({ color: "#3f5a4a", roughness: 0.9, flatShading: true });
    const woodM = new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 1, flatShading: true });
    const bronze = new THREE.MeshStandardMaterial({ color: "#8a6a3a", roughness: 0.5, metalness: 0.6, flatShading: true });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this._track(box, [stone, roofM, woodM, bronze]);
    const mk = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); return m; };
    mk(7, 0.6, 5.5, stone, 0, 0.3, 0);          // platform
    mk(4.4, 2.6, 3.6, stone, -0.6, 1.6, 0);     // hall
    const roofGeo = new THREE.ConeGeometry(3.4, 1.8, 4); this._track(roofGeo);
    const roof = new THREE.Mesh(roofGeo, roofM); roof.rotation.y = Math.PI / 4; roof.position.set(-0.6, 3.8, 0); g.add(roof);
    // warm lit windows
    const winGeo = new THREE.PlaneGeometry(0.5, 0.7); this._track(winGeo);
    const winMat = new THREE.MeshBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this._track(null, winMat);
    for (const wx of [-1.6, -0.6, 0.4]) { const w = new THREE.Mesh(winGeo, winMat); w.position.set(wx, 1.6, 1.81); g.add(w); }
    // bell arch + swinging bell
    mk(0.3, 3, 0.3, woodM, 2.3, 1.5, -1); mk(0.3, 3, 0.3, woodM, 2.3, 1.5, 1); mk(3, 0.3, 0.3, woodM, 2.3, 3.1, 0);
    const bellGeo = new THREE.CylinderGeometry(0.35, 0.5, 0.9, 10); this._track(bellGeo);
    const bell = new THREE.Mesh(bellGeo, bronze); bell.position.set(0, -0.55, 0);
    const pivot = new THREE.Group(); pivot.position.set(2.3, 2.95, 0); pivot.add(bell); g.add(pivot);

    const apply = (o) => {
      winMat.opacity = Math.min(0.85, (0.2 + o.night * 0.4) * (0.35 + o.near * 0.65)) * (0.85 + o.bands.mid * 0.25);
      pivot.rotation.z = Math.sin(o.elapsed * 6.0) * o.payoff * 0.5; // rings on payoff
    };
    return { group: g, apply };
  }

  _buildTree() {
    const g = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: "#5c4326", roughness: 1, flatShading: true });
    const leafM = new THREE.MeshStandardMaterial({ color: "#2f5236", roughness: 1, flatShading: true });
    this._track(null, [bark, leafM]);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 1.1, 7, 7); this._track(trunkGeo);
    const trunk = new THREE.Mesh(trunkGeo, bark); trunk.position.y = 3.5; g.add(trunk);
    const brGeo = new THREE.CylinderGeometry(0.16, 0.3, 3, 6); this._track(brGeo);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const b = new THREE.Mesh(brGeo, bark); b.position.set(Math.cos(a) * 0.8, 5 + Math.random(), Math.sin(a) * 0.8); b.rotation.z = Math.cos(a) * 0.7; b.rotation.x = Math.sin(a) * 0.7; g.add(b); }
    const canGeo = new THREE.IcosahedronGeometry(2.2, 0); this._track(canGeo);
    for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(canGeo, leafM); c.position.set(rand(-2.4, 2.4), 6.6 + rand(-0.6, 1.4), rand(-2.4, 2.4)); c.scale.setScalar(rand(0.8, 1.4)); g.add(c); }
    // canopy fireflies
    const N = 40, fp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { fp[3 * i] = rand(-3, 3); fp[3 * i + 1] = 6.5 + rand(-1.5, 2.5); fp[3 * i + 2] = rand(-3, 3); }
    const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute("position", new THREE.BufferAttribute(fp, 3)); this._track(fgeo);
    const fmat = new THREE.PointsMaterial({ color: "#ffe6a0", size: 0.14, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }); this._track(null, fmat);
    g.add(new THREE.Points(fgeo, fmat));
    // leaf shower (hidden until you shelter)
    const LN = 60, lp = new Float32Array(LN * 3), lv = new Float32Array(LN);
    for (let i = 0; i < LN; i++) { lp[3 * i] = rand(-3, 3); lp[3 * i + 1] = rand(2, 7); lp[3 * i + 2] = rand(-3, 3); lv[i] = rand(0.4, 1.0); }
    const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute("position", new THREE.BufferAttribute(lp, 3)); this._track(lgeo);
    const lmat = new THREE.PointsMaterial({ color: "#8ba85a", size: 0.12, transparent: true, opacity: 0, depthWrite: false }); this._track(null, lmat);
    const leaves = new THREE.Points(lgeo, lmat); g.add(leaves);

    const apply = (o) => {
      fmat.opacity = (0.2 + o.night * 0.35) * (0.5 + o.near * 0.5) + o.bands.treble * 0.15;
      fmat.size = 0.12 + (o.bands.air || 0) * 0.1;
      lmat.opacity = o.payoff * 0.8;
      if (o.payoff > 0.01) {
        for (let i = 0; i < lp.length; i += 3) {
          lp[i + 1] -= lv[i / 3] * o.dt * 1.2; lp[i] += Math.sin(o.elapsed + i) * o.dt * 0.3;
          if (lp[i + 1] < 0.5) lp[i + 1] = 7;
        }
        lgeo.attributes.position.needsUpdate = true;
      }
    };
    return { group: g, apply };
  }

  _buildWaterfall() {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: "#5a5e66", roughness: 1, flatShading: true });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this._track(box, rock);
    const mk = (w, h, d, x, y, z) => { const m = new THREE.Mesh(box, rock); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); };
    mk(8, 12, 4, 0, 6, -2); mk(2, 10, 3, -3, 5, -0.5); mk(2, 10, 3, 3, 5, -0.5);
    // scrolling water sheet
    const wgeo = new THREE.PlaneGeometry(3.2, 11, 1, 1); this._track(wgeo);
    const wmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, opacity: { value: 0.5 }, col: { value: new THREE.Color("#bfe6ff") } },
      vertexShader: `varying vec2 vu; void main(){ vu = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time, opacity; uniform vec3 col; varying vec2 vu;
        void main(){
          float s = fract(vu.y * 4.0 - time * 1.6);
          float streak = smoothstep(0.0, 0.5, s) * smoothstep(1.0, 0.5, s);
          float edge = smoothstep(0.0, 0.15, vu.x) * smoothstep(1.0, 0.85, vu.x);
          gl_FragColor = vec4(col * (0.7 + streak * 0.5), (0.35 + streak * 0.65) * edge * opacity);
        }`,
    });
    this._track(null, wmat);
    const sheet = new THREE.Mesh(wgeo, wmat); sheet.position.set(0, 5.6, 0.1); g.add(sheet);
    // glowing pool
    const poolGeo = new THREE.CircleGeometry(3.2, 28); poolGeo.rotateX(-Math.PI / 2); this._track(poolGeo);
    const poolMat = new THREE.MeshBasicMaterial({ color: "#2f6b7e", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this._track(null, poolMat);
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(0, 0.06, 1.6); g.add(pool);
    // spray at the base
    const SN = 50, sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { sp[3 * i] = rand(-1.6, 1.6); sp[3 * i + 1] = rand(0, 2); sp[3 * i + 2] = rand(0, 2); }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute("position", new THREE.BufferAttribute(sp, 3)); this._track(sgeo);
    const smat = new THREE.PointsMaterial({ color: "#dff2ff", size: 0.16, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }); this._track(null, smat);
    g.add(new THREE.Points(sgeo, smat));

    const apply = (o) => {
      wmat.uniforms.time.value = o.elapsed;
      wmat.uniforms.opacity.value = 0.4 + o.near * 0.35;
      poolMat.opacity = (0.3 + o.near * 0.3) + o.bands.level * 0.12;
      smat.opacity = 0.3 + o.near * 0.4;
      for (let i = 0; i < sp.length; i += 3) { sp[i + 1] += (0.6 + o.bands.level) * o.dt; if (sp[i + 1] > 2.4) sp[i + 1] = 0; }
      sgeo.attributes.position.needsUpdate = true;
    };
    return { group: g, apply };
  }

  // ---------- placement ----------
  // Nearest existing, biome-valid, off-path home for a type within the 3x3 grid
  // neighbourhood around the walker (or null if none nearby).
  _placeNearest(t, cam) {
    const S = t.spacing, cx = Math.round(cam.x / S), cz = Math.round(cam.z / S);
    let best = null, bestD = Infinity;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const ix = cx + di, iz = cz + dj;
      if (hash2(ix, iz, t.salt) > t.density) continue; // this node is empty
      const jx = (hash2(ix, iz, t.salt + 1) - 0.5) * S * 0.6;
      const jz = (hash2(ix, iz, t.salt + 2) - 0.5) * S * 0.6;
      const wx = ix * S + jx, wz = iz * S + jz;
      if (!t.biomeOK(wx, wz)) continue;
      if (Math.abs(wz - this.ctx.pathZ(wx)) < 10) continue; // keep off the trail
      const h = this.ctx.surfaceHeight(wx, wz);
      if (h < this.ctx.WATER_LEVEL + 0.5) continue;
      const d = Math.hypot(cam.x - wx, cam.z - wz);
      if (d < bestD) { bestD = d; best = { wx, wz, h, cell: ix + "," + iz, dist: d }; }
    }
    return best;
  }

  update(dt, elapsed, bands, beat, cam, night, fm) {
    const decay = Math.pow(0.2, dt);
    this.prompt = null;
    let hintD = Infinity, hasHint = false;

    for (const t of this.types) {
      const inst = t.inst;
      const home = this._placeNearest(t, cam);
      if (!home) { inst.group.visible = false; continue; }
      if (home.cell !== inst.cell) { inst.cell = home.cell; inst.witnessed = this.witnessed.has(t.kind + ":" + home.cell); }
      inst.group.visible = true;
      inst.group.position.set(home.wx, home.h, home.wz);

      const dist = home.dist;
      const nearRaw = THREE.MathUtils.clamp((t.farR - dist) / (t.farR - t.nearR), 0, 1);
      inst.near += (nearRaw - inst.near) * Math.min(1, dt * 3);
      inst.payoff *= decay;

      const within = dist < t.nearR;
      const key = t.kind + ":" + home.cell;
      if (!t.interact) {
        // Auto wonders: kindle + count the first time you reach them.
        if (within && !inst.witnessed) { inst.witnessed = true; this.witnessed.add(key); inst.payoff = 1; this.ctx.onWonder && this.ctx.onWonder(t.kind, t.msg); }
      } else if (within) {
        // Interactable: show the prompt; the key/tap rings the bell.
        this.prompt = "ring the bell";
        if (this._pendingInteract) {
          inst.payoff = 1;
          if (!inst.witnessed) { inst.witnessed = true; this.witnessed.add(key); this.ctx.onWonder && this.ctx.onWonder(t.kind, t.msg); }
        }
      }

      if (dist > 45 && dist < t.farR + 80 && dist < hintD) { hintD = dist; hasHint = true; }
      inst.apply({ dt, elapsed, bands, beat, near: inst.near, night, fm, payoff: inst.payoff });
    }
    this._pendingInteract = false;

    // Occasional curiosity chip: visible ~8 s of every ~26 s while a gem is near.
    this._hintCycle += dt;
    this.hint = hasHint && (this._hintCycle % 26) < 8;
  }

  interact() { this._pendingInteract = true; }

  dispose(scene) {
    for (const t of this.types) scene.remove(t.inst.group);
    for (const d of this._disp) { try { d.dispose(); } catch {} }
    this._disp = [];
  }
}
