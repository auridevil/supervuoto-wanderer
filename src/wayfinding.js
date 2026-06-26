// WP2 — Wayfinding.
// Throttled sampling of the biome fields to point HUD arrows at the nearest
// strong patch of desert / snow. main.js instantiates this once, calls update()
// each frame (cheap — it self-throttles), then reads result() to rotate the two
// HUD chips ("Desert" / "Snow") relative to the camera yaw.
import { desertMask, snowMask } from './worlds/pastel.js';

// 16 compass directions, sampled at rising distances.
const DIRS = 16;
const RINGS = [80, 160, 260, 380];
// Coarse distance buckets keyed by which ring first crossed the threshold.
const LABELS = ['near', 'near', 'mid', 'far'];
const HIT = 0.5; // mask value that counts as "in the biome".
const TWO_PI = Math.PI * 2;

export class Wayfinding {
  constructor() {
    // Throttle: re-sample at most ~2x/second.
    this._acc = 0;
    this._interval = 0.5;

    // Reused per-direction strength accumulators (allocation-light).
    this._dx = new Array(DIRS);
    this._dz = new Array(DIRS);
    for (let i = 0; i < DIRS; i++) {
      // World bearing i: direction = (-sin(b), cos(b)) to match the camera's
      // forward vector convention in controls.js.
      const b = (i / DIRS) * TWO_PI;
      this._dx[i] = -Math.sin(b);
      this._dz[i] = Math.cos(b);
    }

    // Latest results (or null until something is found in range).
    this._desert = null;
    this._snow = null;
  }

  update(dt, camPos, yaw) {
    this._acc += dt;
    if (this._acc < this._interval) return;
    this._acc = 0;

    this._yaw = yaw;
    this._desert = this._scan(desertMask, camPos);
    this._snow = this._scan(snowMask, camPos);
  }

  // Walk each compass direction outward; track the strongest peak (for bearing)
  // and the closest ring that exceeds HIT (for the distance bucket).
  _scan(mask, camPos) {
    let bestDir = -1;
    let bestStrength = HIT; // must beat the threshold to register at all.
    let bestRing = RINGS.length;

    for (let i = 0; i < DIRS; i++) {
      const dx = this._dx[i], dz = this._dz[i];
      for (let r = 0; r < RINGS.length; r++) {
        const dist = RINGS[r];
        const m = mask(camPos.x + dx * dist, camPos.z + dz * dist);
        if (m > bestStrength || (m === bestStrength && r < bestRing)) {
          bestStrength = m;
          bestDir = i;
          bestRing = r;
        }
      }
    }

    if (bestDir < 0) return null;
    const bearing = (bestDir / DIRS) * TWO_PI;
    return { bearing, distanceLabel: LABELS[bestRing] };
  }

  // angleRelToCamera = world bearing - camera yaw, normalized to (-PI, PI] so
  // the HUD can rotate an arrow chip directly.
  result() {
    return {
      desert: this._rel(this._desert),
      snow: this._rel(this._snow),
    };
  }

  _rel(hit) {
    if (!hit) return null;
    let a = hit.bearing - (this._yaw || 0);
    a = ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    return { angleRelToCamera: a, distanceLabel: hit.distanceLabel };
  }
}
