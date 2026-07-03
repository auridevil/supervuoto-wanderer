// Touch input layer (M1 of MOBILE-PLAN). A spawn-at-touch virtual joystick on
// the left part of the screen drives walk/strafe (analog — a partial tilt is a
// slow stroll), dragging anywhere else looks around, and a JUMP button hops.
// It feeds the exact same yaw/pitch/touchMove state WalkControls integrates,
// so there is no separate movement code path to keep in sync.
export class TouchControls {
  constructor(controls, els) {
    this.controls = controls;
    this.layer = els.layer; // full-screen touch surface (under the buttons)
    this.joy = els.joy;     // joystick base (positioned where the thumb lands)
    this.stick = els.stick; // joystick nub
    this.radius = 56;       // px of full joystick deflection
    this.lookSpeed = 0.0045; // rad per px of drag
    this.moveId = null;     // touch identifier owning the joystick
    this.lookId = null;     // touch identifier owning the look drag
    this.origin = { x: 0, y: 0 };
    this.last = { x: 0, y: 0 };

    const opts = { passive: false };
    this.layer.addEventListener("touchstart", (e) => this._start(e), opts);
    this.layer.addEventListener("touchmove", (e) => this._move(e), opts);
    this.layer.addEventListener("touchend", (e) => this._end(e), opts);
    this.layer.addEventListener("touchcancel", (e) => this._end(e), opts);
    if (els.jump) {
      els.jump.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          controls.jump();
        },
        opts
      );
    }
  }

  _start(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.moveId === null && t.clientX < window.innerWidth * 0.45) {
        this.moveId = t.identifier;
        this.origin.x = t.clientX;
        this.origin.y = t.clientY;
        this._placeJoy(t.clientX, t.clientY, 0, 0);
        this.joy.classList.add("on");
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.last.x = t.clientX;
        this.last.y = t.clientY;
      }
    }
  }

  _move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        let dx = t.clientX - this.origin.x;
        let dy = t.clientY - this.origin.y;
        const len = Math.hypot(dx, dy);
        if (len > this.radius) {
          dx *= this.radius / len;
          dy *= this.radius / len;
        }
        this._placeJoy(this.origin.x, this.origin.y, dx, dy);
        // Screen-up = forward, screen-right = strafe right.
        this.controls.touchMove.f = -dy / this.radius;
        this.controls.touchMove.s = dx / this.radius;
      } else if (t.identifier === this.lookId) {
        this.controls.yaw -= (t.clientX - this.last.x) * this.lookSpeed;
        this.controls.pitch -= (t.clientY - this.last.y) * this.lookSpeed;
        const lim = Math.PI / 2 - 0.05;
        this.controls.pitch = Math.max(-lim, Math.min(lim, this.controls.pitch));
        this.last.x = t.clientX;
        this.last.y = t.clientY;
      }
    }
  }

  _end(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        this.moveId = null;
        this.controls.touchMove.f = 0;
        this.controls.touchMove.s = 0;
        this.joy.classList.remove("on");
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  _placeJoy(x, y, dx, dy) {
    this.joy.style.left = `${x}px`;
    this.joy.style.top = `${y}px`;
    this.stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
