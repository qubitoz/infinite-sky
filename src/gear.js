// Natural materials you can gather on foot, the outfit pieces they unlock,
// the player's inventory (per profile), and the world pickup spawner.
// Materials are never spent — reaching the threshold unlocks the piece
// forever (kid-friendly: no losing things).
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

export const MATERIALS = {
  leaf: { name: { en: 'LEAF', es: 'HOJA' }, color: '#5fae4a' },
  flower: { name: { en: 'FLOWER', es: 'FLOR' }, color: '#ff7ab8' },
  branch: { name: { en: 'BRANCH', es: 'RAMA' }, color: '#8a6a42' },
  mud: { name: { en: 'MUD', es: 'LODO' }, color: '#6a5136' },
  bone: { name: { en: 'BONE', es: 'HUESO' }, color: '#e8e2cf' },
  ice: { name: { en: 'ICE SHARD', es: 'ESQUIRLA DE HIELO' }, color: '#bfe6ff' },
  obsidian: { name: { en: 'OBSIDIAN', es: 'OBSIDIANA' }, color: '#4a4156' },
  spore: { name: { en: 'GLOW SPORE', es: 'ESPORA LUMINOSA' }, color: '#8aff6a' },
  crystal: { name: { en: 'CRYSTAL', es: 'CRISTAL' }, color: '#d98aff' },
};

export const PIECES = [
  { id: 'leafhat', name: { en: 'LEAF HAT', es: 'SOMBRERO DE HOJAS' }, slot: 'head', mat: 'leaf', need: 3 },
  { id: 'flowercrown', name: { en: 'FLOWER CROWN', es: 'CORONA DE FLORES' }, slot: 'head', mat: 'flower', need: 3 },
  { id: 'antlers', name: { en: 'BRANCH ANTLERS', es: 'ASTAS DE RAMA' }, slot: 'head', mat: 'branch', need: 3 },
  { id: 'bonecrest', name: { en: 'BONE CREST', es: 'CRESTA DE HUESO' }, slot: 'head', mat: 'bone', need: 3 },
  { id: 'icecrown', name: { en: 'ICE CROWN', es: 'CORONA DE HIELO' }, slot: 'head', mat: 'ice', need: 3 },
  { id: 'crystalcrown', name: { en: 'CRYSTAL CROWN', es: 'CORONA DE CRISTAL' }, slot: 'head', mat: 'crystal', need: 3 },
  { id: 'sporeantenna', name: { en: 'GLOW ANTENNA', es: 'ANTENAS LUMINOSAS' }, slot: 'head', mat: 'spore', need: 3 },
  { id: 'mudmask', name: { en: 'MUD MASK', es: 'MÁSCARA DE LODO' }, slot: 'face', mat: 'mud', need: 3 },
  { id: 'obsidianvisor', name: { en: 'OBSIDIAN VISOR', es: 'VISOR DE OBSIDIANA' }, slot: 'face', mat: 'obsidian', need: 3 },
  { id: 'leafcape', name: { en: 'LEAF CAPE', es: 'CAPA DE HOJAS' }, slot: 'back', mat: 'leaf', need: 6 },
];

// vendor-exclusive premium pieces, one per prop kit family
export const VENDOR_PIECES = [
  { id: 'goldcrown', name: { en: 'GOLDEN CROWN', es: 'CORONA DORADA' }, slot: 'head', cost: { leaf: 4, flower: 2 }, kits: ['forest', 'cacti'] },
  { id: 'sporelantern', name: { en: 'SPORE LANTERN', es: 'FAROL DE ESPORAS' }, slot: 'back', cost: { spore: 3, mud: 2 }, kits: ['shroom', 'swamp'] },
  { id: 'prismhalo', name: { en: 'PRISM HALO', es: 'HALO DE PRISMA' }, slot: 'head', cost: { crystal: 4 }, kits: ['crystal', 'candy'] },
  { id: 'starmask', name: { en: 'STAR MASK', es: 'MÁSCARA ESTELAR' }, slot: 'face', cost: { bone: 2, ice: 2 }, kits: ['frost', 'spikes', 'rocks'] },
];
export function vendorPieceFor(kit) {
  return VENDOR_PIECES.find((p) => p.kits.includes(kit)) || VENDOR_PIECES[0];
}

// ------------------------------------------------------------ piece meshes
const _geo = {
  cone: new THREE.ConeGeometry(1, 1, 6),
  sphere: new THREE.SphereGeometry(1, 8, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  oct: new THREE.OctahedronGeometry(1, 0),
  torus: new THREE.TorusGeometry(1, 0.12, 6, 14),
};
function pm(hex, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, flatShading: true, ...extra });
}
function add(g, geo, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

export function buildPiece(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'leafhat': {
      const m = pm(MATERIALS.leaf.color);
      add(g, _geo.cone, m, 0.34, 0.22, 0.34, 0, 0.08, 0);
      add(g, _geo.cone, m, 0.26, 0.2, 0.26, 0, 0.22, 0);
      add(g, _geo.cone, m, 0.16, 0.18, 0.16, 0, 0.36, 0);
      break;
    }
    case 'flowercrown': {
      add(g, _geo.torus, pm('#5fae4a'), 0.26, 0.26, 0.26, 0, 0.02, 0, Math.PI / 2);
      const f = pm(MATERIALS.flower.color);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(g, _geo.sphere, f, 0.06, 0.06, 0.06, Math.cos(a) * 0.26, 0.05, Math.sin(a) * 0.26);
      }
      break;
    }
    case 'antlers': {
      const m = pm(MATERIALS.branch.color);
      for (const sgn of [-1, 1]) {
        add(g, _geo.cyl, m, 0.03, 0.34, 0.03, sgn * 0.16, 0.16, 0, 0, 0, -sgn * 0.5);
        add(g, _geo.cyl, m, 0.025, 0.2, 0.025, sgn * 0.26, 0.3, 0, 0, 0, -sgn * 1.1);
      }
      break;
    }
    case 'bonecrest': {
      const m = pm(MATERIALS.bone.color, { roughness: 0.5 });
      for (let i = -1; i <= 1; i++) add(g, _geo.cone, m, 0.07, 0.26 - Math.abs(i) * 0.08, 0.07, 0, 0.12, i * 0.16, i * 0.4);
      break;
    }
    case 'icecrown': {
      const m = pm(MATERIALS.ice.color, { roughness: 0.2 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(g, _geo.cone, m, 0.05, 0.2 + (i % 2) * 0.1, 0.05, Math.cos(a) * 0.22, 0.1, Math.sin(a) * 0.22);
      }
      break;
    }
    case 'crystalcrown': {
      const m = pm(MATERIALS.crystal.color, { emissive: '#b44eff', emissiveIntensity: 0.5, roughness: 0.2 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        add(g, _geo.oct, m, 0.07, 0.14, 0.07, Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2);
      }
      break;
    }
    case 'sporeantenna': {
      const m = pm(MATERIALS.spore.color, { emissive: '#4eff66', emissiveIntensity: 0.7 });
      const stem = pm('#3a4a36');
      for (const sgn of [-1, 1]) {
        add(g, _geo.cyl, stem, 0.02, 0.3, 0.02, sgn * 0.1, 0.14, 0, 0, 0, -sgn * 0.3);
        add(g, _geo.sphere, m, 0.07, 0.07, 0.07, sgn * 0.19, 0.3, 0);
      }
      break;
    }
    case 'mudmask': {
      const m = pm(MATERIALS.mud.color, { roughness: 1 });
      add(g, _geo.sphere, m, 0.27, 0.2, 0.1, 0, 0, 0);
      add(g, _geo.sphere, m, 0.06, 0.1, 0.05, -0.14, 0.14, 0);
      add(g, _geo.sphere, m, 0.06, 0.1, 0.05, 0.14, 0.14, 0);
      break;
    }
    case 'obsidianvisor': {
      add(g, _geo.box, pm(MATERIALS.obsidian.color, { roughness: 0.15, metalness: 0.7 }), 0.4, 0.14, 0.08, 0, 0.02, 0);
      break;
    }
    case 'leafcape': {
      const m = pm(MATERIALS.leaf.color, { side: THREE.DoubleSide });
      add(g, _geo.box, m, 0.5, 0.7, 0.02, 0, -0.38, 0.04, 0.12);
      add(g, _geo.cone, m, 0.1, 0.16, 0.1, 0, -0.76, 0.13, Math.PI);
      break;
    }
    case 'goldcrown': {
      const m = pm('#ffd97a', { metalness: 0.7, roughness: 0.25, emissive: '#aa7722', emissiveIntensity: 0.25 });
      add(g, _geo.torus, m, 0.26, 0.26, 0.26, 0, 0.02, 0, Math.PI / 2);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(g, _geo.cone, m, 0.05, 0.16, 0.05, Math.cos(a) * 0.24, 0.1, Math.sin(a) * 0.24);
      }
      break;
    }
    case 'sporelantern': {
      add(g, _geo.cyl, pm('#3a4a36'), 0.03, 0.4, 0.03, 0.1, 0.1, 0, 0, 0, -0.5);
      add(g, _geo.sphere, pm('#8aff6a', { emissive: '#4eff66', emissiveIntensity: 1.0 }), 0.1, 0.12, 0.1, 0.24, 0.28, 0);
      break;
    }
    case 'prismhalo': {
      const m = pm('#e08cff', { emissive: '#b44eff', emissiveIntensity: 0.8, roughness: 0.15 });
      add(g, _geo.torus, m, 0.3, 0.3, 0.3, 0, 0.16, 0, Math.PI / 2.4);
      break;
    }
    case 'starmask': {
      const m = pm('#ffd97a', { emissive: '#aa8833', emissiveIntensity: 0.4, roughness: 0.3 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        add(g, _geo.cone, m, 0.05, 0.16, 0.03, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0, 0, 0, -a + Math.PI);
      }
      break;
    }
    default: return null;
  }
  return g;
}

// ----------------------------------------------------------------- inventory
export class Inventory {
  constructor() {
    this.counts = {};
    this.vendor = [];
    this.equipped = { head: null, face: null, back: null };
    this.key = null;
  }

  load(profile) {
    this.key = `infsky-gear-${profile}`;
    try {
      const d = JSON.parse(localStorage.getItem(this.key) || '{}');
      this.counts = d.counts || {};
      this.vendor = d.vendor || [];
      this.equipped = Object.assign({ head: null, face: null, back: null }, d.equipped);
    } catch { /* fresh */ }
    if (!this.vendor) this.vendor = [];
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify({
        counts: this.counts, equipped: this.equipped, vendor: this.vendor,
      }));
    } catch { /* unavailable */ }
  }

  add(mat) { this.counts[mat] = (this.counts[mat] || 0) + 1; this.save(); return this.counts[mat]; }
  count(m) { return this.counts[m] || 0; }
  unlocked(piece) { return this.count(piece.mat) >= piece.need; }
  ownsVendor(id) { return (this.vendor || []).includes(id); }
  canAfford(piece) { return Object.entries(piece.cost).every(([m, n]) => this.count(m) >= n); }
  buyVendor(piece) {
    if (this.ownsVendor(piece.id) || !this.canAfford(piece)) return false;
    for (const [m, n] of Object.entries(piece.cost)) this.counts[m] -= n;
    this.vendor.push(piece.id);
    this.save();
    return true;
  }
  unlockedList() {
    return [
      ...PIECES.filter((p) => this.unlocked(p)),
      ...VENDOR_PIECES.filter((p) => this.ownsVendor(p.id)),
    ];
  }
  toggleEquip(piece) {
    this.equipped[piece.slot] = this.equipped[piece.slot] === piece.id ? null : piece.id;
    this.save();
  }
}

// ------------------------------------------------------------- world pickups
const _u = new THREE.Vector3();
const _t = new THREE.Vector3();

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.timer = 0;
    this.glowTex = makeGlowTexture();
  }

  update(dt, anchor, planet, active) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!active || it.planet !== planet || it.pos.distanceTo(anchor) > 150) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
      }
    }
    if (active) {
      this.timer -= dt;
      if (this.items.length < 5 && this.timer <= 0) {
        this.timer = 0.6;
        this.spawnOne(planet, anchor);
      }
    }
    for (const it of this.items) {
      it.phase += dt * 2;
      it.group.position.copy(it.pos).addScaledVector(it.up, Math.sin(it.phase) * 0.25 + 0.3);
      it.mesh.rotation.y += dt * 1.4;
    }
  }

  spawnOne(planet, anchor) {
    const avail = planet.def.biome.materials || [];
    if (!avail.length) return;
    const mat = avail[(Math.random() * avail.length) | 0];
    _u.copy(anchor).sub(planet.center).normalize();
    _t.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    _t.addScaledVector(_u, -_t.dot(_u));
    if (_t.lengthSq() < 1e-6) return;
    _t.normalize();
    const d = 18 + Math.random() * 55;
    const probe = anchor.clone().addScaledVector(_t, d);
    const smp = planet.sampleAt(probe);
    if (smp.terrR < smp.floorR - 0.01) return;

    const def = MATERIALS[mat];
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34, 0),
      new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.45, roughness: 0.4 }),
    );
    group.add(mesh);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: def.color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(1.8, 1.8, 1);
    group.add(halo);

    const pos = planet.center.clone().addScaledVector(smp.up, smp.floorR);
    group.position.copy(pos);
    this.scene.add(group);
    this.items.push({ mat, planet, group, mesh, pos, up: smp.up.clone(), phase: Math.random() * 6 });
  }

  nearestWithin(anchor, range) {
    let best = null, bd = range;
    for (const it of this.items) {
      const d = it.pos.distanceTo(anchor);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  collect(item) {
    this.scene.remove(item.group);
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    return item.mat;
  }
}
