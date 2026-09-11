import * as THREE from 'three';

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function canvasTexture(size, paint, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

export function wallpaper() {
  return canvasTexture(512, (ctx, s) => {
    const random = rng(37);
    ctx.fillStyle = '#bdb47b'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 58000; i++) {
      ctx.fillStyle = random() > 0.5 ? `rgba(53,46,18,${random() * .075})` : `rgba(246,233,162,${random() * .15})`;
      ctx.fillRect(random() * s, random() * s, 1 + random() * 3, 1);
    }
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = '#6d663719'; ctx.fillRect(x, 0, 1, s);
      ctx.fillStyle = '#e2d59e26'; ctx.fillRect(x + 2, 0, 1, s);
      for (let y = 0; y < s; y += 32) {
        ctx.strokeStyle = '#8d835631'; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.moveTo(x + 8, y + 4); ctx.lineTo(x + 11, y + 12);
        ctx.lineTo(x + 8, y + 20); ctx.lineTo(x + 5, y + 12); ctx.closePath(); ctx.stroke();
      }
    }
    const damp = ctx.createLinearGradient(0, 0, 0, s);
    damp.addColorStop(0, '#28270b2b'); damp.addColorStop(.16, '#29281000');
    damp.addColorStop(.75, '#29281000'); damp.addColorStop(1, '#2827115e');
    ctx.fillStyle = damp; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = random() * s, y = random() * s, r = 20 + random() * 100;
      const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
      stain.addColorStop(0, '#51421b0a'); stain.addColorStop(1, '#51421b00');
      ctx.fillStyle = stain; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.fillStyle = '#665e3024'; ctx.fillRect(0, 0, 2, s);
  });
}

export function carpet(repeat) {
  return canvasTexture(256, (ctx, s) => {
    const random = rng(83);
    ctx.fillStyle = '#716b4d'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 50000; i++) {
      const value = Math.floor(45 + random() * 100);
      ctx.fillStyle = `rgba(${value + 9},${value + 4},${Math.floor(value * .7)},.36)`;
      ctx.fillRect(random() * s, random() * s, 1, 1 + random() * 2);
    }
    ctx.strokeStyle = '#2a271713'; ctx.strokeRect(0, 0, s, s);
  }, repeat);
}

export function ceiling(repeat) {
  return canvasTexture(256, (ctx, s) => {
    const random = rng(212);
    ctx.fillStyle = '#bcbba0'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 17000; i++) {
      ctx.fillStyle = random() > .4 ? '#55523b18' : '#eee8c818';
      ctx.fillRect(random() * s, random() * s, 1, 1);
    }
    ctx.strokeStyle = '#555442'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, s, s);
    ctx.strokeStyle = '#d8d4b7'; ctx.lineWidth = 1;
    ctx.strokeRect(3, 3, s - 6, s - 6);
  }, repeat);
}

export function labelTexture(title, subtitle = '', color = '#dadbb0', bg = '#292b20') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = color; ctx.globalAlpha = .32; ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, 994, 226); ctx.globalAlpha = 1;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 76px Arial, sans-serif'; ctx.fillText(title, 512, subtitle ? 99 : 136, 940);
  if (subtitle) { ctx.font = '27px monospace'; ctx.fillText(subtitle, 512, 185, 920); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
