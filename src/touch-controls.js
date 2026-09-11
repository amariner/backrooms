/** Use input capabilities, not screen size: a narrow desktop is still a desktop. */
export function supportsTouchControls(environment = globalThis) {
  return Number(environment.navigator?.maxTouchPoints) > 0
    || Boolean(environment.matchMedia?.('(any-pointer: coarse)').matches);
}

/** Convert an offset from the fixed joystick centre into unit movement axes. */
export function joystickMovement(dx, dy, radius, deadZone = 0.12) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) {
    return { forward: 0, strafe: 0 };
  }
  const distance = Math.hypot(dx, dy);
  const amount = Math.min(distance / radius, 1);
  const dead = Math.max(0, Math.min(deadZone, 0.99));
  if (amount <= dead || distance === 0) return { forward: 0, strafe: 0 };
  const strength = (amount - dead) / (1 - dead);
  return { forward: -dy / distance * strength, strafe: dx / distance * strength };
}

/** Independent captured pointers let one thumb move while another looks around. */
export class TouchControls {
  constructor({ joystick, thumb, lookSurface, isPlaying = () => true, onLook = () => {} }) {
    if (!joystick || !thumb || !lookSurface) throw new TypeError('Touch control surfaces are required.');
    this.joystick = joystick;
    this.thumb = thumb;
    this.lookSurface = lookSurface;
    this.isPlaying = isPlaying;
    this.onLook = onLook;
    this.enabled = true;
    this._movement = { forward: 0, strafe: 0 };
    this._movePointer = null;
    this._lookPointer = null;
    this._listeners = [];

    this._listen(joystick, 'pointerdown', event => this._startMove(event));
    this._listen(joystick, 'pointermove', event => this._move(event));
    this._listen(lookSurface, 'pointerdown', event => this._startLook(event));
    this._listen(lookSurface, 'pointermove', event => this._look(event));
    for (const surface of [joystick, lookSurface]) {
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        this._listen(surface, type, event => this._end(event));
      }
    }
    // Also finish a gesture if capture is unavailable or released by the browser.
    const document = joystick.ownerDocument;
    if (document) {
      this._listen(document, 'pointerup', event => this._end(event));
      this._listen(document, 'pointercancel', event => this._end(event));
    }
  }

  get movement() { return { ...this._movement }; }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.reset();
  }

  reset() {
    this._finishMove();
    this._finishLook();
  }

  dispose() {
    this.setEnabled(false);
    for (const [surface, type, handler] of this._listeners) {
      surface.removeEventListener(type, handler);
    }
    this._listeners.length = 0;
  }

  _listen(surface, type, handler) {
    surface.addEventListener(type, handler, { passive: false });
    this._listeners.push([surface, type, handler]);
  }

  _canStart(event) {
    return this.enabled && this.isPlaying()
      && (event.pointerType === 'touch' || event.pointerType === 'pen');
  }

  _capture(surface, pointerId) {
    try { surface.setPointerCapture(pointerId); } catch { /* Global release remains available. */ }
  }

  _release(surface, pointerId) {
    if (pointerId === null) return;
    try {
      if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
    } catch { /* A cancelled pointer may have already been released. */ }
  }

  _startMove(event) {
    if (!this._canStart(event) || this._movePointer !== null || event.pointerId === this._lookPointer) return;
    event.preventDefault();
    const bounds = this.joystick.getBoundingClientRect();
    const thumbBounds = this.thumb.getBoundingClientRect();
    this._origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    this._radius = Math.max(1, (Math.min(bounds.width, bounds.height) - Math.min(thumbBounds.width, thumbBounds.height)) / 2);
    this._movePointer = event.pointerId;
    this._capture(this.joystick, event.pointerId);
    this.joystick.classList.add('is-active');
    this._move(event);
  }

  _move(event) {
    if (event.pointerId !== this._movePointer) return;
    event.preventDefault();
    if (!this.enabled || !this.isPlaying()) { this._finishMove(); return; }
    const dx = event.clientX - this._origin.x;
    const dy = event.clientY - this._origin.y;
    this._movement = joystickMovement(dx, dy, this._radius);
    const distance = Math.hypot(dx, dy);
    const scale = distance > this._radius ? this._radius / distance : 1;
    this.thumb.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  }

  _startLook(event) {
    if (!this._canStart(event) || this._lookPointer !== null || event.pointerId === this._movePointer) return;
    const viewWidth = this.lookSurface.ownerDocument?.defaultView?.innerWidth
      ?? globalThis.innerWidth ?? this.lookSurface.getBoundingClientRect().width;
    if (event.clientX < viewWidth * 0.4) return;
    event.preventDefault();
    this._lookPointer = event.pointerId;
    this._lastLook = { x: event.clientX, y: event.clientY };
    this._capture(this.lookSurface, event.pointerId);
  }

  _look(event) {
    if (event.pointerId !== this._lookPointer) return;
    event.preventDefault();
    if (!this.enabled || !this.isPlaying()) { this._finishLook(); return; }
    const dx = event.clientX - this._lastLook.x;
    const dy = event.clientY - this._lastLook.y;
    this._lastLook = { x: event.clientX, y: event.clientY };
    this.onLook(dx, dy);
  }

  _end(event) {
    if (event.pointerId === this._movePointer) {
      event.preventDefault();
      this._finishMove();
    }
    if (event.pointerId === this._lookPointer) {
      event.preventDefault();
      this._finishLook();
    }
  }

  _finishMove() {
    const pointerId = this._movePointer;
    this._movePointer = null;
    this._movement = { forward: 0, strafe: 0 };
    this.thumb.style.transform = 'translate(0px, 0px)';
    this.joystick.classList.remove('is-active');
    this._release(this.joystick, pointerId);
  }

  _finishLook() {
    const pointerId = this._lookPointer;
    this._lookPointer = null;
    this._lastLook = null;
    this._release(this.lookSurface, pointerId);
  }
}
