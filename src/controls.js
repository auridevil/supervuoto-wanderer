import * as THREE from "three";

// Pointer-lock first-person wander controls: WASD/arrows + mouse-look + Shift-to-stroll.
// The camera glides along the ground; the active world supplies the height.
export class WalkControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.enabled = false;
    this.eyeHeight = 1.7;
    this.speed = 9;
    this.slow = 0.38;   // hold Shift to stroll slowly (multiplier on speed)

    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3(0, this.eyeHeight, 0);
    this.heightAt = () => 0; // set by the active world
    this.collide = null;     // optional (pos, radius) => void, set by the active world
    this.groundY = 0;        // terrain height at the player's feet
    this.currentSpeed = 0;   // horizontal speed (for the avatar's walk cycle)
    this.thirdPerson = false;
    this.camDist = 7.5;

    // Touch mode (mobile): no pointer-lock; TouchControls feeds touchMove
    // (analog -1..1 forward/strafe) and writes yaw/pitch directly.
    this.touchMode = false;
    this.touchMove = { f: 0, s: 0 };

    // Jumping
    this.jumpOffset = 0;     // height above the ground baseline
    this.vy = 0;
    this.onGround = true;
    this.gravity = 32;
    this.jumpSpeed = 11;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        this.jump();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);

    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("pointerlockchange", () => {
      if (this.touchMode) return;
      this.enabled = document.pointerLockElement === this.dom;
    });
  }

  lock() {
    if (this.touchMode) { this.enabled = true; return; }
    // requestPointerLock can reject (iframe/permissions policies); don't let
    // that surface as an unhandled error — the user just clicks again.
    try {
      const p = this.dom.requestPointerLock();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch { /* unsupported environment */ }
  }

  jump() {
    if (this.onGround) { this.vy = this.jumpSpeed; this.onGround = false; }
  }

  _onMouseMove(e) {
    if (!this.enabled) return;
    const s = 0.0022;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  update(dt) {
    const forward = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
                    (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) +
                    this.touchMove.f;
    const strafe = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
                   (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) +
                   this.touchMove.s;
    const boost = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? this.slow : 1;

    // Move on the horizontal plane relative to where we're looking.
    // forwardVec = (-sin, cos); rightVec = forwardVec × up = (-cos, -sin).
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dir = new THREE.Vector3(
      -sin * forward - cos * strafe,
      0,
      cos * forward - sin * strafe
    );
    if (dir.lengthSq() > 1) dir.normalize(); // keep sub-unit joystick tilts analog

    const target = dir.multiplyScalar(this.speed * boost);
    // Smooth acceleration / damping for a floaty wander feel.
    this.velocity.x += (target.x - this.velocity.x) * Math.min(1, dt * 6);
    this.velocity.z += (target.z - this.velocity.z) * Math.min(1, dt * 6);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    const feetY = this.groundY + this.jumpOffset;
    if (this.collide) this.collide(this.position, 0.5, feetY);

    this.groundY = this.heightAt(this.position.x, this.position.z);
    const eye = this.groundY + this.eyeHeight;
    this.position.y += (eye - this.position.y) * Math.min(1, dt * 8);

    // Jump arc (added on top of the terrain-following baseline).
    if (!this.onGround) {
      this.jumpOffset += this.vy * dt;
      this.vy -= this.gravity * dt;
      if (this.jumpOffset <= 0) { this.jumpOffset = 0; this.vy = 0; this.onGround = true; }
    }

    const cp = Math.cos(this.pitch);
    const lookDir = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    if (this.thirdPerson) {
      // Orbit camera behind the avatar; yaw orbits, pitch raises/lowers.
      const focus = new THREE.Vector3(this.position.x, this.groundY + 2.2 + this.jumpOffset, this.position.z);
      const fwdH = new THREE.Vector3(-Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const camY = focus.y + 3 - this.pitch * 5;
      const cam = new THREE.Vector3(
        focus.x - fwdH.x * this.camDist,
        Math.max(this.groundY + 1.2, camY),
        focus.z - fwdH.z * this.camDist
      );
      this.camera.position.lerp(cam, Math.min(1, dt * 8));
      this.camera.lookAt(focus);
    } else {
      this.camera.position.set(this.position.x, this.position.y + this.jumpOffset, this.position.z);
      this.camera.lookAt(this.camera.position.clone().add(lookDir));
    }
  }
}
