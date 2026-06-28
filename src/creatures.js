// Procedural fauna. Species are generated DETERMINISTICALLY from each
// planet's seed, so every player exploring the same system seed meets the
// same creatures — only the discovery progress (scanned species) is
// per-player. Individuals are transient spawns; the species is the catalog
// unit. Bodies are kid-friendly low-poly: round shapes, bright colors,
// big eyes, never hostile.
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './noise.js';
import { creatureName } from './names.js';
import { merged } from './props.js';

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

// Each species is collapsed to ONE vertex-colored geometry (the same merge pattern
// props use): build the part group once, bake every part's transform + material color
// into the mesh, then merge. All live individuals of a species then draw as a single
// InstancedMesh (one draw call) instead of a ~13-mesh Group each. The trade is per-part
// limb animation for whole-body motion (move / hop / hover / turn / scan-flash) carried
// by the per-instance matrix — the dominant motion at the distances fauna is viewed.
function paintColor(geo, color) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const impostorCache = new Map();
function getImpostor(spec) {
  let imp = impostorCache.get(spec.id);
  if (imp) return imp;
  const g = new THREE.Group();
  const M = {
    body: new THREE.MeshStandardMaterial({ color: spec.body }),
    belly: new THREE.MeshStandardMaterial({ color: spec.belly }),
    accent: new THREE.MeshStandardMaterial({ color: spec.accent }),
  };
  BUILDERS[spec.archetype](g, M, spec.eyeScale);
  g.updateWorldMatrix(true, true);
  const parts = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);   // bake the part's pose (relative to the root)
    paintColor(geo, o.material.color); // bake the part's color as vertex colors
    parts.push(geo);
  });
  const geo = merged(parts);           // one geometry (normalizes indexed/non-indexed mix)
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.84, metalness: 0 });
  M.body.dispose(); M.belly.dispose(); M.accent.dispose();
  imp = { geo, mat };
  impostorCache.set(spec.id, imp);
  return imp;
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
    // tighter despawn radius on the low-pop (mobile/LQ) profile — fewer instances
    // on screen where draw calls hurt most
    this.despawnR = popCap <= 8 ? 220 : 280;
    this.alive = [];
    this.insts = new Map(); // spec.id -> InstancedMesh (one draw call per species)
    this.spawnTimer = 0;
  }

  // lazily create the per-species instanced mesh the first time it's needed
  getInst(spec) {
    let inst = this.insts.get(spec.id);
    if (!inst) {
      const { geo, mat } = getImpostor(spec);
      inst = new THREE.InstancedMesh(geo, mat, this.popCap);
      inst.count = 0;
      inst.frustumCulled = false; // matrices are world-space; per-instance cull is moot
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(inst);
      this.insts.set(spec.id, inst);
    }
    return inst;
  }

  update(dt, anchor, planet, active) {
    // despawn far / inactive — no scene churn, the instance just stops being written
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const c = this.alive[i];
      if (!active || c.planet !== planet || c.pos.distanceTo(anchor) > this.despawnR) {
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
    this.flush();
  }

  // pack live individuals into their species' instance buffer (one draw call each)
  flush() {
    for (const inst of this.insts.values()) inst.__n = 0;
    for (const c of this.alive) {
      const inst = c.inst;
      inst.setMatrixAt(inst.__n++, c.m4);
    }
    for (const inst of this.insts.values()) {
      inst.count = inst.__n;
      inst.instanceMatrix.needsUpdate = true;
    }
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

    const inst = this.getInst(spec);
    const pos = planet.center.clone().addScaledVector(smp.up, smp.floorR - 0.05);
    const c = {
      spec, planet, inst, pos,
      fwd: _v1.clone(),
      quat: new THREE.Quaternion(),
      m4: new THREE.Matrix4(),
      state: 'idle', t: 1 + Math.random() * 2,
      phase: Math.random() * 10, breath: Math.random() * 6, flash: 0,
      groundT: 0, gUp: null, gFloorR: 0, // amortized ground sampling (full path)
    };
    // face a random tangent direction immediately
    this.orient(c, smp.up, 1);
    _v3.setScalar(spec.size);
    c.m4.compose(c.pos, c.quat, _v3);
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
    c.quat.slerp(_q, k);
  }

  behave(c, dt, anchor, planet) {
    // amortize grounding: re-sample the FULL height every ~0.13s (jittered so
    // creatures don't all sample the same frame) instead of every frame. Keeps
    // them on the visible full-res terrain (no low-path float) while cutting the
    // per-creature noise cost ~5x.
    c.groundT -= dt;
    if (c.groundT <= 0 || !c.gUp) {
      c.groundT = 0.12 + Math.random() * 0.05;
      const smp = planet.sampleAt(c.pos);
      if (!c.gUp) c.gUp = smp.up.clone(); else c.gUp.copy(smp.up);
      c.gFloorR = smp.floorR;
    }
    const up = c.gUp;
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
    c.pos.copy(planet.center).addScaledVector(up, c.gFloorR - 0.05 + lift);
    this.orient(c, up, moving ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 2));

    // compose the per-instance matrix: pose + a gentle breathing pulse (keeps idle
    // creatures alive without per-part meshes) + the scan-flash pulse. Blobs squash.
    c.breath += dt * 2.4;
    if (c.flash > 0) c.flash -= dt;
    const flashS = c.flash > 0 ? 1 + c.flash * 0.12 * Math.abs(Math.sin(c.flash * 18)) : 1;
    const base = c.spec.size * flashS;
    if (a === 'blob') {
      const sq = 1 + Math.sin(c.breath) * 0.1;
      _v3.set(base / Math.sqrt(sq), base * sq, base / Math.sqrt(sq));
    } else {
      _v3.setScalar(base * (1 + Math.sin(c.breath) * 0.02));
    }
    c.m4.compose(c.pos, c.quat, _v3);
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

  // top-k creatures within range, nearest first. In-place insertion keeps only
  // ≤k entries (no map/filter/sort over the whole list, no per-creature wrapper
  // objects, no sqrt). Called up to 3×/frame on foot.
  nearestList(anchor, range, k) {
    const out = this._nlOut || (this._nlOut = []);
    const dists = this._nlDist || (this._nlDist = []);
    out.length = 0; dists.length = 0;
    const r2 = range * range;
    for (const c of this.alive) {
      const d2 = c.pos.distanceToSquared(anchor);
      if (d2 >= r2) continue;
      if (out.length >= k && d2 >= dists[out.length - 1]) continue;
      let i = out.length;
      while (i > 0 && dists[i - 1] > d2) i--;
      out.splice(i, 0, c); dists.splice(i, 0, d2);
      if (out.length > k) { out.pop(); dists.pop(); }
    }
    return out;
  }
}
