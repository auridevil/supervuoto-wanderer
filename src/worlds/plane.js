import * as THREE from "three";

// An endless reflective grid under a glowing horizon, with slow abstract shapes.
export class PlaneWorld {
  constructor() {
    this.name = "Infinite Plane";
    this.heightAt = () => 0;
    this.objects = [];
  }

  init(scene) {
    this.scene = scene;
    scene.background = new THREE.Color("#0a0a16");
    scene.fog = new THREE.Fog("#1a1140", 30, 220);

    this.ambient = new THREE.AmbientLight("#5566ff", 0.4);
    this.key = new THREE.PointLight("#ff7bd5", 2.0, 200);
    this.key.position.set(0, 30, 0);
    scene.add(this.ambient, this.key);

    // ---- horizon glow dome ----
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        glow: { value: new THREE.Color("#ff4fa3") },
        sky: { value: new THREE.Color("#0a0a18") },
        pulse: { value: 0 },
      },
      vertexShader: `varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 glow; uniform vec3 sky; uniform float pulse; varying float h;
        void main(){
          float band = exp(-abs(h)*7.0);          // bright band at the horizon
          float up = clamp(h,0.0,1.0);
          vec3 c = mix(sky, glow, band*(0.6+pulse));
          c = mix(c, sky*0.4, up*0.7);
          gl_FragColor = vec4(c,1.0);
        }`,
    });
    this.skyGeo = new THREE.SphereGeometry(600, 32, 16); // kept so dispose() can free it
    this.sky = new THREE.Mesh(this.skyGeo, this.skyMat);
    scene.add(this.sky);

    // ---- infinite grid floor ----
    this.floorMat = new THREE.ShaderMaterial({
      transparent: true,
      extensions: { derivatives: true },
      uniforms: {
        cam: { value: new THREE.Vector3() },
        gridColor: { value: new THREE.Color("#36e6ff") },
        baseColor: { value: new THREE.Color("#0b0b1c") },
        fogColor: { value: new THREE.Color("#1a1140") },
        fogNear: { value: 30 },
        fogFar: { value: 220 },
        energy: { value: 0 },
      },
      vertexShader: `
        uniform vec3 cam; varying vec3 wpos;
        void main(){
          wpos = position + vec3(cam.x, 0.0, cam.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(cam.x,0.0,cam.z),1.0);
        }`,
      fragmentShader: `
        uniform vec3 gridColor, baseColor, fogColor; uniform float fogNear, fogFar, energy;
        uniform vec3 cam; varying vec3 wpos;
        float line(vec2 p, float w){
          vec2 g = abs(fract(p) - 0.5);
          vec2 d = g / fwidth(p);
          float l = min(d.x, d.y);
          return 1.0 - clamp(l - w, 0.0, 1.0);
        }
        void main(){
          float small = line(wpos.xz * 0.5, 0.0);
          float big = line(wpos.xz * 0.05, 0.0) * 1.4;
          float grid = clamp(small * 0.6 + big, 0.0, 1.0);
          vec3 col = mix(baseColor, gridColor * (1.2 + energy*2.5), grid);
          float dist = length(wpos.xz - cam.xz);
          float fog = clamp((dist - fogNear) / (fogFar - fogNear), 0.0, 1.0);
          col = mix(col, fogColor, fog);
          float alpha = mix(1.0, 0.0, fog*0.7);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    const floorGeo = new THREE.PlaneGeometry(500, 500, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(floorGeo, this.floorMat);
    scene.add(this.floor);

    // ---- floating abstract shapes ----
    this.shapes = new THREE.Group();
    const geos = [
      new THREE.IcosahedronGeometry(2.2, 0),
      new THREE.TorusGeometry(2, 0.5, 12, 24),
      new THREE.OctahedronGeometry(2.4, 0),
      new THREE.DodecahedronGeometry(2.2, 0),
    ];
    this.shapeData = [];
    for (let i = 0; i < 26; i++) {
      const geo = geos[i % geos.length];
      const hue = (i / 26 + 0.5) % 1;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.7, 0.6),
        emissive: new THREE.Color().setHSL(hue, 0.8, 0.4),
        emissiveIntensity: 1.0,
        roughness: 0.3,
        metalness: 0.6,
        wireframe: i % 3 === 0,
      });
      const m = new THREE.Mesh(geo, mat);
      const r = 20 + Math.random() * 90;
      const a = Math.random() * Math.PI * 2;
      m.position.set(Math.cos(a) * r, 4 + Math.random() * 24, Math.sin(a) * r);
      const s = 0.6 + Math.random() * 1.6;
      m.scale.setScalar(s);
      this.shapes.add(m);
      this.shapeData.push({
        baseScale: s,
        spin: new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(0.6),
        bobPhase: Math.random() * Math.PI * 2,
        baseEmissive: 1.0,
      });
    }
    scene.add(this.shapes);

    this.shapeGeos = geos;
    this.objects = [this.ambient, this.key, this.sky, this.floor, this.shapes];
  }

  update(dt, elapsed, bands, beat, cam) {
    this.sky.position.copy(cam);
    this.floorMat.uniforms.cam.value.copy(cam);
    this.floorMat.uniforms.energy.value = bands.bass * 0.8 + beat * 0.6;
    this.skyMat.uniforms.pulse.value = bands.mid * 0.8 + beat * 0.5;
    this.skyMat.uniforms.glow.value.setHSL((0.9 + bands.treble * 0.2) % 1, 0.85, 0.55);

    this.key.intensity = 1.5 + beat * 3 + bands.bass * 1.5;
    this.key.position.set(cam.x, 30 + Math.sin(elapsed * 0.3) * 8, cam.z);

    const range = 130;
    for (let i = 0; i < this.shapes.children.length; i++) {
      const m = this.shapes.children[i];
      const d = this.shapeData[i];
      m.rotation.x += d.spin.x * dt;
      m.rotation.y += d.spin.y * dt;
      m.rotation.z += d.spin.z * dt;
      m.position.y += Math.sin(elapsed * 0.4 + d.bobPhase) * dt * 1.2;
      const pump = 1 + bands.bass * 0.4 + beat * 0.5;
      m.scale.setScalar(d.baseScale * pump);
      m.material.emissiveIntensity = d.baseEmissive + bands.treble * 2.5 + beat * 2;
      // keep shapes around the player so the field feels endless
      if (m.position.x - cam.x > range) m.position.x -= range * 2;
      else if (m.position.x - cam.x < -range) m.position.x += range * 2;
      if (m.position.z - cam.z > range) m.position.z -= range * 2;
      else if (m.position.z - cam.z < -range) m.position.z += range * 2;
    }
  }

  dispose(scene) {
    for (const o of this.objects) scene.remove(o);
    this.floor.geometry.dispose();
    this.floorMat.dispose();
    this.skyGeo.dispose(); // was leaking: sky sphere geometry was never freed
    this.skyMat.dispose();
    for (const g of this.shapeGeos) g.dispose();
    for (const m of this.shapes.children) m.material.dispose();
    this.objects = []; // drop refs so the whole world graph can be GC'd
    scene.fog = null;
  }
}
