import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_SIZE, WORLD, findPath, isWalkable } from '../src/world-layout.js';
import { LEVEL_ONE, validateLevelOne } from '../src/level-one-layout.js';
import { LevelOneState } from '../src/level-one-state.js';

test('the service wing is connected, enclosed and larger than level zero', () => {
  const result = validateLevelOne();
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(LEVEL_ONE.grid.length, 33);
  assert.equal(result.reachableCells, result.walkableCells);
  assert.ok(result.walkableCells > 500);
  for (const row of LEVEL_ONE.grid) {
    assert.equal(row.length, 33);
    assert.equal(row[0], '#');
    assert.equal(row.at(-1), '#');
  }
  assert.match(LEVEL_ONE.grid[0], /^#+$/);
  assert.match(LEVEL_ONE.grid.at(-1), /^#+$/);
  assert.equal(isWalkable(-1, LEVEL_ONE.spawn.z, 0.23, LEVEL_ONE), false);
  assert.equal(isWalkable(33 * CELL_SIZE, LEVEL_ONE.spawn.z, 0.23, LEVEL_ONE), false);
});

test('the exit, shelters and patrol routes are reachable without unlocking any objective', () => {
  const targets = [LEVEL_ONE.exit, LEVEL_ONE.entitySpawn, ...LEVEL_ONE.shelters, ...LEVEL_ONE.patrol];
  for (const target of targets) {
    const route = findPath(LEVEL_ONE.spawn.x, LEVEL_ONE.spawn.z, target.x, target.z, LEVEL_ONE);
    assert.ok(route.length > 0, `${target.id ?? target.label ?? 'target'} is reachable`);
    assert.deepEqual(route.at(-1), { x: target.x, z: target.z });
    for (let index = 0; index < route.length; index++) {
      assert.ok(isWalkable(route[index].x, route[index].z, 0.4, LEVEL_ONE));
      if (index) {
        const distance = Math.abs(route[index].x - route[index - 1].x)
          + Math.abs(route[index].z - route[index - 1].z);
        assert.ok(Math.abs(distance - CELL_SIZE) < 1e-8);
      }
    }
  }
  const cell = { x: (30 + 0.5) * CELL_SIZE, z: (28 + 0.5) * CELL_SIZE };
  assert.equal(isWalkable(cell.x, cell.z, 0.23, LEVEL_ONE), true);
  assert.equal(isWalkable(cell.x, cell.z), false, 'the default world remains level zero');
  assert.deepEqual(findPath(WORLD.spawn.x, WORLD.spawn.z, WORLD.spawn.x, WORLD.spawn.z),
    [{ x: WORLD.spawn.x, z: WORLD.spawn.z }]);
});

test('spawn has a safe refuge and the initial threat is distant', () => {
  const { spawn, shelters, entitySpawn } = LEVEL_ONE;
  assert.ok(shelters.some((point) => Math.hypot(point.x - spawn.x, point.z - spawn.z) < point.radius));
  assert.ok(Math.hypot(entitySpawn.x - spawn.x, entitySpawn.z - spawn.z) > 35);
  for (const property of ['fuses', 'relays', 'notes', 'supplies']) {
    assert.equal(property in LEVEL_ONE, false, `${property} no longer creates an objective`);
  }
});

test('a fresh game has no inventory, puzzle progress or expendable light', () => {
  const state = new LevelOneState();
  for (const property of ['sequence', 'progress', 'notes', 'battery', 'rechargeCooldown', 'powered',
    'relay', 'readNote', 'recharge']) {
    assert.equal(property in state, false, `${property} has been removed`);
  }
  assert.equal(state.failed, false);
  assert.equal(state.detected, 0);
  assert.equal(state.noise, 0);
});

test('the flashlight remains effective indefinitely and invalid time is ignored', () => {
  const state = new LevelOneState();
  state.update(240, { flashlightOn: true });
  const before = { ...state };
  for (const dt of [NaN, Infinity, -1, 0]) state.update(dt, { flashlightOn: true });
  assert.deepEqual({ ...state }, before);
  state.update(2, { flashlightOn: true, distance: 20, lineOfSight: true });
  assert.ok(state.detected > 0.5, 'the light still attracts the entity after four minutes');
});

test('sprinting and flashlight attract the threat; stillness in a dark refuge conceals the player', () => {
  const walking = new LevelOneState();
  const running = new LevelOneState();
  walking.update(3, { moving: true, distance: 18 });
  running.update(3, { moving: true, sprinting: true, distance: 18 });
  assert.ok(running.noise > walking.noise);
  assert.ok(running.detected > walking.detected);
  const state = new LevelOneState();
  state.update(2, { flashlightOn: true, lineOfSight: true, distance: 8 });
  assert.ok(state.detected > 0.75);
  state.update(3, { hidden: true, flashlightOn: false, lineOfSight: true, distance: 0.5 });
  assert.equal(state.failed, false);
  assert.equal(state.hidden, true);
  assert.equal(state.detected, 0);
  state.update(0.1, { hidden: true, moving: true });
  assert.equal(state.hidden, false);
  state.update(0.1, { hidden: true, flashlightOn: true });
  assert.equal(state.hidden, false);
});

test('a close exposed pursuit fails, freezes state and supports a clean restart', () => {
  const state = new LevelOneState();
  state.update(3, { distance: 0.5, lineOfSight: true, flashlightOn: true });
  assert.equal(state.failed, true);
  const frozen = { ...state };
  state.update(10, { flashlightOn: true });
  assert.deepEqual({ ...state }, frozen);
  state.reset();
  assert.deepEqual(state, new LevelOneState());
});

test('calling breaks refuge concealment and makes noise even while standing still', () => {
  const state = new LevelOneState();
  state.update(.1, { hidden: true });
  assert.equal(state.hidden, true);
  state.update(1, { hidden: true, calling: true, distance: 15 });
  assert.equal(state.hidden, false);
  assert.equal(state.noise, 1);
  assert.ok(state.detected > 0);
  state.update(3, { hidden: true });
  assert.equal(state.hidden, true);
  assert.equal(state.noise, 0);
});

test('breaking line of sight lets detection fade and prevents capture through walls', () => {
  const state = new LevelOneState();
  state.update(2, { distance: 5, lineOfSight: true, flashlightOn: true });
  assert.equal(state.detected, 1);
  state.update(1, { distance: 0.5, lineOfSight: false });
  assert.equal(state.failed, false);
  assert.ok(state.detected < 1 && state.detected > 0.75);
  state.update(8, { distance: 8, lineOfSight: false });
  assert.equal(state.detected, 0);
});

test('outages use simulation time and pause when update is not called', () => {
  const state = new LevelOneState();
  state.update(29, {});
  assert.equal(state.blackout, false);
  state.update(2, {});
  assert.equal(state.blackout, true);
  const elapsed = state.elapsed;
  for (const dt of [0, -1, NaN]) state.update(dt);
  assert.equal(state.elapsed, elapsed, 'an inactive simulation does not advance the clock');
  state.update(12, {});
  assert.equal(state.blackout, false);
  state.update(53, {});
  assert.equal(state.blackout, true);
});
