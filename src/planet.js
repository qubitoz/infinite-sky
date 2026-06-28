// Procedural planets: quadtree cube-sphere terrain with skirted LOD chunks,
// a low-res displaced impostor sphere as permanent horizon filler, water/lava,
// atmosphere shell, cloud layer, rings and instanced surface props.
//
// The same JS height function feeds chunk geometry, the impostor, prop
// placement and physics queries, so collisions always match visuals.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Simplex3, mulberry32, hashStr, clamp, lerp, smoothstep } from './noise.js';
import { makeAtmosphereMaterial, makeWaterMaterial, makeRingMaterial } from './shaders.js';
import { makeCloudTexture, makeRingTexture, makeDetailMaps } from './textures.js';
import { makePropTemplates } from './props.js';

const FACES = [
  { n: [1, 0, 0], t: [0, 0, -1], b: [0, 1, 0] },
  { n: [-1, 0, 0], t: [0, 0, 1], b: [0, 1, 0] },
  { n: [0, 1, 0], t: [1, 0, 0], b: [0, 0, -1] },
  { n: [0, -1, 0], t: [1, 0, 0], b: [0, 0, 1] },
  { n: [0, 0, 1], t: [1, 0, 0], b: [0, 1, 0] },
  { n: [0, 0, -1], t: [-1, 0, 0], b: [0, 1, 0] },
].map((f) => ({
  n: new THREE.Vector3(...f.n),
  t: new THREE.Vector3(...f.t),
  b: new THREE.Vector3(...f.b),
}));

function cubeDir(face, u, v, out) {
  const f = FACES[face];
  out.set(
    f.n.x + f.t.x * u + f.b.x * v,
    f.n.y + f.t.y * u + f.b.y * v,
    f.n.z + f.t.z * u + f.b.z * v,
  );
  return out.normalize();
}

function faceOfDir(d) {
  const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
  if (ax >= ay && ax >= az) return d.x > 0 ? 0 : 1;
  if (ay >= az) return d.y > 0 ? 2 : 3;
  return d.z > 0 ? 4 : 5;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _col = new THREE.Color();

let DETAIL = null;
function getDetailMaps() {
  if (!DETAIL) DETAIL = makeDetailMaps(mulberry32(0x51deba));
  return DETAIL;
}

// ---------------------------------------------------------------- build queue
const queue = [];

export function processBuildQueue(budgetMs) {
  if (!queue.length) return 0;
  queue.sort((a, b) => a.priority - b.priority);
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < budgetMs) {
    const job = queue.shift();
    job.planet.queued.delete(job.key);
    if (!job.planet.desired.has(job.key)) continue;
    job.planet.runBuild(job.key, job.nd);
  }
  return queue.length;
}

export function pendingBuilds() { return queue.length; }

// --------------------------------------------------------------------- planet
export class Planet {
  constructor(def, qual = { res: 17 }) {
    this.def = def;
    this.R = def.radius;
    this.center = new THREE.Vector3(...def.position);
    this.group = new THREE.Group();
    this.group.position.copy(this.center);

    const biome = def.biome;
    this.noise = new Simplex3(mulberry32(def.seed));
    this.rand = mulberry32(def.seed ^ 0xabcdef01);
    this.tp = biome.terrain;
    this.contAmp = this.tp.contAmp * this.R;
    this.mtnAmp = this.tp.mtnAmp * this.R;
    this.detAmp = this.tp.detAmp * this.R;
    this.maxH = (this.tp.contAmp * 0.55 + this.tp.mtnAmp + this.tp.detAmp) * this.R;

    this.hasSea = !!biome.sea;
    this.seaOffU = this.hasSea ? biome.sea.level * this.R : 0;
    this.seaR = this.hasSea ? this.R + this.seaOffU : -1;
    this.atmoH = this.R * 0.45;

    this.ramp = biome.ramp.map(([hex, t]) => ({ t, c: new THREE.Color(hex) }));
    this.rockC = new THREE.Color(biome.rock);
    this.snowC = biome.snow ? new THREE.Color(biome.snow) : null;
    this.snowLine = biome.snowLine;
    this.subC = new THREE.Color(biome.sea && biome.sea.lava ? '#1a0e08' : '#22383e');

    this.RES = qual.res;
    this.lowQ = qual.aa === false; // touch/LQ render path — cheaper water shader
    this.faceArc = this.R * Math.PI / 2;
    this.maxLevel = clamp(Math.round(Math.log2(this.faceArc / (this.RES - 1) / 1.7)), 4, 8);
    this.propLevel = clamp(this.maxLevel - 1, 3, 7);
    this.uvScale = this.faceArc / 64;

    this.built = new Map();   // key -> {mesh, last}
    this.desired = new Map(); // key -> node desc
    this.queued = new Set();
    this.nodeH = new Map();
    this.tiles = new Map();   // prop tiles
    this.lodTimer = 0;
    this.discovered = false;
    this.propTemplates = makePropTemplates(biome);

    const detail = getDetailMaps();
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: detail.map, normalMap: detail.normal,
      normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.96, metalness: 0,
    });
    this.farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 });

    this.chunksGroup = new THREE.Group();
    this.group.add(this.chunksGroup);
    this.sunDir = this.center.clone().negate().normalize();

    this.buildFarMesh();
    this.buildShells();
  }

  // ----- height field -------------------------------------------------------
  height3(x, y, z, low = false) {
    const tp = this.tp;
    let wx = 0, wy = 0, wz = 0;
    if (tp.warp) {
      const wf = tp.contFreq * 1.8;
      wx = this.noise.fbm(x * wf + 13.1, y * wf + 7.7, z * wf + 3.3, 2) * tp.warp;
      wy = this.noise.fbm(x * wf + 1.2, y * wf + 91.3, z * wf + 17.8, 2) * tp.warp;
      wz = this.noise.fbm(x * wf + 55.4, y * wf + 33.3, z * wf + 71.2, 2) * tp.warp;
    }
    const cf = tp.contFreq;
    let c = this.noise.fbm((x + wx) * cf, (y + wy) * cf, (z + wz) * cf, low ? 4 : 5);
    if (tp.fold) c = 0.72 - Math.abs(c) * 2.1;
    const mf = tp.mtnFreq;
    let m = this.noise.ridged(
      (x + wx * 0.5) * mf + 5.2, (y + wy * 0.5) * mf + 9.4, (z + wz * 0.5) * mf + 1.7,
      low ? 3 : 5) / 1.25;
    if (tp.terrace) m += (Math.round(m * 6) / 6 - m) * tp.terrace;
    const mask = smoothstep(-0.15, 0.45, c);
    let h = c * this.contAmp + Math.pow(Math.max(m, 0), 1.8) * this.mtnAmp * mask;
    if (!low) h += this.noise.fbm(x * tp.detFreq, y * tp.detFreq, z * tp.detFreq, 3) * this.detAmp;
    return h;
  }

  // world-space physics sample: up vector, terrain/floor radii, altitude
  sampleAt(worldPos) {
    const up = worldPos.clone().sub(this.center);
    const len = up.length();
    up.divideScalar(len || 1);
    const terrR = this.R + this.height3(up.x, up.y, up.z);
    const floorR = this.hasSea ? Math.max(terrR, this.seaR) : terrR;
    return { up, len, terrR, floorR, alt: len - floorR };
  }

  // ----- vertex coloring ----------------------------------------------------
  colorFor(h, slope, dx, dy, dz, out) {
    const sea = this.hasSea ? this.seaOffU : 0;
    const jit = this.noise.noise(dx * 9.1 + 3.3, dy * 9.1 + 7.7, dz * 9.1 + 1.1);
    let t = (h - sea) / Math.max(this.maxH - sea, 1);
    t = clamp(t + jit * 0.05, 0, 1);
    const ramp = this.ramp;
    let i = 0;
    while (i < ramp.length - 1 && t > ramp[i + 1].t) i++;
    const a = ramp[i], b = ramp[Math.min(i + 1, ramp.length - 1)];
    const span = Math.max(b.t - a.t, 1e-6);
    out.copy(a.c).lerp(b.c, clamp((t - a.t) / span, 0, 1));
    if (this.hasSea) {
      if (h < sea + this.R * 0.0032) out.lerp(this.ramp[0].c, 0.85);
      if (h < sea) out.lerp(this.subC, 0.75);
    }
    out.lerp(this.rockC, smoothstep(0.42, 0.72, slope));
    if (this.snowC && this.snowLine != null) {
      const sl = this.snowLine + jit * 0.06;
      if (t > sl) out.lerp(this.snowC, smoothstep(sl, sl + 0.07, t) * (1 - smoothstep(0.35, 0.6, slope)));
    }
    const v = 0.92 + 0.08 * this.noise.noise(dx * 3.7 + 11, dy * 3.7 + 5, dz * 3.7 + 9);
    out.multiplyScalar(v);
    return out;
  }

  // ----- impostor sphere (always visible, sits 0.8% under true terrain) -----
  buildFarMesh() {
    let geo = new THREE.SphereGeometry(1, 96, 64);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo);
    const pos = geo.attributes.position;
    const n = pos.count;
    const colors = new Float32Array(n * 3);
    const hs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      _v1.fromBufferAttribute(pos, i).normalize();
      const h = this.height3(_v1.x, _v1.y, _v1.z, true);
      hs[i] = h;
      const r = this.R * 0.992 + h;
      pos.setXYZ(i, _v1.x * r, _v1.y * r, _v1.z * r);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      _v1.fromBufferAttribute(pos, i).normalize();
      _v2.fromBufferAttribute(nor, i);
      const slope = 1 - Math.abs(_v2.dot(_v1));
      this.colorFor(hs[i], slope, _v1.x, _v1.y, _v1.z, _col);
      colors[i * 3] = _col.r; colors[i * 3 + 1] = _col.g; colors[i * 3 + 2] = _col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.farMesh = new THREE.Mesh(geo, this.farMat);
    this.group.add(this.farMesh);
  }

  // ----- water / clouds / atmosphere / rings --------------------------------
  buildShells() {
    const biome = this.def.biome;
    if (this.hasSea) {
      this.waterMat = makeWaterMaterial(biome.sea.deep, biome.sea.shallow, biome.sea.lava, this.lowQ);
      this.waterMat.uniforms.uSunDir.value.copy(this.sunDir);
      const water = new THREE.Mesh(new THREE.SphereGeometry(this.seaR, 96, 64), this.waterMat);
      water.renderOrder = 1;
      this.group.add(water);
    }
    if (biome.cloud.density > 0.05) {
      const tex = makeCloudTexture(this.rand, biome.cloud.density, biome.cloud.color);
      this.clouds = new THREE.Mesh(
        new THREE.SphereGeometry(this.R * 1.05, 48, 32),
        new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      );
      this.clouds.renderOrder = 3;
      this.clouds.rotation.z = (this.rand() - 0.5) * 0.6;
      this.group.add(this.clouds);
    }
    this.atmoMat = makeAtmosphereMaterial(this.def.atmo || biome.atmo, biome.strength);
    this.atmoMat.uniforms.uSunDir.value.copy(this.sunDir);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(this.R * 1.2, 48, 32), this.atmoMat);
    atmo.renderOrder = 4;
    this.group.add(atmo);

    if (this.def.hasRings) {
      const inner = this.R * 1.5, outer = this.R * 2.4;
      const tex = makeRingTexture(this.rand, this.def.ringTint);
      const mat = makeRingMaterial(tex, inner, outer);
      mat.uniforms.uSunDir.value.copy(this.sunDir);
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160, 1), mat);
      ring.rotation.set(Math.PI / 2 + (this.rand() - 0.5) * 0.5, 0, (this.rand() - 0.5) * 0.4);
      ring.renderOrder = 2;
      this.group.add(ring);
    }
  }

  // ----- quadtree LOD --------------------------------------------------------
  update(cameraPos, isNearest, dt) {
    const distC = cameraPos.distanceTo(this.center);
    if (this.clouds) {
      this.clouds.rotation.y += this.def.cloudSpin * dt * 60;
      // fade the shell out when the camera is close to (or under) it
      const dShell = Math.abs(distC - this.R * 1.05);
      this.clouds.material.opacity = clamp(dShell / (this.R * 0.06), 0.1, 1);
      // outside the shell only the front faces are visible — halve the overdraw
      const side = distC > this.R * 1.06 ? THREE.FrontSide : THREE.DoubleSide;
      if (this.clouds.material.side !== side) this.clouds.material.side = side;
    }
    if (isNearest && distC < this.R * 3.5) {
      this.lodTimer -= dt;
      if (this.lodTimer <= 0) {
        this.lodTimer = 0.22;
        this.lodUpdate(cameraPos);
      }
    } else if (this.built.size && distC > this.R * 5) {
      this.teardown();
    }
  }

  lodUpdate(camWorldPos) {
    const camLocal = _v1.copy(camWorldPos).sub(this.center);
    const camLen = camLocal.length();
    const camAlt = camLen - this.R;
    this.desired.clear();
    const cullOn = camAlt < this.R * 0.7;
    const horizon = cullOn
      ? Math.acos(clamp(this.R / Math.max(camLen, this.R + 1), -1, 1)) + 0.18
      : Math.PI;
    for (let f = 0; f < 6; f++) this.walkNode(f, 0, 0, 0, camLocal, camLen, horizon);
    this.resolveVisibility();
    this.updatePropTiles(camLocal, camAlt);
  }

  walkNode(face, level, ix, iy, camLocal, camLen, horizon) {
    const div = 1 << level, size = 2 / div;
    const uC = -1 + (ix + 0.5) * size, vC = -1 + (iy + 0.5) * size;
    cubeDir(face, uC, vC, _v2);
    const key = `${face}|${level}|${ix}|${iy}`;
    let h = this.nodeH.get(key);
    if (h === undefined) {
      h = this.height3(_v2.x, _v2.y, _v2.z, true);
      this.nodeH.set(key, h);
    }
    const chunkSize = this.faceArc / div;
    if (horizon < Math.PI) {
      const cosAng = clamp((camLocal.x * _v2.x + camLocal.y * _v2.y + camLocal.z * _v2.z) / camLen, -1, 1);
      if (Math.acos(cosAng) - (chunkSize * 0.85) / this.R > horizon) return;
    }
    const r = this.R + h;
    const dx = camLocal.x - _v2.x * r, dy = camLocal.y - _v2.y * r, dz = camLocal.z - _v2.z * r;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (level < this.maxLevel && dist < chunkSize * 2.6) {
      for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
        this.walkNode(face, level + 1, ix * 2 + cx, iy * 2 + cy, camLocal, camLen, horizon);
      }
    } else {
      this.desired.set(key, { face, level, ix, iy, priority: dist / chunkSize });
    }
  }

  resolveVisibility() {
    const shown = new Set();
    for (const [key, nd] of this.desired) {
      let l = nd.level, x = nd.ix, y = nd.iy, found = null;
      while (l >= 0) {
        const k = `${nd.face}|${l}|${x}|${y}`;
        if (this.built.has(k)) { found = k; break; }
        l--; x >>= 1; y >>= 1;
      }
      if (found) shown.add(found);
      if (!this.built.has(key) && !this.queued.has(key)) {
        this.queued.add(key);
        queue.push({ planet: this, key, nd, priority: nd.priority + (this.maxLevel - nd.level) });
      }
    }
    const now = performance.now();
    for (const [k, c] of this.built) {
      const vis = shown.has(k);
      c.mesh.visible = vis;
      if (vis || this.desired.has(k)) c.last = now;
      else if (now - c.last > 6000) {
        this.chunksGroup.remove(c.mesh);
        c.mesh.geometry.dispose();
        this.built.delete(k);
      }
    }
  }

  runBuild(key, nd) {
    const mesh = this.buildChunk(nd);
    mesh.visible = false;
    this.chunksGroup.add(mesh);
    this.built.set(key, { mesh, last: performance.now() });
  }

  buildChunk(nd) {
    const N = this.RES, P = N + 2;
    const div = 1 << nd.level, size = 2 / div;
    const u0 = -1 + nd.ix * size, v0 = -1 + nd.iy * size;
    const chunkWorld = this.faceArc / div;

    // padded height/position grid (1-vertex apron for seamless normals)
    const gp = new Float32Array(P * P * 3);
    const gh = new Float32Array(P * P);
    for (let gy = 0; gy < P; gy++) {
      const v = v0 + ((gy - 1) / (N - 1)) * size;
      for (let gx = 0; gx < P; gx++) {
        const u = u0 + ((gx - 1) / (N - 1)) * size;
        cubeDir(nd.face, u, v, _v2);
        const h = this.height3(_v2.x, _v2.y, _v2.z);
        const r = this.R + h;
        const i = (gy * P + gx) * 3;
        gp[i] = _v2.x * r; gp[i + 1] = _v2.y * r; gp[i + 2] = _v2.z * r;
        gh[gy * P + gx] = h;
      }
    }

    const NV = N * N + 4 * N;
    const positions = new Float32Array(NV * 3);
    const normals = new Float32Array(NV * 3);
    const colors = new Float32Array(NV * 3);
    const uvs = new Float32Array(NV * 2);

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const vi = y * N + x;
        const pi = ((y + 1) * P + (x + 1)) * 3;
        const px = gp[pi], py = gp[pi + 1], pz = gp[pi + 2];
        positions[vi * 3] = px; positions[vi * 3 + 1] = py; positions[vi * 3 + 2] = pz;

        const w = ((y + 1) * P + x) * 3, e = ((y + 1) * P + (x + 2)) * 3;
        const s = (y * P + (x + 1)) * 3, nn = ((y + 2) * P + (x + 1)) * 3;
        const ax = gp[e] - gp[w], ay = gp[e + 1] - gp[w + 1], az = gp[e + 2] - gp[w + 2];
        const bx = gp[nn] - gp[s], by = gp[nn + 1] - gp[s + 1], bz = gp[nn + 2] - gp[s + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const pl = Math.hypot(px, py, pz) || 1;
        const ux = px / pl, uy = py / pl, uz = pz / pl;
        if (nx * ux + ny * uy + nz * uz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        normals[vi * 3] = nx; normals[vi * 3 + 1] = ny; normals[vi * 3 + 2] = nz;

        const slope = 1 - Math.abs(nx * ux + ny * uy + nz * uz);
        this.colorFor(gh[(y + 1) * P + (x + 1)], slope, ux, uy, uz, _col);
        colors[vi * 3] = _col.r; colors[vi * 3 + 1] = _col.g; colors[vi * 3 + 2] = _col.b;

        uvs[vi * 2] = (u0 + (x / (N - 1)) * size) * this.uvScale;
        uvs[vi * 2 + 1] = (v0 + (y / (N - 1)) * size) * this.uvScale;
      }
    }

    // skirt vertices: copies of edge verts pulled toward planet center
    const skirtDepth = chunkWorld * 0.08 + 2;
    const SB = N * N;
    const edge = (slot, j) => {
      if (slot === 0) return j;                 // bottom y=0
      if (slot === 1) return (N - 1) * N + j;   // top
      if (slot === 2) return j * N;             // left x=0
      return j * N + (N - 1);                   // right
    };
    for (let slot = 0; slot < 4; slot++) {
      for (let j = 0; j < N; j++) {
        const src = edge(slot, j), dst = SB + slot * N + j;
        const px = positions[src * 3], py = positions[src * 3 + 1], pz = positions[src * 3 + 2];
        const pl = Math.hypot(px, py, pz) || 1;
        const f = 1 - skirtDepth / pl;
        positions[dst * 3] = px * f; positions[dst * 3 + 1] = py * f; positions[dst * 3 + 2] = pz * f;
        normals[dst * 3] = normals[src * 3]; normals[dst * 3 + 1] = normals[src * 3 + 1]; normals[dst * 3 + 2] = normals[src * 3 + 2];
        colors[dst * 3] = colors[src * 3]; colors[dst * 3 + 1] = colors[src * 3 + 1]; colors[dst * 3 + 2] = colors[src * 3 + 2];
        uvs[dst * 2] = uvs[src * 2]; uvs[dst * 2 + 1] = uvs[src * 2 + 1];
      }
    }

    const idx = [];
    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N - 1; x++) {
        const a = y * N + x, b = a + 1, c = a + N, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    // double-sided skirt quads
    for (let slot = 0; slot < 4; slot++) {
      for (let j = 0; j < N - 1; j++) {
        const a = edge(slot, j), b = edge(slot, j + 1);
        const sa = SB + slot * N + j, sb = sa + 1;
        idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, this.terrainMat);
  }

  // ----- props ---------------------------------------------------------------
  updatePropTiles(camLocal, camAlt) {
    const keep = new Set();
    if (camAlt < 700 && this.propTemplates.length) {
      const dir = _v2.copy(camLocal).normalize();
      const face = faceOfDir(dir);
      const f = FACES[face];
      const dn = dir.dot(f.n);
      if (dn > 0.001) {
        const u = dir.dot(f.t) / dn, v = dir.dot(f.b) / dn;
        const div = 1 << this.propLevel, size = 2 / div;
        const tileWorld = this.faceArc / div;
        const cx = Math.floor((u + 1) / size), cy = Math.floor((v + 1) / size);
        const radius = 190;
        const range = Math.ceil(radius / tileWorld) + 1;
        for (let dy = -range; dy <= range; dy++) {
          for (let dx = -range; dx <= range; dx++) {
            const ix = cx + dx, iy = cy + dy;
            if (ix < 0 || iy < 0 || ix >= div || iy >= div) continue;
            cubeDir(face, -1 + (ix + 0.5) * size, -1 + (iy + 0.5) * size, _v3);
            const d = _v3.multiplyScalar(this.R).distanceTo(camLocal);
            if (d > radius + Math.max(camAlt, 0) + tileWorld) continue;
            const tk = `${face}|${ix}|${iy}`;
            keep.add(tk);
            if (!this.tiles.has(tk)) this.buildTile(face, ix, iy, tk);
          }
        }
      }
    }
    for (const [tk, tile] of this.tiles) {
      if (!keep.has(tk)) {
        tile.forEach((m) => { this.group.remove(m); m.dispose(); });
        this.tiles.delete(tk);
      }
    }
  }

  buildTile(face, ix, iy, tk) {
    const rand = mulberry32(hashStr(tk) ^ this.def.seed);
    const div = 1 << this.propLevel, size = 2 / div;
    const u0 = -1 + ix * size, v0 = -1 + iy * size;
    const meshes = [];
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(), probe = new THREE.Vector3();
    const colA = new THREE.Color(), colB = new THREE.Color();

    for (const tpl of this.propTemplates) {
      const count = Math.round(tpl.density * 24 * (0.7 + rand() * 0.6));
      if (!count) continue;
      const inst = new THREE.InstancedMesh(tpl.geo, tpl.mat, count);
      colA.set(tpl.colorA); colB.set(tpl.colorB);
      let placed = 0;
      for (let i = 0; i < count * 2 && placed < count; i++) {
        const u = u0 + rand() * size, v = v0 + rand() * size;
        cubeDir(face, u, v, up);
        const h = this.height3(up.x, up.y, up.z);
        if (this.hasSea && h < this.seaOffU + this.R * 0.0015) continue;
        const eps = 0.0015;
        cubeDir(face, u + eps, v, probe);
        const h2 = this.height3(probe.x, probe.y, probe.z);
        cubeDir(face, u, v + eps, probe);
        const h3 = this.height3(probe.x, probe.y, probe.z);
        if (Math.max(Math.abs(h2 - h), Math.abs(h3 - h)) / (this.R * eps) > tpl.maxSlope) continue;
        const s = lerp(tpl.sMin, tpl.sMax, rand());
        p.copy(up).multiplyScalar(this.R + h + tpl.yOff * s);
        _q1.setFromUnitVectors(_Y, up);
        _q2.setFromAxisAngle(up, rand() * Math.PI * 2);
        _q1.premultiply(_q2);
        sc.setScalar(s);
        m4.compose(p, _q1, sc);
        inst.setMatrixAt(placed, m4);
        _col.lerpColors(colA, colB, rand());
        inst.setColorAt(placed, _col);
        placed++;
      }
      if (!placed) { inst.dispose(); continue; }
      inst.count = placed;
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      this.group.add(inst);
      meshes.push(inst);
    }
    this.tiles.set(tk, meshes);
  }

  teardown() {
    for (const [, c] of this.built) {
      this.chunksGroup.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.built.clear();
    this.desired.clear();
    this.queued.clear();
    this.nodeH.clear(); // recomputed cheaply; otherwise grows unbounded all session
    for (const [, tile] of this.tiles) tile.forEach((m) => { this.group.remove(m); m.dispose(); });
    this.tiles.clear();
  }
}
