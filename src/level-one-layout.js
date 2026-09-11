import { CELL_SIZE, isWalkable, validateWorld } from './world-layout.js';

const SIZE = 33;
const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill('#'));
const fill = (left, top, right, bottom, value = '.') => {
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) cells[row][col] = value;
  }
};
const at = (col, row, details = {}) => ({
  x: (col + 0.5) * CELL_SIZE,
  z: (row + 0.5) * CELL_SIZE,
  ...details,
});

// Two service loops cross a central conduit. The offset baffles interrupt sight
// lines without creating dead ends, allowing the player to evade a pursuit.
fill(15, 3, 17, 30);
fill(13, 1, 19, 4);
fill(13, 27, 19, 31);
fill(15, 10, 16, 10, '#');
fill(16, 21, 17, 21, '#');

// West loop: water pumps, a leaking machine hall and the silent locker annex.
fill(3, 6, 5, 27);
fill(3, 6, 17, 8);
fill(3, 25, 17, 27);
fill(4, 11, 11, 20);
fill(10, 12, 15, 13);
fill(10, 19, 15, 20);
fill(7, 12, 7, 16, '#');
fill(9, 17, 9, 19, '#');
fill(4, 16, 5, 16, '#');
fill(5, 22, 8, 24);
fill(10, 7, 11, 11);
fill(10, 20, 11, 26);

// East loop: distribution below, ventilation above and a divided storage bay.
fill(25, 5, 29, 27);
fill(17, 5, 29, 7);
fill(16, 25, 29, 27);
fill(23, 2, 30, 7);
fill(22, 23, 30, 29);
fill(21, 12, 29, 20);
fill(17, 15, 25, 16);
fill(24, 12, 24, 16, '#');
fill(27, 16, 27, 20, '#');
fill(26, 24, 26, 27, '#');
fill(26, 3, 26, 5, '#');
fill(28, 9, 29, 9, '#');
fill(22, 6, 22, 13);
fill(21, 9, 23, 11);

const grid = cells.map((row) => row.join(''));
const lights = [];
for (let row = 3; row < SIZE - 1; row += 5) {
  for (let col = 4; col < SIZE - 1; col += 6) {
    if (grid[row][col] === '.') lights.push(at(col, row));
  }
}
for (const row of [4, 9, 14, 19, 24, 29]) lights.push(at(16, row));

export const LEVEL_ONE = {
  id: 1,
  name: 'EL ALA DE SERVICIO',
  grid,
  spawn: at(16, 29, { yaw: 0 }),
  exit: at(16, 2, { yaw: 0 }),
  shelters: [
    at(16, 30, { id: 'access', label: 'REFUGIO · ACCESO', radius: 5.2 }),
    at(7, 23, { id: 'lockers', label: 'REFUGIO · TAQUILLAS', radius: 3.8 }),
    at(22, 10, { id: 'inspection', label: 'REFUGIO · INSPECCIÓN', radius: 3.8 }),
  ],
  entitySpawn: at(16, 14),
  patrol: [at(16, 19), at(4, 7), at(5, 19), at(28, 18), at(28, 4), at(16, 6)],
  lights,
  signs: [
    at(16, 27, { yaw: 0, text: 'NIVEL 1', subtitle: 'ALA DE SERVICIO · PERSONAL AUTORIZADO' }),
    at(13, 26, { yaw: Math.PI / 2, text: '← BOMBAS', subtitle: 'ZONA INUNDABLE · ALA OESTE' }),
    at(19, 26, { yaw: -Math.PI / 2, text: 'DISTRIBUCIÓN →', subtitle: 'ACCESO DE SERVICIO · SECTOR SUR' }),
    at(16, 17, { yaw: 0, text: 'NO CORRA', subtitle: 'SE OYEN LOS PASOS' }),
    at(19, 6, { yaw: -Math.PI / 2, text: 'VENTILACIÓN →', subtitle: 'EXTRACTORES · SECTOR NORTE' }),
    at(16, 4, { yaw: 0, text: 'SALIDA ↑', subtitle: 'NO MIRE ATRÁS' }),
  ],
  sectors: [
    at(16, 29, { name: 'ACCESO · NIVEL 1' }),
    at(6, 14, { name: 'BOMBAS' }),
    at(7, 23, { name: 'TAQUILLAS · REFUGIO' }),
    at(16, 16, { name: 'CONDUCTO CENTRAL' }),
    at(28, 26, { name: 'DISTRIBUCIÓN' }),
    at(28, 15, { name: 'ALMACÉN DE SERVICIO' }),
    at(28, 4, { name: 'VENTILACIÓN' }),
    at(22, 10, { name: 'INSPECCIÓN · REFUGIO' }),
  ],
};

export function validateLevelOne(world = LEVEL_ONE) {
  const result = validateWorld(world);
  const errors = [...result.errors];
  for (const [kind, points] of [
    ['Refugio', world.shelters], ['Patrulla', world.patrol],
  ]) {
    if (!Array.isArray(points)) errors.push(`${kind}: falta la lista de posiciones.`);
    else if (result.walkableCells > 0 && points.some((point) =>
      !point || !isWalkable(point.x, point.z, 0.4, world))) {
      errors.push(`${kind}: posición no transitable.`);
    }
  }
  if (result.walkableCells > 0 && (!world.entitySpawn ||
      !isWalkable(world.entitySpawn.x, world.entitySpawn.z, 0.4, world))) {
    errors.push('Vigilante: posición no transitable.');
  }
  if (world.shelters?.some((shelter) => !Number.isFinite(shelter.radius) || shelter.radius <= 0)) {
    errors.push('Los refugios necesitan un radio positivo.');
  }
  return { ...result, valid: errors.length === 0, errors };
}
