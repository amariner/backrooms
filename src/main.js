import * as THREE from 'three';
import { WORLD as LEVEL_ZERO, CELL_SIZE, WALL_HEIGHT, isWalkable as walkableIn, findPath as pathIn, validateWorld } from './world-layout.js';
import { wallpaper, carpet, ceiling, labelTexture } from './textures.js';
import { AtmosphereAudio } from './audio.js';
import { LEVEL_ONE, validateLevelOne } from './level-one-layout.js';
import { LevelOneState } from './level-one-state.js';
import { buildLevelOneScene } from './level-one-scene.js';
import { EntityCallState } from './entity-call-state.js';
import { TouchControls, supportsTouchControls } from './touch-controls.js';

const advanced = new URLSearchParams(location.search).get('level') === '1';
const WORLD = advanced ? LEVEL_ONE : LEVEL_ZERO;
const isWalkable = (x, z, radius = .23) => walkableIn(x, z, radius, WORLD);
const findPath = (x, z, tx, tz) => pathIn(x, z, tx, tz, WORLD);
const levelState = advanced ? new LevelOneState() : null;
const entityCall = new EntityCallState();
let levelScene, entityPosition = advanced ? { ...WORLD.entitySpawn } : null;
let entityPath = [], entityRouteTick = 0, patrolIndex = 0, hiddenInShelter = false;
let lastBlackout = false, lastPresence = false, breathingClock = 0, entityStepDistance = 0;
let lastKnownPosition = null;

const $ = (id) => document.getElementById(id);
const canvas = $('scene-canvas');
const audio = new AtmosphereAudio();
const keys = new Set();
const lightPool = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let touchMode = supportsTouchControls(), touchControls, touchSprint = false;
let renderer, scene, camera, flashlight;
let mode = 'menu', elapsed = 0, stamina = 1, exhausted = false;
let yaw = WORLD.spawn.yaw, pitch = 0, bob = 0, sensitivity = 1;
let muted = false, flashlightOn = false, pointerWasLocked = false, dragging = false;
let currentTarget = null, toastTimeout, lastHud = -1, lightTick = 0;
const player = { x: WORLD.spawn.x, z: WORLD.spawn.z };
const wallMaterial = new THREE.MeshStandardMaterial({ map: wallpaper(), roughness: .95, color: '#e2d796' });

function box(w, h, d, material, x, y, z, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}

function sign(text, subtitle, width, x, y, z, yaw = 0, color, bg, parent = scene) {
  const map = labelTexture(text, subtitle, color, bg);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); mesh.rotation.y = yaw; parent.add(mesh); return mesh;
}

function buildWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#070906');
  scene.fog = new THREE.FogExp2('#0d110b', .048);
  camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, .07, 95);
  camera.rotation.order = 'YXZ';
  camera.position.set(player.x, 1.62, player.z);
  scene.add(camera);
  if (advanced) {
    levelScene = buildLevelOneScene(scene, WORLD, { touch: touchMode });
    buildPlayerLights();
    return;
  }
  scene.add(new THREE.AmbientLight('#d6c996', .075));
  scene.add(new THREE.HemisphereLight('#9faaa0', '#13160e', .15));
  const dim = WORLD.grid.length * CELL_SIZE;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(dim, dim), new THREE.MeshStandardMaterial({ map: carpet(WORLD.grid.length * 2), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(dim / 2, 0, dim / 2); floor.receiveShadow = true; scene.add(floor);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(dim, dim), new THREE.MeshStandardMaterial({ map: ceiling(WORLD.grid.length * 2), roughness: 1 }));
  roof.rotation.x = Math.PI / 2; roof.position.set(dim / 2, WALL_HEIGHT, dim / 2); scene.add(roof);

  const solids = [];
  WORLD.grid.forEach((row, z) => [...row].forEach((cell, x) => {
    if (cell === '#' && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dz]) => WORLD.grid[z + dz]?.[x + dx] === '.')) solids.push({ x, z });
  }));
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMaterial, solids.length);
  const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE + .026, .115, CELL_SIZE + .026), new THREE.MeshStandardMaterial({ color: '#625d3e', roughness: 1 }), solids.length);
  const topTrim = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL_SIZE + .018, .035, CELL_SIZE + .018), new THREE.MeshStandardMaterial({ color: '#aaa27a', roughness: 1 }), solids.length);
  const matrix = new THREE.Matrix4();
  solids.forEach(({ x, z }, i) => {
    const wx = (x + .5) * CELL_SIZE, wz = (z + .5) * CELL_SIZE;
    walls.setMatrixAt(i, matrix.makeTranslation(wx, WALL_HEIGHT / 2, wz));
    trim.setMatrixAt(i, matrix.makeTranslation(wx, .065, wz));
    topTrim.setMatrixAt(i, matrix.makeTranslation(wx, WALL_HEIGHT - .028, wz));
  });
  walls.castShadow = true; walls.receiveShadow = true;
  scene.add(walls, trim, topTrim);

  // Each contact shadow is baked into a transparent floor strip, not a real-time shadow map.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = 4; shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext('2d'); const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(21,18,7,.4)'); grad.addColorStop(1, 'rgba(21,18,7,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 64);
  const shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const shadows = [];
  for (const { x, z } of solids) {
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (WORLD.grid[z + dz]?.[x + dx] !== '.') continue;
      shadows.push({ x: (x + .5) * CELL_SIZE + dx * (CELL_SIZE / 2 + .25), z: (z + .5) * CELL_SIZE + dz * (CELL_SIZE / 2 + .25), angle: Math.atan2(dx, dz) });
    }
  }
  const shadowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(CELL_SIZE, .5), shadowMat, shadows.length);
  const dummy = new THREE.Object3D();
  shadows.forEach((s, i) => {
    dummy.position.set(s.x, .012, s.z); dummy.rotation.set(-Math.PI / 2, 0, s.angle); dummy.updateMatrix(); shadowMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(shadowMesh);

  const fixtureMat = new THREE.MeshStandardMaterial({ color: '#5f604a', roughness: .72 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#807954' });
  const deadTubeMat = new THREE.MeshStandardMaterial({ color: '#242b22', roughness: .8 });
  WORLD.lights.forEach(({ x, z }, i) => {
    box(1.95, .065, .5, fixtureMat, x, WALL_HEIGHT - .04, z);
    box(1.77, .018, .115, i % 3 === 0 ? glowMat : deadTubeMat, x, WALL_HEIGHT - .08, z - .105);
    box(1.77, .018, .115, i % 3 === 0 ? glowMat : deadTubeMat, x, WALL_HEIGHT - .08, z + .105);
    if (i % 4 === 0) {
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(.6, .34), new THREE.MeshStandardMaterial({ color: '#74735b', roughness: 1 }));
      tile.rotation.x = Math.PI / 2; tile.position.set(x + .95, WALL_HEIGHT - .012, z + 1.25); scene.add(tile);
      for (let n = 0; n < 7; n++) box(.48, .012, .012, fixtureMat, x + .95, WALL_HEIGHT - .024, z + 1.13 + n * .04);
    }
  });
  for (let i = 0; i < 5; i++) {
    const light = new THREE.PointLight(i % 3 === 0 ? '#ded0a1' : '#bac2a1', 4.2, 10, 2);
    scene.add(light); lightPool.push(light);
  }
  const frameMat = new THREE.MeshStandardMaterial({ color: '#4a4b39', roughness: .8 });
  WORLD.signs.forEach((s) => {
    const group = new THREE.Group(); group.position.set(s.x, 0, s.z); group.rotation.y = s.yaw; scene.add(group);
    box(2.3, .57, .075, frameMat, 0, 2.57, 0, group);
    sign(s.text, s.subtitle, 2.25, 0, 2.57, .041, 0, '#e4e1bd', '#343a2b', group);
    // Separate reverse-facing label avoids mirrored lettering from the back.
    sign(s.text, s.subtitle, 2.25, 0, 2.57, -.041, Math.PI, '#e4e1bd', '#343a2b', group);
    for (const x of [-.85, .85]) box(.022, .27, .022, frameMat, x, 2.99, 0, group);
  });
  buildExit();
  buildPlayerLights();
}

function buildPlayerLights() {
  flashlight = new THREE.SpotLight('#ded9c8', 0, 21, Math.PI / 7, .65, 1.3);
  flashlight.castShadow = true;
  const shadowSize = touchMode ? 512 : 1024;
  flashlight.shadow.mapSize.set(shadowSize, shadowSize);
  flashlight.shadow.camera.near = .12;
  flashlight.shadow.camera.far = 21;
  flashlight.shadow.bias = -.0003;
  flashlight.shadow.normalBias = .028;
  flashlight.position.set(.22, -.15, -.12);
  flashlight.target.position.set(0, -.06, -8);
  camera.add(flashlight, flashlight.target);
}

function buildExit() {
  const exitGroup = new THREE.Group(); exitGroup.position.set(WORLD.exit.x, 0, WORLD.exit.z); exitGroup.rotation.y = WORLD.exit.yaw; scene.add(exitGroup);
  const steel = new THREE.MeshStandardMaterial({ color: '#434e42', metalness: .3, roughness: .65 });
  const door = new THREE.MeshStandardMaterial({ color: '#65755c', roughness: .75, metalness: .2 });
  for (const x of [-.93, .93]) box(.15, 2.92, .3, steel, x, 1.46, 0, exitGroup);
  box(2.02, .15, .3, steel, 0, 2.88, 0, exitGroup);
  box(1.72, 2.75, .15, door, 0, 1.375, 0, exitGroup);
  box(1.24, .08, .09, steel, 0, 1.16, .15, exitGroup);
  box(1.3, .56, .018, steel, 0, 2.03, .089, exitGroup);
  sign('SALIDA', 'AL OTRO LADO', 1.65, 0, 2.6, .17, 0, '#9aa783', '#152019', exitGroup);
  sign('ABRIR LA PUERTA', touchMode ? 'TOCA ABRIR' : 'E', 1.25, 0, 2.03, .105, 0, '#aeb294', '#252b22', exitGroup);
  const exitIndicator = new THREE.MeshBasicMaterial({ color: '#83956a' });
  box(.12, .12, .06, exitIndicator, .65, 1.4, .12, exitGroup);
  const light = new THREE.PointLight('#a8b898', 2.4, 6, 2); light.position.set(0, 2.7, 1); exitGroup.add(light);
}

function toast(message, duration = 4200) {
  clearTimeout(toastTimeout); $('toast').textContent = message; $('toast').hidden = false;
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, duration);
}

function syncAudioButton() {
  $('sound-toggle').setAttribute('aria-pressed', String(!muted));
  const label = muted ? 'Activar sonido' : 'Silenciar sonido';
  $('sound-toggle').title = label; $('sound-toggle').setAttribute('aria-label', label);
}

function hideScreens() {
  ['menu', 'pause-screen', 'win-screen', 'dead-screen', 'hud'].forEach((id) => { $(id).hidden = true; });
}

function setMode(next) {
  mode = next;
  document.body.dataset.mode = next;
}

function resetInput() {
  keys.clear(); dragging = false; touchSprint = false;
  touchControls?.reset();
  $('touch-sprint')?.setAttribute('aria-pressed', 'false');
}

function resetGame() {
  resetInput();
  entityCall.reset(); audio.stopCall();
  elapsed = 0; stamina = 1; exhausted = false; pitch = 0; bob = 0;
  yaw = WORLD.spawn.yaw; player.x = WORLD.spawn.x; player.z = WORLD.spawn.z;
  flashlightOn = true; flashlight.intensity = 18; currentTarget = null;
  $('objective-title').textContent = 'ENCUENTRA LA SALIDA';
  $('objective-detail').textContent = advanced ? 'Busca una puerta. Escucha antes de cruzar.' : 'Hay una puerta al final de estos pasillos.';
  $('flashlight-status').textContent = 'LINTERNA ON';
  $('interaction-prompt').hidden = true;
  $('shelter-status').hidden = true; $('blackout-status').hidden = true;
  if (advanced) {
    levelState.reset(); entityPosition = { ...WORLD.entitySpawn };
    entityPath = []; entityRouteTick = 0; patrolIndex = 0;
    hiddenInShelter = false; lastBlackout = false; lastPresence = false; breathingClock = 0;
    entityStepDistance = 0; lastKnownPosition = null;
  }
  document.body.classList.remove('presence-near', 'power-out');
  keys.clear(); updateHud();
}

function acquireMouse() {
  if (touchMode) return;
  try {
    const request = canvas.requestPointerLock?.();
    request?.catch(() => mouseFallback());
    if (!canvas.requestPointerLock) mouseFallback();
  } catch { mouseFallback(); }
}

function mouseFallback() {
  if (mode === 'playing' && !touchMode) toast('Mantén pulsado el ratón y arrastra para mirar. WASD para moverte.', 6500);
}

function startGame(restart = true) {
  if (restart) resetGame();
  hideScreens(); $('hud').hidden = false; setMode('playing');
  resetInput(); canvas.focus({ preventScroll: true });
  audio.start(); audio.setActive(true); acquireMouse();
  updateHud();
  if (restart) toast(touchMode
    ? 'Joystick para moverte. Arrastra la zona derecha para mirar. Toca los botones para actuar.'
    : advanced
    ? 'Encuentra la salida. Si escuchas pasos, apaga la linterna y rompe la línea de visión.'
    : 'Busca la puerta de salida. F controla la linterna. E abre la puerta.', 5500);
}

function pauseGame() {
  if (mode !== 'playing') return;
  setMode('paused'); resetInput(); hideScreens(); $('pause-screen').hidden = false;
  $('toast').hidden = true;
  $('interaction-prompt').hidden = true; audio.setActive(false);
  if (document.pointerLockElement) document.exitPointerLock();
  $('resume-button').focus();
}

function goHome() {
  setMode('menu'); resetInput(); audio.setActive(false);
  if (document.pointerLockElement) document.exitPointerLock();
  hideScreens(); $('menu').hidden = false; $('toast').hidden = true; resetGame();
  $('start-button').focus();
}

function canMove(x, z) {
  if (!isWalkable(x, z, .24)) return false;
  if (advanced && levelScene.blockers.some((b) => Math.abs(x - b.x) < b.halfX + .24 && Math.abs(z - b.z) < b.halfZ + .24)) return false;
  const doorX = x - WORLD.exit.x, doorZ = z - WORLD.exit.z;
  const c = Math.cos(WORLD.exit.yaw), s = Math.sin(WORLD.exit.yaw);
  return !(Math.abs(doorX * c - doorZ * s) < 1.18 && Math.abs(doorX * s + doorZ * c) < .4);
}

function lineOfSight(target, from = player) {
  const distance = Math.hypot(target.x - from.x, target.z - from.z);
  for (let i = .2; i < distance; i += .2) {
    if (!isWalkable(from.x + (target.x - from.x) * i / distance, from.z + (target.z - from.z) * i / distance, 0)) return false;
  }
  return true;
}

function getTarget() {
  let closest = null, best = 2.7;
  const targets = advanced ? levelScene.interactables : [{ ...WORLD.exit, kind: 'exit' }];
  for (const target of targets) {
    const dx = target.x - player.x, dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / (dist || 1);
    if (dist < best && facing > .5 && lineOfSight(target)) { best = dist; closest = target; }
  }
  return closest;
}

function interact() {
  if (mode !== 'playing' || !getTarget()) return;
  setMode('won'); resetInput(); hideScreens(); $('win-screen').hidden = false;
  $('win-time').textContent = formatTime(elapsed);
  $('win-summary').textContent = 'SALIDA ENCONTRADA';
  $('toast').hidden = true;
  document.body.classList.remove('presence-near');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.escape(); audio.setActive(false); $('win-restart-button').focus();
}

function failLevelOne() {
  if (mode !== 'playing') return;
  setMode('dead'); resetInput(); hideScreens(); $('dead-screen').hidden = false; $('toast').hidden = true;
  document.body.classList.remove('presence-near');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.tone(65, 1.6, .09, 0, 'sine', 32); audio.setActive(false);
  $('retry-button').focus();
}

function callEntity() {
  if (mode !== 'playing' || !advanced || !entityCall.call(player)) return;
  dragging = false;
  audio.callEntity();
  // A shout gives away a hiding place even when the distant entity ignores it.
  hiddenInShelter = false;
  levelState.hidden = false;
  levelState.noise = 1;
  canvas.focus({ preventScroll: true });
  updateHud();
}

function tickLevelOne(dt, moving, sprinting) {
  const previousLure = entityCall.target;
  entityCall.update(dt);
  if (entityCall.target !== previousLure) entityRouteTick = 0;
  const distance = Math.hypot(player.x - entityPosition.x, player.z - entityPosition.z);
  hiddenInShelter = !moving && !flashlightOn && WORLD.shelters.some((s) => Math.hypot(player.x - s.x, player.z - s.z) < s.radius);
  const sight = lineOfSight(player, entityPosition);
  levelState.update(dt, { moving, sprinting: sprinting && moving, flashlightOn, hidden: hiddenInShelter, calling: entityCall.shouting, distance, lineOfSight: sight });
  hiddenInShelter = levelState.hidden;
  if (levelState.blackout !== lastBlackout) {
    if (levelState.blackout) audio.tone(42, 1.8, .045);
    lastBlackout = levelState.blackout;
  }
  const nearby = levelState.detected > .55;
  if (nearby && !lastPresence) audio.tone(92, 1.1, .035, 0, 'sine', 71);
  lastPresence = nearby;
  document.body.classList.toggle('presence-near', nearby);
  document.body.classList.toggle('power-out', levelState.blackout);
  // The first seconds belong to the player. After that, the listener follows connected corridors.
  if ((elapsed > 10 || entityCall.target) && !levelState.failed) {
    const seesPlayer = sight && distance < (flashlightOn ? 25 : 13);
    const hearsPlayer = levelState.noise > .4 && distance < 24;
    if (!hiddenInShelter && (seesPlayer || hearsPlayer)) lastKnownPosition = { ...player };
    const chasing = !hiddenInShelter && lastKnownPosition && (levelState.detected > .3 || hearsPlayer);
    if (entityCall.target && Math.hypot(entityPosition.x - entityCall.target.x, entityPosition.z - entityCall.target.z) < 1.1) {
      entityCall.finishLure(); entityRouteTick = 0;
    }
    const investigating = Boolean(entityCall.target);
    entityRouteTick -= dt;
    if (entityRouteTick <= 0) {
      let destination = chasing ? lastKnownPosition : entityCall.target || WORLD.patrol[patrolIndex];
      if (!chasing && !investigating && Math.hypot(entityPosition.x - destination.x, entityPosition.z - destination.z) < 1.1) {
        patrolIndex = (patrolIndex + 1) % WORLD.patrol.length; destination = WORLD.patrol[patrolIndex];
      }
      entityPath = findPath(entityPosition.x, entityPosition.z, destination.x, destination.z).slice(1);
      // A player in the same cell is still reachable; no teleporting through walls.
      if (!entityPath.length && lineOfSight(destination, entityPosition)) entityPath = [{ x: destination.x, z: destination.z }];
      entityRouteTick = .75;
    }
    const next = entityPath[0];
    if (next) {
      const dx = next.x - entityPosition.x, dz = next.z - entityPosition.z;
      const length = Math.hypot(dx, dz), step = Math.min(length, dt * (chasing ? 3.85 : investigating ? 3.2 : 1.7));
      if (length > .001) {
        const nx = entityPosition.x + dx / length * step, nz = entityPosition.z + dz / length * step;
        if (isWalkable(nx, nz, .2)) {
          entityPosition.x = nx; entityPosition.z = nz; entityStepDistance += step;
          if (entityStepDistance > 1.2) {
            entityStepDistance %= 1.2;
            audio.presence(distance, (Math.cos(yaw) * (nx - player.x) - Math.sin(yaw) * (nz - player.z)) / Math.max(distance, 1), false, !sight);
          }
        }
      }
      if (length < .15) entityPath.shift();
    }
  }
  breathingClock -= dt;
  if (breathingClock <= 0 && distance < 17) {
    audio.presence(distance, (Math.cos(yaw) * (entityPosition.x - player.x) - Math.sin(yaw) * (entityPosition.z - player.z)) / Math.max(distance, 1), true, !sight);
    breathingClock = 3.6;
  }
  if (levelState.failed) failLevelOne();
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function updateHud() {
  $('timer').textContent = formatTime(elapsed);
  $('stamina-fill').style.transform = `scaleX(${stamina})`;
  $('stamina-fill').style.opacity = exhausted ? '.45' : '1';
  const angle = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  const headings = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  $('compass').textContent = `${headings[Math.round(angle / 45) % 8]} · ${String(Math.round(angle) % 360).padStart(3, '0')}°`;
  const sector = WORLD.sectors.reduce((best, s) => Math.hypot(player.x - s.x, player.z - s.z) < Math.hypot(player.x - best.x, player.z - best.z) ? s : best);
  $('sector').textContent = sector.name;
  currentTarget = getTarget();
  $('interaction-prompt').hidden = !currentTarget || mode !== 'playing';
  if (currentTarget) $('interaction-prompt').lastElementChild.textContent = advanced ? 'Abrir el ascensor' : 'Abrir la salida';
  $('flashlight-status').textContent = `LINTERNA ${flashlightOn ? 'ON' : 'OFF'}`;
  $('touch-interact').disabled = !currentTarget || mode !== 'playing';
  $('touch-flashlight').setAttribute('aria-pressed', String(flashlightOn));
  $('touch-flashlight').setAttribute('aria-label', flashlightOn ? 'Apagar linterna' : 'Encender linterna');
  $('touch-sprint').setAttribute('aria-pressed', String(touchSprint));
  $('interaction-prompt').firstElementChild.textContent = touchMode ? 'TOCA ABRIR' : 'E';
  if (advanced) {
    $('shelter-status').hidden = !hiddenInShelter;
    $('blackout-status').hidden = !levelState.blackout;
    $('entity-call-button').disabled = entityCall.cooldown > 0;
    $('entity-call-button').classList.toggle('is-calling', entityCall.shouting);
    $('entity-call-status').textContent = entityCall.shouting ? 'Qué gran idea…' : entityCall.cooldown > 0 ? `Coge aire · ${Math.ceil(entityCall.cooldown)} s` : '¿Y si te escucha?';
    $('entity-call-caption').hidden = !entityCall.shouting;
  }
}

function updateLighting(time) {
  if (advanced) return;
  const nearest = WORLD.lights.filter((_, i) => i % 3 === 0).map((light) => ({ ...light, distance: (light.x - camera.position.x) ** 2 + (light.z - camera.position.z) ** 2 })).sort((a, b) => a.distance - b.distance);
  lightPool.forEach((light, i) => {
    const source = nearest[i];
    light.position.set(source.x, WALL_HEIGHT - .22, source.z);
    // A slow, low-amplitude fluctuation avoids harsh flashing.
    light.intensity = 4.2 * (reducedMotion ? 1 : .95 + .05 * Math.sin(time * 1.4 + i * 8));
  });
}

function configureLevelUI() {
  document.body.dataset.level = advanced ? '1' : '0';
  document.querySelectorAll('.level-option').forEach((link) => {
    if (link.dataset.level === document.body.dataset.level) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('next-level-button').hidden = advanced;
  $('entity-call-control').hidden = !advanced;
  $('entity-call-instruction').hidden = !advanced;
  $('touch-entity-call-instruction').hidden = !advanced;
  if (!advanced) return;
  document.title = 'BACKROOMS — Nivel 1 · El ala de servicio';
  $('menu-eyebrow').innerHTML = '<span class="eyebrow-line"></span> ARCHIVO 002 <span class="eyebrow-separator">/</span> NIVEL 1';
  $('menu-description').innerHTML = '<p>La salida solo llevaba más abajo.<br />Hay algo respirando en la oscuridad.</p><p class="description-last">Encuentra una puerta. Llega antes que eso.</p>';
  $('start-button').firstElementChild.textContent = 'DESCENDER';
  $('menu-level-name').textContent = 'NIVEL 1 — EL ALA DE SERVICIO';
  $('menu-level-subtitle').textContent = 'RIESGO ELEVADO · PRESENCIA NO IDENTIFICADA';
  $('instructions-intro').innerHTML = 'Encuentra el ascensor de salida y pulsa <strong>E</strong> para abrirlo. Tu linterna siempre funciona; contrólala con <strong>F</strong>. La entidad oye cuando corres y ve tu luz. Dobla una esquina y apágala para perderla. En los rincones señalizados con una luz azul tenue, quédate quieto y a oscuras para esconderte. Pulsa <strong>G</strong> para gritar «Entitiiii!!»: puede atraerla al lugar donde llamaste. Gritar te delata, incluso en un refugio.';
  $('win-eyebrow').textContent = 'ARCHIVO 002 / TRANSMISIÓN RECUPERADA';
  $('win-title').innerHTML = 'AL OTRO<br /><span>LADO.</span>';
  $('win-description').innerHTML = 'Las puertas se cierran. El ascensor desciende.<br />Alguien ha pulsado el botón desde abajo.';
  $('win-footnote').textContent = 'EN EL REGISTRO APARECEN DOS PASAJEROS.';
}

function configureInputUI() {
  document.body.dataset.input = touchMode ? 'touch' : 'desktop';
  document.body.dataset.mode = mode;
  $('touch-controls').hidden = !touchMode;
  touchControls?.setEnabled(touchMode);
  if (!touchMode) return;
  $('fullscreen-toggle').hidden = !document.documentElement.requestFullscreen;
  $('instructions-intro').textContent = advanced
    ? 'Encuentra el ascensor y toca ABRIR cuando estés cerca y mirando hacia él. La entidad ve tu luz y oye tus pasos. Dobla una esquina, apaga la linterna y quédate quieto en un refugio azul para esconderte. Entitiiii!! puede atraerla al lugar donde llamaste: gritar te delata.'
    : 'Explora los pasillos con el joystick y busca la salida. Arrastra la zona derecha para mirar. Cuando estés cerca de la puerta y mirándola, toca ABRIR. Puedes jugar en vertical o en horizontal.';
  $('pause-footnote').textContent = 'TOCA CONTINUAR PARA VOLVER';
  $('dialog-note').textContent = 'Puedes moverte y mirar a la vez con dos dedos. Toca Correr para activarlo o desactivarlo. En horizontal tendrás más espacio para explorar.';
  $('entity-call-button').title = 'Gritar Entitiiii!! · Puede atraer a la entidad';
}

function resizeViewport() {
  resetInput();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, touchMode ? 1.25 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  updateHud();
}

function enableTouchMode() {
  if (touchMode) return;
  touchMode = true;
  // First touch also supports hybrid devices whose media queries report a mouse.
  if (document.pointerLockElement) document.exitPointerLock();
  flashlight.shadow.mapSize.set(512, 512);
  flashlight.shadow.map?.dispose(); flashlight.shadow.map = null;
  configureInputUI(); resizeViewport();
}

function toggleFlashlight() {
  if (mode !== 'playing') return;
  flashlightOn = !flashlightOn; flashlight.intensity = flashlightOn ? 18 : 0;
  updateHud();
}

function bindControls() {
  canvas.tabIndex = -1;
  touchControls = new TouchControls({
    joystick: $('touch-joystick'), thumb: $('touch-stick'), lookSurface: canvas,
    isPlaying: () => mode === 'playing',
    onLook: (dx, dy) => {
      yaw -= dx * .004 * sensitivity;
      pitch = THREE.MathUtils.clamp(pitch - dy * .004 * sensitivity, -1.3, 1.3);
    },
  });
  touchControls.setEnabled(touchMode);
  $('touch-pause').addEventListener('click', pauseGame);
  $('touch-interact').addEventListener('click', interact);
  $('touch-flashlight').addEventListener('click', toggleFlashlight);
  $('touch-sprint').addEventListener('click', () => {
    if (mode !== 'playing') return;
    touchSprint = !touchSprint; updateHud();
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') enableTouchMode();
  }, { capture: true, passive: true });
  $('start-button').addEventListener('click', () => startGame());
  $('resume-button').addEventListener('click', () => startGame(false));
  $('restart-button').addEventListener('click', () => startGame());
  $('win-restart-button').addEventListener('click', () => startGame());
  $('home-button').addEventListener('click', goHome);
  $('retry-button').addEventListener('click', () => startGame());
  $('dead-home-button').addEventListener('click', goHome);
  $('entity-call-button').addEventListener('click', callEntity);
  $('instructions-button').addEventListener('click', () => $('instructions-dialog').showModal());
  $('close-instructions').addEventListener('click', () => $('instructions-dialog').close());
  $('instructions-dialog').addEventListener('click', (e) => {
    const rect = $('instructions-dialog').getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) $('instructions-dialog').close();
  });
  $('sensitivity').addEventListener('input', (e) => { sensitivity = Number(e.target.value); });
  $('sound-toggle').addEventListener('click', () => { muted = !muted; audio.setMuted(muted); if (!muted) audio.start(); syncAudioButton(); });
  $('fullscreen-toggle').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('Este navegador no permite pantalla completa.');
    } catch { toast('No se pudo activar la pantalla completa.'); }
  });
  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
    $('fullscreen-toggle').title = label; $('fullscreen-toggle').setAttribute('aria-label', label);
  });
  document.addEventListener('keydown', (e) => {
    if ($('instructions-dialog').open) return;
    if (e.code === 'Escape') {
      if (e.repeat) return;
      if (mode === 'playing') pauseGame(); else if (mode === 'paused') startGame(false);
      return;
    }
    if (mode !== 'playing') return;
    // Preserve native keyboard activation for HUD and utility buttons.
    if (e.code === 'Space' && e.target instanceof Element && e.target.closest('button')) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyF', 'KeyG'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyG') callEntity();
    if (e.code === 'KeyF') toggleFlashlight();
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && pointerWasLocked && mode === 'playing') pauseGame();
    pointerWasLocked = locked;
  });
  document.addEventListener('pointerlockerror', mouseFallback);
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && mode === 'playing' && e.button === 0) dragging = true; });
  document.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('click', () => { if (mode === 'playing' && !document.pointerLockElement) acquireMouse(); });
  document.addEventListener('mousemove', (e) => {
    if (e.sourceCapabilities?.firesTouchEvents) return;
    if (mode !== 'playing' || (!document.pointerLockElement && !dragging)) return;
    yaw -= e.movementX * .002 * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * .002 * sensitivity, -1.3, 1.3);
  });
  window.addEventListener('blur', () => { resetInput(); if (mode === 'playing') pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('resize', resizeViewport);
  window.visualViewport?.addEventListener('resize', resizeViewport);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); pauseGame(); toast('Se perdió la conexión gráfica. Recarga la página para volver a entrar.', 60000);
  });
  syncAudioButton();
}

let lastTime = 0;
function frame(milliseconds) {
  const time = milliseconds / 1000;
  const dt = Math.min(lastTime ? time - lastTime : .016, .05); lastTime = time;
  let moving = false, sprinting = false;
  if (mode === 'playing') {
    elapsed += dt;
    const touchMovement = touchControls.movement;
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touchMovement.forward;
    const strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + touchMovement.strafe;
    const length = Math.hypot(forward, strafe);
    if (exhausted && stamina > .3) exhausted = false;
    sprinting = length > 0 && (keys.has('ShiftLeft') || keys.has('ShiftRight') || touchSprint) && !exhausted && stamina > .015;
    const speed = sprinting ? 6.1 : 3.45;
    if (length) {
      const normalization = Math.max(1, length); // Preserve the joystick's analog speed.
      const dx = (Math.cos(yaw) * strafe - Math.sin(yaw) * forward) / normalization * speed * dt;
      const dz = (-Math.sin(yaw) * strafe - Math.cos(yaw) * forward) / normalization * speed * dt;
      const oldX = player.x, oldZ = player.z;
      // Substeps keep collisions reliable at low frame rates and while sprinting.
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12));
      for (let i = 0; i < steps; i++) {
        if (canMove(player.x + dx / steps, player.z)) player.x += dx / steps;
        if (canMove(player.x, player.z + dz / steps)) player.z += dz / steps;
      }
      moving = Math.hypot(player.x - oldX, player.z - oldZ) > .001;
    }
    stamina = THREE.MathUtils.clamp(stamina + (sprinting && moving ? -.19 : .12) * dt, 0, 1);
    if (stamina <= .015) exhausted = true;
    if (moving) bob += dt * (sprinting ? 12 : 8);
    const offset = moving && !reducedMotion ? Math.sin(bob) * (sprinting ? .042 : .025) : 0;
    camera.position.set(player.x, 1.62 + offset, player.z);
    camera.rotation.set(pitch, yaw, moving && !reducedMotion ? Math.cos(bob / 2) * .003 : 0);
    if (advanced) tickLevelOne(dt, moving, sprinting);
    const targetFov = sprinting && moving && !reducedMotion ? 79 : 74;
    if (Math.abs(camera.fov - targetFov) > .01) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
    if (time - lastHud > .1) { updateHud(); lastHud = time; }
  } else if (mode === 'menu') {
    camera.position.set(WORLD.spawn.x + .35, 1.63, WORLD.spawn.z - .2);
    camera.rotation.set(-.015, .34 + (reducedMotion ? 0 : Math.sin(time * .11) * .11), 0);
  }
  audio.update({ moving: mode === 'playing' && moving, sprinting, dt, tension: advanced ? levelState.detected : .12 });
  if (advanced) levelScene.update(reducedMotion ? 0 : elapsed, { blackout: levelState.blackout, player: camera.position, entityPosition, threat: levelState.detected });
  if (time - lightTick > .18) { updateLighting(time); lightTick = time; }
  renderer.render(scene, camera);
}

try {
  const validation = advanced ? validateLevelOne() : validateWorld();
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchMode, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, touchMode ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  buildWorld(); configureLevelUI(); configureInputUI(); bindControls(); updateLighting(0);
  renderer.setAnimationLoop(frame);
  $('loading-indicator').hidden = true; $('start-button').disabled = false;
  // Development-only harness exercises the actual interaction and collision functions.
  if (import.meta.env.DEV) {
    window.__BACKROOMS__ = {
      state: () => ({ mode, level: advanced ? 1 : 0, x: player.x, z: player.z, yaw, pitch, elapsed, stamina, exhausted, flashlightOn, target: currentTarget?.kind, drawCalls: renderer.info.render.calls,
        inputMode: touchMode ? 'touch' : 'desktop', touch: { ...touchControls.movement, sprinting: touchSprint }, pixelRatio: renderer.getPixelRatio(),
        ...(advanced ? { noise: levelState.noise, detected: levelState.detected, blackout: levelState.blackout, hidden: hiddenInShelter, entity: { ...entityPosition },
          call: { count: entityCall.count, cooldown: entityCall.cooldown, shouting: entityCall.shouting, pending: Boolean(entityCall.pending), target: entityCall.target ? { ...entityCall.target } : null } } : {}) }),
      world: WORLD,
      walkTo: (x, z) => { if (!canMove(x, z)) return false; player.x = x; player.z = z; updateHud(); return true; },
      lookAt: (x, z) => { yaw = Math.atan2(-(x - player.x), -(z - player.z)); pitch = 0; updateHud(); },
      path: findPath,
      canMove,
      advance: (seconds) => {
        if (!advanced || !Number.isFinite(seconds) || seconds < 0 || seconds > 600) return false;
        for (let remaining = seconds; remaining > 0 && mode === 'playing'; remaining -= .05) {
          const dt = Math.min(.05, remaining); elapsed += dt; tickLevelOne(dt, false, false);
        }
        updateHud(); return true;
      },
    };
  }
} catch (error) {
  console.error('No se pudo iniciar Backrooms:', error);
  $('loading-indicator').hidden = true;
  $('error-message').textContent = 'No se pudo iniciar el escenario 3D. Prueba con un navegador actualizado y compatible con WebGL 2.';
  $('error-message').hidden = false;
}
