import * as THREE from 'three';
import { WORLD, CELL_SIZE, WALL_HEIGHT, isWalkable, findPath, validateWorld } from './world-layout.js';
import { wallpaper, carpet, ceiling, labelTexture } from './textures.js';
import { AtmosphereAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene-canvas');
const audio = new AtmosphereAudio();
const keys = new Set();
const collected = new Set();
const fuseObjects = [];
const lightPool = [];
const routeDots = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer, scene, camera, flashlight, exitGroup, exitIndicator, exitStatusSign, exitHeaderSign;
let mode = 'menu', elapsed = 0, stamina = 1, exhausted = false;
let yaw = WORLD.spawn.yaw, pitch = 0, bob = 0, sensitivity = 1;
let muted = false, flashlightOn = false, pointerWasLocked = false, dragging = false;
let currentTarget = null, toastTimeout, hintUntil = 0, lastHud = -1, lightTick = 0;
let hintRoute = [], hintTarget = null, hintRefresh = 0;
const player = { x: WORLD.spawn.x, z: WORLD.spawn.z };
const wallMaterial = new THREE.MeshStandardMaterial({ map: wallpaper(), roughness: .95, color: '#e2d796' });

function box(w, h, d, material, x, y, z, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}

function sign(text, subtitle, width, x, y, z, yaw = 0, color, bg, parent = scene) {
  const map = labelTexture(text, subtitle, color, bg);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  mesh.position.set(x, y, z); mesh.rotation.y = yaw; parent.add(mesh); return mesh;
}

function buildWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#393725');
  scene.fog = new THREE.FogExp2('#4c472b', .023);
  camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, .07, 95);
  camera.rotation.order = 'YXZ';
  camera.position.set(player.x, 1.62, player.z);
  scene.add(camera);
  scene.add(new THREE.AmbientLight('#f3df9f', .65));
  scene.add(new THREE.HemisphereLight('#f1edcd', '#4a4222', .8));
  const dim = WORLD.grid.length * CELL_SIZE;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(dim, dim), new THREE.MeshStandardMaterial({ map: carpet(WORLD.grid.length * 2), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(dim / 2, 0, dim / 2); scene.add(floor);
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
  const glowMat = new THREE.MeshBasicMaterial({ color: '#fff5c1' });
  WORLD.lights.forEach(({ x, z }, i) => {
    box(1.95, .065, .5, fixtureMat, x, WALL_HEIGHT - .04, z);
    box(1.77, .018, .115, glowMat, x, WALL_HEIGHT - .08, z - .105);
    box(1.77, .018, .115, glowMat, x, WALL_HEIGHT - .08, z + .105);
    if (i % 4 === 0) {
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(.6, .34), new THREE.MeshStandardMaterial({ color: '#74735b', roughness: 1 }));
      tile.rotation.x = Math.PI / 2; tile.position.set(x + .95, WALL_HEIGHT - .012, z + 1.25); scene.add(tile);
      for (let n = 0; n < 7; n++) box(.48, .012, .012, fixtureMat, x + .95, WALL_HEIGHT - .024, z + 1.13 + n * .04);
    }
  });
  for (let i = 0; i < 8; i++) {
    const light = new THREE.PointLight(i % 3 === 0 ? '#fff3bd' : '#f6edc1', 17, 14, 2);
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
  WORLD.fuses.forEach((fuse) => buildFuse(fuse));
  buildExit();

  flashlight = new THREE.SpotLight('#fff4d8', 0, 25, Math.PI / 6.4, .6, 1.3);
  flashlight.position.set(.22, -.15, -.12);
  flashlight.target.position.set(0, -.06, -8);
  camera.add(flashlight, flashlight.target);
  const dotGeometry = new THREE.RingGeometry(.045, .085, 16);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: '#e8efab', transparent: true, opacity: .65, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const dot = new THREE.Mesh(dotGeometry, dotMaterial); dot.rotation.x = -Math.PI / 2; dot.visible = false; scene.add(dot); routeDots.push(dot);
  }
}

function buildFuse(fuse) {
  const group = new THREE.Group(); group.position.set(fuse.x, 0, fuse.z); scene.add(group);
  const steel = new THREE.MeshStandardMaterial({ color: '#4d5147', roughness: .68, metalness: .35 });
  box(.72, 1.3, .55, steel, 0, .65, 0, group);
  const face = new THREE.MeshStandardMaterial({ color: '#798070', roughness: .8 });
  box(.64, .95, .03, face, 0, .78, .29, group);
  sign(`FUSIBLE ${fuse.id}`, fuse.label, .64, 0, 1.08, .31, 0, '#edebc5', '#30372c', group);
  const item = new THREE.Group(); group.add(item);
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#eff3b3', emissive: '#d3ec66', emissiveIntensity: .75, roughness: .32, metalness: .2 });
  const fuseBody = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .35, 12), bodyMat);
  fuseBody.position.y = 1.65; item.add(fuseBody);
  const metal = new THREE.MeshStandardMaterial({ color: '#c8c9a4', metalness: .8, roughness: .3 });
  for (const y of [1.44, 1.86]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .08, 12), metal); end.position.y = y; item.add(end);
  }
  const beacon = new THREE.PointLight('#deed97', 3.5, 5, 2); beacon.position.set(0, 1.85, 0); group.add(beacon);
  // Three fixed object lights are inexpensive and help locate pickups around corners.
  const indicator = sign(fuse.id, '', .35, 0, 2.17, 0, 0, '#eff5bd', '#4b542a', group);
  fuseObjects.push({ ...fuse, group, item, beacon, indicator, kind: 'fuse' });
}

function buildExit() {
  exitGroup = new THREE.Group(); exitGroup.position.set(WORLD.exit.x, 0, WORLD.exit.z); exitGroup.rotation.y = WORLD.exit.yaw; scene.add(exitGroup);
  const steel = new THREE.MeshStandardMaterial({ color: '#434e42', metalness: .3, roughness: .65 });
  const door = new THREE.MeshStandardMaterial({ color: '#65755c', roughness: .75, metalness: .2 });
  for (const x of [-.93, .93]) box(.15, 2.92, .3, steel, x, 1.46, 0, exitGroup);
  box(2.02, .15, .3, steel, 0, 2.88, 0, exitGroup);
  box(1.72, 2.75, .15, door, 0, 1.375, 0, exitGroup);
  box(1.24, .08, .09, steel, 0, 1.16, .15, exitGroup);
  box(1.3, .56, .018, steel, 0, 2.03, .089, exitGroup);
  exitHeaderSign = sign('SALIDA', 'RESTABLECER SUMINISTRO', 1.65, 0, 2.6, .17, 0, '#c3d9a2', '#273829', exitGroup);
  exitStatusSign = sign('ACCESO BLOQUEADO', 'SE NECESITAN 3 FUSIBLES', 1.25, 0, 2.03, .105, 0, '#e7c28c', '#343c2e', exitGroup);
  exitIndicator = new THREE.MeshBasicMaterial({ color: '#dc754e' });
  box(.12, .12, .06, exitIndicator, .65, 1.4, .12, exitGroup);
  const light = new THREE.PointLight('#bdd6a0', 6, 9, 2); light.position.set(0, 2.7, 1); exitGroup.add(light);
}

function setExitPowered(powered) {
  exitIndicator.color.set(powered ? '#caf08d' : '#dc754e');
  for (const [mesh, title, subtitle] of [
    [exitHeaderSign, 'SALIDA', powered ? 'SUMINISTRO RESTABLECIDO' : 'RESTABLECER SUMINISTRO'],
    [exitStatusSign, powered ? 'ACCESO HABILITADO' : 'ACCESO BLOQUEADO', powered ? 'PULSA E PARA SALIR' : 'SE NECESITAN 3 FUSIBLES'],
  ]) {
    mesh.material.map.dispose();
    mesh.material.map = labelTexture(title, subtitle, powered ? '#dbf3b3' : '#e7c28c', '#343c2e');
  }
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
  ['menu', 'pause-screen', 'win-screen', 'hud'].forEach((id) => { $(id).hidden = true; });
}

function resetGame() {
  collected.clear(); elapsed = 0; stamina = 1; exhausted = false; pitch = 0; bob = 0;
  yaw = WORLD.spawn.yaw; player.x = WORLD.spawn.x; player.z = WORLD.spawn.z;
  flashlightOn = false; flashlight.intensity = 0; hintUntil = 0; currentTarget = null;
  fuseObjects.forEach((f) => { f.item.visible = true; f.beacon.intensity = 3.5; f.indicator.visible = true; });
  setExitPowered(false);
  $('objective-title').textContent = 'RESTABLECE LA ENERGÍA';
  $('objective-detail').textContent = 'Encuentra los tres fusibles del edificio.';
  $('fuse-count').textContent = '0 / 3';
  $('flashlight-status').textContent = 'LINTERNA OFF';
  $('interaction-prompt').hidden = true; $('hint-text').hidden = true;
  routeDots.forEach((dot) => { dot.visible = false; });
  keys.clear(); updateHud();
}

function acquireMouse() {
  try {
    const request = canvas.requestPointerLock?.();
    request?.catch(() => mouseFallback());
    if (!canvas.requestPointerLock) mouseFallback();
  } catch { mouseFallback(); }
}

function mouseFallback() {
  if (mode === 'playing') toast('Mantén pulsado el ratón y arrastra para mirar. WASD para moverte.', 6500);
}

function startGame(restart = true) {
  if (restart) resetGame();
  hideScreens(); $('hud').hidden = false; mode = 'playing';
  keys.clear(); dragging = false; canvas.focus();
  audio.start(); audio.setActive(true); acquireMouse();
  if (restart) toast('Busca tres fusibles. Sigue las señales; pulsa H si necesitas orientación.', 6000);
}

function pauseGame() {
  if (mode !== 'playing') return;
  mode = 'paused'; keys.clear(); dragging = false; hideScreens(); $('pause-screen').hidden = false;
  $('interaction-prompt').hidden = true; audio.setActive(false);
  if (document.pointerLockElement) document.exitPointerLock();
  $('resume-button').focus();
}

function goHome() {
  mode = 'menu'; keys.clear(); audio.setActive(false);
  if (document.pointerLockElement) document.exitPointerLock();
  hideScreens(); $('menu').hidden = false; $('toast').hidden = true; resetGame();
  $('start-button').focus();
}

function canMove(x, z) {
  if (!isWalkable(x, z, .24)) return false;
  for (const f of fuseObjects) {
    if (Math.abs(x - f.x) < .6 && Math.abs(z - f.z) < .52) return false;
  }
  const doorX = x - WORLD.exit.x, doorZ = z - WORLD.exit.z;
  const c = Math.cos(WORLD.exit.yaw), s = Math.sin(WORLD.exit.yaw);
  return !(Math.abs(doorX * c - doorZ * s) < 1.18 && Math.abs(doorX * s + doorZ * c) < .4);
}

function lineOfSight(target) {
  const distance = Math.hypot(target.x - player.x, target.z - player.z);
  for (let i = .2; i < distance; i += .2) {
    if (!isWalkable(player.x + (target.x - player.x) * i / distance, player.z + (target.z - player.z) * i / distance, 0)) return false;
  }
  return true;
}

function getTarget() {
  let closest = null, best = 2.7;
  for (const target of [...fuseObjects.filter((f) => !collected.has(f.id)), { ...WORLD.exit, kind: 'exit' }]) {
    const dx = target.x - player.x, dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    const facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / (dist || 1);
    if (dist < best && facing > .5 && lineOfSight(target)) { best = dist; closest = target; }
  }
  return closest;
}

function interact() {
  const target = getTarget();
  if (!target) return;
  if (target.kind === 'fuse') {
    collected.add(target.id); target.item.visible = false; target.beacon.intensity = .3; target.indicator.visible = false;
    $('fuse-count').textContent = `${collected.size} / 3`; audio.pickup();
    if (collected.size === 3) {
      $('objective-title').textContent = 'ENCUENTRA LA SALIDA';
      $('objective-detail').textContent = 'La puerta tiene energía. Regresa al extremo norte.';
      setExitPowered(true);
      toast('Energía restablecida. La salida te espera al norte.', 6000);
    } else toast(`Fusible ${target.id} recuperado. ${3 - collected.size} por encontrar.`);
    hintRefresh = 0;
  } else if (collected.size < 3) {
    audio.denied(); toast(`Sin energía. Faltan ${3 - collected.size} fusibles para abrir la salida.`);
  } else {
    mode = 'won'; keys.clear(); hideScreens(); $('win-screen').hidden = false;
    $('win-time').textContent = formatTime(elapsed); $('toast').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.escape(); audio.setActive(false); $('win-restart-button').focus();
  }
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
  if (currentTarget) $('interaction-prompt').lastElementChild.textContent = currentTarget.kind === 'fuse'
    ? `Recoger fusible ${currentTarget.id}` : collected.size === 3 ? 'Abrir la salida' : `Salida sin energía · ${collected.size}/3 fusibles`;
}

function updateHint(now, dt) {
  const active = now < hintUntil && mode === 'playing';
  $('hint-text').hidden = !active;
  if (!active) { routeDots.forEach((dot) => { dot.visible = false; }); return; }
  hintRefresh -= dt;
  if (hintRefresh <= 0) {
    const targets = collected.size === 3 ? [{ ...WORLD.exit, label: 'SALIDA' }] : WORLD.fuses.filter((f) => !collected.has(f.id));
    const paths = targets.map((target) => ({ target, path: findPath(player.x, player.z, target.x, target.z) })).filter((p) => p.path.length);
    paths.sort((a, b) => a.path.length - b.path.length);
    if (paths[0]) { hintRoute = paths[0].path; hintTarget = paths[0].target; }
    hintRefresh = .6;
  }
  if (!hintTarget) return;
  // Only point ahead when the player's full collision circle can follow the segment.
  let next = hintRoute[0];
  for (const candidate of hintRoute.slice(1, 3)) {
    const distance = Math.hypot(candidate.x - player.x, candidate.z - player.z);
    let clear = true;
    for (let step = .1; step <= distance; step += .1) {
      if (!canMove(player.x + (candidate.x - player.x) * step / distance, player.z + (candidate.z - player.z) * step / distance)) { clear = false; break; }
    }
    if (clear) next = candidate; else break;
  }
  const targetAngle = Math.atan2(-(next.x - player.x), -(next.z - player.z));
  const diff = Math.atan2(Math.sin(targetAngle - yaw), Math.cos(targetAngle - yaw));
  const direction = Math.abs(diff) < .45 ? '↑ SIGUE RECTO' : Math.abs(diff) > 2.45 ? '↶ DA LA VUELTA' : diff > 0 ? '← A LA IZQUIERDA' : 'A LA DERECHA →';
  $('hint-text').textContent = `${direction}  ·  ${hintTarget.label}  ·  ${Math.max(1, Math.round((hintRoute.length - 1) * CELL_SIZE))} m`;
  routeDots.forEach((dot, i) => {
    const point = hintRoute[i + 1]; dot.visible = Boolean(point);
    if (point) dot.position.set(point.x, .025, point.z);
  });
}

function updateLighting(time) {
  const nearest = WORLD.lights.map((light) => ({ ...light, distance: (light.x - camera.position.x) ** 2 + (light.z - camera.position.z) ** 2 })).sort((a, b) => a.distance - b.distance);
  lightPool.forEach((light, i) => {
    const source = nearest[i];
    light.position.set(source.x, WALL_HEIGHT - .22, source.z);
    // A slow, low-amplitude fluctuation avoids harsh flashing.
    light.intensity = 17 * (reducedMotion ? 1 : .98 + .02 * Math.sin(time * 3.4 + i * 8));
  });
}

function bindControls() {
  canvas.tabIndex = -1;
  $('start-button').addEventListener('click', () => startGame());
  $('resume-button').addEventListener('click', () => startGame(false));
  $('restart-button').addEventListener('click', () => startGame());
  $('win-restart-button').addEventListener('click', () => startGame());
  $('home-button').addEventListener('click', goHome);
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
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyF', 'KeyH'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyF') {
      flashlightOn = !flashlightOn; flashlight.intensity = flashlightOn ? 24 : 0;
      $('flashlight-status').textContent = `LINTERNA ${flashlightOn ? 'ON' : 'OFF'}`;
    }
    if (e.code === 'KeyH') { hintUntil = performance.now() / 1000 + 18; hintRefresh = 0; }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && pointerWasLocked && mode === 'playing') pauseGame();
    pointerWasLocked = locked;
  });
  document.addEventListener('pointerlockerror', mouseFallback);
  canvas.addEventListener('mousedown', (e) => { if (mode === 'playing' && e.button === 0) dragging = true; });
  document.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('click', () => { if (mode === 'playing' && !document.pointerLockElement) acquireMouse(); });
  document.addEventListener('mousemove', (e) => {
    if (mode !== 'playing' || (!document.pointerLockElement && !dragging)) return;
    yaw -= e.movementX * .002 * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * .002 * sensitivity, -1.3, 1.3);
  });
  window.addEventListener('blur', () => { keys.clear(); if (mode === 'playing') pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  });
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
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const length = Math.hypot(forward, strafe);
    if (exhausted && stamina > .3) exhausted = false;
    sprinting = length > 0 && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !exhausted && stamina > .015;
    const speed = sprinting ? 6.1 : 3.45;
    if (length) {
      const dx = (Math.cos(yaw) * strafe - Math.sin(yaw) * forward) / length * speed * dt;
      const dz = (-Math.sin(yaw) * strafe - Math.cos(yaw) * forward) / length * speed * dt;
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
    const targetFov = sprinting && moving && !reducedMotion ? 79 : 74;
    if (Math.abs(camera.fov - targetFov) > .01) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
    if (time - lastHud > .1) { updateHud(); lastHud = time; }
  } else if (mode === 'menu') {
    camera.position.set(WORLD.spawn.x + .35, 1.63, WORLD.spawn.z - .2);
    camera.rotation.set(-.015, .34 + (reducedMotion ? 0 : Math.sin(time * .11) * .11), 0);
  }
  audio.update({ moving: mode === 'playing' && moving, sprinting, dt, tension: collected.size / 6 });
  updateHint(time, dt);
  if (time - lightTick > .18) { updateLighting(time); lightTick = time; }
  fuseObjects.forEach((f, i) => {
    if (f.item.visible) { f.item.rotation.y = time * .65; f.item.position.y = reducedMotion ? 0 : Math.sin(time * 1.9 + i) * .06; f.indicator.lookAt(camera.position.x, 2.17, camera.position.z); }
  });
  renderer.render(scene, camera);
}

try {
  const validation = validateWorld();
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  buildWorld(); bindControls(); updateLighting(0);
  renderer.setAnimationLoop(frame);
  $('loading-indicator').hidden = true; $('start-button').disabled = false;
  // Development-only harness exercises the actual interaction and collision functions.
  if (import.meta.env.DEV) {
    window.__BACKROOMS__ = {
      state: () => ({ mode, x: player.x, z: player.z, yaw, pitch, elapsed, stamina, exhausted, flashlightOn, collected: [...collected], target: currentTarget?.kind, drawCalls: renderer.info.render.calls }),
      world: WORLD,
      walkTo: (x, z) => { if (!canMove(x, z)) return false; player.x = x; player.z = z; updateHud(); return true; },
      lookAt: (x, z) => { yaw = Math.atan2(-(x - player.x), -(z - player.z)); pitch = 0; updateHud(); },
      path: findPath,
      canMove,
    };
  }
} catch (error) {
  console.error('No se pudo iniciar Backrooms:', error);
  $('loading-indicator').hidden = true;
  $('error-message').textContent = 'No se pudo iniciar el escenario 3D. Prueba en un navegador de escritorio con la aceleración gráfica activada.';
  $('error-message').hidden = false;
}
