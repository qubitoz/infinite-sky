// Procedurally assembled starfighters. Nose points -Z. Five variants — the
// starter plus one per climate hazard; setVariant rebuilds the mesh in place
// so external references (group/position/quaternion) stay valid.
// All visual parts live in an `inner` wrapper so cosmetic banking and
// squash-and-stretch never touch the flight orientation.
import * as THREE from 'three';
import { getGlow, disposeTree } from './textures.js';
import { clamp } from './noise.js';

// hull paints unlocked with mined gems (owned forever once bought)
export const PAINTS = [
  { id: 'red', hex: '#e8455a', name: { en: 'RED', es: 'ROJO' }, cost: 4 },
  { id: 'blue', hex: '#3d8fe0', name: { en: 'BLUE', es: 'AZUL' }, cost: 4 },
  { id: 'gold', hex: '#ffd34d', name: { en: 'GOLD', es: 'DORADO' }, cost: 4 },
  { id: 'green', hex: '#42d97a', name: { en: 'GREEN', es: 'VERDE' }, cost: 4 },
];

export const SHIPS = {
  star: { name: { en: 'STARWING', es: 'ALA ESTELAR' }, resist: null, hull: '#cfd6dc', accent: '#e8b23c', glow: '#7fd4ff' },
  frost: { name: { en: 'FROSTWING', es: 'ESCARCHA' }, resist: 'cold', hull: '#eaf4fb', accent: '#7fd4ff', glow: '#bfe6ff' },
  ember: { name: { en: 'EMBERWING', es: 'BRASA' }, resist: 'heat', hull: '#b3402f', accent: '#ffb347', glow: '#ffc890' },
  mist: { name: { en: 'MISTWING', es: 'BRUMA' }, resist: 'acid', hull: '#3f7d44', accent: '#9fe87f', glow: '#caffb0' },
  prism: { name: { en: 'PRISMWING', es: 'PRISMA' }, resist: 'storm', hull: '#7a4f9e', accent: '#e08cff', glow: '#e0b3ff' },
};

// climate ships buyable at the spaceport SHIPYARD kiosk (estelars) — an
// alternative to finding & repairing a wreck
export const SHIP_SHOP = [
  { key: 'frost', price: 120 },
  { key: 'ember', price: 120 },
  { key: 'mist', price: 140 },
  { key: 'prism', price: 160 },
];

function buildInto(group, variantKey, out) {
  disposeTree(group); // free the previous build's geometry/materials before rebuild
  while (group.children.length) group.remove(group.children[0]);
  const v = SHIPS[variantKey] || SHIPS.star;
  const inner = new THREE.Group();
  group.add(inner);
  out.inner = inner;
  out.trailColor.set(v.glow);

  const hull = new THREE.MeshStandardMaterial({
    color: out.paintHex || v.hull, roughness: 0.45, metalness: 0.6, flatShading: true,
  });
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
    inner.add(m);
    return m;
  };

  // tapered hexagonal fuselage + matching nose
  const hullGeo = new THREE.CylinderGeometry(0.85, 0.52, 4.6, 6);
  hullGeo.rotateX(Math.PI / 2); // axis → Z, wide end aft
  hullGeo.scale(1.25, 0.72, 1);
  add(hullGeo, hull, 0, 0, 0.35);
  const nose = new THREE.ConeGeometry(0.52, 2.5, 6);
  nose.rotateX(-Math.PI / 2);
  nose.scale(1.25, 0.72, 1);
  add(nose, hull, 0, 0, -3.2);

  // raked canopy + upper deck + spine stripe
  const can = new THREE.SphereGeometry(0.55, 12, 8);
  can.scale(0.95, 0.55, 2.1);
  add(can, glass, 0, 0.52, -1.35);
  add(new THREE.BoxGeometry(0.85, 0.3, 1.9), hull, 0, 0.48, 1.15);
  add(new THREE.BoxGeometry(0.4, 0.07, 3.2), accent, 0, 0.66, 0.7);

  // side intakes
  for (const sgn of [-1, 1]) {
    const intake = new THREE.CylinderGeometry(0.3, 0.36, 1.5, 6);
    intake.rotateX(Math.PI / 2);
    add(intake, dark, sgn * 0.98, -0.08, -0.45);
    add(new THREE.BoxGeometry(0.1, 0.24, 1.1), accent, sgn * 1.16, -0.08, -0.45);
  }

  // swept wings: main plane + leading-edge accent + tip fin + nav light
  out.navs = [];
  for (const sgn of [-1, 1]) {
    add(new THREE.BoxGeometry(3.4, 0.1, 1.9), hull, sgn * 2.2, -0.12, 1.05, 0, sgn * 0.45, -sgn * 0.12);
    add(new THREE.BoxGeometry(3.0, 0.06, 0.5), accent, sgn * 2.05, -0.06, 0.35, 0, sgn * 0.45, -sgn * 0.12);
    add(new THREE.BoxGeometry(0.1, 0.72, 1.15), accent, sgn * 3.72, 0.14, 1.8, 0, 0, -sgn * 0.12);
    const nav = add(new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshBasicMaterial({ color: sgn < 0 ? '#ff4a4a' : '#4aff7a', toneMapped: false }),
      sgn * 3.74, 0.55, 1.8);
    out.navs.push(nav);
  }

  // swept tail fin
  add(new THREE.BoxGeometry(0.1, 1.25, 1.6), hull, 0, 0.95, 2.15, 0.32, 0, 0);
  add(new THREE.BoxGeometry(0.12, 0.28, 0.7), accent, 0, 1.52, 2.45, 0.32, 0, 0);

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

  // engines: nacelle + accent ring + bright nozzle disc + glow sprite
  out.nozzles.length = 0;
  out.glows.length = 0;
  out.gear.length = 0;
  for (const sgn of [-1, 1]) {
    const eng = new THREE.CylinderGeometry(0.42, 0.52, 1.8, 8);
    eng.rotateX(Math.PI / 2);
    add(eng, dark, sgn * 1.12, -0.05, 2.45);
    add(new THREE.TorusGeometry(0.46, 0.06, 6, 12), accent, sgn * 1.12, -0.05, 3.3);
    add(new THREE.CircleGeometry(0.34, 12),
      new THREE.MeshBasicMaterial({ color: v.glow, toneMapped: false }), sgn * 1.12, -0.05, 3.34);
    out.nozzles.push(new THREE.Vector3(sgn * 1.12, -0.05, 3.45));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlow(), color: v.glow, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.position.set(sgn * 1.12, -0.05, 3.45);
    sp.scale.set(1.4, 1.4, 1);
    inner.add(sp);
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
    inner: null,
    variantKey: initialVariant,
    nozzles: [],
    glows: [],
    gear: [],
    navs: [],
    gearVisible: false,
    trailColor: new THREE.Color('#7fd4ff'),
    paintHex: null,
    _phase: 0,
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
    // cosmetic per-frame motion: banking into turns, squash & stretch with
    // acceleration, blinking nav lights — none of it touches flight physics
    tick(dt, bank = 0, stretch = 0) {
      this._phase += dt;
      if (this.inner) {
        this.inner.rotation.z = bank;
        const s = clamp(stretch, -0.12, 0.18);
        this.inner.scale.set(1 - s * 0.35, 1 - s * 0.35, 1 + s);
      }
      const on = Math.sin(this._phase * 5) > -0.35;
      for (const n of this.navs) n.visible = on;
    },
    setVariant(key) {
      if (!SHIPS[key]) return;
      this.variantKey = key;
      buildInto(group, key, this);
    },
    setPaint(hex) {
      this.paintHex = hex || null;
      buildInto(group, this.variantKey, this);
    },
  };
  buildInto(group, initialVariant, ship);
  return ship;
}
