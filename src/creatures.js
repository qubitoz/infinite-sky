// Procedural fauna. Species are generated DETERMINISTICALLY from each
// planet's seed, so every player exploring the same system seed meets the
// same creatures — only the discovery progress (scanned species) is
// per-player. Individuals are transient spawns; the species is the catalog
// unit. Bodies are kid-friendly low-poly: round shapes, bright colors,
// big eyes, never hostile.
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './noise.js';
import { creatureName } from './names.js';

const TEMPERAMENTS = ['shy', 'curious', 'playful', 'calm'];
const RARITY_WEIGHT = { common: 1, uncommon: 0.5, rare: 0.2 };

// Build every species in the system up front — the universe knows its own
// fauna, which is what makes a "discovered X of Y" catalog possible.
export function buildSpeciesCatalog(planets) {
  const all = [];
  for (const p of planets) {
    const rand = mulberry32((p.def.seed ^ 0x00fa44a7) >>> 0);
    // per-planet richness: fauna worlds can host up to 8 species, and rich
    // ones unlock the rarer body plans (biped, serpent)
    let count = p.def.biome.faunaCount || 0;
    if (count > 0) count = Math.min(8, count + ((rand() * 4) | 0));
    const allowed = [...(p.def.biome.faunaArchetypes || [])];
    if (count >= 3) allowed.push('biped', 'serpent');
    p.species = [];
    for (let i = 0; i < count && allowed.length; i++) {
      const hue = rand();
      const r = rand();
      const body = new THREE.Color().setHSL(hue, 0.55 + rand() * 0.25, 0.5 + rand() * 0.15);
      p.species.push({
        id: `${p.def.id}:${i}`,
        planetId: p.def.id,
        planetName: p.def.name,
        name: creatureName(rand).toUpperCase(),
        archetype: allowed[(rand() * allowed.length) | 0],
        size: 0.7 + rand() * rand() * 1.9,
        body,
        belly: body.clone().lerp(new THREE.Color('#ffffff'), 0.45),
        accent: new THREE.Color().setHSL((hue + 0.32 + rand() * 0.25) % 1, 0.62, 0.6),
        eyeScale: 0.85 + rand() * 0.6,
        temperament: TEMPERAMENTS[(rand() * TEMPERAMENTS.length) | 0],
        rarity: r < 0.55 ? 'common' : r < 0.85 ? 'uncommon' : 'rare',
        speed: 2.2 + rand() * 2.6,
      });
    }
    all.push(...p.species);
  }
  return all;
}

// ----------------------------------------------------------- body assembly
const G = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const EYE_WHITE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
const EYE_DARK = new THREE.MeshStandardMaterial({ color: '#1b2026', roughness: 0.25 });

function part(parent, geo, mat, sx, sy, sz, x, y, z, name = '') {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.name = name;
  parent.add(m);
  return m;
}

// leg with hip pivot so rotation.x swings naturally
function leg(parent, mat, r, h, x, y, z, name) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.name = name;
  part(pivot, G.cyl, mat, r, h, r, 0, -h / 2, 0);
  parent.add(pivot);
  return pivot;
}

function eyePair(parent, s, x, y, z) {
  for (const sgn of [-1, 1]) {
    const e = part(parent, G.sphere, EYE_WHITE, s, s, s * 0.7, sgn * x, y, z);
    part(e, G.sphere, EYE_DARK, 0.5, 0.5, 0.5, 0, 0.05, -0.62);
  }
}

// All bodies are built standing on y=0, facing -Z.
const BUILDERS = {
  walker(g, M, es) {
    part(g, G.sphere, M.body, 0.85, 0.72, 1.2, 0, 1.0, 0, 'body');
    part(g, G.sphere, M.belly, 0.68, 0.5, 0.95, 0, 0.82, 0.02);
    const head = part(g, G.sphere, M.body, 0.5, 0.5, 0.5, 0, 1.5, -1.15, 'head');
    eyePair(head, 0.34 * es, 0.45, 0.18, -0.78);
    part(head, G.cone, M.accent, 0.34, 0.9, 0.34, -0.5, 0.85, 0.1, 'earL').rotation.z = 0.35;
    part(head, G.cone, M.accent, 0.34, 0.9, 0.34, 0.5, 0.85, 0.1, 'earR').rotation.z = -0.35;
    leg(g, M.body, 0.15, 1.05, -0.5, 1.05, -0.6, 'leg0');
    leg(g, M.body, 0.15, 1.05, 0.5, 1.05, -0.6, 'leg1');
    leg(g, M.body, 0.15, 1.05, -0.5, 1.05, 0.65, 'leg2');
    leg(g, M.body, 0.15, 1.05, 0.5, 1.05, 0.65, 'leg3');
    const tail = part(g, G.cone, M.accent, 0.16, 0.85, 0.16, 0, 1.25, 1.25, 'tail');
    tail.rotation.x = 2.2;
  },
  longneck(g, M, es) {
    part(g, G.sphere, M.body, 1.05, 0.9, 1.45, 0, 1.45, 0.2, 'body');
    part(g, G.sphere, M.belly, 0.85, 0.6, 1.15, 0, 1.2, 0.22);
    const neck = part(g, G.cyl, M.body, 0.22, 1.5, 0.22, 0, 2.3, -1.0);
    neck.rotation.x = 0.45;
    const head = part(g, G.sphere, M.body, 0.4, 0.38, 0.45, 0, 3.0, -1.45, 'head');
    eyePair(head, 0.4 * es, 0.5, 0.2, -0.75);
    part(head, G.cone, M.accent, 0.3, 0.8, 0.3, 0, 1.1, 0, 'earL');
    leg(g, M.body, 0.24, 1.45, -0.55, 1.45, -0.75, 'leg0');
    leg(g, M.body, 0.24, 1.45, 0.55, 1.45, -0.75, 'leg1');
    leg(g, M.body, 0.24, 1.45, -0.55, 1.45, 0.95, 'leg2');
    leg(g, M.body, 0.24, 1.45, 0.55, 1.45, 0.95, 'leg3');
    const tail = part(g, G.cone, M.body, 0.28, 1.5, 0.28, 0, 1.5, 1.85, 'tail');
    tail.rotation.x = 1.9;
  },
  hopper(g, M, es) {
    part(g, G.sphere, M.body, 0.75, 0.88, 0.78, 0, 1.0, 0, 'body');
    part(g, G.sphere, M.belly, 0.58, 0.62, 0.6, 0, 0.85, -0.12);
    eyePair(g, 0.2 * es, 0.28, 1.3, -0.62);
    part(g, G.sphere, M.accent, 0.14, 0.55, 0.1, -0.26, 1.95, 0.05, 'earL').rotation.z = 0.25;
    part(g, G.sphere, M.accent, 0.14, 0.55, 0.1, 0.26, 1.95, 0.05, 'earR').rotation.z = -0.25;
    part(g, G.sphere, M.body, 0.2, 0.5, 0.45, -0.6, 0.45, 0.1);
    part(g, G.sphere, M.body, 0.2, 0.5, 0.45, 0.6, 0.45, 0.1);
    part(g, G.sphere, M.belly, 0.22, 0.22, 0.22, 0, 0.75, 0.78, 'tail');
  },
  blob(g, M, es) {
    part(g, G.sphere, M.body, 1.0, 0.85, 1.0, 0, 0.8, 0, 'body');
    part(g, G.sphere, M.belly, 0.8, 0.58, 0.85, 0, 0.6, 0.06);
    eyePair(g, 0.24 * es, 0.34, 1.05, -0.72);
    const ant = part(g, G.cyl, M.accent, 0.05, 0.7, 0.05, 0, 1.85, 0, 'tail');
    part(ant, G.sphere, M.accent, 3.2, 0.23, 3.2, 0, 0.55, 0); // counter parent scale → round bauble
  },
  flyer(g, M, es) {
    part(g, G.sphere, M.body, 0.55, 0.5, 0.75, 0, 0.7, 0, 'body');
    part(g, G.sphere, M.belly, 0.42, 0.34, 0.55, 0, 0.58, 0.02);
    eyePair(g, 0.18 * es, 0.22, 0.85, -0.55);
    part(g, G.cone, M.accent, 0.12, 0.4, 0.12, 0, 0.68, -0.85, 'beak').rotation.x = -1.57;
    for (const [sgn, nm] of [[-1, 'wingL'], [1, 'wingR']]) {
      const w = new THREE.Group();
      w.position.set(sgn * 0.45, 0.8, 0);
      w.name = nm;
      part(w, G.box, M.accent, 1.25, 0.06, 0.5, sgn * 0.62, 0, 0);
      g.add(w);
    }
    part(g, G.box, M.accent, 0.4, 0.05, 0.5, 0, 0.7, 0.75, 'tail');
  },
  biped(g, M, es) {
    // tall friendly bird: egg body on two long legs, crest, stubby wings
    part(g, G.sphere, M.body, 0.6, 0.85, 0.55, 0, 1.9, 0, 'body');
    part(g, G.sphere, M.belly, 0.45, 0.6, 0.42, 0, 1.75, -0.12);
    eyePair(g, 0.2 * es, 0.26, 2.35, -0.42);
    part(g, G.cone, M.accent, 0.12, 0.4, 0.12, 0, 2.25, -0.62, 'beak').rotation.x = -1.57;
    part(g, G.cone, M.accent, 0.16, 0.5, 0.16, 0, 2.85, 0.05, 'earL').rotation.z = 0.15;
    leg(g, M.body, 0.09, 1.5, -0.25, 1.5, 0, 'leg0');
    leg(g, M.body, 0.09, 1.5, 0.25, 1.5, 0, 'leg1');
    part(g, G.sphere, M.accent, 0.14, 0.4, 0.1, -0.62, 1.95, 0.1, 'wingL').rotation.z = 0.5;
    part(g, G.sphere, M.accent, 0.14, 0.4, 0.1, 0.62, 1.95, 0.1, 'wingR').rotation.z = -0.5;
    part(g, G.sphere, M.belly, 0.18, 0.18, 0.18, 0, 1.7, 0.55, 'tail');
  },
  serpent(g, M, es) {
    // gentle noodle: head + shrinking segments resting on the ground
    const head = part(g, G.sphere, M.body, 0.5, 0.45, 0.55, 0, 0.5, -1.4, 'head');
    eyePair(head, 0.42 * es, 0.5, 0.35, -0.6);
    part(head, G.cone, M.accent, 0.3, 0.7, 0.3, 0, 1.0, 0.1, 'earL');
    let s = 0.45;
    for (let i = 0; i < 5; i++) {
      part(g, G.sphere, M.body, s, s * 0.9, s, 0, s * 0.85, -0.7 + i * 0.62, i === 4 ? 'tail' : '');
      s *= 0.85;
    }
    part(g, G.sphere, M.belly, 0.34, 0.3, 0.4, 0, 0.42, -0.75);
  },
  crawler(g, M, es) {
    part(g, G.sphere, M.body, 0.95, 0.45, 1.25, 0, 0.62, 0, 'body');
    part(g, G.sphere, M.accent, 0.55, 0.3, 0.5, 0, 0.72, -1.0, 'head');
    eyePair(g, 0.16 * es, 0.24, 0.85, -1.35);
    for (let i = 0; i < 6; i++) {
      const sgn = i % 2 ? 1 : -1, row = (i / 2 | 0) - 1;
      leg(g, M.body, 0.09, 0.6, sgn * 0.6, 0.6, row * 0.62, `leg${i}`);
    }
    const a1 = part(g, G.cyl, M.accent, 0.04, 0.6, 0.04, -0.18, 1.1, -1.15, 'earL');
    a1.rotation.x = -0.5;
    const a2 = part(g, G.cyl, M.accent, 0.04, 0.6, 0.04, 0.18, 1.1, -1.15, 'earR');
    a2.rotation.x = -0.5;
  },
};

const protoCache = new Map();
function getProto(spec) {
  let proto = protoCache.get(spec.id);
  if (!proto) {
    proto = new THREE.Group();
    const M = {
      body: new THREE.MeshStandardMaterial({ color: spec.body, roughness: 0.85, flatShading: true }),
      belly: new THREE.MeshStandardMaterial({ color: spec.belly, roughness: 0.9, flatShading: true }),
      accent: new THREE.MeshStandardMaterial({ color: spec.accent, roughness: 0.7, flatShading: true }),
    };
    BUILDERS[spec.archetype](proto, M, spec.eyeScale);
    protoCache.set(spec.id, proto);
  }
  return proto;
}

// ------------------------------------------------------------- live fauna
const _up = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();

export class CreatureManager {
  constructor(scene, popCap = 12) {
    this.scene = scene;
    this.popCap = popCap;
    this.alive = [];
    this.spawnTimer = 0;
  }

  update(dt, anchor, planet, active) {
    // despawn far / inactive
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const c = this.alive[i];
      if (!active || c.planet !== planet || c.pos.distanceTo(anchor) > 280) {
        this.scene.remove(c.group);
        this.alive.splice(i, 1);
      }
    }
    if (active && planet.species && planet.species.length) {
      const target = Math.min(this.popCap, planet.species.length * 2 + 3);
      this.spawnTimer -= dt;
      if (this.alive.length < target && this.spawnTimer <= 0) {
        this.spawnTimer = 0.35;
        this.trySpawn(planet, anchor);
      }
    }
    for (const c of this.alive) this.behave(c, dt, anchor, planet);
  }

  trySpawn(planet, anchor) {
    // weighted species pick
    let total = 0;
    for (const s of planet.species) total += RARITY_WEIGHT[s.rarity];
    let pick = Math.random() * total;
    let spec = planet.species[0];
    for (const s of planet.species) { pick -= RARITY_WEIGHT[s.rarity]; if (pick <= 0) { spec = s; break; } }

    _up.copy(anchor).sub(planet.center).normalize();
    _v1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    _v1.addScaledVector(_up, -_v1.dot(_up));
    if (_v1.lengthSq() < 1e-6) return;
    _v1.normalize();
    const d = 55 + Math.random() * 120;
    _v2.copy(anchor).addScaledVector(_v1, d);
    const smp = planet.sampleAt(_v2);
    if (smp.terrR < smp.floorR - 0.01) return; // no spawning on water/lava

    const group = getProto(spec).clone();
    group.scale.setScalar(spec.size);
    const pos = planet.center.clone().addScaledVector(smp.up, smp.floorR - 0.05);
    group.position.copy(pos);
    this.scene.add(group);

    const parts = { legs: [], wings: [], ears: [], head: null, tail: null, body: null };
    group.traverse((o) => {
      if (o.name.startsWith('leg')) parts.legs.push(o);
      else if (o.name.startsWith('wing')) parts.wings.push(o);
      else if (o.name.startsWith('ear')) parts.ears.push(o);
      else if (o.name === 'head') parts.head = o;
      else if (o.name === 'tail') parts.tail = o;
      else if (o.name === 'body') parts.body = o;
    });
    const c = {
      spec, planet, group, pos, parts,
      fwd: _v1.clone(),
      state: 'idle', t: 1 + Math.random() * 2,
      phase: Math.random() * 10, flash: 0,
      bodyScaleY: parts.body ? parts.body.scale.y : 1,
    };
    // face a random tangent direction immediately
    this.orient(c, smp.up, 1);
    this.alive.push(c);
  }

  orient(c, up, k) {
    _v3.copy(c.fwd).addScaledVector(up, -c.fwd.dot(up));
    if (_v3.lengthSq() < 1e-6) return;
    _v3.normalize();
    c.fwd.copy(_v3);
    const right = _v1.crossVectors(_v3, up).normalize();
    const back = _v2.crossVectors(right, up).normalize();
    _m.makeBasis(right, up, back);
    _q.setFromRotationMatrix(_m);
    c.group.quaternion.slerp(_q, k);
  }

  behave(c, dt, anchor, planet) {
    const smp = planet.sampleAt(c.pos);
    const up = smp.up;
    const dPlayer = c.pos.distanceTo(anchor);
    const tm = c.spec.temperament;

    // temperament reactions override wandering (all friendly — kids' game)
    if (tm === 'shy' && dPlayer < 16) {
      c.state = 'flee'; c.t = 0.6;
      _v3.copy(c.pos).sub(anchor);
      c.fwd.copy(_v3.addScaledVector(up, -_v3.dot(up)).normalize());
    } else if (tm === 'curious' && dPlayer < 28 && dPlayer > 7 && c.state !== 'approach') {
      c.state = 'approach'; c.t = 1.5;
      _v3.copy(anchor).sub(c.pos);
      c.fwd.copy(_v3.addScaledVector(up, -_v3.dot(up)).normalize());
    } else if (tm === 'playful' && dPlayer < 22 && c.state !== 'circle') {
      c.state = 'circle'; c.t = 2;
      _v3.copy(anchor).sub(c.pos).normalize();
      c.fwd.crossVectors(_v3, up).normalize();
    }

    c.t -= dt;
    if (c.t <= 0) {
      if (c.state === 'idle') {
        c.state = 'wander';
        c.t = 2 + Math.random() * 3;
        _v3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        _v3.addScaledVector(up, -_v3.dot(up));
        if (_v3.lengthSq() > 1e-6) c.fwd.copy(_v3.normalize());
      } else {
        c.state = 'idle';
        c.t = 1 + Math.random() * 2.5;
      }
    }

    const moving = c.state !== 'idle';
    const speedK = c.state === 'flee' ? 2.1 : c.state === 'approach' ? 0.5 : 1;
    const spd = c.spec.speed * speedK * Math.sqrt(c.spec.size);
    if (moving) c.pos.addScaledVector(c.fwd, spd * dt);

    // stick to the surface (+ hop / hover offsets)
    c.phase += dt * (moving ? 1.6 + spd * 0.25 : 1);
    let lift = 0;
    const a = c.spec.archetype;
    if (a === 'hopper' && moving) lift = Math.abs(Math.sin(c.phase * 5)) * 0.55 * c.spec.size;
    if (a === 'flyer') lift = (2.4 + Math.sin(c.phase * 1.6) * 0.5) * c.spec.size;
    if (a === 'blob' && moving) lift = Math.abs(Math.sin(c.phase * 4)) * 0.2 * c.spec.size;
    c.pos.copy(planet.center).addScaledVector(up, smp.floorR - 0.05 + lift);
    c.group.position.copy(c.pos);
    this.orient(c, up, moving ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 2));

    // part animation
    const swing = moving ? Math.sin(c.phase * 7) * 0.55 : 0;
    c.parts.legs.forEach((l, i) => { l.rotation.x = swing * (i % 2 ? 1 : -1); });
    c.parts.wings.forEach((w, i) => {
      w.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(c.phase * 10) * 0.55);
    });
    c.parts.ears.forEach((e, i) => {
      e.rotation.z = (i ? -0.3 : 0.3) + Math.sin(c.phase * 2 + i) * 0.12;
    });
    if (c.parts.tail) c.parts.tail.rotation.y = Math.sin(c.phase * 3) * 0.3;
    if (c.parts.head) c.parts.head.rotation.x = Math.sin(c.phase * 1.7) * 0.08;
    if (a === 'blob' && c.parts.body) {
      const s = 1 + Math.sin(c.phase * 4) * 0.1;
      c.parts.body.scale.y = c.bodyScaleY * s;
    }

    // scan flash
    if (c.flash > 0) {
      c.flash -= dt;
      c.group.scale.setScalar(c.spec.size * (1 + Math.max(c.flash, 0) * 0.12 * Math.abs(Math.sin(c.flash * 18))));
    }
  }

  // creatures in range and roughly in front of the camera
  scan(camera, range) {
    _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const hits = [];
    for (const c of this.alive) {
      _v1.copy(c.pos).sub(camera.position);
      const d = _v1.length();
      if (d < range && _v1.divideScalar(d).dot(_fwd) > 0.2) {
        c.flash = 1.4;
        hits.push(c);
      }
    }
    return hits;
  }

  nearestList(anchor, range, k) {
    return this.alive
      .map((c) => ({ c, d: c.pos.distanceTo(anchor) }))
      .filter((e) => e.d < range)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map((e) => e.c);
  }
}
