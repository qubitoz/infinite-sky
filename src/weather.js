// Visual weather: a recycled particle field around the camera, driven by each
// planet's generated weather string. Rain/acid use short line streaks; snow,
// ash, sparkles, dust and mist use points. One Points + one LineSegments mesh
// total — buffers are allocated once and reconfigured per kind.
import * as THREE from 'three';
import { clamp } from './noise.js';
import { TIME } from './shaders.js';

export function weatherKind(biome, weatherEn) {
  const w = (weatherEn || '').toUpperCase();
  if (/RAIN|SHOWER|DRIZZLE|SQUALL/.test(w)) return biome.hazard === 'acid' ? 'acid' : 'rain';
  if (/SNOW|FLURR|BLIZZARD|WHITEOUT/.test(w)) return 'snow';
  if (/ASH|SOOT/.test(w)) return 'ash';
  if (/SPARK|SHIMMER|MOTE|SPRINKLE|GLOW|STATIC|CRYSTAL|PETAL|POLLEN/.test(w)) return 'sparkle';
  if (/DUST|SAND|GALE|TEMPEST|STORM|WIND/.test(w)) return 'dust';
  if (/MIST|FOG|SPORE|HAZE/.test(w)) return 'mist';
  return null;
}

const KINDS = {
  rain: { line: true, color: 0x9fd4ff, count: 320, speed: 52, len: 0.05, opacity: 0.45, sway: 2 },
  acid: { line: true, color: 0xaaff7a, count: 300, speed: 46, len: 0.055, opacity: 0.5, sway: 3 },
  snow: { color: 0xffffff, count: 380, speed: 6, size: 0.35, opacity: 0.9, sway: 7 },
  ash: { color: 0x9a8a82, count: 260, speed: 3, size: 0.3, opacity: 0.8, sway: 5 },
  sparkle: { color: 0xffe9ff, count: 220, speed: 1.2, size: 0.28, opacity: 0.85, sway: 6, additive: true },
  dust: { color: 0xd8b58a, count: 260, speed: 4, size: 0.4, opacity: 0.45, sway: 22 },
  mist: { color: 0xcfe0d8, count: 140, speed: 1, size: 1.8, opacity: 0.16, sway: 3 },
};
const MAXP = 400;

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _fall = new THREE.Vector3();
const _ref = new THREE.Vector3(0, 1, 0);
const _rel = new THREE.Vector3();

export class WeatherSystem {
  constructor(scene, density = 1) {
    this.density = density;
    this.kind = null;
    this.fade = 0;
    this.pts = new Array(MAXP).fill(null).map(() => new THREE.Vector3());
    this.fresh = true;

    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    this.pMat = new THREE.PointsMaterial({
      size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    });
    this.points = new THREE.Points(this.pGeo, this.pMat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);

    this.lGeo = new THREE.BufferGeometry();
    this.lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 6), 3));
    this.lMat = new THREE.LineBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    this.lines = new THREE.LineSegments(this.lGeo, this.lMat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  setKind(kind) {
    this.kind = kind;
    this.fresh = true;
    const k = KINDS[kind];
    if (!k) return;
    if (k.line) {
      this.lMat.color.set(k.color);
    } else {
      this.pMat.color.set(k.color);
      this.pMat.size = k.size;
      this.pMat.blending = k.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.pMat.needsUpdate = true;
    }
  }

  update(dt, camPos, up, kind, intensity) {
    if (kind !== this.kind) this.setKind(kind);
    const k = KINDS[this.kind];
    const target = k ? clamp(intensity, 0, 1) : 0;
    this.fade += (target - this.fade) * Math.min(dt * 2.5, 1);
    if (!k || this.fade < 0.02) {
      this.points.visible = false;
      this.lines.visible = false;
      return;
    }

    // tangent basis around the local up
    _ref.set(0, 1, 0);
    if (Math.abs(up.dot(_ref)) > 0.95) _ref.set(1, 0, 0);
    _t1.crossVectors(up, _ref).normalize();
    _t2.crossVectors(up, _t1).normalize();
    _fall.copy(up).multiplyScalar(-1).addScaledVector(_t1, 0.15).normalize();

    const n = Math.min(MAXP, Math.round(k.count * this.density));
    const t = TIME.value;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      if (this.fresh) {
        p.copy(camPos)
          .addScaledVector(up, -8 + Math.random() * 34)
          .addScaledVector(_t1, (Math.random() - 0.5) * 64)
          .addScaledVector(_t2, (Math.random() - 0.5) * 64);
      }
      p.addScaledVector(_fall, k.speed * dt);
      p.addScaledVector(_t1, Math.sin(t * 1.3 + i * 1.7) * k.sway * dt);
      p.addScaledVector(_t2, Math.cos(t * 1.1 + i * 2.3) * k.sway * 0.6 * dt);
      _rel.subVectors(p, camPos);
      const h = _rel.dot(up);
      const lat = Math.sqrt(Math.max(_rel.lengthSq() - h * h, 0));
      if (h < -14 || h > 32 || lat > 38) {
        p.copy(camPos)
          .addScaledVector(up, 14 + Math.random() * 16)
          .addScaledVector(_t1, (Math.random() - 0.5) * 64)
          .addScaledVector(_t2, (Math.random() - 0.5) * 64);
      }
    }
    this.fresh = false;

    if (k.line) {
      this.points.visible = false;
      this.lines.visible = true;
      this.lMat.opacity = k.opacity * this.fade;
      const arr = this.lGeo.attributes.position.array;
      const L = k.speed * k.len;
      for (let i = 0; i < n; i++) {
        const p = this.pts[i];
        arr[i * 6] = p.x; arr[i * 6 + 1] = p.y; arr[i * 6 + 2] = p.z;
        arr[i * 6 + 3] = p.x + _fall.x * L; arr[i * 6 + 4] = p.y + _fall.y * L; arr[i * 6 + 5] = p.z + _fall.z * L;
      }
      for (let i = n; i < MAXP; i++) for (let j = 0; j < 6; j++) arr[i * 6 + j] = 0;
      this.lGeo.attributes.position.needsUpdate = true;
    } else {
      this.lines.visible = false;
      this.points.visible = true;
      this.pMat.opacity = k.opacity * this.fade;
      const arr = this.pGeo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const p = this.pts[i];
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      for (let i = n; i < MAXP; i++) {
        arr[i * 3] = camPos.x; arr[i * 3 + 1] = camPos.y - 1e4; arr[i * 3 + 2] = camPos.z;
      }
      this.pGeo.attributes.position.needsUpdate = true;
    }
  }
}
