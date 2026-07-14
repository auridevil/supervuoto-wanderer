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
    this.hint = null;            // truthy when the occasional curiosity chip should show
    this._hintCycle = 0;
    this._disp = [];

    const anyBiome = (x, z) => ctx.snowMask(x, z) < 0.8 && ctx.desertMask(x, z) < 0.8;
    const grassy = (x, z) => ctx.desertMask(x, z) < 0.35 && ctx.snowMask(x, z) < 0.35;
    this.types = [
      { kind: "monastery", spacing: 380, density: 0.30, salt: 11, interact: true, prompt: "ring the bell", nearR: 14, farR: 150, build: () => this._buildMonastery(),
        biomeOK: (x, z) => ctx.snowMask(x, z) < 0.75 && ctx.desertMask(x, z) < 0.5, msg: "the bell of the mountain monastery answers you" },
      { kind: "tree", spacing: 300, density: 0.5, salt: 23, interact: false, nearR: 6.5, farR: 120, build: () => this._buildTree(),
        biomeOK: grassy, msg: "you rest a while beneath the great tree" },
      { kind: "waterfall", spacing: 340, density: 0.32, salt: 37, interact: false, nearR: 9, farR: 140, build: () => this._buildWaterfall(),
        biomeOK: (x, z) => ctx.desertMask(x, z) < 0.4, msg: "you stand in the drifting mist of the falls" },
      { kind: "torii", spacing: 420, density: 0.28, salt: 51, interact: false, nearR: 9, farR: 150, build: () => this._buildTorii(),
        biomeOK: anyBiome, msg: "you pass beneath a hundred quiet gates" },
      { kind: "door", spacing: 460, density: 0.24, salt: 63, interact: true, prompt: "open the door", nearR: 12, farR: 140, build: () => this._buildDoor(),
        biomeOK: (x, z) => ctx.snowMask(x, z) < 0.7 && ctx.desertMask(x, z) < 0.7, msg: "the door opens onto nothing, and everything" },
      { kind: "well", spacing: 440, density: 0.26, salt: 77, interact: true, prompt: "drop a stone", nearR: 11, farR: 130, build: () => this._buildWell(),
        biomeOK: (x, z) => ctx.snowMask(x, z) < 0.7, msg: "the well answers with a distant splash" },
      { kind: "cairn", spacing: 340, density: 0.4, salt: 89, interact: true, prompt: "add a stone", nearR: 10, farR: 120, build: () => this._buildCairn(),
        biomeOK: (x, z) => ctx.desertMask(x, z) > 0.35 || ctx.snowMask(x, z) > 0.35, msg: "you rest a stone upon the cairn" },
      { kind: "lanternGrove", spacing: 400, density: 0.3, salt: 101, interact: false, nearR: 16, farR: 150, build: () => this._buildLanternGrove(),
        biomeOK: grassy, msg: "the lanterns kindle as you pass" },
      { kind: "fallenStar", spacing: 480, density: 0.22, salt: 113, interact: false, nearR: 12, farR: 150, build: () => this._buildFallenStar(),
        biomeOK: anyBiome, msg: "a fallen star cools in its crater" },
      { kind: "singing", spacing: 430, density: 0.26, salt: 127, interact: true, prompt: "touch the stone", nearR: 12, farR: 140, build: () => this._buildSingingStone(),
        biomeOK: anyBiome, msg: "the stone answers your touch with a low chord" },
      { kind: "shipwreck", spacing: 400, density: 0.3, salt: 139, interact: false, nearR: 14, farR: 150, build: () => this._buildShipwreck(),
        biomeOK: (x, z) => ctx.desertMask(x, z) > 0.45, msg: "a ship, stranded far from any sea" },
      { kind: "frozenLake", spacing: 380, density: 0.3, salt: 151, interact: false, nearR: 16, farR: 150, build: () => this._buildFrozenLake(),
        biomeOK: (x, z) => ctx.snowMask(x, z) > 0.45, msg: "the frozen lake holds something beneath" },
      { kind: "lighthouse", spacing: 500, density: 0.22, salt: 163, interact: false, nearR: 14, farR: 160, build: () => this._buildLighthouse(),
        biomeOK: (x, z) => ctx.snowMask(x, z) < 0.6 && ctx.desertMask(x, z) < 0.6, msg: "a lighthouse sweeps a sea that isn't there" },
      { kind: "moonPavilion", spacing: 420, density: 0.26, salt: 177, nearR: 12, farR: 150, build: () => this._buildMoonPavilion(),
        biomeOK: anyBiome, msg: "you step onto the moon-viewing platform" },
      { kind: "statueGarden", spacing: 400, density: 0.28, salt: 191, nearR: 14, farR: 150, build: () => this._buildStatueGarden(),
        biomeOK: grassy, msg: "the statues keep their long vigil with you" },
      { kind: "bridge", spacing: 460, density: 0.24, salt: 203, nearR: 13, farR: 150, build: () => this._buildBridge(),
        biomeOK: anyBiome, msg: "a bridge that ends in the mist" },
      { kind: "observatory", spacing: 480, density: 0.24, salt: 217, nearR: 13, farR: 150, build: () => this._buildObservatory(),
        biomeOK: anyBiome, msg: "the old telescope still finds the stars" },
      { kind: "hotSpring", spacing: 400, density: 0.3, salt: 229, nearR: 12, farR: 140, build: () => this._buildHotSpring(),
        biomeOK: (x, z) => ctx.snowMask(x, z) > 0.4, msg: "warmth rises from the hidden spring" },
      { kind: "giant", spacing: 520, density: 0.2, salt: 241, nearR: 18, farR: 170, build: () => this._buildSleepingGiant(),
        biomeOK: anyBiome, msg: "the sleeping giant breathes, slow as centuries" },
    ];

    this.objects = [];
    for (const t of this.types) {
      const inst = t.build();
      inst.type = t; inst.cell = null; inst.near = 0; inst.payoff = 0; inst.armed = true;
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

  _buildTorii() {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: "#c0432f", roughness: 0.8, flatShading: true });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this._track(box, red);
    const accents = [];
    for (let i = 0; i < 16; i++) {
      const z = -i * 3.0;
      const mk = (w, h, d, x, y) => { const m = new THREE.Mesh(box, red); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); };
      mk(0.3, 3.2, 0.3, -1.5, 1.6); mk(0.3, 3.2, 0.3, 1.5, 1.6);
      mk(4.0, 0.36, 0.4, 0, 3.25); mk(3.3, 0.26, 0.32, 0, 2.7);
      const am = new THREE.MeshBasicMaterial({ color: "#ffb27a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this._track(null, am);
      const a = new THREE.Mesh(box, am); a.scale.set(3.3, 0.12, 0.12); a.position.set(0, 2.95, z); g.add(a);
      accents.push(am);
    }
    const apply = (o) => {
      const t = o.elapsed * 2.2;
      for (let i = 0; i < accents.length; i++) accents[i].opacity = o.near * Math.max(0, Math.sin(t - i * 0.5)) * 0.7;
    };
    return { group: g, apply };
  }

  _buildDoor() {
    const g = new THREE.Group();
    const frameM = new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 1, flatShading: true });
    const doorM = new THREE.MeshStandardMaterial({ color: "#4a3524", roughness: 1, flatShading: true });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this._track(box, [frameM, doorM]);
    const mk = (m, w, h, d, x, y) => { const me = new THREE.Mesh(box, m); me.scale.set(w, h, d); me.position.set(x, y, 0); g.add(me); };
    mk(frameM, 0.3, 3.2, 0.4, -1.0, 1.6); mk(frameM, 0.3, 3.2, 0.4, 1.0, 1.6); mk(frameM, 2.3, 0.35, 0.4, 0, 3.3);
    const pivot = new THREE.Group(); pivot.position.set(-0.85, 0, 0); g.add(pivot);
    const door = new THREE.Mesh(box, doorM); door.scale.set(1.7, 3.0, 0.15); door.position.set(0.85, 1.55, 0); pivot.add(door);
    const N = 30, mp = new Float32Array(N * 3), mv = [];
    for (let i = 0; i < N; i++) { mp[3 * i] = rand(-0.6, 0.6); mp[3 * i + 1] = rand(0.5, 2.8); mp[3 * i + 2] = rand(-0.3, 0.3); mv.push([rand(-0.5, 0.5), rand(0.3, 1.0), rand(-0.5, 0.5)]); }
    const mgeo = new THREE.BufferGeometry(); mgeo.setAttribute("position", new THREE.BufferAttribute(mp, 3)); this._track(mgeo);
    const mmat = new THREE.PointsMaterial({ color: "#e8e0c8", size: 0.13, transparent: true, opacity: 0, depthWrite: false }); this._track(null, mmat);
    g.add(new THREE.Points(mgeo, mmat));
    const apply = (o) => {
      pivot.rotation.y = -o.payoff * 1.2;
      mmat.opacity = o.payoff * 0.9;
      if (o.payoff > 0.01) { for (let i = 0; i < mp.length; i += 3) { const v = mv[i / 3]; mp[i] += v[0] * o.dt; mp[i + 1] += v[1] * o.dt; mp[i + 2] += v[2] * o.dt; if (mp[i + 1] > 3.2) mp[i + 1] = 0.5; } mgeo.attributes.position.needsUpdate = true; }
    };
    return { group: g, apply };
  }

  _buildWell() {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#8a857a", roughness: 1, flatShading: true }); this._track(null, stone);
    const ringGeo = new THREE.CylinderGeometry(1.1, 1.2, 1.0, 16, 1, true); this._track(ringGeo);
    const ring = new THREE.Mesh(ringGeo, stone); ring.position.y = 0.5; g.add(ring);
    const discGeo = new THREE.CircleGeometry(1.0, 20); discGeo.rotateX(-Math.PI / 2); this._track(discGeo);
    const discMat = new THREE.MeshBasicMaterial({ color: "#0a1830", transparent: true, opacity: 0.9, depthWrite: false }); this._track(null, discMat);
    const disc = new THREE.Mesh(discGeo, discMat); disc.position.y = 0.35; g.add(disc);
    const N = 24, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 0.9; sp[3 * i] = Math.cos(a) * r; sp[3 * i + 1] = 0.36; sp[3 * i + 2] = Math.sin(a) * r; }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute("position", new THREE.BufferAttribute(sp, 3)); this._track(sgeo);
    const smat = new THREE.PointsMaterial({ color: "#bfe6ff", size: 0.06, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }); this._track(null, smat);
    g.add(new THREE.Points(sgeo, smat));
    const ripGeo = new THREE.RingGeometry(0.2, 0.35, 24); ripGeo.rotateX(-Math.PI / 2); this._track(ripGeo);
    const ripMat = new THREE.MeshBasicMaterial({ color: "#bfe6ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); this._track(null, ripMat);
    const rip = new THREE.Mesh(ripGeo, ripMat); rip.position.y = 0.37; g.add(rip);
    const apply = (o) => {
      smat.opacity = (0.3 + o.near * 0.4) * (0.6 + 0.4 * Math.sin(o.elapsed * 1.5));
      rip.scale.setScalar(1 + (1 - o.payoff) * 3.0); ripMat.opacity = o.payoff * 0.7;
    };
    return { group: g, apply };
  }

  _buildCairn() {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#9a938a", roughness: 1, flatShading: true }); this._track(null, stone);
    const geo = new THREE.IcosahedronGeometry(0.5, 0); this._track(geo);
    const stones = []; let y = 0.3;
    for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(geo, stone); const sc = 0.95 - i * 0.1; s.scale.set(sc, sc * 0.6, sc); s.position.set(rand(-0.08, 0.08), y, rand(-0.08, 0.08)); s.rotation.y = rand(0, 6.28); g.add(s); stones.push(s); y += sc * 0.42; }
    const top = stones[stones.length - 1], topY = top.position.y;
    const apply = (o) => { top.position.y = topY + o.payoff * 0.25; };
    return { group: g, apply };
  }

  _buildLanternGrove() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: "#5a4632", roughness: 1, flatShading: true }); this._track(null, wood);
    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6); this._track(postGeo);
    const orbGeo = new THREE.SphereGeometry(0.26, 10, 8); this._track(orbGeo);
    const orbs = [];
    for (let i = 0; i < 9; i++) {
      const a = rand(0, 6.28), r = rand(2, 9), px = Math.cos(a) * r, pz = Math.sin(a) * r;
      const post = new THREE.Mesh(postGeo, wood); post.position.set(px, 1.1, pz); g.add(post);
      const m = new THREE.MeshBasicMaterial({ color: "#ffcf8a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); this._track(null, m);
      const orb = new THREE.Mesh(orbGeo, m); orb.position.set(px, 2.3, pz); g.add(orb);
      orbs.push({ m, ph: rand(0, 6.28) });
    }
    const apply = (o) => { for (const it of orbs) it.m.opacity = o.near * (0.55 + 0.25 * Math.sin(o.elapsed * 1.5 + it.ph)) + o.bands.mid * 0.1 * o.near; };
    return { group: g, apply };
  }

  _buildFallenStar() {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: "#3a3a42", roughness: 1, flatShading: true }); this._track(null, rock);
    const craterGeo = new THREE.TorusGeometry(2.2, 0.7, 8, 20); craterGeo.rotateX(-Math.PI / 2); this._track(craterGeo);
    const crater = new THREE.Mesh(craterGeo, rock); crater.position.y = 0.2; g.add(crater);
    const coreGeo = new THREE.IcosahedronGeometry(0.7, 0); this._track(coreGeo);
    const coreMat = new THREE.MeshBasicMaterial({ color: "#ffdca0", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }); this._track(null, coreMat);
    const core = new THREE.Mesh(coreGeo, coreMat); core.position.y = 0.5; g.add(core);
    const light = new THREE.PointLight("#ffb46a", 0, 14); light.position.y = 0.7; g.add(light);
    const apply = (o) => {
      const hb = Math.pow(Math.max(0, Math.sin(o.elapsed * 1.1)), 6); // slow heartbeat
      const e = o.near * (0.4 + 0.6 * hb);
      coreMat.opacity = 0.3 + e * 0.7; core.scale.setScalar(0.85 + e * 0.35); light.intensity = e * 1.4;
    };
    return { group: g, apply };
  }

  _buildSingingStone() {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#6b6f78", roughness: 1, flatShading: true }); this._track(null, stone);
    const geo = new THREE.BoxGeometry(1.4, 5.5, 1.0); this._track(geo);
    const mono = new THREE.Mesh(geo, stone); mono.position.y = 2.7; mono.rotation.z = 0.08; g.add(mono);
    const seamGeo = new THREE.PlaneGeometry(0.18, 4.4); this._track(seamGeo);
    const seamMat = new THREE.MeshBasicMaterial({ color: "#9fe0ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); this._track(null, seamMat);
    const seam = new THREE.Mesh(seamGeo, seamMat); seam.position.set(0, 2.7, 0.52); seam.rotation.z = 0.08; g.add(seam);
    const apply = (o) => { seamMat.opacity = o.near * 0.25 + o.payoff * 0.7 + o.bands.mid * 0.15 * o.payoff; };
    return { group: g, apply };
  }

  _buildShipwreck() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: "#6e5334", roughness: 1, flatShading: true });
    const sailM = new THREE.MeshStandardMaterial({ color: "#b9ad92", roughness: 1, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const box = new THREE.BoxGeometry(1, 1, 1); this._track(box, [wood, sailM]);
    const hull = new THREE.Mesh(box, wood); hull.scale.set(8, 2.2, 3); hull.position.set(0, 1, 0); hull.rotation.z = 0.12; g.add(hull);
    const hull2 = new THREE.Mesh(box, wood); hull2.scale.set(6, 1.6, 2.6); hull2.position.set(0.5, 2.2, 0); hull2.rotation.z = 0.12; g.add(hull2);
    const mast = new THREE.Mesh(box, wood); mast.scale.set(0.3, 7, 0.3); mast.position.set(0, 4, 0); mast.rotation.z = 0.12; g.add(mast);
    const sailGeo = new THREE.PlaneGeometry(3.4, 3.6); this._track(sailGeo);
    const sail = new THREE.Mesh(sailGeo, sailM); sail.position.set(0.1, 4.4, 0); g.add(sail);
    const apply = (o) => { sail.rotation.y = Math.sin(o.elapsed * 0.6) * 0.12; };
    return { group: g, apply };
  }

  _buildFrozenLake() {
    const g = new THREE.Group();
    const iceGeo = new THREE.CircleGeometry(9, 40); iceGeo.rotateX(-Math.PI / 2); this._track(iceGeo);
    const iceMat = new THREE.MeshStandardMaterial({ color: "#9fc4d6", roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true }); this._track(null, iceMat);
    const ice = new THREE.Mesh(iceGeo, iceMat); ice.position.y = 0.05; g.add(ice);
    const cp = [];
    for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), r1 = rand(0, 8), r2 = r1 + rand(1, 3); cp.push(Math.cos(a) * r1, 0.06, Math.sin(a) * r1, Math.cos(a) * r2, 0.06, Math.sin(a) * r2); }
    const cgeo = new THREE.BufferGeometry(); cgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cp), 3)); this._track(cgeo);
    const cmat = new THREE.LineBasicMaterial({ color: "#dff2ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); this._track(null, cmat);
    g.add(new THREE.LineSegments(cgeo, cmat));
    const shGeo = new THREE.SphereGeometry(2.2, 12, 10); this._track(shGeo);
    const shMat = new THREE.MeshBasicMaterial({ color: "#2a4a6a", transparent: true, opacity: 0.35, depthWrite: false }); this._track(null, shMat);
    const shape = new THREE.Mesh(shGeo, shMat); shape.position.y = -1.6; shape.scale.set(1.6, 0.5, 1); g.add(shape);
    const apply = (o) => { cmat.opacity = o.near * (0.3 + 0.4 * Math.abs(Math.sin(o.elapsed * 0.8))); shMat.opacity = 0.2 + o.near * 0.25; };
    return { group: g, apply };
  }

  _buildLighthouse() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: "#d8d2c4", roughness: 1, flatShading: true });
    const red = new THREE.MeshStandardMaterial({ color: "#b0483a", roughness: 1, flatShading: true });
    this._track(null, [white, red]);
    const towGeo = new THREE.CylinderGeometry(1.0, 1.6, 9, 12); this._track(towGeo);
    const tower = new THREE.Mesh(towGeo, white); tower.position.y = 4.5; g.add(tower);
    const bandGeo = new THREE.CylinderGeometry(1.15, 1.3, 1.2, 12); this._track(bandGeo);
    const band = new THREE.Mesh(bandGeo, red); band.position.y = 6.2; g.add(band);
    const capGeo = new THREE.ConeGeometry(1.2, 1.4, 12); this._track(capGeo);
    const cap = new THREE.Mesh(capGeo, red); cap.position.y = 9.6; g.add(cap);
    const lampMat = new THREE.MeshBasicMaterial({ color: "#fff2c0", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }); this._track(null, lampMat);
    const lampGeo = new THREE.SphereGeometry(0.6, 10, 8); this._track(lampGeo);
    const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.y = 8.8; g.add(lamp);
    const beamGeo = new THREE.ConeGeometry(4, 40, 16, 1, true); beamGeo.translate(0, -20, 0); beamGeo.rotateX(Math.PI / 2); this._track(beamGeo);
    const beamMat = new THREE.MeshBasicMaterial({ color: "#fff2c0", transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); this._track(null, beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = 8.8; g.add(beam);
    const apply = (o) => { beam.rotation.y = o.elapsed * 0.7; beamMat.opacity = 0.04 + o.near * 0.1; lampMat.opacity = 0.6 + 0.3 * Math.sin(o.elapsed * 3.0); };
    return { group: g, apply };
  }

  _buildMoonPavilion() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 1, flatShading: true });
    const roofM = new THREE.MeshStandardMaterial({ color: "#3f4a55", roughness: 0.9, flatShading: true });
    const box = new THREE.BoxGeometry(1, 1, 1); this._track(box, [wood, roofM]);
    const deck = new THREE.Mesh(box, wood); deck.scale.set(6, 0.4, 6); deck.position.y = 0.4; g.add(deck);
    for (const sx of [-2.4, 2.4]) for (const sz of [-2.4, 2.4]) { const p = new THREE.Mesh(box, wood); p.scale.set(0.28, 3, 0.28); p.position.set(sx, 1.9, sz); g.add(p); }
    const roof = new THREE.Mesh(box, roofM); roof.scale.set(6.6, 0.35, 6.6); roof.position.y = 3.5; g.add(roof);
    const lm = new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); this._track(null, lm);
    const lampGeo = new THREE.SphereGeometry(0.3, 10, 8); this._track(lampGeo);
    const lamp = new THREE.Mesh(lampGeo, lm); lamp.position.set(0, 3.0, 0); g.add(lamp);
    const apply = (o) => { lm.opacity = (0.3 + o.night * 0.4) * (0.4 + o.near * 0.6) + o.bands.mid * 0.1 * o.near; };
    return { group: g, apply };
  }

  _buildStatueGarden() {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#8f887c", roughness: 1, flatShading: true }); this._track(null, stone);
    const baseGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.4, 8); this._track(baseGeo);
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.45, 1.8, 7); this._track(bodyGeo);
    const headGeo = new THREE.IcosahedronGeometry(0.32, 0); this._track(headGeo);
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#bfe6ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); this._track(null, eyeMat);
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 5); this._track(eyeGeo);
    for (let i = 0; i < 6; i++) {
      const a = rand(0, 6.28), r = rand(2, 7), px = Math.cos(a) * r, pz = Math.sin(a) * r, fy = rand(0, 6.28);
      const base = new THREE.Mesh(baseGeo, stone); base.position.set(px, 0.2, pz); g.add(base);
      const body = new THREE.Mesh(bodyGeo, stone); body.position.set(px, 1.2, pz); body.rotation.y = fy; g.add(body);
      const head = new THREE.Mesh(headGeo, stone); head.position.set(px, 2.25, pz); g.add(head);
      for (const ex of [-0.12, 0.12]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(px + Math.cos(fy) * 0.28 + ex * Math.sin(fy), 2.3, pz + Math.sin(fy) * 0.28 + ex * Math.cos(fy)); g.add(e); }
    }
    const apply = (o) => { eyeMat.opacity = o.near * (0.2 + 0.8 * o.night); };
    return { group: g, apply };
  }

  _buildBridge() {
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: "#9a938a", roughness: 1, flatShading: true }); this._track(null, stone);
    const box = new THREE.BoxGeometry(1, 1, 1); this._track(box);
    const N = 10;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), x = t * 13 - 2, y = 0.5 + t * 3.2;
      const plank = new THREE.Mesh(box, stone); plank.scale.set(1.6, 0.3, 2.4); plank.position.set(x, y, 0); plank.rotation.z = -0.32; g.add(plank);
      for (const sz of [-1.1, 1.1]) { const r = new THREE.Mesh(box, stone); r.scale.set(1.5, 0.55, 0.15); r.position.set(x, y + 0.5, sz); r.rotation.z = -0.32; g.add(r); }
    }
    const mm = new THREE.MeshBasicMaterial({ color: "#c8d6e0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); this._track(null, mm);
    const mgeo = new THREE.PlaneGeometry(7, 7); this._track(mgeo);
    const mist = new THREE.Mesh(mgeo, mm); mist.position.set(12.5, 4, 0); mist.rotation.y = Math.PI / 2; g.add(mist);
    const apply = (o) => { mm.opacity = (0.22 + o.near * 0.33) * (0.6 + 0.4 * Math.sin(o.elapsed * 0.6)); };
    return { group: g, apply };
  }

  _buildObservatory() {
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: "#8a8478", roughness: 1, flatShading: true });
    const domeM = new THREE.MeshStandardMaterial({ color: "#6f7a82", roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
    const metal = new THREE.MeshStandardMaterial({ color: "#4a4d55", roughness: 0.6, metalness: 0.4, flatShading: true });
    this._track(null, [wall, domeM, metal]);
    const baseGeo = new THREE.CylinderGeometry(2.6, 2.8, 2.2, 16); this._track(baseGeo);
    const base = new THREE.Mesh(baseGeo, wall); base.position.y = 1.1; g.add(base);
    const domeGeo = new THREE.SphereGeometry(2.6, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5); this._track(domeGeo);
    const dome = new THREE.Mesh(domeGeo, domeM); dome.position.y = 2.2; g.add(dome);
    const scopeGeo = new THREE.CylinderGeometry(0.22, 0.3, 3.2, 10); this._track(scopeGeo);
    const scope = new THREE.Mesh(scopeGeo, metal); scope.position.set(0, 3.2, 0); scope.rotation.z = 0.7; g.add(scope);
    const beamMat = new THREE.MeshBasicMaterial({ color: "#bfe0ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); this._track(null, beamMat);
    const beamGeo = new THREE.CylinderGeometry(0.08, 0.5, 18, 12, 1, true); beamGeo.translate(0, 9, 0); this._track(beamGeo);
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(0, 3.2, 0); beam.rotation.z = 0.7; g.add(beam);
    const apply = (o) => { beamMat.opacity = o.near * (0.1 + 0.08 * Math.sin(o.elapsed * 1.5)); dome.rotation.y += o.dt * 0.05; scope.rotation.y = dome.rotation.y; beam.rotation.y = dome.rotation.y; };
    return { group: g, apply };
  }

  _buildHotSpring() {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: "#5a5e66", roughness: 1, flatShading: true }); this._track(null, rock);
    const rockGeo = new THREE.IcosahedronGeometry(0.7, 0); this._track(rockGeo);
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; const r = new THREE.Mesh(rockGeo, rock); r.position.set(Math.cos(a) * 2.6, 0.2, Math.sin(a) * 2.6); r.scale.setScalar(rand(0.7, 1.3)); g.add(r); }
    const poolGeo = new THREE.CircleGeometry(2.4, 24); poolGeo.rotateX(-Math.PI / 2); this._track(poolGeo);
    const poolMat = new THREE.MeshBasicMaterial({ color: "#4a8f9a", transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }); this._track(null, poolMat);
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.y = 0.15; g.add(pool);
    const N = 40, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 2.2; sp[3 * i] = Math.cos(a) * r; sp[3 * i + 1] = rand(0, 3); sp[3 * i + 2] = Math.sin(a) * r; }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute("position", new THREE.BufferAttribute(sp, 3)); this._track(sgeo);
    const smat = new THREE.PointsMaterial({ color: "#e8f2f4", size: 0.4, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }); this._track(null, smat);
    g.add(new THREE.Points(sgeo, smat));
    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 24); ringGeo.rotateX(-Math.PI / 2); this._track(ringGeo);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ffdcb0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); this._track(null, ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.y = 0.16; g.add(ring);
    const apply = (o) => {
      for (let i = 0; i < sp.length; i += 3) { sp[i + 1] += (0.4 + 0.3 * o.near) * o.dt; if (sp[i + 1] > 3.2) sp[i + 1] = 0; }
      sgeo.attributes.position.needsUpdate = true;
      smat.opacity = 0.2 + o.near * 0.3; poolMat.opacity = 0.5 + o.near * 0.25;
      ring.scale.setScalar(1 + (1 - o.payoff) * 6); ringMat.opacity = o.payoff * 0.6;
    };
    return { group: g, apply };
  }

  _buildSleepingGiant() {
    const g = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: "#5f6169", roughness: 1, flatShading: true }); this._track(null, rock);
    const bodyGeo = new THREE.IcosahedronGeometry(4, 0); this._track(bodyGeo);
    const torso = new THREE.Mesh(bodyGeo, rock); torso.scale.set(2.4, 1.0, 1.3); torso.position.set(0, 2.2, 0); g.add(torso);
    const headGeo = new THREE.IcosahedronGeometry(2, 0); this._track(headGeo);
    const head = new THREE.Mesh(headGeo, rock); head.position.set(9, 2.4, 0); g.add(head);
    const kneeGeo = new THREE.IcosahedronGeometry(2.4, 0); this._track(kneeGeo);
    const knee = new THREE.Mesh(kneeGeo, rock); knee.scale.set(1.1, 1.3, 1.1); knee.position.set(-6, 2.6, 0); g.add(knee);
    const apply = (o) => { const br = Math.sin(o.elapsed * 0.35) * (0.15 + o.near * 0.35); torso.position.y = 2.2 + br; torso.scale.y = 1.0 + br * 0.06; };
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
    let hintD = Infinity, hasHint = false;

    for (const t of this.types) {
      const inst = t.inst;
      const home = this._placeNearest(t, cam);
      if (!home) { inst.group.visible = false; continue; }
      if (home.cell !== inst.cell) { inst.cell = home.cell; inst.armed = true; }
      inst.group.visible = true;
      inst.group.position.set(home.wx, home.h, home.wz);

      const dist = home.dist;
      const nearRaw = THREE.MathUtils.clamp((t.farR - dist) / (t.farR - t.nearR), 0, 1);
      inst.near += (nearRaw - inst.near) * Math.min(1, dt * 3);
      inst.payoff *= decay;

      const within = dist < t.nearR;
      const key = t.kind + ":" + home.cell;
      // Proximity trigger: coming close fires the payoff (every visit); it only
      // counts the first time this gem is met. Re-arms once you've clearly left.
      if (within && inst.armed) {
        inst.armed = false;
        inst.payoff = 1;
        const first = !this.witnessed.has(key);
        if (first) this.witnessed.add(key);
        this.ctx.onWonder && this.ctx.onWonder(t.kind, t.msg, first, { x: home.wx, y: home.h + 1.5, z: home.wz });
      } else if (dist > t.nearR * 1.7) {
        inst.armed = true;
      }

      if (dist > 45 && dist < t.farR + 80 && dist < hintD) { hintD = dist; hasHint = true; }
      inst.apply({ dt, elapsed, bands, beat, near: inst.near, night, fm, payoff: inst.payoff });
    }

    // Occasional curiosity chip: visible ~8 s of every ~26 s while a gem is near.
    this._hintCycle += dt;
    this.hint = hasHint && (this._hintCycle % 26) < 8;
  }

  dispose(scene) {
    for (const t of this.types) scene.remove(t.inst.group);
    for (const d of this._disp) { try { d.dispose(); } catch {} }
    this._disp = [];
  }
}
