// Space dressing: layered starfield + galaxy band, nebula sprites, the sun,
// an asteroid belt, pulse-drive warp streaks and the ship's engine trail.
import * as THREE from 'three';
import { getGlow, makeNebulaTexture } from './textures.js';
import { makeSunMaterial } from './shaders.js';
import { clamp } from './noise.js';

function randomDir(rand, out) {
  const u = rand() * 2 - 1, ph = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(ph), u, s * Math.sin(ph));
}

export function makeStarfield(rand, total) {
  const group = new THREE.Group();
  const mats = [];
  const v = new THREE.Vector3();

  const layer = (count, size, radius) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      randomDir(rand, v).multiplyScalar(radius * (0.85 + rand() * 0.3));
      pos.set([v.x, v.y, v.z], i * 3);
      const t = rand();
      const warm = t < 0.3, cool = t > 0.75;
      const b = 0.55 + rand() * 0.45;
      col[i * 3] = b * (cool ? 0.75 : 1);
      col[i * 3 + 1] = b * (warm ? 0.82 : cool ? 0.85 : 1);
      col[i * 3 + 2] = b * (warm ? 0.6 : 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, transparent: true,
      depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    mats.push(mat);
  };
  layer(Math.floor(total * 0.62), 1.5, 3.0e5);
  layer(Math.floor(total * 0.28), 2.3, 2.9e5);
  layer(Math.floor(total * 0.08), 3.4, 2.8e5);

  // galaxy band squashed onto a random plane
  const bandN = randomDir(rand, new THREE.Vector3());
  const count = Math.floor(total * 0.55);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    randomDir(rand, v);
    v.addScaledVector(bandN, -v.dot(bandN) * (0.82 + rand() * 0.14)).normalize().multiplyScalar(3.1e5);
    pos.set([v.x, v.y, v.z], i * 3);
    const b = 0.25 + rand() * 0.45;
    col[i * 3] = b * 0.8; col[i * 3 + 1] = b * 0.85; col[i * 3 + 2] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const bandMat = new THREE.PointsMaterial({
    size: 1.4, sizeAttenuation: false, vertexColors: true, transparent: true,
    depthWrite: false, fog: false,
  });
  const band = new THREE.Points(geo, bandMat);
  band.frustumCulled = false;
  group.add(band);
  mats.push(bandMat);

  return { group, mats };
}

export function makeNebulae(rand) {
  const group = new THREE.Group();
  const mats = [];
  const hues = [0.62, 0.78, 0.55, 0.9, 0.05, 0.68];
  const v = new THREE.Vector3();
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.SpriteMaterial({
      map: makeNebulaTexture(rand),
      color: new THREE.Color().setHSL(hues[i % hues.length] + rand() * 0.06, 0.65, 0.6),
      transparent: true, opacity: 0.16 + rand() * 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const sp = new THREE.Sprite(mat);
    randomDir(rand, v).multiplyScalar(2.45e5);
    sp.position.copy(v);
    const s = 7e4 + rand() * 1.1e5;
    sp.scale.set(s, s * (0.6 + rand() * 0.7), 1);
    sp.frustumCulled = false;
    group.add(sp);
    mats.push(mat);
  }
  return { group, mats };
}

export function makeSun(system) {
  const group = new THREE.Group();
  const suns = [];
  const addSun = (star, radius, pos) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      makeSunMaterial(star.core, star.color),
    );
    mesh.position.copy(pos);
    group.add(mesh);
    const glows = [];
    for (const [scaleK, op] of [[0.30, 0.55], [0.14, 0.85]]) {
      const mat = new THREE.SpriteMaterial({
        map: getGlow(), color: star.glow, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.position.copy(pos);
      sp.frustumCulled = false;
      sp.renderOrder = 5;
      group.add(sp);
      glows.push({ sp, scaleK: scaleK * (radius / system.sunRadius) });
    }
    suns.push({ pos: pos.clone(), glows });
  };
  addSun(system.star, system.sunRadius, new THREE.Vector3(0, 0, 0));
  if (system.binary) {
    addSun(system.binary.star, system.binary.radius,
      new THREE.Vector3(system.binary.x, 0, system.binary.z));
  }
  return {
    group,
    update(camPos) {
      for (const sun of suns) {
        const d = camPos.distanceTo(sun.pos);
        for (const g of sun.glows) {
          const s = d * g.scaleK;
          g.sp.scale.set(s, s, 1);
        }
      }
    },
  };
}

export function makeAsteroidBelt(rand, belt, count) {
  const base = new THREE.IcosahedronGeometry(1, 1);
  const pos = base.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // deterministic by position so duplicated verts displace identically
    const k = Math.sin(v.x * 12.3 + v.y * 7.7 + v.z * 31.1) * 0.5 + 0.5;
    v.multiplyScalar(0.75 + k * 0.55);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  base.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#6e6259', roughness: 0.95, metalness: 0.05 });
  const inst = new THREE.InstancedMesh(base, mat, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = belt.radius + (rand() + rand() - 1) * belt.width;
    const y = (rand() + rand() - 1) * belt.height;
    v.set(Math.cos(ang) * rr, y, Math.sin(ang) * rr);
    e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    q.setFromEuler(e);
    const k = 5 + rand() * rand() * 38;
    s.set(k * (0.7 + rand() * 0.6), k * (0.7 + rand() * 0.6), k);
    m4.compose(v, q, s);
    inst.setMatrixAt(i, m4);
  }
  // proper instanced bounding sphere → cull the whole belt when it's off-screen
  // (e.g. looking outward from the system) instead of always drawing it
  inst.computeBoundingSphere();
  inst.frustumCulled = true;
  return inst;
}

// pulse-drive star streaks: world-fixed line segments respawned around the
// camera. Two layers — a crisp blue core plus a longer, fainter violet trail
// underneath — give the warp tunnel a cinematic depth without any post-fx.
export class WarpField {
  constructor(scene, count = 220) {
    this.count = count;
    this.anchors = Array.from({ length: count }, () => new THREE.Vector3());
    const mk = (color) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const lines = new THREE.LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.visible = false;
      scene.add(lines);
      return { geo, mat, lines };
    };
    this.core = mk(0xaad8ff);
    this.halo = mk(0xb48cff);
    this.fresh = true;
    this._r = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  update(camPos, velDir, speed, intensity) {
    if (intensity < 0.02 || speed < 800) {
      this.core.lines.visible = false;
      this.halo.lines.visible = false;
      this.fresh = true;
      return;
    }
    this.core.lines.visible = true;
    this.halo.lines.visible = true;
    const k = clamp(intensity, 0, 1);
    this.core.mat.opacity = k * 0.75;
    this.halo.mat.opacity = k * 0.32;
    const a1 = this.core.geo.attributes.position.array;
    const a2 = this.halo.geo.attributes.position.array;
    const L = 6 + speed * 0.016;
    const L2 = L * 2.3;
    for (let i = 0; i < this.count; i++) {
      const a = this.anchors[i];
      this._r.subVectors(a, camPos);
      const along = this._r.dot(velDir);
      const latSq = this._r.lengthSq() - along * along;
      if (this.fresh || along < -60 || along > 760 || latSq > 230 * 230) {
        randomDir(Math.random, this._p);
        this._p.addScaledVector(velDir, -this._p.dot(velDir));
        if (this._p.lengthSq() < 1e-6) this._p.set(velDir.y, -velDir.x, 0);
        this._p.normalize().multiplyScalar(20 + Math.random() * 200);
        a.copy(camPos).addScaledVector(velDir, 60 + Math.random() * 620).add(this._p);
      }
      a1[i * 6] = a.x; a1[i * 6 + 1] = a.y; a1[i * 6 + 2] = a.z;
      a1[i * 6 + 3] = a.x - velDir.x * L; a1[i * 6 + 4] = a.y - velDir.y * L; a1[i * 6 + 5] = a.z - velDir.z * L;
      a2[i * 6] = a.x; a2[i * 6 + 1] = a.y; a2[i * 6 + 2] = a.z;
      a2[i * 6 + 3] = a.x - velDir.x * L2; a2[i * 6 + 4] = a.y - velDir.y * L2; a2[i * 6 + 5] = a.z - velDir.z * L2;
    }
    this.fresh = false;
    this.core.geo.attributes.position.needsUpdate = true;
    this.halo.geo.attributes.position.needsUpdate = true;
  }
}

export class EngineTrail {
  constructor(scene, max = 480) {
    this.max = max;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max).fill(1);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    const mat = new THREE.PointsMaterial({
      size: 1.4, map: getGlow(), sizeAttenuation: true, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(p, v, r, g, b, life) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.base[i * 3] = r; this.base[i * 3 + 1] = g; this.base[i * 3 + 2] = b;
    this.life[i] = life; this.life0[i] = life;
    this.anyLive = true;
  }

  update(dt) {
    // skip the whole 480-particle loop + two buffer uploads when idle
    // (parked / landed / no thrust) — the common on-foot case
    if (!this.anyLive) { this.points.visible = false; return; }
    const pa = this.geo.attributes.position.array;
    const ca = this.geo.attributes.color.array;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        const f = Math.max(this.life[i] / this.life0[i], 0);
        pa[i * 3] = this.pos[i * 3]; pa[i * 3 + 1] = this.pos[i * 3 + 1]; pa[i * 3 + 2] = this.pos[i * 3 + 2];
        ca[i * 3] = this.base[i * 3] * f; ca[i * 3 + 1] = this.base[i * 3 + 1] * f; ca[i * 3 + 2] = this.base[i * 3 + 2] * f;
        if (this.life[i] > 0) live++;
      } else {
        ca[i * 3] = 0; ca[i * 3 + 1] = 0; ca[i * 3 + 2] = 0;
      }
    }
    this.points.visible = true;
    this.anyLive = live > 0;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
