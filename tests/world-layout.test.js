import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_SIZE, WORLD, findPath, isWalkable, validateWorld } from '../src/world-layout.js';

const center = (col, row) => ({ x: (col + 0.5) * CELL_SIZE, z: (row + 0.5) * CELL_SIZE });

test('the whole map and all three fuses belong to one accessible building', () => {
  const result = validateWorld();
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.ok(result.walkableCells > 350, 'the building provides meaningful exploration space');
  assert.equal(result.reachableCells, result.walkableCells);
  assert.deepEqual(WORLD.fuses.map((fuse) => fuse.id), ['A', 'B', 'C']);
});

test('the rectangular outer boundary is entirely solid', () => {
  const width = WORLD.grid[0].length;
  assert.equal(WORLD.grid.length, 29);
  for (const row of WORLD.grid) {
    assert.equal(row.length, width);
    assert.equal(row[0], '#');
    assert.equal(row.at(-1), '#');
  }
  assert.match(WORLD.grid[0], /^#+$/);
  assert.match(WORLD.grid.at(-1), /^#+$/);
  assert.equal(isWalkable(-1, 8), false);
  assert.equal(isWalkable(8, WORLD.grid.length * CELL_SIZE + 1), false);
});

test('each target has a valid contiguous route from the spawn', () => {
  for (const target of [...WORLD.fuses, WORLD.exit]) {
    const path = findPath(WORLD.spawn.x, WORLD.spawn.z, target.x, target.z);
    assert.ok(path.length > 1, `${target.id ?? 'exit'} is reachable`);
    assert.deepEqual(path[0], { x: WORLD.spawn.x, z: WORLD.spawn.z });
    assert.deepEqual(path.at(-1), { x: target.x, z: target.z });
    for (let index = 0; index < path.length; index++) {
      assert.ok(isWalkable(path[index].x, path[index].z, 0.4));
      if (index) {
        const a = path[index - 1];
        const b = path[index];
        assert.ok(Math.abs(Math.abs(a.x - b.x) + Math.abs(a.z - b.z) - CELL_SIZE) < 1e-8);
      }
    }
  }
});

test('spawn looks north down an unobstructed central corridor', () => {
  assert.equal(WORLD.spawn.yaw, 0);
  for (let offset = 1; offset <= 8; offset++) {
    assert.ok(isWalkable(WORLD.spawn.x, WORLD.spawn.z - offset * CELL_SIZE, 0.4));
  }
});

test('collision accounts for the player radius and rejects solid cells', () => {
  const point = center(2, 3);
  assert.equal(isWalkable(point.x, point.z), true);
  assert.equal(isWalkable(2 * CELL_SIZE + 0.2, point.z, 0.23), false);
  assert.equal(isWalkable(2 * CELL_SIZE + 0.24, point.z, 0.23), true);
  assert.equal(isWalkable(2 * CELL_SIZE + 0.2, point.z, 0), true);
  assert.equal(isWalkable(CELL_SIZE * 1.5, point.z, 0), false);
  assert.equal(isWalkable(point.x, point.z, 100), false);
  assert.equal(isWalkable(NaN, point.z), false);
  assert.equal(isWalkable(point.x, point.z, -1), false);
});

test('path search handles same-cell, wall and malformed endpoints', () => {
  const { x, z } = WORLD.spawn;
  assert.deepEqual(findPath(x, z, x + 0.1, z), [{ x, z }]);
  assert.deepEqual(findPath(x, z, CELL_SIZE / 2, CELL_SIZE / 2), []);
  assert.deepEqual(findPath(NaN, z, x, z), []);
  assert.deepEqual(findPath(-100, z, x, z), []);
});

test('circular collision allows clearance around pillar corners', () => {
  const cornerX = 11 * CELL_SIZE;
  const cornerZ = 23 * CELL_SIZE;
  assert.equal(isWalkable(cornerX - 0.18, cornerZ - 0.18, 0.23), true);
  assert.equal(isWalkable(cornerX - 0.16, cornerZ - 0.16, 0.23), false);
});

test('validation diagnoses broken boundaries, inaccessible goals and malformed maps', () => {
  assert.equal(validateWorld({ ...WORLD, grid: ['##', '#'] }).valid, false);
  assert.equal(validateWorld({ ...WORLD, fuses: [null, null, null] }).valid, false);
  const opened = [...WORLD.grid];
  opened[0] = `${opened[0].slice(0, 14)}.${opened[0].slice(15)}`;
  assert.ok(validateWorld({ ...WORLD, grid: opened }).errors.some((error) => error.includes('perímetro')));
  const sealed = WORLD.grid.map((row) => [...row]);
  const target = WORLD.fuses[0];
  const col = Math.floor(target.x / CELL_SIZE);
  const row = Math.floor(target.z / CELL_SIZE);
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) sealed[row + dz][col + dx] = '#';
  const result = validateWorld({ ...WORLD, grid: sealed.map((line) => line.join('')) });
  assert.ok(result.errors.some((error) => error.includes('Fusible A: no se puede alcanzar')));
  assert.ok(result.errors.some((error) => error.includes('conectadas')));
});
