import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityCallState } from '../src/entity-call-state.js';

const position = { x: 12.5, z: 4 };
const sequence = (...values) => {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'only the expected random draws are consumed');
    return values[index++];
  };
};

test('a call shouts immediately and only responds below the 60 percent threshold', () => {
  for (const roll of [0, 0.599999]) {
    const state = new EntityCallState();
    assert.equal(state.call(position, sequence(roll, 0)), true);
    assert.equal(state.shouting, true);
    assert.equal(state.cooldown, 8);
    assert.equal(state.count, 1);
    assert.equal(state.target, null);
    assert.equal(state.pending.remaining, 1.3);
  }
  for (const roll of [0.6, 0.999999]) {
    const state = new EntityCallState();
    assert.equal(state.call(position, sequence(roll)), true);
    assert.equal(state.shouting, true, 'a missed call still makes an audible shout');
    assert.equal(state.pending, null);
    state.update(4);
    assert.equal(state.target, null);
    assert.equal(state.shouting, false);
  }
});

test('responses are delayed and investigate an immutable snapshot of the shout position', () => {
  const state = new EntityCallState();
  const origin = { ...position };
  state.call(origin, sequence(0, 0.5));
  assert.equal(state.pending.remaining, 2.3);
  origin.x = 100;
  origin.z = 200;
  state.update(2.2);
  assert.equal(state.target, null);
  state.update(0.1);
  assert.deepEqual(state.target, position);
  assert.equal(Object.isFrozen(state.target), true);
  assert.equal(state.pending, null);
  state.update(0.9);
  assert.equal(state.shouting, false);
});

test('cooldown rejects repeat calls without rolling or resetting the shout', () => {
  const state = new EntityCallState();
  state.call(position, sequence(0.8));
  state.update(3.2);
  assert.equal(state.shouting, false);
  assert.equal(state.call(position, sequence()), false);
  assert.equal(state.count, 1);
  for (let step = 0; step < 48; step++) state.update(0.1);
  assert.equal(state.cooldown, 0);
  assert.equal(state.call(position, sequence(0.8)), true);
  assert.equal(state.count, 2);
  assert.equal(state.cooldown, 8);
  assert.equal(state.shouting, true);
});

test('a missed later call preserves the active lure and its original expiry', () => {
  const state = new EntityCallState();
  state.call(position, sequence(0, 0));
  state.update(8);
  const target = state.target;
  assert.equal(state.call({ x: 99, z: 88 }, sequence(0.9)), true);
  assert.equal(state.target, target);
  assert.equal(state.pending, null);
  state.update(25.2);
  assert.equal(state.target, target);
  state.update(0.1);
  assert.equal(state.target, null);
});

test('a successful later call replaces the target only when the new response arrives', () => {
  const state = new EntityCallState();
  state.call(position, sequence(0, 0));
  state.update(8);
  const next = { x: 50, z: 70 };
  state.call(next, sequence(0, 1));
  assert.equal(state.pending.remaining, 3.3);
  state.update(3.2);
  assert.deepEqual(state.target, position);
  state.update(0.1);
  assert.deepEqual(state.target, next);
  state.update(31.9);
  assert.deepEqual(state.target, next);
  state.update(0.1);
  assert.equal(state.target, null);
});

test('large updates age a new lure only after its delay and expire it correctly', () => {
  const state = new EntityCallState();
  state.call(position, sequence(0, 0.5));
  state.update(34.2);
  assert.deepEqual(state.target, position);
  assert.ok(Math.abs(state._lureRemaining - 0.1) < 1e-9);
  state.update(0.1);
  assert.equal(state.target, null);
  state.reset().call(position, sequence(0, 0.5));
  state.update(100);
  assert.equal(state.target, null);
  assert.equal(state.pending, null);
  assert.equal(state.cooldown, 0);
  assert.equal(state.shouting, false);
});

test('response, shout, cooldown and lure lifetime do not depend on update partitioning', () => {
  for (const elapsed of [1, 2.3, 3.2, 8, 13, 34.3, 50]) {
    const whole = new EntityCallState();
    const split = new EntityCallState();
    whole.call(position, sequence(0, 0.5));
    split.call(position, sequence(0, 0.5));
    whole.update(elapsed);
    const ticks = Math.round(elapsed * 10);
    for (let tick = 0; tick < ticks; tick++) split.update(0.1);
    assert.deepEqual(split.target, whole.target, `target at ${elapsed}s`);
    assert.equal(split.shouting, whole.shouting, `shout at ${elapsed}s`);
    assert.ok(Math.abs(split.cooldown - whole.cooldown) < 1e-9);
    assert.ok(Math.abs(split._lureRemaining - whole._lureRemaining) < 1e-9);
    assert.equal(split.pending === null, whole.pending === null);
    if (split.pending) {
      assert.ok(Math.abs(split.pending.remaining - whole.pending.remaining) < 1e-9);
      assert.deepEqual(split.pending.position, whole.pending.position);
    }
  }
});

test('invalid time and invalid positions leave state untouched and do not roll', () => {
  const state = new EntityCallState();
  for (const invalid of [null, undefined, {}, { x: NaN, z: 1 }, { x: 1, z: Infinity },
    { x: '1', z: 2 }]) {
    assert.equal(state.call(invalid, sequence()), false);
    assert.deepEqual(state, new EntityCallState());
  }
  state.call(position, sequence(0, 0.5));
  const snapshot = structuredClone(state);
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) state.update(dt);
  assert.deepEqual({ ...state }, snapshot);
});

test('arrival ends only the current lure, and reset clears all call state', () => {
  const state = new EntityCallState();
  state.call(position, sequence(0, 0));
  state.update(8);
  state.call({ x: 20, z: 30 }, sequence(0, 0));
  state.finishLure();
  assert.equal(state.target, null);
  assert.ok(state.pending, 'arrival at an old target does not erase a new distant call');
  assert.equal(state.count, 2);
  state.update(1.3);
  assert.deepEqual(state.target, { x: 20, z: 30 });
  assert.equal(state.reset(), state);
  assert.deepEqual(state, new EntityCallState());
});
