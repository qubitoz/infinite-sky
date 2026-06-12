// Deterministic surface sites: ship wrecks (collect 3 parts → new ship in the
// hangar) and friendly trading posts (swap materials for exclusive outfit
// pieces). Placement derives from the planet seed; collection progress is
// per profile + system.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { vendorPieceFor } from './gear.js';
import { makeGlowTexture } from './textures.js';

const RESIST_SHIPS = ['frost', 'ember', 'mist', 'prism'];
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);

function randomUnit(rand, out) {
  const u = rand() * 2 - 1, ph = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(ph), u, s * Math.sin(ph));
}

// surface point for a direction, nudged deterministically off water
function surfacePoint(planet, dir) {
  const d = dir.clone();
  for (let i = 0; i < 10; i++) {
    const smp = planet.sampleAt(_v1.copy(planet.center).addScaledVector(d, planet.R));
    if (smp.terrR >= smp.floorR - 0.01) return { pos: planet.center.clone().addScaledVector(smp.up, smp.floorR), up: smp.up.clone() };
    d.applyAxisAngle(_Y, 0.13).normalize();
  }
  const smp = planet.sampleAt(_v1.copy(planet.center).addScaledVector(d, planet.R));
  return { pos: planet.center.clone().addScaledVector(smp.up, smp.floorR), up: smp.up.clone() };
}

function mkMesh(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

export class SiteManager {
  constructor(scene) {
    this.scene = scene;
    this.defs = new Map();      // planetId -> {wreck, vendor}
    this.built = null;          // {planet, group, partMeshes:[], anchors}
    this.progress = {};
    this.key = null;
    this.glowTex = makeGlowTexture();
  }

  setContext(profile, systemSeed) {
    this.key = `infsky-sites-${profile}-${systemSeed}`;
    try { this.progress = JSON.parse(localStorage.getItem(this.key) || '{}'); } catch { this.progress = {}; }
  }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.progress)); } catch { /* fine */ }
  }

  defsFor(planet) {
    const pid = planet.def.id;
    if (!this.defs.has(pid)) {
      const rand = mulberry32((planet.def.seed ^ 0x517e50) >>> 0);
      let wreck = null, vendor = null;
      if (!planet.def.biome.hazard && rand() < 0.55) {
        wreck = {
          dir: randomUnit(rand, new THREE.Vector3()),
          ship: RESIST_SHIPS[(rand() * RESIST_SHIPS.length) | 0],
          parts: [0, 1, 2].map(() => ({ ang: rand() * Math.PI * 2, d: 50 + rand() * 150 })),
        };
      }
      if ((planet.def.biome.faunaCount || 0) > 0 && rand() < 0.5) {
        vendor = { dir: randomUnit(rand, new THREE.Vector3()), piece: vendorPieceFor(planet.def.biome.kit) };
      }
      this.defs.set(pid, { wreck, vendor });
    }
    return this.defs.get(pid);
  }

  prog(pid) {
    if (!this.progress[pid]) this.progress[pid] = { parts: [false, false, false], repaired: false };
    return this.progress[pid];
  }

  teardown() {
    if (this.built) { this.scene.remove(this.built.group); this.built = null; }
  }

  // build world meshes for a planet's sites
  build(planet) {
    this.teardown();
    const d = this.defsFor(planet);
    const group = new THREE.Group();
    const anchors = { wreck: null, parts: [], vendor: null };
    const pr = this.prog(planet.def.id);

    if (d.wreck) {
      const w = surfacePoint(planet, d.wreck.dir);
      anchors.wreck = w;
      const wg = new THREE.Group();
      const dark = new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.7, metalness: 0.5, flatShading: true });
      const burn = new THREE.MeshStandardMaterial({ color: '#2a2624', roughness: 0.95, flatShading: true });
      mkMesh(wg, new THREE.BoxGeometry(1.6, 1.0, 4.8), dark, 0, 0.3, 0, 0.18, 0.4, 0.22);
      mkMesh(wg, new THREE.BoxGeometry(3.4, 0.14, 1.5), dark, -1.8, 0.1, 0.8, 0, 0.5, 0.35);
      mkMesh(wg, new THREE.BoxGeometry(2.2, 0.14, 1.2), burn, 2.0, 0.05, -0.6, 0, -0.4, -0.25);
      mkMesh(wg, new THREE.ConeGeometry(0.7, 2.2, 4), burn, 0.4, 0.2, -2.8, 1.2, 0, 0.6);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: '#ff8a4a', transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.set(7, 7, 1);
      halo.position.set(0, 1.5, 0);
      wg.add(halo);
      wg.position.copy(w.pos);
      wg.quaternion.setFromUnitVectors(_Y, w.up);
      group.add(wg);

      // tangent basis for part placement
      _v1.set(0, 1, 0);
      if (Math.abs(w.up.dot(_v1)) > 0.95) _v1.set(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(w.up, _v1).normalize();
      const t2 = new THREE.Vector3().crossVectors(w.up, t1).normalize();
      d.wreck.parts.forEach((p, i) => {
        if (pr.parts[i] || pr.repaired) { anchors.parts.push(null); return; }
        _v2.copy(w.pos)
          .addScaledVector(t1, Math.cos(p.ang) * p.d)
          .addScaledVector(t2, Math.sin(p.ang) * p.d);
        const sp = planet.sampleAt(_v2);
        const pos = planet.center.clone().addScaledVector(sp.up, sp.floorR + 0.6);
        const pg = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#aa6611', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.7 });
        mkMesh(pg, new THREE.TorusGeometry(0.5, 0.16, 6, 10), gold, 0, 0, 0, Math.PI / 2.5);
        mkMesh(pg, new THREE.BoxGeometry(0.4, 0.4, 0.4), gold, 0, 0, 0, 0.5, 0.5, 0);
        const h = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex, color: '#ffb347', transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        h.scale.set(2.6, 2.6, 1);
        pg.add(h);
        pg.position.copy(pos);
        group.add(pg);
        anchors.parts.push({ idx: i, pos, mesh: pg });
      });
    }

    if (d.vendor) {
      const v = surfacePoint(planet, d.vendor.dir);
      anchors.vendor = v;
      const vg = new THREE.Group();
      const tentM = new THREE.MeshStandardMaterial({ color: '#ff7ab8', roughness: 0.8, flatShading: true });
      const woodM = new THREE.MeshStandardMaterial({ color: '#8a6a42', roughness: 0.9, flatShading: true });
      mkMesh(vg, new THREE.ConeGeometry(3.4, 3.2, 6), tentM, 0, 1.6, 0);
      mkMesh(vg, new THREE.BoxGeometry(2.6, 0.8, 1.0), woodM, 0, 0.4, 2.8);
      mkMesh(vg, new THREE.CylinderGeometry(0.06, 0.08, 4.4, 5), woodM, 2.6, 2.2, 2.6);
      mkMesh(vg, new THREE.BoxGeometry(1.2, 0.7, 0.04), tentM, 2.0, 3.9, 2.6);
      // big friendly shopkeeper blob
      const skin = new THREE.MeshStandardMaterial({ color: '#9a6ad9', roughness: 0.8, flatShading: true });
      const body = mkMesh(vg, new THREE.SphereGeometry(1.0, 10, 8), skin, 0, 1.0, 2.0);
      body.scale.set(1.1, 0.95, 1.1);
      const eyeW = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
      const eyeB = new THREE.MeshStandardMaterial({ color: '#1b2026', roughness: 0.25 });
      for (const sgn of [-1, 1]) {
        const e = mkMesh(vg, new THREE.SphereGeometry(0.22, 8, 6), eyeW, sgn * 0.34, 1.35, 2.85);
        mkMesh(vg, new THREE.SphereGeometry(0.1, 6, 5), eyeB, sgn * 0.34, 1.37, 3.04);
        e.scale.z = 0.7;
      }
      vg.position.copy(v.pos);
      vg.quaternion.setFromUnitVectors(_Y, v.up);
      group.add(vg);
    }

    this.scene.add(group);
    this.built = { planet, group, anchors };
  }

  update(dt, playerPos, planet, started) {
    if (!started) return;
    const near = playerPos.distanceTo(planet.center) - planet.R < 4000;
    if (this.built && (this.built.planet !== planet || !near)) this.teardown();
    if (!this.built && near) this.build(planet);
    if (this.built) {
      for (const p of this.built.anchors.parts) if (p) p.mesh.rotation.y += dt * 1.5;
    }
  }

  // ---- queries for main / radar / markers
  blips(planet) {
    const out = [];
    if (!this.built || this.built.planet !== planet) return out;
    const a = this.built.anchors;
    const pr = this.prog(planet.def.id);
    if (a.wreck && !pr.repaired) out.push({ pos: a.wreck.pos, kind: 'wreck' });
    for (const p of a.parts) if (p) out.push({ pos: p.pos, kind: 'part' });
    if (a.vendor) out.push({ pos: a.vendor.pos, kind: 'vendor' });
    return out;
  }

  nearestPart(planet, pos, range) {
    if (!this.built || this.built.planet !== planet) return null;
    let best = null, bd = range;
    for (const p of this.built.anchors.parts) {
      if (!p) continue;
      const d = p.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  collectPart(planet, part) {
    const pid = planet.def.id;
    const pr = this.prog(pid);
    pr.parts[part.idx] = true;
    this.built.group.remove(part.mesh);
    this.built.anchors.parts[this.built.anchors.parts.indexOf(part)] = null;
    const done = pr.parts.every(Boolean);
    if (done) pr.repaired = true;
    this.save();
    return { done, got: pr.parts.filter(Boolean).length, ship: this.defsFor(planet).wreck.ship };
  }

  vendorNear(planet, pos, range) {
    if (!this.built || this.built.planet !== planet) return null;
    const a = this.built.anchors;
    if (a.vendor && a.vendor.pos.distanceTo(pos) < range) return this.defsFor(planet).vendor.piece;
    return null;
  }
}
