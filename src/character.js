import * as THREE from "three";

// A small, serene sage-traveler: pilgrim sun-hat, layered cloak that sways as he
// walks, a shoulder mantle, a neck scarf, satchel with a bedroll, a water gourd,
// prayer beads, boots, and a walking staff with a hanging lantern that breathes
// with the music. Earthy palette, not a purple wizard.
export class Wizard {
  constructor() {
    this.group = new THREE.Group();
    this.phase = 0;
    this.facing = 0;
    this.reduceMotion = false; // photosensitivity: damp pickup flash + halo/aura strobing (main.js sets it)
    this.build();
    this.group.scale.setScalar(0.92); // a touch smaller than human-eye scale
    this.group.visible = false;
  }

  build() {
    const M = (c, r = 0.9, flat = true) => new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: flat });
    const tunic = M("#cdb892");      // warm sand
    const cloak = M("#4f6b5b");      // travelled teal-green
    const mantleM = M("#3c5347");    // darker shoulder mantle
    const leather = M("#6b4a32");    // pack / straps / boots
    const rust = M("#b5683a");       // sash / hat band / scarf
    const skin = M("#e8c39e");
    const beardMat = M("#efeae0");
    const straw = M("#d8b46a");      // sun-hat
    const wood = M("#7a5230", 1);
    const gourdM = M("#c9a24a");     // water gourd
    const beadM = M("#7a5230", 0.5); // prayer beads
    // Body materials we can flash red when a ring is collected.
    this.bodyMats = [tunic, cloak, mantleM, leather, rust, skin, beardMat, straw, wood, gourdM, beadM];

    // ---- legs + boots ----
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.42, 4, 8);
    const bootGeo = new THREE.BoxGeometry(0.22, 0.14, 0.34);
    this.legL = new THREE.Mesh(legGeo, leather);
    this.legR = new THREE.Mesh(legGeo, leather);
    this.legL.position.set(-0.17, 0.34, 0);
    this.legR.position.set(0.17, 0.34, 0);
    this.bootL = new THREE.Mesh(bootGeo, leather); this.bootL.position.set(0, -0.28, 0.05); this.legL.add(this.bootL);
    this.bootR = new THREE.Mesh(bootGeo, leather); this.bootR.position.set(0, -0.28, 0.05); this.legR.add(this.bootR);
    this.group.add(this.legL, this.legR);

    // ---- tunic / robe (knee length, tapered) ----
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.56, 1.05, 12, 1), tunic);
    robe.position.y = 1.02;
    this.group.add(robe);
    // belt
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.12, 12), rust);
    belt.position.y = 0.66;
    this.group.add(belt);
    // a hanging pouch + a water gourd on the belt
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.1), leather);
    pouch.position.set(-0.34, 0.6, 0.18);
    this.group.add(pouch);
    const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), gourdM);
    gourd.scale.set(1, 1.3, 1); gourd.position.set(0.36, 0.56, 0.16);
    this.group.add(gourd);
    const gourdNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 8), gourdM);
    gourdNeck.position.set(0.36, 0.72, 0.16);
    this.group.add(gourdNeck);

    // ---- long cloak on a shoulder pivot, so it can sway/lag as he walks ----
    this.cloakPivot = new THREE.Group();
    this.cloakPivot.position.set(0, 1.5, -0.04);
    const cloakGeo = new THREE.CylinderGeometry(0.42, 0.62, 1.2, 14, 1, true, Math.PI * 0.5, Math.PI);
    const cape = new THREE.Mesh(cloakGeo, cloak);
    cape.material.side = THREE.DoubleSide;
    cape.position.set(0, -0.42, 0.02);
    cape.scale.z = 0.85;
    this.cloakPivot.add(cape);
    this.group.add(this.cloakPivot);

    // ---- shoulder mantle (short cape over the shoulders) ----
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.5, 16, 1, true), mantleM);
    mantle.material.side = THREE.DoubleSide;
    mantle.position.set(0, 1.42, 0);
    this.group.add(mantle);
    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 16), mantleM);
    collar.position.set(0, 1.54, 0);
    collar.rotation.x = Math.PI / 2;
    this.group.add(collar);

    // ---- neck scarf with a hanging, swaying end ----
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 16), rust);
    scarf.position.set(0, 1.5, 0.02); scarf.rotation.x = Math.PI / 2;
    this.group.add(scarf);
    this.scarfEnd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.04), rust);
    this.scarfEnd.position.set(0.12, 1.28, 0.12);
    this.group.add(this.scarfEnd);
    // prayer beads
    const beads = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 20), beadM);
    beads.position.set(0, 1.36, 0.08); beads.rotation.x = Math.PI / 2.3;
    this.group.add(beads);

    // ---- backpack + bedroll ----
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.22), leather);
    pack.position.set(0, 1.18, -0.34);
    this.group.add(pack);
    const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 10), tunic);
    bedroll.rotation.z = Math.PI / 2;
    bedroll.position.set(0, 1.46, -0.34);
    this.group.add(bedroll);
    for (const sx of [-0.16, 0.16]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.05), rust);
      strap.position.set(sx, 1.25, 0.16);
      strap.rotation.x = 0.1;
      this.group.add(strap);
    }

    // ---- arms + hands (left swings; right grips the staff) ----
    const armGeo = new THREE.CapsuleGeometry(0.095, 0.5, 4, 8);
    const handGeo = new THREE.SphereGeometry(0.1, 10, 8);
    this.armL = new THREE.Mesh(armGeo, tunic);
    this.armR = new THREE.Mesh(armGeo, tunic);
    this.armL.position.set(-0.42, 1.2, 0);
    this.armR.position.set(0.42, 1.2, 0);
    const handL = new THREE.Mesh(handGeo, skin); handL.position.set(0, -0.32, 0); this.armL.add(handL);
    const handR = new THREE.Mesh(handGeo, skin); handR.position.set(0, -0.32, 0); this.armR.add(handR);
    this.armR.rotation.x = -0.7; // reach forward to hold the staff
    this.group.add(this.armL, this.armR);

    // ---- head ----
    this.head = new THREE.Group();
    this.head.position.y = 1.66;
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), skin);
    this.head.add(headMesh);
    // nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), skin);
    nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.02, 0.25);
    this.head.add(nose);
    // beard (two layers for some bulk)
    const beard1 = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.62, 10, 1, true), beardMat);
    beard1.position.set(0, -0.33, 0.06); beard1.rotation.x = Math.PI; beard1.scale.z = 0.65;
    this.head.add(beard1);
    const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.08), beardMat);
    moustache.position.set(0, -0.06, 0.22);
    this.head.add(moustache);
    // eyes + brows
    const eyeGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: "#2b2b3a" });
    const browGeo = new THREE.BoxGeometry(0.1, 0.025, 0.04);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * 0.1, 0.04, 0.23);
      this.head.add(eye);
      const brow = new THREE.Mesh(browGeo, beardMat);
      brow.position.set(sx * 0.1, 0.11, 0.23); brow.rotation.z = -sx * 0.2;
      this.head.add(brow);
    }
    // ---- pilgrim sun-hat (wide brim + low crown + band) ----
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.035, 20), straw);
    brim.position.y = 0.24; brim.rotation.z = 0.04; // a slightly rakish tilt
    this.head.add(brim);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.32, 20), straw);
    crown.position.y = 0.4; crown.rotation.z = 0.04;
    this.head.add(crown);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 8, 20), rust);
    band.position.y = 0.27; band.rotation.x = Math.PI / 2;
    this.head.add(band);
    this.group.add(this.head);

    // ---- faint sage halo (subtle, golden) ----
    this.haloMat = new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.02, 8, 32), this.haloMat);
    this.halo.position.set(0, 1.74, -0.12);
    this.group.add(this.halo);

    // Enlightenment aura — glows when the sage walks on the waveform.
    this.auraMat = new THREE.MeshBasicMaterial({ color: "#fff0b0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14), this.auraMat);
    this.aura.position.y = 1.1;
    this.aura.visible = false;
    this.group.add(this.aura);

    // Contact shadow blob under the sage (kept on the ground during bob/jump).
    const bc = document.createElement("canvas");
    bc.width = bc.height = 64;
    const bx = bc.getContext("2d");
    const bgrad = bx.createRadialGradient(32, 32, 0, 32, 32, 32);
    bgrad.addColorStop(0, "rgba(0,0,0,0.8)");
    bgrad.addColorStop(0.55, "rgba(0,0,0,0.35)");
    bgrad.addColorStop(1, "rgba(0,0,0,0)");
    bx.fillStyle = bgrad; bx.fillRect(0, 0, 64, 64);
    this.blobTex = new THREE.CanvasTexture(bc);
    this.blobMat = new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, opacity: 0.55, depthWrite: false });
    const blobGeo = new THREE.CircleGeometry(0.95, 24);
    blobGeo.rotateX(-Math.PI / 2);
    this.blob = new THREE.Mesh(blobGeo, this.blobMat);
    this.blob.renderOrder = 1;
    this.group.add(this.blob);

    // ---- walking staff with a hanging lantern (reactive) ----
    this.staff = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.05, 8), wood);
    pole.position.y = 1.0;
    this.staff.add(pole);
    // little hook at the top
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI * 1.3), wood);
    hook.position.set(0.07, 1.95, 0); hook.rotation.z = Math.PI / 2;
    this.staff.add(hook);
    // lantern: cage rings + roof + glowing orb
    const lantern = new THREE.Group();
    const lroof = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.1, 8), leather);
    lroof.position.y = 0.14; lantern.add(lroof);
    for (const yy of [0.1, -0.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14), leather);
      ring.position.y = yy; ring.rotation.x = Math.PI / 2; lantern.add(ring);
    }
    this.orbMat = new THREE.MeshBasicMaterial({ color: "#ffd27a" });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), this.orbMat);
    lantern.add(this.orb);
    this.orbLight = new THREE.PointLight("#ffd27a", 1.5, 9);
    lantern.add(this.orbLight);
    lantern.position.set(0.16, 1.78, 0.05);
    this.staff.add(lantern);
    this.staff.position.set(0.46, 0, 0.2);
    this.group.add(this.staff);
  }

  update(dt, elapsed, pos, groundY, yaw, speed, vel, bands, beat, jumpOffset = 0, enlightened = 0, flash = 0) {
    let target = speed > 0.3 ? Math.atan2(vel.x, vel.z) : -yaw;
    let diff = ((target - this.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.facing += diff * Math.min(1, dt * 8);
    const lean = Math.min(speed, 6) / 6 * 0.08; // lean into the stride
    this.group.rotation.set(lean, this.facing, 0);

    this.phase += speed * dt * 1.1;
    const sw = Math.sin(this.phase);
    const idle = Math.sin(elapsed * 1.5) * 0.04;
    const walkAmt = Math.min(1, speed / 6);

    // Legs swing at the hip; boots flick at the end of each step.
    this.legL.rotation.x = sw * 0.5 * walkAmt;
    this.legR.rotation.x = -sw * 0.5 * walkAmt;
    this.bootL.rotation.x = Math.max(0, sw) * 0.5 * walkAmt;
    this.bootR.rotation.x = Math.max(0, -sw) * 0.5 * walkAmt;
    // Left arm swings freely; right stays forward gripping the staff.
    this.armL.rotation.x = -sw * 0.4 * walkAmt;
    this.armR.rotation.x = -0.7 + sw * 0.05 * walkAmt;
    this.head.rotation.z = sw * 0.04 * walkAmt;
    this.head.rotation.x = lean * 0.5 + Math.sin(elapsed * 1.2) * 0.02;

    // Cloak lags behind the walk: leans back with speed, sways side to side.
    this.cloakPivot.rotation.x = 0.12 + walkAmt * 0.28 + Math.sin(this.phase * 0.5) * 0.05 * walkAmt;
    this.cloakPivot.rotation.z = -sw * 0.08 * walkAmt;
    // Scarf end flutters.
    this.scarfEnd.rotation.x = 0.2 + Math.sin(this.phase + 1) * 0.25 * walkAmt + Math.sin(elapsed * 2) * 0.06;

    const bob = Math.abs(sw) * 0.08 * walkAmt + idle;
    this.group.position.set(pos.x, groundY + bob + 0.05 + jumpOffset, pos.z);
    if (jumpOffset > 0.1) { this.legL.rotation.x = -0.5; this.legR.rotation.x = -0.5; }

    // Staff plants with each stride (a small tap), and swings with the lean.
    this.staff.rotation.z = 0.06 + Math.sin(this.phase) * 0.05 * walkAmt;
    this.staff.position.y = Math.max(0, -Math.sin(this.phase)) * 0.04 * walkAmt;

    // Keep the contact shadow on the ground; soften/grow it as the sage rises.
    const lift = bob + jumpOffset;
    this.blob.position.y = (0.06 - lift) / 0.92; // counter group bob/jump (group is scaled 0.92)
    this.blob.scale.setScalar(1 + jumpOffset * 0.12);   // grows as he rises
    this.blobMat.opacity = 0.55 / (1 + jumpOffset * 0.5); // and fades

    // Music: halo shimmer + lantern glow; enlightenment when on the waveform.
    // Reduce-motion: scale the beat-driven strobe terms + the white pickup flash
    // right down so the sage doesn't flicker hard.
    const fm = this.reduceMotion ? 0.15 : 1;
    const e = enlightened;
    const haloPulse = (1 + bands.treble * 0.5 + beat * 0.4 * fm) * (1 + e * 0.9);
    this.halo.scale.setScalar(haloPulse);
    this.haloMat.opacity = 0.3 + bands.treble * 0.35 + beat * 0.25 * fm + e * 0.6;
    this.haloMat.color.setHSL(0.13, 0.9, 0.62 + e * 0.25); // gold, brighter when enlightened
    this.halo.rotation.z += dt * (0.5 + e * 2.5);

    this.aura.visible = e > 0.02;
    // The aura's sine-strobe softens toward a steady glow in reduce-motion.
    this.auraMat.opacity = e * 0.4 * (0.7 + 0.3 * fm * Math.sin(elapsed * 5));
    this.aura.scale.setScalar(1 + e * 0.5 + bands.bass * 0.2 + beat * 0.2 * fm);

    // White flash when a ring is collected (damped in reduce-motion).
    const fr = flash * 0.95 * fm;
    for (const m of this.bodyMats) m.emissive.setRGB(fr, fr, fr);

    this.orb.scale.setScalar(1 + bands.bass * 1.0 + beat * 0.8);
    this.orbLight.intensity = 1.2 + bands.bass * 5 + beat * 5;
    const hue = (0.1 + bands.mid * 0.12) % 1; // warm amber lantern
    this.orbMat.color.setHSL(hue, 0.85, 0.65);
    this.orbLight.color.setHSL(hue, 0.85, 0.65);
  }
}
