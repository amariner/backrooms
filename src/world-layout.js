export const CELL_SIZE = 3.2;
export const WALL_HEIGHT = 3.1;

const SIZE = 29;
const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill('#'));
const carve = (left, top, right, bottom) => {
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) cells[row][col] = '.';
  }
};
const partition = (left, top, right, bottom) => {
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) cells[row][col] = '#';
  }
};
const at = (col, row, details = {}) => ({
  x: (col + 0.5) * CELL_SIZE,
  z: (row + 0.5) * CELL_SIZE,
  ...details,
});

// A long central spine joins four wings. Both side wings loop back into it,
// so navigation has landmarks and alternate routes rather than random dead ends.
carve(13, 3, 15, 26);
carve(11, 1, 17, 4);
carve(10, 21, 18, 27);
partition(11, 23, 11, 24);
partition(17, 23, 17, 24);

// West: the records room, a returning passage and a mostly abandoned annex.
carve(2, 2, 10, 7);
carve(2, 6, 4, 20);
carve(8, 5, 10, 11);
carve(8, 9, 14, 11);
carve(2, 18, 14, 20);
carve(2, 19, 9, 26);
carve(7, 25, 13, 26);
carve(7, 13, 14, 15);
partition(5, 3, 5, 5);
partition(8, 2, 8, 4);
partition(6, 20, 6, 24);
partition(3, 23, 4, 23);
partition(9, 14, 9, 14);

// East: maintenance has a loop around its inner partition and a quiet closet.
carve(14, 8, 27, 10);
carve(19, 2, 27, 6);
carve(25, 5, 27, 10);
carve(19, 5, 21, 9);
carve(24, 11, 27, 15);
partition(23, 3, 23, 6);
partition(20, 3, 21, 3);
carve(17, 12, 20, 13);
carve(19, 13, 21, 16);

// Southeast: two office bays join a lower hall and the entrance lobby.
carve(14, 15, 27, 17);
carve(19, 14, 27, 21);
carve(25, 20, 27, 26);
carve(18, 24, 27, 27);
carve(14, 25, 21, 27);
partition(23, 14, 23, 18);
partition(20, 19, 21, 19);
partition(21, 25, 21, 27);
carve(21, 24, 22, 24);
partition(25, 25, 25, 25);

const grid = cells.map((row) => row.join(''));
const lights = [];
for (let row = 2; row < SIZE - 1; row += 4) {
  for (let col = 2; col < SIZE - 1; col += 4) {
    if (grid[row][col] === '.') lights.push(at(col, row));
  }
}
// The central fixtures offer a faint landmark toward the exit.
for (const row of [4, 8, 12, 16, 20, 24]) lights.push(at(14, row));

export const WORLD = {
  grid,
  spawn: at(14, 25, { yaw: 0 }),
  exit: at(14, 2, { yaw: 0 }),
  signs: [
    at(14, 21, { yaw: 0, text: 'NIVEL 0', subtitle: 'USTED ESTÁ AQUÍ' }),
    at(12, 19, { yaw: Math.PI / 2, text: '← ARCHIVO', subtitle: 'SECTOR A · ALA OESTE' }),
    at(12, 10, { yaw: Math.PI / 2, text: 'ARCHIVO', subtitle: 'A · REGISTROS' }),
    at(17, 9, { yaw: -Math.PI / 2, text: 'MANTENIMIENTO →', subtitle: 'SECTOR B · ALA ESTE' }),
    at(17, 16, { yaw: -Math.PI / 2, text: 'OFICINAS →', subtitle: 'SECTOR C · PASILLO SUR' }),
    at(14, 5, { yaw: 0, text: 'SALIDA ↑', subtitle: 'MANTENGA EL PASO LIBRE' }),
  ],
  lights,
  sectors: [
    at(14, 25, { name: 'VESTÍBULO' }),
    at(6, 4, { name: 'ARCHIVO · A' }),
    at(25, 4, { name: 'MANTENIMIENTO · B' }),
    at(25, 20, { name: 'OFICINAS · C' }),
    at(4, 21, { name: 'ANEXO OESTE' }),
    at(14, 8, { name: 'PASILLO CENTRAL' }),
  ],
};

function floorAt(layout, col, row) {
  return layout[row]?.[col] === '.';
}

/** Circle versus solid tiles. Tangency is allowed; leaving the map is not. */
export function isWalkable(x, z, radius = 0.23, world = WORLD) {
  if (![x, z, radius].every(Number.isFinite) || radius < 0) return false;
  const col = Math.floor(x / CELL_SIZE);
  const row = Math.floor(z / CELL_SIZE);
  if (!floorAt(world.grid, col, row)) return false;
  if (radius === 0) return true;
  if (x - radius < 0 || z - radius < 0 ||
      x + radius > world.grid[0].length * CELL_SIZE ||
      z + radius > world.grid.length * CELL_SIZE) return false;

  for (let r = Math.floor((z - radius) / CELL_SIZE); r <= Math.floor((z + radius) / CELL_SIZE); r++) {
    for (let c = Math.floor((x - radius) / CELL_SIZE); c <= Math.floor((x + radius) / CELL_SIZE); c++) {
      if (floorAt(world.grid, c, r)) continue;
      const nearestX = Math.max(c * CELL_SIZE, Math.min(x, (c + 1) * CELL_SIZE));
      const nearestZ = Math.max(r * CELL_SIZE, Math.min(z, (r + 1) * CELL_SIZE));
      if ((x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2) return false;
    }
  }
  return true;
}

const steps = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function search(layout, startCol, startRow) {
  const width = layout[0].length;
  const first = startRow * width + startCol;
  const parents = new Map([[first, null]]);
  const queue = [[startCol, startRow]];
  for (let index = 0; index < queue.length; index++) {
    const [col, row] = queue[index];
    for (const [dx, dz] of steps) {
      const nc = col + dx;
      const nr = row + dz;
      const key = nr * width + nc;
      if (!floorAt(layout, nc, nr) || parents.has(key)) continue;
      parents.set(key, row * width + col);
      queue.push([nc, nr]);
    }
  }
  return parents;
}

/** Shortest four-direction route, including the start and destination cells. */
export function findPath(fromX, fromZ, toX, toZ, world = WORLD) {
  if (![fromX, fromZ, toX, toZ].every(Number.isFinite)) return [];
  const sc = Math.floor(fromX / CELL_SIZE);
  const sr = Math.floor(fromZ / CELL_SIZE);
  const tc = Math.floor(toX / CELL_SIZE);
  const tr = Math.floor(toZ / CELL_SIZE);
  if (!floorAt(world.grid, sc, sr) || !floorAt(world.grid, tc, tr)) return [];
  const width = world.grid[0].length;
  const parents = search(world.grid, sc, sr);
  let key = tr * width + tc;
  if (!parents.has(key)) return [];
  const path = [];
  while (key !== null) {
    path.push(at(key % width, Math.floor(key / width)));
    key = parents.get(key);
  }
  return path.reverse();
}

/** Structural and flood-fill checks. Accepts a candidate world for validation. */
export function validateWorld(world = WORLD) {
  const errors = [];
  const layout = world?.grid;
  if (!Array.isArray(layout) || layout.length < 3 ||
      !layout.every((row) => typeof row === 'string' && row.length === layout[0].length) ||
      layout[0].length < 3) {
    return { valid: false, errors: ['El mapa debe ser una cuadrícula rectangular.'], walkableCells: 0, reachableCells: 0 };
  }
  const width = layout[0].length;
  if (layout.some((row) => /[^#.]/.test(row))) errors.push('El mapa contiene celdas desconocidas.');
  if (layout[0].includes('.') || layout.at(-1).includes('.') ||
      layout.some((row) => row[0] !== '#' || row.at(-1) !== '#')) {
    errors.push('El perímetro debe estar cerrado.');
  }
  const openPosition = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.z) &&
    floorAt(layout, Math.floor(point.x / CELL_SIZE), Math.floor(point.z / CELL_SIZE));
  const spawnValid = openPosition(world.spawn);
  if (!spawnValid) errors.push('La aparición debe estar sobre una celda transitable.');
  if (!Number.isFinite(world.spawn?.yaw)) errors.push('La orientación inicial debe ser válida.');
  const reachable = spawnValid
    ? search(layout, Math.floor(world.spawn.x / CELL_SIZE), Math.floor(world.spawn.z / CELL_SIZE))
    : new Map();
  const walkableCells = layout.reduce((total, row) => total + [...row].filter((cell) => cell === '.').length, 0);
  if (walkableCells !== reachable.size) errors.push('Todas las zonas transitables deben estar conectadas.');
  if (!openPosition(world.exit)) errors.push('Salida: posición no transitable.');
  else if (!reachable.has(Math.floor(world.exit.z / CELL_SIZE) * width + Math.floor(world.exit.x / CELL_SIZE))) {
    errors.push('Salida: no se puede alcanzar desde la aparición.');
  }
  if (!Number.isFinite(world.exit?.yaw)) errors.push('La orientación de salida debe ser válida.');
  for (const [kind, points] of [['Luz', world.lights], ['Señal', world.signs], ['Sector', world.sectors]]) {
    if (!Array.isArray(points)) errors.push(`${kind}: falta la lista de posiciones.`);
    else if (points.some((point) => !openPosition(point))) errors.push(`${kind}: posición no transitable.`);
  }
  return { valid: errors.length === 0, errors, walkableCells, reachableCells: reachable.size };
}
