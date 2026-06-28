// Fase D — star charts (radar reveals) and gadgets (Option-B soft action:
// harmless toys that pop targets for prizes, plus flora harvesting). All
// bought with estelars at the spaceport, owned forever per profile.
import * as THREE from 'three';
import { getGlow, disposeTree } from './textures.js';

export const CHARTS = [
  { id: 'system', name: { en: 'SYSTEM CHART', es: 'CARTA DEL SISTEMA' }, color: '#9fe8d8', price: 50,
    desc: { en: 'Reveals every planet on the radar', es: 'Revela todos los planetas en el radar' } },
  { id: 'prospect', name: { en: 'PROSPECTOR CHART', es: 'CARTA DE PROSPECTOR' }, color: '#ffd34d', price: 60,
    desc: { en: 'Marks worlds with wrecks or ruins', es: 'Marca mundos con naufragios o ruinas' } },
];

export const GADGETS = [
  { id: 'harvester', name: { en: 'HARVESTER', es: 'COSECHADORA' }, color: '#9fe87f', price: 80,
    desc: { en: 'Harvest flora — hold E', es: 'Cosecha flora — mantén E' } },
  { id: 'flarecannon', name: { en: 'FLARE CANNON', es: 'CAÑÓN DE BENGALAS' }, color: '#ff8a5c', price: 120,
    desc: { en: 'Pop cosmic geodes — fire in space', es: 'Revienta geodas — dispara en el espacio' } },
  { id: 'bubblewand', name: { en: 'BUBBLE WAND', es: 'VARITA DE BURBUJAS' }, color: '#7fc4ff', price: 60,
    desc: { en: 'Playful bubbles for creatures', es: 'Burbujas que alegran a las criaturas' } },
];

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _ap = new THREE.Vector3();

// closest distance² from point p to segment a→b
function segDist2(p, a, b) {
  _seg.subVectors(b, a);
  _ap.subVectors(p, a);
  const t = Math.max(0, Math.min(1, _ap.dot(_seg) / (_seg.lengthSq() || 1)));
  _v2.copy(a).addScaledVector(_seg, t);
  return _v2.distanceToSquared(p);
}

function randomDir(out) {
  const u = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(ph), u, s * Math.sin(ph));
}

export class GadgetManager {
  constructor(scene) {
    this.scene = scene;
    this.glow = getGlow();
    this.targets = [];   // floating cosmic geodes (in space)
    this.shots = [];     // flares + bubbles
    this.spawnT = 0;
    this._events = [];   // reused each frame (no per-frame array alloc)
  }

  // returns an events array: {type:'geode'|'bubble', pos}
  update(dt, camPos, hasFlare, inSpace) {
    const events = this._events;
    events.length = 0;
    // ---- geode targets (space, flare cannon owned)
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const tg = this.targets[i];
      if (!hasFlare || !inSpace || tg.pos.distanceTo(camPos) > 900) {
        disposeTree(tg.group);
        this.scene.remove(tg.group);
        this.targets.splice(i, 1);
      }
    }
    if (hasFlare && inSpace) {
      this.spawnT -= dt;
      if (this.targets.length < 3 && this.spawnT <= 0) { this.spawnT = 1.4; this.spawnTarget(camPos); }
    }
    const t = performance.now() * 0.002;
    for (const tg of this.targets) {
      tg.group.rotation.y += dt * 0.8;
      tg.group.rotation.x += dt * 0.5;
      tg.halo.material.opacity = 0.4 + 0.25 * Math.sin(t + tg.phase);
    }
    // ---- shots
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      _v1.copy(sh.pos);
      sh.pos.addScaledVector(sh.vel, dt);
      sh.life -= dt;
      sh.sprite.position.copy(sh.pos);
      let hit = false;
      if (sh.kind === 'flare') {
        for (let k = this.targets.length - 1; k >= 0; k--) {
          const tg = this.targets[k];
          if (segDist2(tg.pos, _v1, sh.pos) < (tg.r + 2.5) * (tg.r + 2.5)) {
            events.push({ type: 'geode', pos: tg.pos.clone() });
            disposeTree(tg.group);
            this.scene.remove(tg.group);
            this.targets.splice(k, 1);
            hit = true;
            break;
          }
        }
      }
      if (hit || sh.life <= 0) {
        if (sh.kind === 'bubble') events.push({ type: 'bubble', pos: sh.pos.clone() });
        disposeTree(sh.sprite);
        this.scene.remove(sh.sprite);
        this.shots.splice(i, 1);
      }
    }
    return events;
  }

  spawnTarget(camPos) {
    randomDir(_v1);
    const pos = camPos.clone().addScaledVector(_v1, 160 + Math.random() * 220);
    const group = new THREE.Group();
    const r = 7 + Math.random() * 5;
    const hue = Math.random();
    const col = new THREE.Color().setHSL(hue, 0.7, 0.6);
    const geo = new THREE.IcosahedronGeometry(r, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.3, flatShading: true,
    }));
    group.add(mesh);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: col, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.scale.set(r * 5, r * 5, 1);
    group.add(halo);
    group.position.copy(pos);
    this.scene.add(group);
    this.targets.push({ group, halo, mesh, pos, r, phase: Math.random() * 6 });
  }

  fire(kind, from, dir) {
    const isFlare = kind === 'flare';
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glow, color: isFlare ? 0xffb060 : 0x9fd8ff,
      transparent: true, opacity: isFlare ? 0.95 : 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    const s = isFlare ? 6 : 3;
    sprite.scale.set(s, s, 1);
    sprite.position.copy(from);
    this.scene.add(sprite);
    this.shots.push({
      kind, sprite, pos: from.clone(),
      vel: dir.clone().multiplyScalar(isFlare ? 620 : 22),
      life: isFlare ? 1.4 : 1.8,
    });
  }

  blips() { return this.targets.map((tg) => ({ pos: tg.pos, kind: 'geode' })); }

  teardown() {
    for (const tg of this.targets) { disposeTree(tg.group); this.scene.remove(tg.group); }
    for (const sh of this.shots) { disposeTree(sh.sprite); this.scene.remove(sh.sprite); }
    this.targets.length = 0;
    this.shots.length = 0;
  }
}
