// All textures are generated procedurally on canvases — no external assets.
import * as THREE from 'three';

// Perfectly tileable lattice value noise (integer lattice wraps).
export function tileableNoise(rand, w, h, cellsX, cellsY, octaves, gain = 0.55) {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0, cx = cellsX, cy = cellsY;
  const fade = (t) => t * t * (3 - 2 * t);
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(cx * cy);
    for (let i = 0; i < cx * cy; i++) lat[i] = rand();
    for (let y = 0; y < h; y++) {
      const fy = (y / h) * cy, y0 = fy | 0, ty = fade(fy - y0), y1 = (y0 + 1) % cy;
      for (let x = 0; x < w; x++) {
        const fx = (x / w) * cx, x0 = fx | 0, tx = fade(fx - x0), x1 = (x0 + 1) % cx;
        const a = lat[y0 * cx + x0], b = lat[y0 * cx + x1];
        const c = lat[y1 * cx + x0], d = lat[y1 * cx + x1];
        out[y * w + x] += (a + (b - a) * tx + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty) * amp;
      }
    }
    tot += amp; amp *= gain; cx *= 2; cy *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function canvasTex(w, h, fill, srgb = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  fill(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Shared close-up terrain detail: subtle albedo grain + derived normal map.
export function makeDetailMaps(rand) {
  const S = 256;
  const n = tileableNoise(rand, S, S, 6, 6, 5, 0.6);
  const map = canvasTex(S, S, (d, w, h) => {
    for (let i = 0; i < w * h; i++) {
      const v = 200 + n[i] * 55;
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const strength = 2.6;
  const normal = canvasTex(S, S, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xl = n[y * w + ((x - 1 + w) % w)], xr = n[y * w + ((x + 1) % w)];
      const yu = n[((y - 1 + h) % h) * w + x], yd = n[((y + 1) % h) * w + x];
      let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      d[i * 4] = ((nx / len) * 0.5 + 0.5) * 255;
      d[i * 4 + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      d[i * 4 + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      d[i * 4 + 3] = 255;
    }
  }, false);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  return { map, normal };
}

export function makeCloudTexture(rand, density, colorHex) {
  const W = 1024, H = 512;
  const n = tileableNoise(rand, W, H, 10, 5, 5, 0.58);
  const c = new THREE.Color(colorHex);
  const thr = 0.62 - density * 0.22;
  return canvasTex(W, H, (d, w, h) => {
    for (let i = 0; i < w * h; i++) {
      const a = Math.pow(Math.max(0, Math.min(1, (n[i] - thr) / 0.24)), 1.4);
      d[i * 4] = c.r * 255; d[i * 4 + 1] = c.g * 255; d[i * 4 + 2] = c.b * 255;
      d[i * 4 + 3] = a * 215;
    }
  });
}

export function makeRingTexture(rand, tintHex) {
  const W = 512;
  const tint = new THREE.Color(tintHex);
  // random band structure
  const bands = [];
  let t = 0.02;
  while (t < 0.98) {
    const wBand = 0.015 + rand() * 0.1;
    bands.push({ a: t, b: Math.min(0.98, t + wBand), alpha: 0.15 + rand() * 0.8, lum: 0.5 + rand() * 0.5 });
    t += wBand + rand() * 0.05;
  }
  return canvasTex(W, 1, (d, w) => {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let alpha = 0, lum = 1;
      for (const b of bands) if (u >= b.a && u <= b.b) {
        const edge = Math.min((u - b.a) / 0.012, (b.b - u) / 0.012, 1);
        alpha = b.alpha * Math.max(0, edge); lum = b.lum; break;
      }
      const fade = Math.min(u / 0.06, (1 - u) / 0.06, 1);
      d[x * 4] = tint.r * 255 * lum; d[x * 4 + 1] = tint.g * 255 * lum; d[x * 4 + 2] = tint.b * 255 * lum;
      d[x * 4 + 3] = alpha * Math.max(0, fade) * 255;
    }
  });
}

export function makeGlowTexture() {
  const S = 128;
  return canvasTex(S, S, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2;
      const r = Math.hypot(dx, dy);
      const a = Math.pow(Math.max(0, 1 - r), 2.4);
      d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = a * 255;
    }
  });
}

// The radial glow is identical everywhere; share ONE texture across all the
// sprite-using systems (avatar/ship/sites/spaceport/mining/gear/gadgets/effects)
// instead of generating 8 copies in VRAM. Never .dispose() this one.
let _glow = null;
export function getGlow() { return _glow || (_glow = makeGlowTexture()); }

// Dispose geometry + materials of a removed subtree (does NOT touch Sprite
// geometry — that's a three.js singleton — nor shared textures like the glow).
export function disposeTree(obj) {
  const seen = new Set();
  obj.traverse((o) => {
    if (o.isMesh && o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) for (const mm of (Array.isArray(m) ? m : [m])) if (!seen.has(mm)) { seen.add(mm); mm.dispose(); }
  });
}

export function makeNebulaTexture(rand) {
  const S = 256;
  const n = tileableNoise(rand, S, S, 4, 4, 5, 0.62);
  return canvasTex(S, S, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2;
      const fall = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy)), 2.2);
      const cloud = Math.max(0, Math.min(1, (n[i] - 0.42) / 0.35));
      const a = fall * cloud * 0.85;
      d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = a * 255;
    }
  });
}

export function makeGrassTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffffff';
  for (let b = 0; b < 7; b++) {
    const x0 = 8 + b * 7 + (b % 2) * 2;
    const lean = (b - 3) * 2.2;
    ctx.beginPath();
    ctx.moveTo(x0 - 2.4, 64);
    ctx.quadraticCurveTo(x0 + lean * 0.4, 30, x0 + lean, 6 + (b % 3) * 7);
    ctx.quadraticCurveTo(x0 + lean * 0.5, 32, x0 + 2.4, 64);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
