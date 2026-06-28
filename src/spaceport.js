// Modern spaceports — a deterministic landing hub on one safe planet per
// system. No creatures: just automated kiosk screens. Fase A ships the
// structure, the ESTELARS economy and a working EXCHANGE kiosk; the other
// kiosks preview what's coming. Built only when the player nears the host
// planet (same proximity pattern as SiteManager).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { makeGlowTexture } from './textures.js';

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

function randomUnit(rand, out) {
  const u = rand() * 2 - 1, ph = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(ph), u, s * Math.sin(ph));
}

function surfacePoint(planet, dir) {
  const d = dir.clone();
  for (let i = 0; i < 12; i++) {
    const smp = planet.sampleAt(_v1.copy(planet.center).addScaledVector(d, planet.R));
    if (smp.terrR >= smp.floorR - 0.01) {
      return { pos: planet.center.clone().addScaledVector(smp.up, smp.floorR), up: smp.up.clone() };
    }
    d.applyAxisAngle(_Y, 0.17).normalize();
  }
  const smp = planet.sampleAt(_v1.copy(planet.center).addScaledVector(d, planet.R));
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
    this.glowTex = makeGlowTexture();
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
    const safe = planets.filter((p) => !p.def.biome.hazard);
    const pool = safe.length ? safe : planets;
    this.portPlanet = pool[(rand() * pool.length) | 0];
    this.anchor = surfacePoint(this.portPlanet, randomUnit(rand, new THREE.Vector3()));
    const up = this.anchor.up;
    let ref = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(ref)) > 0.95) ref.set(1, 0, 0);
    this.t1 = new THREE.Vector3().crossVectors(up, ref).normalize();
    this.t2 = new THREE.Vector3().crossVectors(up, this.t1).normalize();
    this.kiosks = KIOSKS.map((k, i) => {
      const a = (i / KIOSKS.length) * Math.PI * 2;
      const probe = this.anchor.pos.clone()
        .addScaledVector(this.t1, Math.cos(a) * 9)
        .addScaledVector(this.t2, Math.sin(a) * 9);
      const smp = this.portPlanet.sampleAt(probe);
      return {
        ...k,
        pos: this.portPlanet.center.clone().addScaledVector(smp.up, smp.floorR),
        up: smp.up.clone(), holo: null,
      };
    });
  }

  isPortPlanet(p) { return p === this.portPlanet; }

  build() {
    if (this.built) return;
    const group = new THREE.Group();
    const A = this.anchor;

    // landing pad + hub dome + beacon
    const pad = new THREE.Group();
    pad.position.copy(A.pos);
    pad.quaternion.setFromUnitVectors(_Y, A.up);
    const deck = new THREE.MeshStandardMaterial({ color: '#2a313a', roughness: 0.7, metalness: 0.5, flatShading: true });
    mk(pad, new THREE.CylinderGeometry(7, 7.4, 0.4, 6), deck, 0, 0.2, 0);
    mk(pad, new THREE.TorusGeometry(6.3, 0.18, 6, 6), new THREE.MeshBasicMaterial({ color: '#5ef2d6', toneMapped: false }), 0, 0.42, 0, Math.PI / 2);
    mk(pad, new THREE.SphereGeometry(2.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#3a4450', roughness: 0.4, metalness: 0.7, flatShading: true }), 0, 0.35, 0);
    mk(pad, new THREE.TorusGeometry(2.6, 0.12, 6, 14), new THREE.MeshBasicMaterial({ color: '#7fc4ff', toneMapped: false }), 0, 0.7, 0, Math.PI / 2);
    mk(pad, new THREE.CylinderGeometry(0.18, 0.28, 9, 6), deck, 0, 4.7, 0);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: '#5ef2d6', transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    beacon.scale.set(5, 5, 1);
    beacon.position.set(0, 9.4, 0);
    pad.add(beacon);
    this.beacon = beacon;
    group.add(pad);

    // kiosks (pillar + glowing screen + floating holo icon)
    for (const k of this.kiosks) {
      const kg = new THREE.Group();
      kg.position.copy(k.pos);
      kg.quaternion.setFromUnitVectors(_Y, k.up);
      // turn the screen toward the pad centre
      _v1.copy(A.pos).sub(k.pos);
      kg.rotateY(Math.atan2(_v1.dot(this.t1), _v1.dot(this.t2)));
      mk(kg, new THREE.BoxGeometry(0.5, 2.0, 0.5),
        new THREE.MeshStandardMaterial({ color: '#2a313a', roughness: 0.6, metalness: 0.6, flatShading: true }), 0, 1.0, 0);
      mk(kg, new THREE.BoxGeometry(1.7, 1.1, 0.14),
        new THREE.MeshStandardMaterial({ color: k.color, emissive: k.color, emissiveIntensity: 0.85, roughness: 0.3 }), 0, 1.9, 0.32);
      const holo = mk(kg, new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshStandardMaterial({ color: k.color, emissive: k.color, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 }), 0, 2.9, 0.2);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: k.color, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.set(3, 3, 1);
      halo.position.set(0, 2.1, 0.3);
      kg.add(halo);
      k.holo = holo;
      group.add(kg);
    }

    this.scene.add(group);
    this.group = group;
    this.built = true;
  }

  teardown() {
    if (this.group) { this.scene.remove(this.group); this.group = null; }
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
        k.holo.position.y = 2.9 + Math.sin(t + k.pos.x) * 0.12;
      }
      if (this.beacon) this.beacon.material.opacity = 0.55 + 0.4 * Math.sin(t * 2.5);
    }
  }

  activeKiosk(playerPos, range = 4.5) {
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
