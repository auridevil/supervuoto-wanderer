import * as THREE from "three";
import { PERF } from "./perf.js";

// A flock of birds drifting over the wanderer — boids-lite (cohere to a slowly
// orbiting centre + circulate + wander), scattering outward on strong beats then
// reforming. One InstancedMesh of chevrons; wings flap in the vertex shader.

const rand = (a, b) => a + Math.random() * (b - a);

export class Flock {
  constructor(scene) {
    this.scene = scene;
    this._disp = [];
    this.reduceMotion = false;
    const N = PERF.fauna;

    // Chevron: a flat plane spread along X (wings), tips swept slightly back (+z).
    const geo = new THREE.PlaneGeometry(1.4, 0.7, 4, 1);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.abs(p.getX(i)) * 0.25);
    geo.computeVertexNormals();
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) phase[i] = rand(0, 6.28);
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    this._disp.push(geo);

    const mat = new THREE.MeshBasicMaterial({ color: "#cdd6e8", transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    this._disp.push(mat);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uFlap = { value: 0 };
      sh.vertexShader = "attribute float aPhase;\nuniform float uFlap;\n" + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float w = abs(position.x);
         transformed.y += sin(uFlap * 9.0 + aPhase) * w * w * 0.9;` // wing-tip flap
      );
      this._sh = sh;
    };
    mat.customProgramCacheKey = () => "bird-flap";

    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.center = new THREE.Vector3(0, 46, 0);
    this._dummy = new THREE.Object3D();
    this._scatter = 0;
    this._init = false;
    this.birds = [];
    for (let i = 0; i < N; i++) this.birds.push({ p: new THREE.Vector3(), v: new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)) });
  }

  update(dt, elapsed, cam, beat) {
    const c = this.center;
    if (!this._init) {
      this._init = true;
      c.set(cam.x, 46, cam.z);
      for (const b of this.birds) b.p.set(cam.x + rand(-40, 40), rand(35, 55), cam.z + rand(-40, 40));
    }
    // Flock centre slowly orbits the walker at altitude.
    const ang = elapsed * 0.08;
    c.x += (cam.x + Math.cos(ang) * 40 - c.x) * Math.min(1, dt * 0.5);
    c.z += (cam.z + Math.sin(ang) * 40 - c.z) * Math.min(1, dt * 0.5);
    c.y = 46 + Math.sin(elapsed * 0.3) * 4;

    if (beat > 0.8 && this._scatter < 0.2) this._scatter = this.reduceMotion ? 0.35 : 1;
    this._scatter *= Math.pow(0.25, dt);
    const cohesion = 0.6 * (1 - this._scatter);

    for (const b of this.birds) {
      const to = c.clone().sub(b.p);
      const dist = to.length() || 1;
      to.multiplyScalar(1 / dist);
      b.v.addScaledVector(to, cohesion * dt * (dist > 50 ? 3 : 1)); // steer to centre (harder if far)
      b.v.x += -to.z * dt * 0.8; b.v.z += to.x * dt * 0.8;          // circulate
      if (this._scatter > 0.01) { b.v.addScaledVector(to, -this._scatter * 8 * dt); b.v.y += (Math.random() - 0.5) * this._scatter * 6 * dt; }
      b.v.x += (Math.random() - 0.5) * dt * 2; b.v.z += (Math.random() - 0.5) * dt * 2; // wander
      b.v.y += (c.y - b.p.y) * 0.5 * dt;                            // hold altitude
      const sp = b.v.length(), max = 10, min = 3.5;
      if (sp > max) b.v.multiplyScalar(max / sp); else if (sp > 0.001 && sp < min) b.v.multiplyScalar(min / sp);
      b.p.addScaledVector(b.v, dt);
    }

    const d = this._dummy;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      d.position.copy(b.p);
      d.lookAt(b.p.x + b.v.x, b.p.y + b.v.y, b.p.z + b.v.z);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this._sh) this._sh.uniforms.uFlap.value = elapsed;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    for (const d of this._disp) { try { d.dispose(); } catch {} }
    this._disp = [];
  }
}
