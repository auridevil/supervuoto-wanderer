import * as THREE from "three";

// Builder helpers for biome-specific ground props. Each builder returns a
// THREE.Group whose origin sits on the ground (y=0). Geometries/materials are
// shared where possible; pass the world's _disp array so they get freed on
// dispose. Low-poly, flat-shaded, muted palette to match the rest of the world.

const rand = (a, b) => a + Math.random() * (b - a);

// --- Desert ---------------------------------------------------------------

// Shared desert geometries/materials, created once and reused across instances.
export function makeDesertKit(track) {
  const armGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.0, 7);
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.0, 8);
  const cactusMat = new THREE.MeshStandardMaterial({ color: "#5c7349", roughness: 1, flatShading: true });
  const boneMat = new THREE.MeshStandardMaterial({ color: "#cabfa3", roughness: 1, flatShading: true });
  const shrubMat = new THREE.MeshStandardMaterial({ color: "#7a6a4a", roughness: 1, flatShading: true });
  const boneGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6);
  const skullGeo = new THREE.IcosahedronGeometry(0.28, 0);
  const twigGeo = new THREE.CylinderGeometry(0.04, 0.06, 1.0, 5);
  track(armGeo, cactusMat); track(trunkGeo, boneMat); track(boneGeo, shrubMat);
  track(skullGeo); track(twigGeo);
  return { armGeo, trunkGeo, cactusMat, boneMat, shrubMat, boneGeo, skullGeo, twigGeo };
}

// A saguaro-like cactus: a vertical trunk with 1-2 upturned arms.
export function buildCactus(kit) {
  const g = new THREE.Group();
  const h = rand(2.2, 3.6);
  const trunk = new THREE.Mesh(kit.trunkGeo, kit.cactusMat);
  trunk.scale.set(1, h, 1); trunk.position.y = h / 2; g.add(trunk);
  const arms = 1 + (Math.random() < 0.6 ? 1 : 0);
  for (let a = 0; a < arms; a++) {
    const side = a === 0 ? 1 : -1;
    const armH = rand(0.8, 1.3);
    const elbowY = rand(h * 0.4, h * 0.7);
    // Horizontal stub off the trunk.
    const stub = new THREE.Mesh(kit.armGeo, kit.cactusMat);
    stub.scale.set(0.7, 0.6, 0.7);
    stub.rotation.z = side * Math.PI / 2;
    stub.position.set(side * 0.4, elbowY, 0);
    g.add(stub);
    // Vertical arm rising from the elbow.
    const arm = new THREE.Mesh(kit.armGeo, kit.cactusMat);
    arm.scale.set(0.8, armH, 0.8);
    arm.position.set(side * 0.72, elbowY + armH * 0.5, 0);
    g.add(arm);
  }
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

// Bleached bones / a dead shrub: a low pale tangle of twigs (optionally a skull).
export function buildBones(kit) {
  const g = new THREE.Group();
  if (Math.random() < 0.5) {
    // Scattered ribs/bones lying low.
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(kit.boneGeo, kit.boneMat);
      b.scale.set(rand(0.7, 1.2), rand(0.6, 1.1), rand(0.7, 1.2));
      b.rotation.set(Math.PI / 2 + rand(-0.3, 0.3), rand(0, Math.PI), rand(-0.4, 0.4));
      b.position.set(rand(-0.4, 0.4), 0.12, rand(-0.4, 0.4));
      g.add(b);
    }
    if (Math.random() < 0.4) {
      const skull = new THREE.Mesh(kit.skullGeo, kit.boneMat);
      skull.position.set(rand(-0.3, 0.3), 0.25, rand(-0.3, 0.3));
      g.add(skull);
    }
  } else {
    // Dead shrub: a few splayed twigs.
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = new THREE.Mesh(kit.twigGeo, kit.shrubMat);
      const th = rand(0.8, 1.6);
      t.scale.set(1, th, 1);
      t.rotation.set(rand(-0.5, 0.5), rand(0, Math.PI), rand(-0.5, 0.5));
      t.position.y = th * 0.45;
      g.add(t);
    }
  }
  return g;
}

// --- Snow -----------------------------------------------------------------

export function makeSnowKit(track) {
  const tierGeo = new THREE.ConeGeometry(1.0, 1.6, 7);
  const capGeo = new THREE.ConeGeometry(0.85, 1.0, 7);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.8, 6);
  const pineMat = new THREE.MeshStandardMaterial({ color: "#2b4438", roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: "#eef3f8", roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#4a3a2e", roughness: 1, flatShading: true });
  const rockGeo = new THREE.IcosahedronGeometry(1.0, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: "#5b5f68", roughness: 1, flatShading: true });
  const rockCapGeo = new THREE.SphereGeometry(1.0, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  track(tierGeo, pineMat); track(capGeo, snowMat); track(trunkGeo, trunkMat);
  track(rockGeo, rockMat); track(rockCapGeo);
  return { tierGeo, capGeo, trunkGeo, pineMat, snowMat, trunkMat, rockGeo, rockMat, rockCapGeo };
}

// A dark pine: a short trunk, 2-3 stacked dark-green cone tiers, snow-cap on top.
export function buildPine(kit) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(kit.trunkGeo, kit.trunkMat);
  trunk.position.y = 0.4; g.add(trunk);
  const tiers = 2 + (Math.random() < 0.6 ? 1 : 0);
  let y = 0.8;
  const baseW = rand(0.9, 1.25);
  for (let i = 0; i < tiers; i++) {
    const shrink = 1 - i * 0.22;
    const tier = new THREE.Mesh(kit.tierGeo, kit.pineMat);
    tier.scale.set(baseW * shrink, 1, baseW * shrink);
    tier.position.y = y + 0.8;
    g.add(tier);
    y += 1.05;
  }
  // White snow-cap cone crowning the tree.
  const cap = new THREE.Mesh(kit.capGeo, kit.snowMat);
  const capW = baseW * (1 - (tiers - 1) * 0.22) * 0.7;
  cap.scale.set(capW, 0.7, capW);
  cap.position.y = y + 0.9;
  g.add(cap);
  g.scale.setScalar(rand(0.9, 1.5));
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

// A snowy boulder: a grey icosahedron with a white snow-topped dome.
export function buildSnowBoulder(kit) {
  const g = new THREE.Group();
  const s = rand(0.7, 1.4);
  const rock = new THREE.Mesh(kit.rockGeo, kit.rockMat);
  rock.scale.set(s, s * rand(0.7, 1.0), s);
  rock.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
  rock.position.y = s * 0.5;
  g.add(rock);
  const cap = new THREE.Mesh(kit.rockCapGeo, kit.snowMat);
  cap.scale.set(s * 0.9, s * 0.4, s * 0.9);
  cap.position.y = s * 0.7;
  g.add(cap);
  return g;
}
