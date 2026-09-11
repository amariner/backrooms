import * as THREE from 'three';

function randomSource(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function texture(paint, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  paint(canvas.getContext('2d'), 512, randomSource(21061991));
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function serviceConcrete() {
  return texture((ctx, size, random) => {
    ctx.fillStyle = '#76827d'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 47000; i++) {
      const shade = 50 + random() * 160;
      ctx.fillStyle = `rgba(${shade},${shade + 4},${shade + 1},${.02 + random() * .14})`;
      ctx.fillRect(random() * size, random() * size, 1 + random() * 3, 1 + random() * 2);
    }
    for (let i = 0; i < 32; i++) {
      const x = random() * size;
      const y = random() * size;
      const gradient = ctx.createLinearGradient(x, y, x, size);
      gradient.addColorStop(0, '#26393100'); gradient.addColorStop(.3, '#24382f22');
      gradient.addColorStop(1, '#1d2e262e');
      ctx.fillStyle = gradient; ctx.fillRect(x, y, 3 + random() * 21, size - y);
    }
    ctx.fillStyle = '#233b3525'; ctx.fillRect(0, size * .64, size, size * .36);
    ctx.fillStyle = '#bcc0ad40'; ctx.fillRect(0, size * .63, size, 3);
    ctx.strokeStyle = '#27362f70'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
    for (const x of [42, size - 42]) for (const y of [38, size - 38]) {
      ctx.fillStyle = '#26302c65'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      let x = random() * size, y = random() * size;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 7; j++) { x += (random() - .5) * 20; y += 5 + random() * 20; ctx.lineTo(x, y); }
      ctx.strokeStyle = '#25302c32'; ctx.lineWidth = .7; ctx.stroke();
    }
  });
}

export function serviceFloor(repeat) {
  return texture((ctx, size, random) => {
    ctx.fillStyle = '#444e4b'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 40000; i++) {
      const shade = 30 + random() * 100;
      ctx.fillStyle = `rgba(${shade},${shade + 5},${shade + 3},.2)`;
      ctx.fillRect(random() * size, random() * size, random() * 5, 1 + random() * 2);
    }
    for (let i = 0; i < 9; i++) {
      const x = random() * size, y = random() * size, r = random() * 110 + 15;
      const stain = ctx.createRadialGradient(x, y, 1, x, y, r);
      stain.addColorStop(0, '#11252650'); stain.addColorStop(1, '#11252600');
      ctx.fillStyle = stain; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.strokeStyle = '#192320'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, size, size);
    ctx.strokeStyle = '#96a8a125'; ctx.lineWidth = 1; ctx.strokeRect(3, 3, size - 6, size - 6);
  }, repeat);
}

export function hazardTexture() {
  return texture((ctx, size) => {
    ctx.fillStyle = '#bc9d40'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#262b27';
    for (let x = -size; x < size * 2; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 64, 0);
      ctx.lineTo(x + 64 - size, size); ctx.lineTo(x - size, size); ctx.fill();
    }
    ctx.fillStyle = '#7c83652b';
    for (let y = 0; y < size; y += 7) ctx.fillRect(0, y, size, 1);
  });
}

export function puddleTexture() {
  return texture((ctx, size, random) => {
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 10; i++) {
      const x = 150 + random() * 200, y = 140 + random() * 230, r = 45 + random() * 95;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
      glow.addColorStop(0, '#91b4ab66'); glow.addColorStop(.65, '#5a79775a'); glow.addColorStop(1, '#5a797700');
      ctx.fillStyle = glow; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

export function warningGraffiti() {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.translate(512, 180); ctx.rotate(-.045);
  ctx.fillStyle = '#302f2a'; ctx.textAlign = 'center';
  ctx.font = '900 96px sans-serif'; ctx.fillText('NO SIGAS', 0, 0);
  ctx.font = '900 110px sans-serif'; ctx.fillText('TU VOZ', 0, 111);
  ctx.strokeStyle = '#302f2a'; ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-265 + i * 87, 115); ctx.lineTo(-263 + i * 87, 136 + i % 3 * 19); ctx.stroke(); }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}
