// Modern spaceports — a deterministic landing hub on one safe planet per
// system. No creatures: just automated kiosk screens. Fase A ships the
// structure, the ESTELARS economy and a working EXCHANGE kiosk; the other
// kiosks preview what's coming. Built only when the player nears the host
// planet (same proximity pattern as SiteManager).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { getGlow, disposeTree } from './textures.js';

export const KIOSKS = [
  { id: 'exchange', color: '#5ef2d6' },
  { id: 'ships', color: '#7fc4ff' },
  { id: 'parts', color: '#ffd34d' },
  { id: 'maps', color: '#9fe8d8' },
  { id: 'clothing', color: '#ff7ab8' },
  { id: 'gadgets', color: '#b48cff' },
];

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

// per-system port palettes: [ring/beacon, hub trim]
const THEMES = [
  { ring: '#5ef2d6', hub: '#7fc4ff' },
  { ring: '#ff7ab8', hub: '#ffd34d' },
  { ring: '#ffd34d', hub: '#ff8a4a' },
  { ring: '#b48cff', hub: '#7fc4ff' },
  { ring: '#7fffd4', hub: '#9fe87f' },
];

function randomUnit(rand, out) {
  const u = rand() * 2 - 1, ph = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(ph), u, s * Math.sin(ph));
}

// kiosk ring radius — ~4x the old footprint; init + build both use it
const PORT_RING = 30;

// Find a FLAT, DRY landing spot. Samples many fully-random directions (not a single
// latitude ring) so ocean worlds don't trap it on water, and prefers the flattest land
// (low slope) so the port + its plaza sit on even ground. Runs once at init.
function surfacePoint(planet, rand) {
  const tmp = new THREE.Vector3(), nb = new THREE.Vector3();
  const off = 0.018; // ~1° tangent probe for slope
  let best = null, bestFlat = Infinity, anyLand = null;
  const land = (smp) => ({ pos: planet.center.clone().addScaledVector(smp.up, smp.floorR), up: smp.up.clone() });
  for (let i = 0; i < 48; i++) {
    const d = randomUnit(rand, new THREE.Vector3());
    const smp = planet.sampleAt(tmp.copy(planet.center).addScaledVector(d, planet.R));
    if (smp.terrR < smp.floorR - 0.01) continue; // water — skip
    if (!anyLand) anyLand = land(smp);
    const ref = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(d, ref).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
    let maxd = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      nb.copy(d).addScaledVector(t1, a * off).addScaledVector(t2, b * off).normalize();
      const s2 = planet.sampleAt(tmp.copy(planet.center).addScaledVector(nb, planet.R));
      maxd = Math.max(maxd, Math.abs(s2.floorR - smp.floorR));
    }
    if (maxd < bestFlat) { bestFlat = maxd; best = land(smp); }
    if (maxd < planet.R * 0.004) break; // flat enough
  }
  if (best || anyLand) return best || anyLand;
  // pure-ocean fallback (shouldn't happen — init prefers land worlds)
  const smp = planet.sampleAt(tmp.copy(planet.center).addScaledVector(new THREE.Vector3(0, 1, 0), planet.R));
  return { pos: planet.center.clone().addScaledVector(smp.up, smp.floorR), up: smp.up.clone() };
}

function mk(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

export class SpaceportManager {
  constructor(scene) {
    this.scene = scene;
    this.glowTex = getGlow();
    this.portPlanet = null;
    this.anchor = null;
    this.kiosks = [];
    this.built = false;
    this.group = null;
    this.beacon = null;
  }

  // deterministic host planet + layout (one port per system, safe world)
  init(planets, seed) {
    const rand = mulberry32((seed ^ 0x70a17) >>> 0);
    // prefer a land-rich, non-hazard world so the port lands on dry, flat ground
    const nonHaz = planets.filter((p) => !p.def.biome.hazard);
    const dry = nonHaz.filter((p) => !p.hasSea);
    const pool = dry.length ? dry : (nonHaz.length ? nonHaz : planets);
    this.portPlanet = pool[(rand() * pool.length) | 0];
    this.theme = THEMES[(rand() * THEMES.length) | 0]; // per-system port palette
    this.anchor = surfacePoint(this.portPlanet, rand);
    // flat-plaza ground: the player walks on the deck level inside this radius instead of
    // the bumpy terrain, so they don't fall through the base to the ground below
    this.anchorR = this.anchor.pos.distanceTo(this.portPlanet.center);
    this.deckR = this.anchorR + 0.4; // deck surface (plaza cylinder top)
    this.plazaR = PORT_RING + 8;
    const up = this.anchor.up;
    let ref = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(ref)) > 0.95) ref.set(1, 0, 0);
    this.t1 = new THREE.Vector3().crossVectors(up, ref).normalize();
    this.t2 = new THREE.Vector3().crossVectors(up, this.t1).normalize();
    // kiosks sit on the flat tangent plane at the anchor height — a level plaza, so the
    // port reads as a built platform instead of following every terrain bump
    this.kiosks = KIOSKS.map((k, i) => {
      const a = (i / KIOSKS.length) * Math.PI * 2;
      const pos = this.anchor.pos.clone()
        .addScaledVector(this.t1, Math.cos(a) * PORT_RING)
        .addScaledVector(this.t2, Math.sin(a) * PORT_RING);
      return { ...k, pos, up: up.clone(), holo: null };
    });
  }

  isPortPlanet(p) { return p === this.portPlanet; }

  // flat walkable floor over the plaza (deck level), blending to terrain at the rim and
  // never below the real ground. Returns the terrain floor when away from the port.
  flatFloor(planet, worldPos, terrainFloorR) {
    if (planet !== this.portPlanet || !this.anchor) return terrainFloorR;
    const d = worldPos.distanceTo(this.anchor.pos);
    if (d >= this.plazaR) return terrainFloorR;
    const edge = Math.min(Math.max((d - (this.plazaR - 6)) / 6, 0), 1);
    const flat = this.deckR * (1 - edge) + terrainFloorR * edge;
    return Math.max(terrainFloorR, flat);
  }

  build() {
    if (this.built) return;
    const group = new THREE.Group();
    const A = this.anchor;

    // wide flat plaza (the extra flat ground) + central landing pad + hub + beacon
    const pad = new THREE.Group();
    pad.position.copy(A.pos);
    pad.quaternion.setFromUnitVectors(_Y, A.up);
    const th = this.theme || THEMES[0];
    const deck = new THREE.MeshStandardMaterial({ color: '#2a313a', roughness: 0.7, metalness: 0.5, flatShading: true });
    const trim = new THREE.MeshBasicMaterial({ color: th.ring, toneMapped: false });
    const plazaR = PORT_RING + 8;
    mk(pad, new THREE.CylinderGeometry(plazaR, plazaR + 0.8, 0.8, 32), deck, 0, 0.0, 0);
    mk(pad, new THREE.TorusGeometry(plazaR - 0.6, 0.35, 6, 40), trim, 0, 0.45, 0, Math.PI / 2);
    mk(pad, new THREE.CylinderGeometry(13, 13.8, 0.7, 8), deck, 0, 0.55, 0);
    mk(pad, new THREE.TorusGeometry(12, 0.32, 6, 8), trim, 0, 0.95, 0, Math.PI / 2);
    mk(pad, new THREE.SphereGeometry(5.0, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#3a4450', roughness: 0.4, metalness: 0.7, flatShading: true }), 0, 0.7, 0);
    mk(pad, new THREE.TorusGeometry(5.0, 0.22, 6, 16), new THREE.MeshBasicMaterial({ color: th.hub, toneMapped: false }), 0, 1.6, 0, Math.PI / 2);
    mk(pad, new THREE.CylinderGeometry(0.34, 0.5, 18, 6), deck, 0, 9.5, 0);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: th.ring, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    beacon.scale.set(11, 11, 1);
    beacon.position.set(0, 18.8, 0);
    pad.add(beacon);
    this.beacon = beacon;
    group.add(pad);

    // kiosks (pillar + glowing screen + floating holo icon), scaled to the bigger port
    this.holoBaseY = 5.0;
    for (const k of this.kiosks) {
      const kg = new THREE.Group();
      kg.position.copy(k.pos);
      kg.quaternion.setFromUnitVectors(_Y, k.up);
      // turn the screen toward the pad centre
      _v1.copy(A.pos).sub(k.pos);
      kg.rotateY(Math.atan2(_v1.dot(this.t1), _v1.dot(this.t2)));
      mk(kg, new THREE.BoxGeometry(0.9, 3.4, 0.9),
        new THREE.MeshStandardMaterial({ color: '#2a313a', roughness: 0.6, metalness: 0.6, flatShading: true }), 0, 1.7, 0);
      mk(kg, new THREE.BoxGeometry(2.9, 1.9, 0.24),
        new THREE.MeshStandardMaterial({ color: k.color, emissive: k.color, emissiveIntensity: 0.85, roughness: 0.3 }), 0, 3.3, 0.55);
      const holo = mk(kg, new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({ color: k.color, emissive: k.color, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 }), 0, this.holoBaseY, 0.35);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: k.color, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.set(5, 5, 1);
      halo.position.set(0, 3.6, 0.5);
      kg.add(halo);
      k.holo = holo;
      group.add(kg);
    }

    this.scene.add(group);
    this.group = group;
    this.built = true;
  }

  teardown() {
    if (this.group) { disposeTree(this.group); this.scene.remove(this.group); this.group = null; }
    this.built = false;
  }

  update(dt, refPos, started) {
    if (!started || !this.portPlanet) { this.teardown(); return; }
    const near = refPos.distanceTo(this.portPlanet.center) - this.portPlanet.R < 4000;
    if (near && !this.built) this.build();
    else if (!near && this.built) this.teardown();
    if (this.built) {
      const t = performance.now() * 0.002;
      for (const k of this.kiosks) {
        if (!k.holo) continue;
        k.holo.rotation.y += dt * 1.5;
        k.holo.position.y = (this.holoBaseY || 5.0) + Math.sin(t + k.pos.x) * 0.18;
      }
      if (this.beacon) this.beacon.material.opacity = 0.55 + 0.4 * Math.sin(t * 2.5);
    }
  }

  activeKiosk(playerPos, range = 6) {
    if (!this.built) return null;
    let best = null, bd = range;
    for (const k of this.kiosks) {
      const d = k.pos.distanceTo(playerPos);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // radar/markers for the host planet
  blips() {
    if (!this.built) return [];
    const out = [{ pos: this.anchor.pos, kind: 'port' }];
    for (const k of this.kiosks) out.push({ pos: k.pos, kind: 'kiosk', id: k.id });
    return out;
  }
}
