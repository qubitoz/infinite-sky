// Procedurally assembled starfighters. Nose points -Z. Five variants — the
// starter plus one per climate hazard; setVariant rebuilds the mesh in place
// so external references (group/position/quaternion) stay valid.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';
import { clamp } from './noise.js';

export const SHIPS = {
  star: { name: { en: 'STARWING', es: 'ALA ESTELAR' }, resist: null, hull: '#cfd6dc', accent: '#e8b23c', glow: '#7fd4ff' },
  frost: { name: { en: 'FROSTWING', es: 'ESCARCHA' }, resist: 'cold', hull: '#eaf4fb', accent: '#7fd4ff', glow: '#bfe6ff' },
  ember: { name: { en: 'EMBERWING', es: 'BRASA' }, resist: 'heat', hull: '#b3402f', accent: '#ffb347', glow: '#ffc890' },
  mist: { name: { en: 'MISTWING', es: 'BRUMA' }, resist: 'acid', hull: '#3f7d44', accent: '#9fe87f', glow: '#caffb0' },
  prism: { name: { en: 'PRISMWING', es: 'PRISMA' }, resist: 'storm', hull: '#7a4f9e', accent: '#e08cff', glow: '#e0b3ff' },
};

function buildInto(group, variantKey, out) {
  while (group.children.length) group.remove(group.children[0]);
  const v = SHIPS[variantKey] || SHIPS.star;

  const hull = new THREE.MeshStandardMaterial({ color: v.hull, roughness: 0.45, metalness: 0.6, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: v.accent, roughness: 0.4, metalness: 0.55, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#23282e', roughness: 0.6, metalness: 0.7, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({
    color: '#0a1218', roughness: 0.12, metalness: 0.9,
    emissive: '#22384e', emissiveIntensity: 0.35,
  });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    group.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(1.5, 0.9, 4.6), hull, 0, 0, 0.4);
  const nose = new THREE.ConeGeometry(0.8, 2.8, 4);
  nose.rotateX(-Math.PI / 2);
  nose.rotateZ(Math.PI / 4);
  nose.scale(1.15, 0.6, 1);
  add(nose, hull, 0, -0.05, -3.2);
  const can = new THREE.SphereGeometry(0.62, 12, 8);
  can.scale(1, 0.72, 1.7);
  add(can, glass, 0, 0.58, -1.1);
  add(new THREE.BoxGeometry(0.5, 0.06, 3.6), accent, 0, 0.49, 0.5);

  for (const sgn of [-1, 1]) {
    add(new THREE.BoxGeometry(3.6, 0.12, 1.6), hull, sgn * 2.3, -0.1, 0.9, 0, sgn * 0.32, -sgn * 0.16);
    add(new THREE.BoxGeometry(0.12, 0.78, 1.2), accent, sgn * 3.9, 0.1, 1.45, 0, 0, -sgn * 0.1);
    add(new THREE.BoxGeometry(1.2, 0.1, 0.7), accent, sgn * 1.4, -0.02, 0.6, 0, sgn * 0.32, -sgn * 0.16);
  }
  add(new THREE.BoxGeometry(0.12, 1.15, 1.5), hull, 0, 0.95, 2.0, 0.25, 0, 0);

  // variant signature pieces
  if (variantKey === 'frost') {
    const plow = new THREE.ConeGeometry(1.1, 1.4, 4);
    plow.rotateX(Math.PI / 2);
    plow.scale(1.3, 0.5, 1);
    add(plow, accent, 0, -0.35, -4.0);
  } else if (variantKey === 'ember') {
    for (const sgn of [-1, 1]) add(new THREE.BoxGeometry(0.1, 1.0, 2.2), accent, sgn * 0.8, 0.6, 1.2, 0.3, 0, sgn * 0.3);
  } else if (variantKey === 'mist') {
    const bub = new THREE.SphereGeometry(1.05, 10, 8);
    add(bub, new THREE.MeshStandardMaterial({
      color: '#9fe87f', roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.22,
    }), 0, 0.5, -1.1);
  } else if (variantKey === 'prism') {
    const cr = new THREE.OctahedronGeometry(0.5, 0);
    cr.scale(1, 2.0, 1);
    add(cr, new THREE.MeshStandardMaterial({
      color: '#e08cff', emissive: '#b44eff', emissiveIntensity: 0.6, roughness: 0.2,
    }), 0, 1.2, 1.6);
  }

  out.nozzles.length = 0;
  out.glows.length = 0;
  out.gear.length = 0;
  for (const sgn of [-1, 1]) {
    const eng = new THREE.CylinderGeometry(0.42, 0.52, 1.7, 8);
    eng.rotateX(Math.PI / 2);
    add(eng, dark, sgn * 1.08, -0.05, 2.45);
    add(new THREE.CircleGeometry(0.34, 12),
      new THREE.MeshBasicMaterial({ color: v.glow, toneMapped: false }), sgn * 1.08, -0.05, 3.32);
    out.nozzles.push(new THREE.Vector3(sgn * 1.08, -0.05, 3.45));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: v.glow, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.position.set(sgn * 1.08, -0.05, 3.45);
    sp.scale.set(1.4, 1.4, 1);
    group.add(sp);
    out.glows.push(sp);
  }
  for (const [x, z] of [[-0.95, 1.0], [0.95, 1.0], [0, -1.9]]) {
    const g = add(new THREE.BoxGeometry(0.16, 0.78, 0.16), dark, x, -0.78, z);
    g.visible = out.gearVisible;
    out.gear.push(g);
  }
}

export function makeShip(initialVariant = 'star') {
  const group = new THREE.Group();
  const ship = {
    group,
    variantKey: initialVariant,
    nozzles: [],
    glows: [],
    gear: [],
    gearVisible: false,
    get resist() { return (SHIPS[this.variantKey] || SHIPS.star).resist; },
    setThrust(f) {
      const s = 0.5 + clamp(f, 0, 1.6) * 2.2;
      for (const sp of this.glows) {
        const j = 0.88 + Math.random() * 0.24;
        sp.scale.set(s * j, s * j, 1);
        sp.material.opacity = clamp(0.25 + f * 0.8, 0, 1);
      }
    },
    setGear(v) {
      this.gearVisible = v;
      this.gear.forEach((g) => { g.visible = v; });
    },
    setVariant(key) {
      if (!SHIPS[key]) return;
      this.variantKey = key;
      buildInto(group, key, this);
    },
  };
  buildInto(group, initialVariant, ship);
  return ship;
}
