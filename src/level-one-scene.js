import * as THREE from 'three';
import { CELL_SIZE, WALL_HEIGHT } from './world-layout.js';
import { labelTexture } from './textures.js';
import { serviceConcrete, serviceFloor, hazardTexture, puddleTexture, warningGraffiti } from './industrial-textures.js';
import { createEntity } from './entity.js';

/** Visuals and physical props. Gameplay, detection and path finding live in main. */
export function buildLevelOneScene(scene, world, { touch = false } = {}) {
  scene.background = new THREE.Color('#020404');
  scene.fog = new THREE.FogExp2('#040807', .046);
  const ambient = new THREE.AmbientLight('#a2aaa0', .07);
  const hemisphere = new THREE.HemisphereLight('#7b9389', '#090c0b', .12);
  scene.add(ambient, hemisphere);

  const interactables = [], lightPool = [], blockers = [];
  const batches = new Map(), dummy = new THREE.Object3D(), cablePoints = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitPipe = new THREE.CylinderGeometry(1, 1, 1, 10);
  const materials = {
    concrete: new THREE.MeshStandardMaterial({ map: serviceConcrete(), roughness: .93 }),
    steel: new THREE.MeshStandardMaterial({ color: '#354846', metalness: .58, roughness: .66 }),
    pale: new THREE.MeshStandardMaterial({ color: '#81938b', metalness: .25, roughness: .77 }),
    dark: new THREE.MeshStandardMaterial({ color: '#172925', roughness: .85, metalness: .35 }),
    rust: new THREE.MeshStandardMaterial({ color: '#665141', metalness: .52, roughness: .79 }),
    red: new THREE.MeshStandardMaterial({ color: '#713b32', metalness: .3, roughness: .75 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#ae963d', roughness: .75 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: .77 }),
    whiteGlow: new THREE.MeshBasicMaterial({ color: '#56665b' }),
    amberGlow: new THREE.MeshBasicMaterial({ color: '#70503a' }),
    cyanGlow: new THREE.MeshBasicMaterial({ color: '#375b50' }),
    redGlow: new THREE.MeshBasicMaterial({ color: '#6e3224' }),
  };
  function shape(kind, material, size, position, rotation = [0, 0, 0], parent) {
    const key = `${kind}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { geometry: kind === 'pipe' ? unitPipe : unitBox, material, matrices: [] });
    dummy.position.set(...position); dummy.scale.set(...size); dummy.rotation.set(...rotation); dummy.updateMatrix();
    const matrix = dummy.matrix.clone();
    if (parent) { parent.updateMatrixWorld(); matrix.premultiply(parent.matrixWorld); }
    batches.get(key).matrices.push(matrix);
  }
  const box = (w, h, d, material, x, y, z, parent, rotation) => shape('box', material, [w, h, d], [x, y, z], rotation, parent);
  const pipe = (r, length, material, x, y, z, rotation = [0, 0, 0], parent) => shape('pipe', material, [r, length, r], [x, y, z], rotation, parent);
  function sign(title, subtitle, width, x, y, z, yaw = 0, color = '#b8d0bb', bg = '#20332f', parent = scene) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4),
      new THREE.MeshStandardMaterial({ map: labelTexture(title, subtitle, color, bg), roughness: .88, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; parent.add(mesh); return mesh;
  }
  function groupAt(x, z, yaw = 0) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = yaw; scene.add(group); return group;
  }
  function dynamicBox(w, h, d, material, x, y, z, parent) {
    const mesh = new THREE.Mesh(unitBox, material); mesh.scale.set(w, h, d); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function line(points) {
    for (let i = 1; i < points.length; i++) cablePoints.push(...points[i - 1], ...points[i]);
  }

  const rows = world.grid.length, columns = world.grid[0].length;
  const dimX = columns * CELL_SIZE, dimZ = rows * CELL_SIZE;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(dimX, dimZ), new THREE.MeshStandardMaterial({ map: serviceFloor(columns), roughness: .55, metalness: .19 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(dimX / 2, 0, dimZ / 2); floor.receiveShadow = true; scene.add(floor);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(dimX, dimZ), new THREE.MeshStandardMaterial({ color: '#344440', roughness: .94 }));
  roof.rotation.x = Math.PI / 2; roof.position.set(dimX / 2, WALL_HEIGHT, dimZ / 2); scene.add(roof);
  const faces = [], clearCells = [];
  world.grid.forEach((row, z) => [...row].forEach((cell, x) => {
    const wx = (x + .5) * CELL_SIZE, wz = (z + .5) * CELL_SIZE;
    if (cell === '.') { clearCells.push({ x: wx, z: wz, col: x, row: z }); return; }
    let visible = false;
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (world.grid[z + dz]?.[x + dx] !== '.') continue;
      visible = true;
      faces.push({ x: wx + dx * (CELL_SIZE / 2 + .03), z: wz + dz * (CELL_SIZE / 2 + .03), yaw: Math.atan2(dx, dz), dx, dz });
    }
    if (!visible) return;
    box(CELL_SIZE, WALL_HEIGHT, CELL_SIZE, materials.concrete, wx, WALL_HEIGHT / 2, wz);
    box(CELL_SIZE + .025, .17, CELL_SIZE + .025, materials.dark, wx, .09, wz);
    box(CELL_SIZE + .04, .13, CELL_SIZE + .04, materials.steel, wx, 2.92, wz);
  }));

  // Wall hardware is tied to solid boundaries, keeping every corridor traversable.
  faces.forEach((face, index) => {
    const group = groupAt(face.x, face.z, face.yaw);
    if (index % 2 === 0) {
      box(.15, 2.9, .12, materials.steel, -1.45, 1.45, .055, group);
      box(.23, .3, .17, materials.hazard, -1.45, .36, .09, group);
    }
    if (index % 3 === 0) {
      pipe(.064, CELL_SIZE, materials.rust, 0, 2.56, .14, [0, 0, Math.PI / 2], group);
      for (const x of [-1.2, 1.2]) pipe(.093, .065, materials.steel, x, 2.56, .14, [0, 0, Math.PI / 2], group);
    }
    if (index % 17 === 5) {
      box(1.08, .56, .07, materials.dark, 0, 2.04, .08, group);
      for (let j = 0; j < 7; j++) box(.94, .025, .035, materials.steel, 0, 1.82 + j * .065, .14, group);
      sign(`B-${String(index + 1).padStart(3, '0')}`, 'ACCESO TÉCNICO', .7, 0, 1.5, .11, 0, '#a3b4a3', '#293b35', group);
    }
    if (index % 29 === 9) {
      box(.67, .89, .1, materials.steel, -.3, 1.12, .065, group);
      box(.51, .58, .045, materials.dark, -.3, 1.15, .13, group);
      box(.25, .055, .014, materials.amberGlow, -.3, 1.31, .158, group);
      pipe(.025, .6, materials.dark, -.3, 1.87, .08, [0, 0, 0], group);
    }
  });

  // The service spine has continuous copper mains, braces and floor lane markers.
  const spineX = world.spawn.x;
  for (let row = 2; row < rows - 2; row++) {
    const z = (row + .5) * CELL_SIZE;
    if (world.grid[row]?.[Math.floor(spineX / CELL_SIZE)] !== '.') continue;
    for (const offset of [-2.35, -1.95]) {
      pipe(offset === -2.35 ? .12 : .072, CELL_SIZE, materials.rust, spineX + offset, 2.73, z, [Math.PI / 2, 0, 0]);
      if (row % 3 === 0) pipe(.16, .08, materials.steel, spineX + offset, 2.73, z, [Math.PI / 2, 0, 0]);
    }
    if (row % 3 === 0) {
      box(5.8, .08, .11, materials.steel, spineX, 2.96, z);
      for (const offset of [-2.35, 2.35]) box(.045, .33, .045, materials.steel, spineX + offset, 2.9, z);
    }
    for (const offset of [-1.4, 1.4]) box(.045, .008, CELL_SIZE * .62, materials.yellow, spineX + offset, .009, z);
  }

  const lightSources = [];
  const fixtures = world.lights?.length ? world.lights : clearCells.filter((_, i) => i % 12 === 0);
  fixtures.forEach(({ x, z }, i) => {
    const warm = i % 4 === 1, broken = i % 7 === 3;
    box(1.38, .09, .3, materials.dark, x, 2.99, z);
    box(1.18, .025, .11, broken ? materials.dark : warm ? materials.amberGlow : materials.whiteGlow, x, 2.925, z);
    for (const offset of [-.42, 0, .42]) box(.025, .055, .25, materials.steel, x + offset, 2.92, z);
    lightSources.push({ x, z, y: 2.74, color: warm ? '#c69360' : '#a1b5a5', base: broken ? .15 : warm ? 3 : 4, emergency: false, phase: i * 1.77 });
    if (i % 6 === 2) {
      line([[x + .7, 3.05, z], [x + .73, 2.5, z + .05], [x + .9, 2.18, z + .08], [x + 1.06, 2.36, z + .15], [x + 1.04, 2.78, z + .18]]);
    }
  });
  for (let i = 0; i < 6; i++) { const light = new THREE.PointLight('#b6d7c3', 0, 8, 2); scene.add(light); lightPool.push(light); }

  const puddles = clearCells.filter(({ col, row }) => (col * 19 + row * 11) % 23 === 0);
  const puddleMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.7, 2.5), new THREE.MeshStandardMaterial({ map: puddleTexture(), color: '#527777', transparent: true, opacity: .36, roughness: .12, metalness: .6, depthWrite: false }), puddles.length);
  puddles.forEach(({ x, z, row }, i) => { dummy.position.set(x, .016, z); dummy.scale.set(1, 1, 1); dummy.rotation.set(-Math.PI / 2, 0, row); dummy.updateMatrix(); puddleMesh.setMatrixAt(i, dummy.matrix); });
  scene.add(puddleMesh);
  clearCells.filter(({ col, row }) => (col * 7 + row * 3) % 31 === 0).forEach(({ x, z }) => {
    box(.75, .025, .42, materials.dark, x + .9, .015, z + .9);
    for (let i = 0; i < 8; i++) box(.035, .018, .37, materials.steel, x + .6 + i * .085, .032, z + .9);
  });

  for (const s of world.signs || []) {
    const group = groupAt(s.x, s.z, s.yaw || 0);
    box(2.44, .66, .07, materials.dark, 0, 2.5, 0, group);
    sign(s.text, s.subtitle, 2.38, 0, 2.5, .041, 0, '#d0c69b', '#29352e', group);
    sign(s.text, s.subtitle, 2.38, 0, 2.5, -.041, Math.PI, '#d0c69b', '#29352e', group);
    for (const x of [-.9, .9]) box(.025, .34, .025, materials.steel, x, 2.95, 0, group);
  }

  // A red threshold gives the starting hall a landmark visible through the fog.
  const gateZ = world.spawn.z - CELL_SIZE * 1.45;
  for (const x of [spineX - 3.05, spineX + 3.05]) {
    box(.18, 3, .32, materials.red, x, 1.5, gateZ);
    box(.24, .75, .35, materials.hazard, x, .48, gateZ);
  }
  box(6.28, .17, .32, materials.red, spineX, 2.99, gateZ);
  sign('ALA DE SERVICIO', '01  /  SUMINISTRO INTERRUMPIDO', 3.1, spineX, 2.58, gateZ + .18, 0, '#dfb78d', '#492c27');
  box(.27, .12, .15, materials.redGlow, spineX - 2.7, 2.7, gateZ + .2);
  lightSources.push({ x: spineX - 2.6, y: 2.5, z: gateZ + .4, color: '#b96542', base: 3, emergency: true, phase: 0 });

  const graffitiFace = faces.filter((face) => face.dz === 1).sort((a, b) => Math.hypot(a.x - spineX, a.z - world.spawn.z) - Math.hypot(b.x - spineX, b.z - world.spawn.z))[0];
  if (graffitiFace) {
    const graffiti = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.05), new THREE.MeshStandardMaterial({ map: warningGraffiti(), transparent: true, depthWrite: false, roughness: 1 }));
    graffiti.position.set(graffitiFace.x, 1.58, graffitiFace.z + .015); scene.add(graffiti);
  }

  for (const shelter of world.shelters || []) {
    const group = groupAt(shelter.x, shelter.z);
    // A weak inspection lamp marks each alcove; its floor remains completely clear.
    box(.34, .09, .2, materials.dark, 0, 2.98, 0, group);
    box(.19, .023, .07, materials.cyanGlow, 0, 2.92, 0, group);
    lightSources.push({ x: shelter.x, y: 2.7, z: shelter.z, color: '#6b9d8e', base: 2.4, emergency: true, phase: 0 });
  }

  const exitGroup = groupAt(world.exit.x, world.exit.z, world.exit.yaw || 0);
  for (const x of [-1.23, 1.23]) {
    box(.2, 2.9, .48, materials.steel, x, 1.45, 0, exitGroup);
    box(.09, 1.2, .035, materials.hazard, x, .76, .26, exitGroup);
  }
  box(2.66, .17, .48, materials.steel, 0, 2.86, 0, exitGroup);
  box(2.5, .035, .55, materials.steel, 0, .018, .07, exitGroup);
  for (const x of [-.58, .58]) {
    box(1.135, 2.68, .13, materials.pale, x, 1.37, -.04, exitGroup);
    box(.98, 1.65, .02, materials.steel, x, 1.25, .035, exitGroup);
    for (const offset of [-.29, 0, .29]) box(.018, 1.6, .012, materials.dark, x + offset, 1.25, .048, exitGroup);
  }
  box(.025, 2.68, .08, materials.dark, 0, 1.37, .04, exitGroup);
  box(.28, .65, .1, materials.dark, 1.52, 1.25, .05, exitGroup);
  const exitMaterial = new THREE.MeshBasicMaterial({ color: '#5f9270' });
  dynamicBox(.12, .12, .015, exitMaterial, 1.52, 1.31, .111, exitGroup);
  sign('SALIDA', 'ASCENSOR  /  02', 2.04, 0, 2.53, .092, 0, '#bdd1b8', '#23352a', exitGroup);
  sign('ABRIR', touch ? 'TOCA EL BOTÓN' : 'E', 1.05, 0, 2.13, .065, 0, '#bcc5ac', '#222c26', exitGroup);
  interactables.push({ ...world.exit, kind: 'exit', group: exitGroup });
  const exYaw = world.exit.yaw || 0;
  blockers.push({ x: world.exit.x, z: world.exit.z, halfX: Math.abs(Math.cos(exYaw)) * 1.36 + Math.abs(Math.sin(exYaw)) * .32, halfZ: Math.abs(Math.sin(exYaw)) * 1.36 + Math.abs(Math.cos(exYaw)) * .32 });
  lightSources.push({ x: world.exit.x, y: 2.6, z: world.exit.z + .6, color: '#a6bd95', base: 4, emergency: true, phase: 0 });

  const creature = createEntity();
  const entity = creature.group; scene.add(entity);
  if (world.entitySpawn) entity.position.set(world.entitySpawn.x, 0, world.entitySpawn.z);
  entity.visible = false;

  for (const { geometry, material, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); scene.add(mesh);
  }
  if (cablePoints.length) {
    const cables = new THREE.BufferGeometry(); cables.setAttribute('position', new THREE.Float32BufferAttribute(cablePoints, 3));
    scene.add(new THREE.LineSegments(cables, new THREE.LineBasicMaterial({ color: '#16221c' })));
  }

  let lastLighting = -Infinity;
  let lastLightPosition = null;
  let nearestLights = [];
  function update(time, { blackout = false, player, entityPosition, threat = 0 } = {}) {
    ambient.intensity = blackout ? .025 : .07;
    hemisphere.intensity = blackout ? .045 : .12;
    materials.whiteGlow.color.set(blackout ? '#0a100d' : '#56665b');
    materials.amberGlow.color.set(blackout ? '#120e08' : '#70503a');
    if (player && (!lastLightPosition || time < lastLighting || time - lastLighting > .14 ||
      Math.hypot(player.x - lastLightPosition.x, player.z - lastLightPosition.z) >= .5)) {
      nearestLights = lightSources.map((s) => ({ ...s, distance: Math.hypot(s.x - player.x, s.z - player.z) })).sort((a, b) => a.distance - b.distance).slice(0, 6);
      lastLighting = time;
      lastLightPosition = { x: player.x, z: player.z };
    }
    lightPool.forEach((light, index) => {
      const source = nearestLights[index]; if (!source) { light.intensity = 0; return; }
      light.position.set(source.x, source.y, source.z); light.color.set(source.color);
      const flicker = source.emergency ? .95 + Math.sin(time * 1.3 + source.phase) * .05 : .96 + Math.sin(time * 1.7 + source.phase) * .04;
      light.intensity = source.base * flicker * (blackout && !source.emergency ? .015 : 1);
    });
    creature.update(time, { position: entityPosition, target: player, threat });
  }
  return { interactables, lightPool, entity, update, blockers };
}
