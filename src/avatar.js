// Chibi explorer avatar, visible in third-person on foot. Outfit pieces
// attach to named anchors (head / face / back). Built feet-at-origin, -Z fwd.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

function mk(parent, geo, mat, sx, sy, sz, x, y, z, name = '') {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.name = name;
  parent.add(m);
  return m;
}

export function buildAvatar(accentHex = '#ff8a4a') {
  const g = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 10, 8);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 7);
  const box = new THREE.BoxGeometry(1, 1, 1);

  const suit = new THREE.MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.6, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.55, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a3138', roughness: 0.7, flatShading: true });
  const visorM = new THREE.MeshStandardMaterial({
    color: '#16222e', roughness: 0.15, metalness: 0.85,
    emissive: '#1c3850', emissiveIntensity: 0.55,
  });

  // legs with hip pivots
  const legs = [];
  for (const sgn of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sgn * 0.15, 0.6, 0);
    mk(hip, cyl, suit, 0.09, 0.55, 0.09, 0, -0.28, 0);
    mk(hip, box, dark, 0.16, 0.1, 0.26, 0, -0.58, -0.04);
    g.add(hip);
    legs.push(hip);
  }
  // body + chest accent
  mk(g, sphere, suit, 0.34, 0.42, 0.27, 0, 0.92, 0, 'body');
  mk(g, sphere, accent, 0.28, 0.26, 0.2, 0, 0.95, -0.14);
  // arms with shoulder pivots
  const arms = [];
  for (const sgn of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(sgn * 0.4, 1.12, 0);
    mk(sh, cyl, suit, 0.07, 0.46, 0.07, 0, -0.24, 0);
    mk(sh, sphere, accent, 0.09, 0.09, 0.09, 0, -0.5, 0);
    g.add(sh);
    arms.push(sh);
  }
  // big helmet + visor + antenna
  mk(g, sphere, suit, 0.33, 0.31, 0.31, 0, 1.42, 0, 'helmet');
  mk(g, sphere, visorM, 0.25, 0.2, 0.16, 0, 1.43, -0.2);
  mk(g, cyl, dark, 0.02, 0.22, 0.02, 0.2, 1.74, 0);
  mk(g, sphere, accent, 0.05, 0.05, 0.05, 0.2, 1.86, 0);
  // backpack + tanks
  mk(g, box, dark, 0.36, 0.42, 0.2, 0, 1.0, 0.3, 'backpack');
  mk(g, cyl, accent, 0.07, 0.32, 0.07, -0.11, 1.05, 0.43);
  mk(g, cyl, accent, 0.07, 0.32, 0.07, 0.11, 1.05, 0.43);

  // jetpack flame
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: '#7fd4ff', transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flame.position.set(0, 0.62, 0.46);
  flame.scale.set(0.7, 1.1, 1);
  g.add(flame);

  // outfit anchors
  const anchors = { head: new THREE.Group(), face: new THREE.Group(), back: new THREE.Group() };
  anchors.head.position.set(0, 1.7, 0);
  anchors.face.position.set(0, 1.43, -0.32);
  anchors.back.position.set(0, 1.18, 0.42);
  Object.values(anchors).forEach((a) => g.add(a));

  return {
    group: g,
    anchors,
    animate(dt, phase, moving, jetting) {
      const s = moving ? Math.sin(phase * 10) * 0.65 : 0;
      legs[0].rotation.x = s;
      legs[1].rotation.x = -s;
      arms[0].rotation.x = -s * 0.75;
      arms[1].rotation.x = s * 0.75;
      flame.material.opacity = jetting ? 0.85 : 0;
      if (jetting) flame.scale.set(0.5 + Math.random() * 0.35, 0.9 + Math.random() * 0.6, 1);
    },
    setOutfit(equipped, buildPiece) {
      for (const slot of Object.keys(anchors)) {
        const a = anchors[slot];
        while (a.children.length) a.remove(a.children[0]);
        if (equipped[slot]) {
          const m = buildPiece(equipped[slot]);
          if (m) a.add(m);
        }
      }
    },
  };
}
