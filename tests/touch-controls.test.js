import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchControls, joystickMovement, supportsTouchControls } from '../src/touch-controls.js';

test('touch support uses capabilities rather than viewport width or user agent', () => {
  assert.equal(supportsTouchControls({ navigator: { maxTouchPoints: 5 }, innerWidth: 1400 }), true);
  assert.equal(supportsTouchControls({ navigator: { maxTouchPoints: 0, userAgent: 'Mobile' }, innerWidth: 320 }), false);
  assert.equal(supportsTouchControls({ matchMedia: query => ({ matches: query === '(any-pointer: coarse)' }) }), true);
  assert.equal(supportsTouchControls({ navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }) }), false);
  assert.equal(supportsTouchControls({}), false);
});

test('joystick dead zone prevents drift and preserves partial speed', () => {
  assert.deepEqual(joystickMovement(0, 0, 50), { forward: 0, strafe: 0 });
  assert.deepEqual(joystickMovement(3, -3, 50), { forward: 0, strafe: 0 });
  const partial = joystickMovement(0, -25, 50);
  assert.equal(partial.strafe, 0);
  assert.ok(partial.forward > 0 && partial.forward < 0.5);
  assert.deepEqual(joystickMovement(NaN, 0, 50), { forward: 0, strafe: 0 });
  assert.deepEqual(joystickMovement(5, 5, 0), { forward: 0, strafe: 0 });
});

test('joystick clamps diagonals and offsets outside the pad to the unit circle', () => {
  const diagonal = joystickMovement(500, -500, 50);
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.strafe) - 1) < 1e-12);
  assert.ok(Math.abs(diagonal.forward - diagonal.strafe) < 1e-12);
  assert.equal(joystickMovement(-500, 0, 50).strafe, -1);
  assert.equal(joystickMovement(0, 500, 50).forward, -1);
});

class Surface extends EventTarget {
  constructor(rect, ownerDocument) {
    super();
    this.rect = rect;
    this.ownerDocument = ownerDocument;
    this.style = {};
    this.captures = new Set();
    this.classes = new Set();
    this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) };
  }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}

function fixture() {
  const document = new EventTarget();
  document.defaultView = { innerWidth: 1000 };
  const joystick = new Surface({ left: 20, top: 600, width: 140, height: 140 }, document);
  const thumb = new Surface({ width: 50, height: 50 }, document);
  const lookSurface = new Surface({ left: 0, top: 0, width: 1000, height: 800 }, document);
  const looks = [];
  let playing = true;
  const controls = new TouchControls({ joystick, thumb, lookSurface, isPlaying: () => playing, onLook: (dx, dy) => looks.push([dx, dy]) });
  return { document, joystick, thumb, lookSurface, looks, controls, pause: () => { playing = false; } };
}

function pointer(surface, type, pointerId, clientX = 0, clientY = 0, extra = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId, clientX, clientY, pointerType: 'touch', isPrimary: false, ...extra });
  surface.dispatchEvent(event);
  return event;
}

test('second non-primary finger looks while the first keeps moving', () => {
  const { controls, joystick, lookSurface, looks } = fixture();
  const start = pointer(joystick, 'pointerdown', 1, 90, 625, { isPrimary: true });
  assert.equal(start.defaultPrevented, true);
  assert.equal(controls.movement.forward, 1);
  assert.equal(joystick.hasPointerCapture(1), true);
  pointer(lookSurface, 'pointerdown', 2, 700, 300);
  pointer(lookSurface, 'pointermove', 2, 745, 280);
  assert.deepEqual(looks, [[45, -20]]);
  assert.equal(controls.movement.forward, 1);
  assert.equal(lookSurface.hasPointerCapture(2), true);
  pointer(lookSurface, 'pointerup', 2);
  assert.equal(lookSurface.hasPointerCapture(2), false);
  assert.equal(controls.movement.forward, 1);
  pointer(joystick, 'pointerup', 1);
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  controls.dispose();
});

test('joystick uses its fixed centre, not the initial thumb position', () => {
  const { controls, joystick, thumb } = fixture();
  pointer(joystick, 'pointerdown', 1, 135, 670);
  assert.equal(controls.movement.strafe, 1);
  assert.equal(thumb.style.transform, 'translate(45px, 0px)');
  pointer(joystick, 'pointermove', 1, 90, 670);
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  pointer(joystick, 'pointermove', 1, 500, 670);
  assert.equal(controls.movement.strafe, 1);
  assert.equal(thumb.style.transform, 'translate(45px, 0px)');
  const exposed = controls.movement;
  exposed.strafe = 0;
  assert.equal(controls.movement.strafe, 1);
  controls.dispose();
});

test('mouse and left-side look gestures are ignored, third fingers cannot steal a gesture', () => {
  const { controls, joystick, lookSurface, looks } = fixture();
  assert.equal(pointer(joystick, 'pointerdown', 1, 90, 625, { pointerType: 'mouse' }).defaultPrevented, false);
  pointer(lookSurface, 'pointerdown', 2, 100, 300);
  pointer(lookSurface, 'pointermove', 2, 700, 300);
  assert.deepEqual(looks, []);
  pointer(lookSurface, 'pointerdown', 3, 700, 300);
  pointer(lookSurface, 'pointerdown', 4, 800, 300);
  pointer(lookSurface, 'pointermove', 4, 900, 300);
  pointer(lookSurface, 'pointermove', 3, 710, 310);
  assert.deepEqual(looks, [[10, 10]]);
  pointer(joystick, 'pointerdown', 5, 90, 625);
  pointer(joystick, 'pointerdown', 6, 90, 715);
  pointer(joystick, 'pointermove', 6, 90, 715);
  assert.equal(controls.movement.forward, 1);
  controls.dispose();
});

test('pointer cancel and lost capture release only their own channel', () => {
  const { controls, joystick, lookSurface, looks } = fixture();
  pointer(joystick, 'pointerdown', 1, 90, 625);
  pointer(lookSurface, 'pointerdown', 2, 700, 300);
  pointer(joystick, 'pointercancel', 1);
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  pointer(lookSurface, 'pointermove', 2, 720, 310);
  assert.deepEqual(looks, [[20, 10]]);
  pointer(joystick, 'pointerdown', 3, 90, 625);
  pointer(lookSurface, 'lostpointercapture', 2);
  pointer(lookSurface, 'pointermove', 2, 800, 300);
  assert.deepEqual(looks, [[20, 10]]);
  assert.equal(controls.movement.forward, 1);
  pointer(joystick, 'lostpointercapture', 3);
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  controls.dispose();
});

test('document release also clears movement when capture is unavailable', () => {
  const { controls, joystick, document } = fixture();
  joystick.setPointerCapture = () => { throw new Error('Pointer unavailable'); };
  pointer(joystick, 'pointerdown', 1, 90, 625);
  assert.equal(controls.movement.forward, 1);
  pointer(document, 'pointerup', 1);
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  controls.dispose();
});

test('reset, disable, pause and dispose cannot leave movement or a look gesture stuck', () => {
  const { controls, joystick, thumb, lookSurface, looks, pause } = fixture();
  const begin = () => {
    pointer(joystick, 'pointerdown', 1, 90, 625);
    pointer(lookSurface, 'pointerdown', 2, 700, 300);
  };
  begin();
  controls.reset();
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  assert.equal(thumb.style.transform, 'translate(0px, 0px)');
  assert.equal(joystick.captures.size + lookSurface.captures.size, 0);
  begin();
  controls.setEnabled(false);
  pointer(joystick, 'pointerdown', 3, 90, 625);
  pointer(lookSurface, 'pointermove', 2, 750, 300);
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  assert.deepEqual(looks, []);
  controls.setEnabled(true);
  begin();
  pause();
  pointer(joystick, 'pointermove', 1, 90, 625);
  pointer(lookSurface, 'pointermove', 2, 750, 300);
  assert.deepEqual(controls.movement, { forward: 0, strafe: 0 });
  assert.deepEqual(looks, []);
  controls.dispose();
  controls.dispose();
  assert.equal(controls._listeners.length, 0);
  pointer(joystick, 'pointerdown', 4, 90, 625);
  assert.equal(joystick.hasPointerCapture(4), false);
});
