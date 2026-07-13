import * as THREE from "three";
import { fbm } from "../noise.js";
import { makeDesertKit, buildCactus, buildBones, makeSnowKit, buildPine, buildSnowBoulder } from "../props.js";
import { PERF } from "../perf.js";

const SIZE = 320;
const SEG = PERF.terrainSeg;
// Scale a prop count by the device profile (never below 1).
const nProps = (n) => Math.max(1, Math.round(n * PERF.scatter));
const CELL = SIZE / SEG;
const FREQ = 0.013;
const HEIGHT = 18;
const WATER_LEVEL = -4; // valleys below this fill with water; you walk its surface

// Low-frequency biome selectors (large regions, but reachable on foot).
const arid = (x, z) => fbm(x * 0.0038 + 120, z * 0.0038 - 80, 2);
const alpine = (x, z) => fbm(x * 0.0026 - 260, z * 0.0026 + 340, 2);
export const desertMask = (x, z) => THREE.MathUtils.smoothstep(arid(x, z), 0.12, 0.36);
export const snowMask = (x, z) => THREE.MathUtils.smoothstep(alpine(x, z), 0.34, 0.56);

// Shared height field — used by the mesh, the walk controls, and decor placement.
export function terrainHeight(x, z) {
  const n = fbm(x * FREQ, z * FREQ, 5);
  let h = Math.sign(n) * Math.pow(Math.abs(n), 1.25) * HEIGHT;
  h += fbm(x * FREQ * 2.7 + 50, z * FREQ * 2.7 + 50, 3) * 5; // mid-scale relief / texture

  const dm = desertMask(x, z);
  if (dm > 0.001) {
    const dune = fbm(x * 0.02 + 9, z * 0.02 - 4, 3) * 3.2; // gentle, never steep
    h = h * (1 - dm) + dune * dm;
  }
  const sm = snowMask(x, z);
  if (sm > 0.001) {
    const m = fbm(x * FREQ * 1.25, z * FREQ * 1.25, 5);
    const peak = Math.sign(m) * Math.pow(Math.abs(m), 1.7) * HEIGHT * 3.6; // tall & steep
    h = h * (1 - sm) + peak * sm;
  }
  return h;
}

// An endless winding path: its centre meanders in z as a function of x.
const PATH_LEVEL = 0.5;  // flat corridor height (above the water -> dry causeway)
const PATH_HALF = 3.2;   // half-width of the fully-flat strip
const PATH_BLEND = 12;   // how far the flattening fades back into the hills
const pathZ = (x) => 24 * Math.sin(x * 0.012) + 9 * Math.sin(x * 0.027 + 1.7);
const pathDZ = (x) => 24 * 0.012 * Math.cos(x * 0.012) + 9 * 0.027 * Math.cos(x * 0.027 + 1.7);

const lo = new THREE.Color("#202a40");   // deep moonlit valley (indigo)
const mid = new THREE.Color("#3a5563");  // muted teal-slate
const hi = new THREE.Color("#9aa6cf");   // pale moonlit ridge highlight
const sandLo = new THREE.Color("#7c6438"); // desert
const sandHi = new THREE.Color("#c4a86e");
const rockLo = new THREE.Color("#4a4d56"); // snowy peak
const snowHi = new THREE.Color("#eef3f8");
// Sunrise palette — the Journey's dawn finale lerps the arc toward these.
const DAWN_TOP = new THREE.Color("#6f93cf");      // daytime sky blue
const DAWN_BOT = new THREE.Color("#f3ba7a");      // warm morning horizon
const DAWN_FOG = new THREE.Color("#b4c6d4");      // pale hazy daylight
const DAWN_SUN = new THREE.Color("#fff2d8");      // bright warm sun
const DAWN_WATER_SH = new THREE.Color("#93b2b0");
const DAWN_WATER_DP = new THREE.Color("#35525e");
const tmp = new THREE.Color();
const tmpB = new THREE.Color();
const rand = (a, b) => a + Math.random() * (b - a);
const PASTEL_FOLIAGE = ["#3a6b43", "#2c5536", "#577039", "#6e5230", "#7a4a38"];

// A small speckled grain texture for surface detail (multiplied over base color).
function makeGrainTexture() {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const n = 150 + Math.floor(Math.random() * 105); // 150..255 grey speckle
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter; // crunchy / lo-fi
  return tex;
}

export class PastelWorld {
  constructor() {
    this.name = "Moonlit Hills";
    // Walk on the flattened surface, but never sink below the water.
    this.heightAt = (x, z) => Math.max(this.surfaceHeight(x, z), WATER_LEVEL);
    this.objects = [];
    this._disp = []; // geometries/materials to dispose
    this.solids = []; // { mesh, hx, hz, hy } collision boxes for walls/structures
    this._cv = new THREE.Vector3();
    this._beatCd = 0;
    this._starCd = 0;
    this.waveWidth = 0.5; // base half-thickness of the waveform ribbon (slider)
    this.onWave = 0;      // 0..1, how much the player stands on the waveform
    this.flash = 0;       // red pickup flash, decays each frame
    this.reduceMotion = false; // photosensitivity: damp beat-driven flashes/strobes (main.js sets it)
    this.progress = 0;    // 0..1 journey position; main.js sets each frame -> day/night arc
    this.onCollect = null;  // called when the walker picks up a ring (Journey hooks this)
    this.auroraBoost = 0;   // extra aurora energy (Journey's aurora-storm event)
    this.sunrise = 0;       // 0..1 dawn finale: warms sky/fog/water, fades the night
    // Day/night keyframes: sunset -> deep-night -> dawn. Each holds base colors
    // (re-applied each frame as the music reaction layers on top), fog, moon,
    // water tint and a 0..1 "night" weight that brightens lanterns/fireflies/aura.
    this._arc = [
      { // 0.00 — sunset / dusk: warm-tinted horizon, brighter, low moon
        skyTop: new THREE.Color("#2a2440"), skyBot: new THREE.Color("#6b4a52"),
        fog: new THREE.Color("#3a2c38"), fogD: 0.0066,
        moon: 0.45, moonCol: new THREE.Color("#ffcea0"),
        waterSh: new THREE.Color("#4a5560"), waterDp: new THREE.Color("#241a2a"),
        night: 0.15,
      },
      { // 0.50 — deep night: cold indigo, dense fog, pale-blue full moon
        skyTop: new THREE.Color("#0a1024"), skyBot: new THREE.Color("#16323a"),
        fog: new THREE.Color("#0e2226"), fogD: 0.0082,
        moon: 0.75, moonCol: new THREE.Color("#c6d2ff"),
        waterSh: new THREE.Color("#1f5258"), waterDp: new THREE.Color("#081c28"),
        night: 1.0,
      },
      { // 1.00 — dawn: cool teal lifting, thinning fog, fading moon
        skyTop: new THREE.Color("#1c2a44"), skyBot: new THREE.Color("#4a6660"),
        fog: new THREE.Color("#1e3a36"), fogD: 0.0064,
        moon: 0.5, moonCol: new THREE.Color("#d8e0f0"),
        waterSh: new THREE.Color("#3a6e6a"), waterDp: new THREE.Color("#0c2330"),
        night: 0.2,
      },
    ];
    this._arcSky = {}; // resolved keyframe scratch (filled by _sampleArc)
  }

  // Sample the day/night arc at this.progress (0..1). Lerps between the three
  // keyframes and stores the result in a small scratch object reused per frame.
  _sampleArc() {
    const kf = this._arc;
    const p = ((this.progress % 1) + 1) % 1;
    const seg = p < 0.5 ? 0 : 1;        // 0->1 then 1->2
    const t = seg === 0 ? p / 0.5 : (p - 0.5) / 0.5;
    const a = kf[seg], b = kf[seg + 1];
    const out = this._arcSky;
    out.skyTop = (out.skyTop || new THREE.Color()).copy(a.skyTop).lerp(b.skyTop, t);
    out.skyBot = (out.skyBot || new THREE.Color()).copy(a.skyBot).lerp(b.skyBot, t);
    out.fog = (out.fog || new THREE.Color()).copy(a.fog).lerp(b.fog, t);
    out.fogD = a.fogD + (b.fogD - a.fogD) * t;
    out.moon = a.moon + (b.moon - a.moon) * t;
    out.moonCol = (out.moonCol || new THREE.Color()).copy(a.moonCol).lerp(b.moonCol, t);
    out.waterSh = (out.waterSh || new THREE.Color()).copy(a.waterSh).lerp(b.waterSh, t);
    out.waterDp = (out.waterDp || new THREE.Color()).copy(a.waterDp).lerp(b.waterDp, t);
    out.night = a.night + (b.night - a.night) * t;
    return out;
  }

  init(scene) {
    this.scene = scene;
    this.skyTop = new THREE.Color("#101a33");  // deep twilight zenith
    this.skyBot = new THREE.Color("#33524e");  // dusky teal horizon
    scene.background = new THREE.Color("#0f1a2c");
    scene.fog = new THREE.FogExp2("#16302e", 0.0072);

    this.hemi = new THREE.HemisphereLight("#8a9ec4", "#26303f", 0.6);
    this.sunLight = new THREE.DirectionalLight("#c6d2ff", 0.6); // moonlight
    this.sunLight.position.set(40, 60, 20);
    scene.add(this.hemi, this.sunLight);
    this.objects.push(this.hemi, this.sunLight);

    this._buildSky(scene);
    this._buildTerrain(scene);
    this._buildPath(scene);
    this._buildWater(scene);
    this._buildSun(scene);
    this._buildAurora(scene);
    this._buildParticles(scene);
    this._buildScatter(scene);
    this._buildStructures(scene);
    this._buildSkyLife(scene);
    this._buildClouds(scene);
    this._buildRipples(scene);
    this._buildStars(scene);
  }

  _track(geo, matOrArr) {
    if (geo) this._disp.push(geo);
    if (Array.isArray(matOrArr)) this._disp.push(...matOrArr);
    else if (matOrArr) this._disp.push(matOrArr);
  }

  _buildSky(scene) {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: this.skyTop.clone() }, bot: { value: this.skyBot.clone() },
        time: { value: 0 }, glow: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, bot; uniform float time, glow; varying vec3 vDir;
        void main(){
          float t = clamp(vDir.y*0.5+0.5, 0.0, 1.0);
          vec3 col = mix(bot, top, t);
          // slowly drifting colour movement across the sky
          float w = sin(vDir.x*2.5 + time*0.13) * 0.5 + sin(vDir.z*3.0 - time*0.1) * 0.5;
          float w2 = sin((vDir.x + vDir.z)*1.6 - time*0.07);
          float w3 = sin(vDir.y*4.0 + time*0.05);
          col += vec3(0.05, 0.025, 0.07) * w;        // hue shimmer
          col += vec3(0.0, 0.03, 0.04) * w3;          // teal banding
          col *= 1.0 + 0.07*w2 + glow*0.35;           // brightness breathing + audio
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    scene.add(this.sky);
    this.objects.push(this.sky);
    this._track(geo, this.skyMat);
  }

  _buildTerrain(scene) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.grain = makeGrainTexture();
    this.grain.repeat.set(60, 60);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.97, metalness: 0.0,
      map: this.grain,
      emissive: new THREE.Color("#9fb0e0"), emissiveIntensity: 0.0,
    });
    // Bass "heave": a gentle vertical breathing of the hills driven by sub/kick
    // energy, done in the vertex shader (visual only — collision uses the CPU
    // surfaceHeight, so walking is unaffected). Faded to ~0 near the flat path
    // corridor (low ground) so the causeway stays flat; flatShading recomputes
    // face normals from the displaced positions, so lighting follows for free.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHeave = { value: 0 };
      shader.uniforms.uHeaveTime = { value: 0 };
      shader.vertexShader = "uniform float uHeave;\nuniform float uHeaveTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vec3 wpH = (modelMatrix * vec4(position, 1.0)).xyz;
         float hv = sin(wpH.x * 0.045 + uHeaveTime * 1.2) * cos(wpH.z * 0.05 - uHeaveTime * 0.9);
         float heaveFade = smoothstep(2.0, ${(HEIGHT * 0.45).toFixed(2)}, wpH.y);
         transformed.y += hv * uHeave * heaveFade * 0.5;`
      );
      this._terrainShader = shader;
    };
    mat.customProgramCacheKey = () => "pastel-terrain-heave";
    this._track(null, this.grain);
    this.terrain = new THREE.Mesh(geo, mat);
    scene.add(this.terrain);
    this.objects.push(this.terrain);
    this._track(geo, mat);
    this._snapX = Infinity; this._snapZ = Infinity;
    this._rowVerts = SEG + 1;       // verts per row in the plane grid
    this._rebuild(0, 0);            // full synchronous build for the initial cell
  }

  // The winding path's centre z at world x — the line the waveform runs along.
  // Demo/autopilot (controls.pathAt) steers the sage onto and along it.
  pathAt(x) {
    return pathZ(x);
  }

  // Keep a structure clear of the path corridor so walls never sit on the line
  // (which blocks the walker / the demo autopilot). Nudges z to whichever side
  // it's already on, just outside `clearance` of the path centre at that x.
  _pushOffPath(pos, clearance) {
    const cz = pathZ(pos.x);
    const dz = pos.z - cz;
    if (Math.abs(dz) < clearance) pos.z = cz + (dz < 0 ? -clearance : clearance);
  }

  // Terrain height flattened into a corridor along the winding path.
  surfaceHeight(x, z) {
    const base = terrainHeight(x, z);
    const d = Math.abs(z - pathZ(x));
    const t = THREE.MathUtils.smoothstep(d, PATH_HALF, PATH_HALF + PATH_BLEND);
    return PATH_LEVEL + (base - PATH_LEVEL) * t;
  }

  // Per-vertex height + color for one vertex index `i` (no normal — done in bulk).
  _writeHeightColor(i, sx, sz, arr, carr) {
    const lx = arr[3 * i], lz = arr[3 * i + 2];
    const wx = sx + lx, wz = sz + lz;
    const h = this.surfaceHeight(wx, wz);
    arr[3 * i + 1] = h;

    const t = THREE.MathUtils.clamp(h / HEIGHT * 0.5 + 0.5, 0, 1);
    if (t < 0.5) tmp.copy(lo).lerp(mid, t * 2);
    else tmp.copy(mid).lerp(hi, (t - 0.5) * 2);
    // Mottled per-vertex noise -> rocky texture variation.
    const n = fbm(wx * 0.18, wz * 0.18, 2) * 0.5 + 0.5;
    tmp.multiplyScalar(0.72 + n * 0.5);
    // Large-scale region tint -> different hills drift teal / blue / violet.
    const hueShift = fbm(wx * 0.0045 + 30, wz * 0.0045 - 20, 2) * 0.16;
    tmp.offsetHSL(hueShift, 0.04, 0);
    // Blend toward desert sand, then snowy rock/cap, by biome.
    const dm = desertMask(wx, wz);
    if (dm > 0.001) tmp.lerp(tmpB.copy(sandLo).lerp(sandHi, THREE.MathUtils.clamp(h / 7 * 0.5 + 0.5, 0, 1)), dm);
    const sm = snowMask(wx, wz);
    if (sm > 0.001) tmp.lerp(tmpB.copy(rockLo).lerp(snowHi, THREE.MathUtils.clamp((h - 16) / 42, 0, 1)), sm);
    carr[3 * i] = tmp.r; carr[3 * i + 1] = tmp.g; carr[3 * i + 2] = tmp.b;
  }

  // Detect a cell crossing; reposition the mesh and rebuild it fully this frame.
  _rebuild(camX, camZ) {
    const sx = Math.round(camX / CELL) * CELL;
    const sz = Math.round(camZ / CELL) * CELL;
    if (sx === this._snapX && sz === this._snapZ) return;
    this._snapX = sx; this._snapZ = sz;
    this.terrain.position.set(sx, 0, sz);
    this._recompute();
  }

  // Full synchronous rebuild: heights+colors (1 noise sample/vert), then normals
  // from neighbour vertex heights (cheap arithmetic — no extra noise, no O(n) pass).
  _recompute() {
    const geo = this.terrain.geometry;
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
    const arr = pos.array, narr = nrm.array, carr = col.array;
    const W = this._rowVerts, sx = this._snapX, sz = this._snapZ, N = pos.count;

    for (let i = 0; i < N; i++) this._writeHeightColor(i, sx, sz, arr, carr);

    for (let row = 0; row < W; row++) {
      for (let c = 0; c < W; c++) {
        const i = row * W + c;
        const iL = c > 0 ? i - 1 : i, iR = c < W - 1 ? i + 1 : i;
        const iD = row > 0 ? i - W : i, iU = row < W - 1 ? i + W : i;
        const dx = (arr[3 * iR] - arr[3 * iL]) || CELL;
        const dz = (arr[3 * iU + 2] - arr[3 * iD + 2]) || CELL;
        const slopeX = (arr[3 * iR + 1] - arr[3 * iL + 1]) / dx;
        const slopeZ = (arr[3 * iU + 1] - arr[3 * iD + 1]) / dz;
        let nx = -slopeX, ny = 1, nz = -slopeZ;
        const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
        narr[3 * i] = nx * inv; narr[3 * i + 1] = ny * inv; narr[3 * i + 2] = nz * inv;
      }
    }
    pos.needsUpdate = true; nrm.needsUpdate = true; col.needsUpdate = true;
  }

  // The winding path ribbon + a line of lantern posts that follow it endlessly.
  _buildPath(scene) {
    this.pathN = 150;
    this.pathHalfW = PATH_HALF - 0.5;
    const count = (this.pathN + 1) * 2;
    const pos = new Float32Array(count * 3);
    const idx = [];
    for (let i = 0; i < this.pathN; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
    const uv = new Float32Array(count * 2);
    for (let i = 0; i <= this.pathN; i++) {
      uv[i * 4] = i * 0.5; uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = i * 0.5; uv[i * 4 + 3] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: "#5a4a34", roughness: 1, flatShading: true, side: THREE.DoubleSide, map: this.grain });
    this.path = new THREE.Mesh(geo, mat);
    this.path.frustumCulled = false; // we bake world coords into the verts each frame
    scene.add(this.path);
    this.objects.push(this.path);
    this._track(geo, mat);

    // Lantern posts lining the trail.
    this.pathLamps = [];
    this.pathGroup = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: "#6b4a32", roughness: 1, flatShading: true });
    const orbGeo = new THREE.SphereGeometry(0.22, 12, 10);
    this._track(postGeo, postMat); this._track(orbGeo);
    this.pathLampInterval = 15;
    this.pathLampCount = 20;
    for (let i = 0; i < this.pathLampCount; i++) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(postGeo, postMat); post.position.y = 0.7; g.add(post);
      const m = new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, blending: THREE.AdditiveBlending });
      this._disp.push(m);
      const orb = new THREE.Mesh(orbGeo, m); orb.position.y = 1.55; g.add(orb);
      this.pathGroup.add(g);
      this.pathLamps.push({ g, mat: m, orb });
    }
    scene.add(this.pathGroup);
    this.objects.push(this.pathGroup);

    // Live oscilloscope: the playing waveform drawn as a thick glowing ribbon.
    this.waveCount = 240;
    this._wx = new Float32Array(this.waveCount);
    this._wz = new Float32Array(this.waveCount);
    const wpos = new Float32Array(this.waveCount * 2 * 3);
    const widx = [];
    for (let i = 0; i < this.waveCount - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      widx.push(a, c, b, b, c, d);
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute("position", new THREE.BufferAttribute(wpos, 3));
    wgeo.setIndex(widx);
    const wmat = new THREE.MeshBasicMaterial({ color: "#ff3df0", transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.waveRibbon = new THREE.Mesh(wgeo, wmat);
    this.waveRibbon.frustumCulled = false;
    this.waveRibbon.renderOrder = 2;
    this.waveMat = wmat;
    scene.add(this.waveRibbon);
    this.objects.push(this.waveRibbon);
    this._track(wgeo, wmat);

    // Collectibles strewn along the path (decorative for now — no pickup yet).
    this.collectibles = [];
    this.collectGroup = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(0.24, 0.05, 8, 20);
    this._track(ringGeo);
    this.collectInterval = 55;
    const CC = 3;
    for (let i = 0; i < CC; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.12, 0.7, 0.6),
        emissive: new THREE.Color().setHSL(0.12, 0.85, 0.5), emissiveIntensity: 0.9,
        roughness: 0.25, metalness: 0.7, flatShading: true,
      });
      this._disp.push(m);
      const mesh = new THREE.Mesh(ringGeo, m);
      this.collectGroup.add(mesh);
      this.collectibles.push({ mesh, mat: m, x: (i - CC / 2) * this.collectInterval, jitter: rand(-0.7, 0.7), bob: rand(0, 6.28), collected: false });
    }
    scene.add(this.collectGroup);
    this.objects.push(this.collectGroup);
  }

  _updatePath(cam, bands, beat, wave, elapsed, night = 0, fm = 1) {
    const pos = this.path.geometry.attributes.position, arr = pos.array;
    const L = 240, step = L / this.pathN, startX = cam.x - L / 2, hw = this.pathHalfW;
    for (let i = 0; i <= this.pathN; i++) {
      const x = startX + i * step;
      const cz = pathZ(x), dz = pathDZ(x);
      const inv = 1 / Math.hypot(dz, 1), px = -dz * inv, pz = inv; // perpendicular in XZ
      const y = PATH_LEVEL + 0.07;
      const a = i * 6, b = i * 6 + 3;
      arr[a] = x + px * hw; arr[a + 1] = y; arr[a + 2] = cz + pz * hw;
      arr[b] = x - px * hw; arr[b + 1] = y; arr[b + 2] = cz - pz * hw;
    }
    pos.needsUpdate = true;
    this.path.geometry.computeVertexNormals();

    const iv = this.pathLampInterval;
    const base = Math.floor(cam.x / iv) * iv - (this.pathLampCount / 2) * iv;
    for (let k = 0; k < this.pathLampCount; k++) {
      const l = this.pathLamps[k];
      const x = base + k * iv;
      const cz = pathZ(x), dz = pathDZ(x);
      const inv = 1 / Math.hypot(dz, 1), px = -dz * inv, pz = inv;
      const side = k % 2 ? 1 : -1;
      const lx = x + px * (hw + 0.9) * side, lz = cz + pz * (hw + 0.9) * side;
      l.g.position.set(lx, this.surfaceHeight(lx, lz), lz);
      l.mat.color.setHSL((0.1 + bands.mid * 0.1) % 1, 0.85, 0.62 + night * 0.08);
      l.mat.opacity = (0.6 + night * 0.35) + bands.level * 0.3; // lanterns glow brighter at night
      l.orb.scale.setScalar(1 + night * 0.15 + bands.bass * 0.8 + beat * 0.6 * fm);
    }

    // Waveform: first compute the wiggling centre-curve, then extrude a ribbon.
    const N = this.waveCount, wx = this._wx, wz = this._wz;
    const amp = 2.2 + bands.level * 5; // louder => taller wiggle
    const wlen = wave ? wave.length : 0;
    for (let i = 0; i < N; i++) {
      const frac = i / (N - 1);
      const x = startX + frac * L;
      const cz = pathZ(x), dz = pathDZ(x);
      const inv = 1 / Math.hypot(dz, 1), ppx = -dz * inv, ppz = inv;
      const s = wlen ? (wave[Math.floor(frac * (wlen - 1))] - 128) / 128 : 0;
      const off = s * amp;
      wx[i] = x + ppx * off; wz[i] = cz + ppz * off;
    }
    const wpos = this.waveRibbon.geometry.attributes.position, wa = wpos.array;
    const halfT = this.waveWidth + bands.level * 0.15 + beat * 0.12 * fm; // slider dominates; subtle pulse
    const y = PATH_LEVEL + 0.22;
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
      let tx = wx[i1] - wx[i0], tz = wz[i1] - wz[i0];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const sx = -tz, sz = tx; // perpendicular to the curve, in the ground plane
      const a = i * 6, b = i * 6 + 3;
      wa[a] = wx[i] + sx * halfT; wa[a + 1] = y; wa[a + 2] = wz[i] + sz * halfT;
      wa[b] = wx[i] - sx * halfT; wa[b + 1] = y; wa[b + 2] = wz[i] - sz * halfT;
    }
    wpos.needsUpdate = true;
    this.waveMat.color.setHSL((0.5 + bands.treble * 0.1) % 1, 0.9, 0.6 + beat * 0.15 * fm); // cohesive cyan
    this.waveMat.opacity = 0.7 + bands.level * 0.3;

    // Is the player standing on the waveform ribbon? (-> the sage is "enlightened")
    const ci = THREE.MathUtils.clamp(Math.round(((cam.x - startX) / L) * (N - 1)), 0, N - 1);
    let dmin = Infinity;
    for (let i = Math.max(0, ci - 2); i <= Math.min(N - 1, ci + 2); i++) {
      const dx = cam.x - wx[i], dz = cam.z - wz[i];
      dmin = Math.min(dmin, dx * dx + dz * dz);
    }
    const near = Math.sqrt(dmin) < halfT + 1.2 ? 1 : 0;
    this.onWave += (near - this.onWave) * 0.12;

    // Collectibles along the path: world-anchored, recycled, picked up on contact.
    const span = this.collectibles.length * this.collectInterval, half = span / 2;
    for (const c of this.collectibles) {
      if (c.x < cam.x - half) { c.x += span; c.collected = false; c.jitter = rand(-0.7, 0.7); }
      else if (c.x > cam.x + half) { c.x -= span; c.collected = false; c.jitter = rand(-0.7, 0.7); }
      if (c.collected) { c.mesh.visible = false; continue; }
      c.mesh.visible = true;
      const x = c.x, cz = pathZ(x), dz = pathDZ(x);
      const inv = 1 / Math.hypot(dz, 1), ppx = -dz * inv, ppz = inv;
      const lx = x + ppx * c.jitter, lz = cz + ppz * c.jitter;
      const y = this.surfaceHeight(lx, lz) + 0.85 + Math.sin(elapsed * 1.5 + c.bob) * 0.16;
      c.mesh.position.set(lx, y, lz);
      c.mesh.rotation.set(0, Math.atan2(1, dz), 0); // upright hoop facing along the path
      c.mat.emissiveIntensity = 0.7 + bands.treble * 1.5 + beat * 1.2 * fm;
      c.mesh.scale.setScalar(1 + bands.bass * 0.25 + beat * 0.35 * fm);
      // Vanish the instant the walker reaches it; flash white on contact.
      const dx = cam.x - lx, dcz = cam.z - lz;
      if (dx * dx + dcz * dcz < 1.5 * 1.5) {
        c.collected = true; c.mesh.visible = false; this._fireRipple(cam); this.flash = 1;
        if (this.onCollect) this.onCollect();
      }
    }
  }

  _buildWater(scene) {
    const geo = new THREE.PlaneGeometry(700, 700, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 }, cam: { value: new THREE.Vector3() },
        shallow: { value: new THREE.Color("#2f6b6e") },
        deep: { value: new THREE.Color("#0c2330") },
        glow: { value: 0 },
      },
      vertexShader: `uniform vec3 cam; varying vec2 w;
        void main(){ w = position.xz + cam.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time, glow; uniform vec3 shallow, deep; uniform vec3 cam; varying vec2 w;
        void main(){
          float waves = sin(w.x*0.25 + time*1.2) * 0.5 + sin(w.y*0.3 - time*0.9) * 0.5;
          float sparkle = pow(max(0.0, sin(w.x*1.7 + time*2.0) * sin(w.y*1.9 - time*1.7)), 8.0);
          vec3 c = mix(deep, shallow, waves * 0.5 + 0.5 + glow);
          c += sparkle * (0.6 + glow);
          float dist = length(w - cam.xz);
          float fade = smoothstep(330.0, 80.0, dist);
          gl_FragColor = vec4(c, (0.72 + glow * 0.2) * fade);
        }`,
    });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 1;
    scene.add(this.water);
    this.objects.push(this.water);
    this._track(geo, this.waterMat);
  }

  _buildSun(scene) {
    this.sunGroup = new THREE.Group();
    const coreGeo = new THREE.SphereGeometry(16, 24, 16);
    this.sunMat = new THREE.MeshBasicMaterial({ color: "#e9eeff" }); // moon
    this.sunGroup.add(new THREE.Mesh(coreGeo, this.sunMat));
    const glowGeo = new THREE.SphereGeometry(28, 24, 16);
    this.sunGlow = new THREE.MeshBasicMaterial({ color: "#8fb0d6", transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending });
    this.sunGroup.add(new THREE.Mesh(glowGeo, this.sunGlow));
    this.sunDir = new THREE.Vector3(0.5, 0.42, -0.76).normalize();
    scene.add(this.sunGroup);
    this.objects.push(this.sunGroup);
    this._track(coreGeo, this.sunMat); this._track(glowGeo, this.sunGlow);
  }

  _buildAurora(scene) {
    const geo = new THREE.PlaneGeometry(800, 800, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.auroraMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 }, cam: { value: new THREE.Vector3() },
        colA: { value: new THREE.Color("#a6f0e0") }, colB: { value: new THREE.Color("#f0a6e6") },
        energy: { value: 0.3 },
      },
      vertexShader: `uniform vec3 cam; varying vec2 w;
        void main(){ w = position.xz + cam.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float time, energy; uniform vec3 colA, colB; uniform vec3 cam; varying vec2 w;
        void main(){
          float v = sin(w.x*0.01 + time*0.25 + sin(w.y*0.02)*2.0);
          float a = pow(max(0.0, v), 3.0);
          float fade = smoothstep(380.0, 120.0, length(w - cam.xz)); // softens far edges
          vec3 c = mix(colA, colB, 0.5 + 0.5*sin(time*0.12 + w.y*0.004));
          gl_FragColor = vec4(c, a * energy * fade);
        }`,
    });
    this.aurora = new THREE.Mesh(geo, this.auroraMat);
    this.aurora.position.y = 115;
    scene.add(this.aurora);
    this.objects.push(this.aurora);
    this._track(geo, this.auroraMat);
  }

  _buildParticles(scene) {
    const N = PERF.particles;
    const pos = new Float32Array(N * 3);
    this.spread = 170;
    for (let i = 0; i < N; i++) {
      pos[3 * i] = rand(-1, 1) * this.spread / 2;
      pos[3 * i + 1] = Math.random() * 70;
      pos[3 * i + 2] = rand(-1, 1) * this.spread / 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.pmat = new THREE.PointsMaterial({ color: "#ffd98a", size: 0.5, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }); // warm fireflies
    this.particles = new THREE.Points(geo, this.pmat);
    scene.add(this.particles);
    this.objects.push(this.particles);
    this._track(geo, this.pmat);
  }

  // Trees, mushrooms, crystals and floating magical orbs that wrap around you.
  // A cheap soft contact-shadow decal (dark radial circle) laid flat on the
  // ground, parented under a prop so it follows it. Grounds things without the
  // cost of real shadow maps.
  _makeBlob(r = 1) {
    if (!this._blobMat) {
      const s = 64, c = document.createElement("canvas");
      c.width = c.height = s;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(0,0,0,0.85)");
      g.addColorStop(0.55, "rgba(0,0,0,0.4)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      this._blobTex = new THREE.CanvasTexture(c);
      this._blobMat = new THREE.MeshBasicMaterial({ map: this._blobTex, transparent: true, opacity: 0.5, depthWrite: false });
      this._blobGeo = new THREE.CircleGeometry(1, 24);
      this._blobGeo.rotateX(-Math.PI / 2);
      this._track(this._blobGeo, this._blobMat);
      this._track(null, this._blobTex);
    }
    const m = new THREE.Mesh(this._blobGeo, this._blobMat);
    m.scale.set(r, 1, r);
    m.position.y = 0.05;
    m.renderOrder = 1;
    return m;
  }

  _buildScatter(scene) {
    this.scatter = [];
    this.scatterGroup = new THREE.Group();
    const R = 150;

    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1.4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#9b6b4a", roughness: 1, flatShading: true });
    const foliageGeo = new THREE.ConeGeometry(1.0, 2.2, 7);
    const topGeo = new THREE.ConeGeometry(0.7, 1.4, 7);
    const capGeo = new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.6, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: "#fff6f0", roughness: 1, flatShading: true });
    const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
    const orbGeo = new THREE.SphereGeometry(0.34, 16, 12);
    this._track(trunkGeo, trunkMat); this._track(foliageGeo); this._track(topGeo);
    this._track(capGeo); this._track(stemGeo, stemMat); this._track(crystalGeo); this._track(orbGeo);

    const place = (obj) => {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      obj.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    };

    const add = (obj, item) => {
      this.scatterGroup.add(obj);
      // Ground-anchored props get a contact shadow; floating orbs don't.
      if (item.kind !== "orb") {
        obj.add(this._makeBlob(item.kind === "crystal" ? 0.6 : item.kind === "veg" ? 0.9 : 1.1));
      }
      item.obj = obj; item.R = R; item.groundY = 0; item.phase = rand(0, Math.PI * 2);
      this.scatter.push(item);
    };

    // Trees
    for (let i = 0; i < nProps(34); i++) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 0.7; g.add(trunk);
      const fmat = new THREE.MeshStandardMaterial({ color: PASTEL_FOLIAGE[i % PASTEL_FOLIAGE.length], roughness: 1, flatShading: true });
      this._disp.push(fmat);
      const f = new THREE.Mesh(foliageGeo, fmat); f.position.y = 2.0; g.add(f);
      const f2 = new THREE.Mesh(topGeo, fmat); f2.position.y = 3.0; g.add(f2);
      const s = rand(0.8, 1.6); g.scale.setScalar(s);
      place(g); add(g, { kind: "veg" });
    }
    // Mushrooms
    for (let i = 0; i < nProps(18); i++) {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = 0.3; g.add(stem);
      const cmat = new THREE.MeshStandardMaterial({ color: i % 2 ? "#b5704f" : "#caa15a", roughness: 0.9, flatShading: true });
      this._disp.push(cmat);
      const cap = new THREE.Mesh(capGeo, cmat); cap.position.y = 0.55; g.add(cap);
      g.scale.setScalar(rand(0.7, 1.5));
      place(g); add(g, { kind: "veg" });
    }
    // Crystals (reactive emissive — tight teal palette)
    for (let i = 0; i < nProps(16); i++) {
      const hue = rand(0.47, 0.57);
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.6, 0.7), emissive: new THREE.Color().setHSL(hue, 0.7, 0.5), emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.2, flatShading: true });
      this._disp.push(m);
      const c = new THREE.Mesh(crystalGeo, m);
      c.scale.set(rand(0.6, 1.2), rand(1.4, 2.6), rand(0.6, 1.2));
      place(c); add(c, { kind: "crystal", mat: m, baseScale: c.scale.clone() });
    }
    // Floating magical orbs (reactive, hover above ground — cohesive cyan)
    for (let i = 0; i < 10; i++) {
      const hue = rand(0.45, 0.55);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.75, 0.7), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
      this._disp.push(m);
      const o = new THREE.Mesh(orbGeo, m);
      place(o); add(o, { kind: "orb", mat: m, float: rand(2.5, 7), base: rand(0.7, 1.4), hue });
    }

    // Desert props (cacti, bleached bones / dead shrubs) — visible only deep in
    // the desert biome; hidden elsewhere via the wrap/visibility logic.
    const desertKit = makeDesertKit((g, m) => this._track(g, m));
    for (let i = 0; i < nProps(14); i++) {
      const g = Math.random() < 0.55 ? buildCactus(desertKit) : buildBones(desertKit);
      place(g); add(g, { kind: "desert" });
    }
    // Snow props (dark snow-capped pines, snowy boulders) — visible only deep in
    // the snow biome.
    const snowKit = makeSnowKit((g, m) => this._track(g, m));
    for (let i = 0; i < nProps(14); i++) {
      const g = Math.random() < 0.55 ? buildPine(snowKit) : buildSnowBoulder(snowKit);
      place(g); add(g, { kind: "snow" });
    }

    // Initialise ground heights.
    for (const it of this.scatter) {
      it.groundY = this.heightAt(it.obj.position.x, it.obj.position.z);
      it.obj.position.y = it.groundY + (it.float || 0);
    }
    scene.add(this.scatterGroup);
    this.objects.push(this.scatterGroup);
  }

  // Shrines, torii gates, towers, broken pillars, ruined walls and labyrinths.
  // Wall-like pieces become collision solids the player can't walk through.
  _buildStructures(scene) {
    const R = 150;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    this._track(box); this._track(cyl);

    const stone = new THREE.MeshStandardMaterial({ color: "#c3bdb0", roughness: 1, flatShading: true });
    const stoneDark = new THREE.MeshStandardMaterial({ color: "#9a9488", roughness: 1, flatShading: true });
    const woodM = new THREE.MeshStandardMaterial({ color: "#8a5a3b", roughness: 1, flatShading: true });
    const roofM = new THREE.MeshStandardMaterial({ color: "#4f6b5b", roughness: 0.9, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: "#e8c66a", roughness: 0.5, metalness: 0.3, flatShading: true });
    const toriiM = new THREE.MeshStandardMaterial({ color: "#c0432f", roughness: 0.8, flatShading: true });
    this._disp.push(stone, stoneDark, woodM, roofM, gold, toriiM);

    const place = (obj) => {
      const a = Math.random() * Math.PI * 2, r = 18 + Math.sqrt(Math.random()) * (R - 18);
      obj.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    };
    const addItem = (obj) => {
      this.scatterGroup.add(obj);
      // Clearance = the structure's own XZ half-size + the path corridor +
      // margin. Keep it (and its collision walls) off the line, here and on wrap.
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      const clear = 0.5 * Math.hypot(size.x, size.z) + PATH_HALF + 2.5;
      this._pushOffPath(obj.position, clear);
      obj.position.y = this.heightAt(obj.position.x, obj.position.z);
      this.scatter.push({ obj, kind: "ground", R, groundY: obj.position.y, phase: 0, clear });
    };
    // boxBlock: a scaled unit box; optionally a collision solid.
    const block = (w, h, d, mat, x, y, z, solid) => {
      const m = new THREE.Mesh(box, mat);
      m.scale.set(w, h, d); m.position.set(x, y, z);
      if (solid) this.solids.push({ mesh: m, hx: w / 2, hz: d / 2, hy: h / 2 });
      return m;
    };
    const column = (r, h, mat, x, z, solid) => {
      const m = new THREE.Mesh(cyl, mat);
      m.scale.set(r * 2, h, r * 2); m.position.set(x, h / 2, z);
      if (solid) this.solids.push({ mesh: m, hx: r, hz: r, hy: h / 2 });
      return m;
    };

    // Torii gates (walk through; the two posts are solid).
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.add(block(0.4, 4, 0.4, toriiM, -1.6, 2, 0, true));
      g.add(block(0.4, 4, 0.4, toriiM, 1.6, 2, 0, true));
      g.add(block(4.6, 0.45, 0.6, toriiM, 0, 4.1, 0));
      g.add(block(3.6, 0.3, 0.45, stoneDark, 0, 3.4, 0));
      g.rotation.y = Math.random() * Math.PI;
      place(g); addItem(g);
    }

    // Shrines / temples (solid body).
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.add(block(3.2, 0.6, 3.2, stoneDark, 0, 0.3, 0));
      g.add(block(2.2, 1.9, 2.2, stone, 0, 1.55, 0, true));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.5, 4), roofM);
      roof.position.y = 3.25; roof.rotation.y = Math.PI / 4; this._disp.push(roof.geometry); g.add(roof);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), gold);
      finial.position.y = 4.05; this._disp.push(finial.geometry); g.add(finial);
      g.add(this._makeBlob(2.0));
      g.rotation.y = Math.random() * Math.PI;
      place(g); addItem(g);
    }

    // Towers (solid shaft).
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const h = 6 + Math.random() * 4;
      g.add(column(1.1, h, stone, 0, 0, true));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.25, 6, 16), stoneDark);
      ring.position.y = h; ring.rotation.x = Math.PI / 2; this._disp.push(ring.geometry); g.add(ring);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.6, 8), roofM);
      cap.position.y = h + 0.8; this._disp.push(cap.geometry); g.add(cap);
      g.add(this._makeBlob(1.4));
      place(g); addItem(g);
    }

    // Broken pillars (solid).
    for (let i = 0; i < nProps(12); i++) {
      const g = new THREE.Group();
      g.add(column(0.4, 1.4 + Math.random() * 2.4, i % 2 ? stone : stoneDark, 0, 0, true));
      g.rotation.set((Math.random() - 0.5) * 0.15, Math.random() * Math.PI, (Math.random() - 0.5) * 0.15);
      place(g); addItem(g);
    }

    // Ruined wall segments (solid).
    for (let i = 0; i < nProps(14); i++) {
      const g = new THREE.Group();
      const len = 3 + Math.random() * 5, h = 1.6 + Math.random() * 1.6;
      if (Math.random() < 0.5) g.add(block(len, h, 0.7, stone, 0, h / 2, 0, true));
      else g.add(block(0.7, h, len, stone, 0, h / 2, 0, true));
      place(g); addItem(g);
    }

    // Labyrinths (a grid of walls + posts you can actually wander/get lost in).
    for (let m = 0; m < 2; m++) this._addLabyrinth(R, box, stone, stoneDark, place, addItem);
  }

  _addLabyrinth(R, box, stone, stoneDark, place, addItem) {
    const g = new THREE.Group();
    const N = 4, S = 6, h = 3.2, th = 0.7, off = -(N * S) / 2;
    const wall = (w, d, x, z, mat) => {
      const mesh = new THREE.Mesh(box, mat);
      mesh.scale.set(w, h, d); mesh.position.set(x, h / 2, z);
      g.add(mesh); this.solids.push({ mesh, hx: w / 2, hz: d / 2, hy: h / 2 });
    };
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) wall(0.9, 0.9, off + i * S, off + j * S, stoneDark);
    for (let i = 0; i < N; i++)
      for (let j = 0; j <= N; j++) if (Math.random() < 0.5) wall(S - 0.9, th, off + i * S + S / 2, off + j * S, stone);
    for (let i = 0; i <= N; i++)
      for (let j = 0; j < N; j++) if (Math.random() < 0.5) wall(th, S - 0.9, off + i * S, off + j * S + S / 2, stone);
    place(g); addItem(g);
  }

  // Circle-vs-AABB push-out against every wall solid. Height-aware: if the
  // player's feet are above a solid's top (minus a small margin), they hop over
  // it instead of being blocked — so low ruins/pillars are clearable but tall
  // towers/labyrinth walls still stop you.
  solveCollision(pos, radius, feetY) {
    const v = this._cv;
    for (const s of this.solids) {
      s.mesh.getWorldPosition(v);
      const solidTopY = v.y + s.hy;
      if (feetY > solidTopY - 0.3) continue; // cleared this wall's top — let it pass
      const dx = pos.x - v.x, dz = pos.z - v.z;
      const ex = s.hx + radius, ez = s.hz + radius;
      if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
        if (ex - Math.abs(dx) < ez - Math.abs(dz)) pos.x = v.x + (dx < 0 ? -ex : ex);
        else pos.z = v.z + (dz < 0 ? -ez : ez);
      }
    }
  }

  _buildSkyLife(scene) {
    this.lanterns = [];
    this.lanternGroup = new THREE.Group();
    const geo = new THREE.SphereGeometry(1.2, 16, 12);
    this._track(geo);
    const R = 200;
    for (let i = 0; i < 16; i++) {
      const hue = rand(0.05, 0.2) + (i % 3) * 0.0;
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.9, 0.7), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
      this._disp.push(m);
      const mesh = new THREE.Mesh(geo, m);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      mesh.position.set(Math.cos(a) * r, rand(28, 72), Math.sin(a) * r);
      this.lanternGroup.add(mesh);
      this.lanterns.push({ mesh, mat: m, R, alt: mesh.position.y, phase: rand(0, 6.28), drift: rand(-1.2, 1.2), base: rand(0.6, 1.3) });
    }
    scene.add(this.lanternGroup);
    this.objects.push(this.lanternGroup);
  }

  _buildClouds(scene) {
    this.clouds = [];
    this.cloudGroup = new THREE.Group();
    const blob = new THREE.SphereGeometry(1, 10, 8);
    this._track(blob);
    const mat = new THREE.MeshStandardMaterial({ color: "#2b3a4a", roughness: 1, transparent: true, opacity: 0.6, flatShading: true });
    this._disp.push(mat);
    const R = 240;
    for (let i = 0; i < PERF.clouds; i++) {
      const g = new THREE.Group();
      const puffs = 3 + Math.floor(Math.random() * 3);
      for (let p = 0; p < puffs; p++) {
        const m = new THREE.Mesh(blob, mat);
        m.position.set(rand(-4, 4), rand(-0.6, 0.6), rand(-2, 2));
        m.scale.set(rand(2, 4), rand(1.3, 2), rand(2, 3));
        g.add(m);
      }
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      g.position.set(Math.cos(a) * r, rand(45, 90), Math.sin(a) * r);
      this.cloudGroup.add(g);
      this.clouds.push({ g, R, drift: rand(0.5, 2) });
    }
    scene.add(this.cloudGroup);
    this.objects.push(this.cloudGroup);
  }

  // Expanding rings on the ground, fired on each beat.
  _buildRipples(scene) {
    this.ripples = [];
    const geo = new THREE.RingGeometry(0.8, 1.0, 48);
    geo.rotateX(-Math.PI / 2);
    this._track(geo);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      this._disp.push(m);
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      scene.add(mesh);
      this.ripples.push({ mesh, mat: m, life: 0 });
      this.objects.push(mesh);
    }
  }

  // Streaks across the sky on strong beats.
  _buildStars(scene) {
    this.stars = [];
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 6, 6);
    geo.rotateZ(Math.PI / 2);
    this._track(geo);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshBasicMaterial({ color: "#fff6d0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      this._disp.push(m);
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      scene.add(mesh);
      this.stars.push({ mesh, mat: m, life: 0, vel: new THREE.Vector3() });
      this.objects.push(mesh);
    }
  }

  _fireRipple(cam) {
    const r = this.ripples.find((x) => x.life <= 0);
    if (!r) return;
    r.mesh.position.set(cam.x, this.heightAt(cam.x, cam.z) + 0.3, cam.z);
    r.mesh.scale.setScalar(1);
    r.life = 1;
    r.mesh.visible = true;
  }

  _fireStar(cam) {
    const s = this.stars.find((x) => x.life <= 0);
    if (!s) return;
    const a = Math.random() * Math.PI * 2;
    s.mesh.position.set(cam.x + Math.cos(a) * 80, rand(60, 110), cam.z + Math.sin(a) * 80);
    s.vel.set(rand(-40, 40), rand(-8, -20), rand(-40, 40));
    s.mesh.lookAt(s.mesh.position.clone().add(s.vel));
    s.life = 1.4;
    s.mesh.visible = true;
  }

  update(dt, elapsed, bands, beat, cam, wave) {
    this._rebuild(cam.x, cam.z); // full rebuild only when crossing a cell
    this.sky.position.copy(cam);
    this.flash = Math.max(0, this.flash - dt * 5); // quick white blink on pickup

    // Photosensitivity / reduce-motion: scale every beat-driven FLASH term right
    // down (and skip shooting stars + soften ripples) so nothing strobes hard.
    const fm = this.reduceMotion ? 0.15 : 1;
    if (this.reduceMotion) this.flash *= 0.15; // damp the ring-pickup white flash (read by main.js/wizard)

    // --- day/night arc: sunset -> deep-night -> dawn base palette ---
    // Resolved each frame; the music reaction below layers ON TOP of these bases.
    const arc = this._sampleArc();
    // Dawn finale (Journey): warm the whole resolved keyframe so everything
    // downstream — sky, fog, moon->sun, water, night-scaled glows — follows.
    if (this.sunrise > 0) {
      const s = this.sunrise;
      arc.skyTop.lerp(DAWN_TOP, s * 0.9);
      arc.skyBot.lerp(DAWN_BOT, s * 0.85);
      arc.fog.lerp(DAWN_FOG, s * 0.8);
      arc.fogD *= 1 - s * 0.6;         // distance clears up in daylight
      arc.moonCol.lerp(DAWN_SUN, s * 0.9);
      arc.moon += s * 0.9;             // the "moon" light becomes the sun
      arc.waterSh.lerp(DAWN_WATER_SH, s * 0.8);
      arc.waterDp.lerp(DAWN_WATER_DP, s * 0.8);
      arc.night *= 1 - s * 0.95;
    }
    const night = arc.night; // 0..1, peaks mid-progress

    // --- global sky / light reaction (strong) ---
    this.skyMat.uniforms.time.value = elapsed;
    this.skyMat.uniforms.glow.value = bands.level * 0.5 + beat * 0.3 * fm;
    // Background base colours follow the arc, slowly drift, AND react to the music.
    const tH = Math.sin(elapsed * 0.035), tH2 = Math.sin(elapsed * 0.028 + 2.0);
    this.skyMat.uniforms.top.value.copy(arc.skyTop)
      .offsetHSL(tH * 0.14 + bands.treble * 0.15, Math.sin(elapsed * 0.05) * 0.08 + bands.mid * 0.15, Math.sin(elapsed * 0.05) * 0.05 + bands.mid * 0.12 + beat * 0.1);
    this.skyMat.uniforms.bot.value.copy(arc.skyBot)
      .offsetHSL(tH2 * 0.14 - bands.bass * 0.12, Math.sin(elapsed * 0.045 + 1.0) * 0.08, Math.sin(elapsed * 0.04) * 0.05 + bands.level * 0.12 + beat * 0.08);
    // At full daylight, lift the sky-derived background so it doesn't read dim.
    if (this.scene.background) this.scene.background.copy(arc.skyBot).multiplyScalar(0.5 + this.sunrise * 0.35);
    // Moon (sunLight) intensity + colour ramp across the arc, beat still kicks it;
    // deep sub energy adds a slow swell under the kick.
    this.sunLight.intensity = arc.moon + beat * 1.6 + bands.bass * 1.0 + (bands.sub || 0) * 0.6;
    this.sunLight.color.copy(arc.moonCol);

    // Bass heave: breathe the hills. sub drives the slow swell, the kick adds snap.
    if (this._terrainShader) {
      this._terrainShader.uniforms.uHeave.value = ((bands.sub || 0) * 0.8 + beat * 0.4) * fm;
      this._terrainShader.uniforms.uHeaveTime.value = elapsed;
    }
    // Daytime ambient lift (this.sunrise) so terrain isn't dark under the risen sun.
    this.hemi.intensity = (0.28 + night * 0.18 + this.sunrise * 0.5) + bands.level * 1.3 + beat * 0.7;
    this.scene.fog.color.copy(arc.fog);
    this.scene.fog.density = arc.fogD + bands.bass * 0.0065;
    // Hills get a subtle cool moonlit lift on the beat (no green wash).
    this.terrain.material.emissiveIntensity = 0.1 + bands.bass * 0.3 + beat * 0.45 * fm;

    // --- sun ---
    this.sunGroup.position.copy(cam).addScaledVector(this.sunDir, 420);
    const sunPulse = 1 + bands.level * 0.6 + beat * 0.6 * fm;
    this.sunGroup.scale.setScalar(sunPulse);
    this.sunGlow.opacity = 0.3 + bands.mid * 0.7 + beat * 0.5 * fm;
    this.sunMat.color.setHSL((0.12 - bands.bass * 0.06 + 1) % 1, 0.6, 0.85 + beat * 0.1 * fm);

    // --- winding path + waveform ---
    this._updatePath(cam, bands, beat, wave, elapsed, night, fm);

    // --- water ---
    this.water.position.set(cam.x, WATER_LEVEL, cam.z);
    this.waterMat.uniforms.time.value = elapsed;
    this.waterMat.uniforms.cam.value.copy(cam);
    this.waterMat.uniforms.glow.value = bands.level * 0.25 + beat * 0.2 * fm;
    this.waterMat.uniforms.shallow.value.copy(arc.waterSh); // day/night water tint
    this.waterMat.uniforms.deep.value.copy(arc.waterDp);

    // --- aurora ---
    this.aurora.position.set(cam.x, 115, cam.z);
    this.auroraMat.uniforms.time.value = elapsed;
    this.auroraMat.uniforms.cam.value.copy(cam);
    this.auroraMat.uniforms.energy.value = (0.22 + night * 0.28) + this.auroraBoost + bands.mid * 1.3 + bands.treble * 0.9 + beat * 0.4 * fm;
    this.auroraMat.uniforms.colA.value.setHSL((0.38 + bands.bass * 0.12) % 1, 0.8, 0.55);  // green
    this.auroraMat.uniforms.colB.value.setHSL((0.52 + bands.treble * 0.15) % 1, 0.8, 0.55); // teal-cyan

    // --- particles ---
    const p = this.particles.geometry.attributes.position, pa = p.array, half = this.spread / 2;
    for (let i = 0; i < p.count; i++) {
      pa[3 * i + 1] += (0.5 + bands.treble * 6 + beat * 4 * fm) * dt;
      if (pa[3 * i + 1] > 70) pa[3 * i + 1] = 0;
      let dx = pa[3 * i] - cam.x, dz = pa[3 * i + 2] - cam.z;
      if (dx > half) pa[3 * i] -= this.spread; else if (dx < -half) pa[3 * i] += this.spread;
      if (dz > half) pa[3 * i + 2] -= this.spread; else if (dz < -half) pa[3 * i + 2] += this.spread;
    }
    p.needsUpdate = true;
    // Treble sizes the fireflies; the airy top end adds a fine sparkle shimmer.
    this.pmat.size = 0.4 + bands.treble * 3.5 + (bands.air || 0) * 2.0 + beat * 2.0 * fm;
    this.pmat.opacity = (0.28 + night * 0.25) + bands.level * 0.7 + (bands.air || 0) * 0.2; // fireflies read brighter at night

    // --- scatter (wrap + reactive) ---
    for (const it of this.scatter) {
      const o = it.obj;
      let wrapped = false;
      let dx = o.position.x - cam.x, dz = o.position.z - cam.z;
      if (dx > it.R) { o.position.x -= it.R * 2; wrapped = true; }
      else if (dx < -it.R) { o.position.x += it.R * 2; wrapped = true; }
      if (dz > it.R) { o.position.z -= it.R * 2; wrapped = true; }
      else if (dz < -it.R) { o.position.z += it.R * 2; wrapped = true; }
      if (wrapped) {
        if (it.clear) this._pushOffPath(o.position, it.clear); // keep walls off the line
        it.groundY = this.heightAt(o.position.x, o.position.z);
      }

      if (it.kind === "crystal") {
        it.mat.emissiveIntensity = 0.4 + bands.bass * 3.8 + beat * 3 * fm;
        o.rotation.y += dt * (0.5 + beat * 3 * fm);
        o.position.y = it.groundY + 0.6 + beat * 0.6 * fm;
      } else if (it.kind === "orb") {
        const bob = Math.sin(elapsed * 1.2 + it.phase) * 0.5;
        o.position.y = it.groundY + it.float + bob + beat * 0.8 * fm;
        o.scale.setScalar(it.base * (1 + bands.treble * 1.5 + beat * 1.1 * fm));
        it.mat.color.setHSL((it.hue + elapsed * 0.03) % 1, 0.85, 0.6 + bands.level * 0.25);
        it.mat.opacity = 0.7 + bands.level * 0.3;
      } else {
        o.position.y = it.groundY; // veg + structures + biome props sit on the ground
        if (it.kind === "veg") o.visible = desertMask(o.position.x, o.position.z) < 0.35 && snowMask(o.position.x, o.position.z) < 0.35;
        else if (it.kind === "desert") o.visible = desertMask(o.position.x, o.position.z) > 0.45;
        else if (it.kind === "snow") o.visible = snowMask(o.position.x, o.position.z) > 0.45;
      }
    }

    // --- sky lanterns ---
    for (const l of this.lanterns) {
      const m = l.mesh;
      m.position.x += l.drift * dt;
      let dx = m.position.x - cam.x, dz = m.position.z - cam.z;
      if (dx > l.R) m.position.x -= l.R * 2; else if (dx < -l.R) m.position.x += l.R * 2;
      if (dz > l.R) m.position.z -= l.R * 2; else if (dz < -l.R) m.position.z += l.R * 2;
      m.position.y = l.alt + Math.sin(elapsed * 0.5 + l.phase) * 2;
      m.scale.setScalar(l.base * (1 + night * 0.2 + bands.mid * 0.6 + beat * 0.5 * fm));
      m.material.opacity = (0.6 + night * 0.35) + bands.mid * 0.3; // brighter at night
    }

    // --- clouds ---
    for (const c of this.clouds) {
      c.g.position.x += c.drift * dt;
      let dx = c.g.position.x - cam.x, dz = c.g.position.z - cam.z;
      if (dx > c.R) c.g.position.x -= c.R * 2; else if (dx < -c.R) c.g.position.x += c.R * 2;
      if (dz > c.R) c.g.position.z -= c.R * 2; else if (dz < -c.R) c.g.position.z += c.R * 2;
    }

    // --- triggers ---
    this._beatCd -= dt; this._starCd -= dt;
    if (beat > 0.55 && this._beatCd <= 0) { this._fireRipple(cam); this._beatCd = 0.22; }
    // Shooting stars strobe hard across the sky — skip them entirely in reduce-motion.
    if (!this.reduceMotion && beat > 0.85 && this._starCd <= 0) { this._fireStar(cam); this._starCd = 1.5; }

    for (const r of this.ripples) {
      if (r.life <= 0) continue;
      r.life -= dt * 0.8;
      const s = 1 + (1 - r.life) * 40;
      r.mesh.scale.setScalar(s);
      r.mat.opacity = Math.max(0, r.life) * 0.5 * fm; // soften beat ripples in reduce-motion
      if (r.life <= 0) r.mesh.visible = false;
    }
    for (const s of this.stars) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mat.opacity = Math.max(0, Math.min(1, s.life)) * 0.9;
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  dispose(scene) {
    // Audited (WP6): every geometry/material/texture created in init() is routed
    // into this._disp — via _track() (grain texture, sky/water/aurora shader mats,
    // path + waveform geo/mats, scatter & structure & collectible geos/mats,
    // ripple/star/lantern/cloud geos) or via _track callbacks in props.js
    // (desert/snow kits) and direct _disp.push() for the per-instance materials
    // (lamp orbs, collectibles, foliage, mushroom caps, crystals, orbs, lanterns,
    // shrine roofs/finials, tower rings/caps). Every scene-added node lives in
    // this.objects. So removing all objects + disposing all _disp frees everything.
    for (const o of this.objects) scene.remove(o);
    for (const d of this._disp) { try { d.dispose(); } catch {} }
    this._disp = [];
    this.objects = [];
    this.solids = [];
    scene.fog = null;
  }
}
