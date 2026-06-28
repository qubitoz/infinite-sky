// Per-biome surface prop templates (trees, rocks, crystals, grass...).
// Multi-part props are merged into one vertex-colored geometry so each
// template renders as a single InstancedMesh per terrain tile.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeGrassTexture } from './textures.js';

function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function merged(parts) {
  // indexed (Cylinder/Sphere…) and non-indexed (Icosahedron/Octahedron…)
  // geometries can't merge together — normalize to non-indexed when mixed
  const mixed = parts.some((p) => !p.index);
  const norm = mixed ? parts.map((p) => (p.index ? p.toNonIndexed() : p)) : parts;
  const geo = mergeGeometries(norm, false);
  parts.forEach((p) => p.dispose());
  return geo;
}

const stdMat = (opts = {}) => new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.0, ...opts,
});

let grassTex = null;

function tree(trunkH, trunkC, canopyC, layers = 3) {
  const parts = [paint(new THREE.CylinderGeometry(0.14, 0.24, trunkH, 5).translate(0, trunkH / 2, 0), trunkC)];
  let y = trunkH * 0.8, r = 1.7, h = 2.6;
  for (let i = 0; i < layers; i++) {
    parts.push(paint(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0), canopyC));
    y += h * 0.55; r *= 0.72; h *= 0.82;
  }
  return merged(parts);
}

function bulbTree(trunkC, canopyC) {
  return merged([
    paint(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 5).translate(0, 1.3, 0), trunkC),
    paint(new THREE.IcosahedronGeometry(1.5, 1).scale(1, 0.8, 1).translate(0, 3.3, 0), canopyC),
    paint(new THREE.IcosahedronGeometry(0.9, 1).translate(0.9, 2.7, 0.4), canopyC),
  ]);
}

function rock() {
  const g = new THREE.DodecahedronGeometry(0.9, 0);
  g.scale(1 + Math.random() * 0.6, 0.7 + Math.random() * 0.5, 1);
  return paint(g, '#ffffff');
}

function crystalGeo(h) {
  return merged([
    paint(new THREE.OctahedronGeometry(0.6, 0).scale(1, h, 1).translate(0, h * 0.5, 0).rotateZ(0.12), '#ffffff'),
    paint(new THREE.OctahedronGeometry(0.34, 0).scale(1, h * 0.7, 1).translate(0.5, h * 0.3, 0.2).rotateZ(-0.3), '#ffffff'),
  ]);
}

function cactus() {
  return merged([
    paint(new THREE.CylinderGeometry(0.32, 0.4, 3.0, 6).translate(0, 1.5, 0), '#ffffff'),
    paint(new THREE.SphereGeometry(0.32, 6, 5).translate(0, 3.0, 0), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.18, 0.2, 1.1, 5).rotateZ(Math.PI / 2.4).translate(0.7, 1.8, 0), '#ffffff'),
  ]);
}

function mushroom(stemC, capC) {
  return merged([
    paint(new THREE.CylinderGeometry(0.22, 0.34, 1.8, 6).translate(0, 0.9, 0), stemC),
    paint(new THREE.SphereGeometry(1.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.65, 1).translate(0, 1.7, 0), capC),
  ]);
}

function lollipop(stemC, ballC) {
  return merged([
    paint(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 5).translate(0, 1.1, 0), stemC),
    paint(new THREE.SphereGeometry(0.85, 8, 6).translate(0, 2.5, 0), ballC),
  ]);
}

function grassTemplate(hex, density) {
  if (!grassTex) grassTex = makeGrassTexture();
  const g = merged([
    new THREE.PlaneGeometry(1.3, 1.0).translate(0, 0.5, 0),
    new THREE.PlaneGeometry(1.3, 1.0).rotateY(Math.PI / 2).translate(0, 0.5, 0),
  ]);
  // vertical billboards catch little direct light on a sphere — self-illuminate a bit
  const mat = new THREE.MeshStandardMaterial({
    map: grassTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: hex,
    emissive: hex, emissiveIntensity: 0.38, emissiveMap: grassTex,
  });
  return { name: 'grass', geo: g, mat, density, sMin: 0.7, sMax: 1.6, yOff: -0.05, maxSlope: 0.75, colorA: '#ffffff', colorB: '#c8d8b0' };
}

// Returns template list for a biome from its prop kit + 3 kit colors
// (a = primary/canopy, b = secondary/trunk, c = accent/sparkle).
// Density = instances per ~2400 u² tile / 24.
export function makePropTemplates(biome) {
  const { a, b, c } = biome.kitColors || { a: '#5fae4a', b: '#8a6a42', c: '#ffd97a' };
  switch (biome.kit) {
    case 'forest': return [
      { name: 'tree', geo: tree(2.4, b, a), mat: stdMat(), density: 1.0, sMin: 1.1, sMax: 2.4, yOff: -0.3, maxSlope: 0.55, colorA: '#ffffff', colorB: '#d9e0c8' },
      { name: 'tree2', geo: tree(4.2, b, a, 2), mat: stdMat(), density: 0.45, sMin: 1.2, sMax: 2.1, yOff: -0.3, maxSlope: 0.5, colorA: '#ffffff', colorB: '#e8e0d0' },
      { name: 'rock', geo: rock(), mat: stdMat({ color: '#8e8a7d' }), density: 0.3, sMin: 0.7, sMax: 2.6, yOff: -0.35, maxSlope: 1.4, colorA: '#ffffff', colorB: '#9aa08c' },
      grassTemplate(a, 3.0),
    ];
    case 'cacti': return [
      { name: 'cactus', geo: cactus(), mat: stdMat({ color: a }), density: 0.45, sMin: 0.8, sMax: 1.8, yOff: -0.2, maxSlope: 0.5, colorA: '#ffffff', colorB: '#e0e8d0' },
      { name: 'rock', geo: rock(), mat: stdMat({ color: b }), density: 0.7, sMin: 0.8, sMax: 3.4, yOff: -0.4, maxSlope: 1.4, colorA: '#ffffff', colorB: '#e8d8c8' },
      grassTemplate(c, 0.9),
    ];
    case 'shroom': return [
      { name: 'shroom', geo: mushroom(b, a), mat: stdMat(), density: 0.8, sMin: 0.8, sMax: 2.8, yOff: -0.2, maxSlope: 0.6, colorA: '#ffffff', colorB: '#e0d0e8' },
      { name: 'spore', geo: paint(new THREE.IcosahedronGeometry(0.8, 1).translate(0, 0.7, 0), '#ffffff'), mat: stdMat({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.5 }), density: 0.4, sMin: 0.5, sMax: 1.4, yOff: -0.15, maxSlope: 0.8, colorA: '#ffffff', colorB: '#e8ffe0' },
      grassTemplate(a, 2.0),
    ];
    case 'crystal': return [
      { name: 'crystal', geo: crystalGeo(3.2), mat: stdMat({ color: a, emissive: c, emissiveIntensity: 0.45, roughness: 0.2 }), density: 0.55, sMin: 0.9, sMax: 3.0, yOff: -0.3, maxSlope: 1.0, colorA: '#ffffff', colorB: '#e0f0ff' },
      { name: 'monolith', geo: paint(new THREE.BoxGeometry(0.9, 4.5, 0.9).translate(0, 2.1, 0).rotateY(0.4), '#ffffff'), mat: stdMat({ color: b, roughness: 0.3, metalness: 0.6 }), density: 0.12, sMin: 0.9, sMax: 2.2, yOff: -0.25, maxSlope: 0.5, colorA: '#ffffff', colorB: '#d0c8e0' },
      { name: 'bubble', geo: paint(new THREE.IcosahedronGeometry(1.0, 2).translate(0, 0.8, 0), '#ffffff'), mat: stdMat({ color: c, roughness: 0.15, flatShading: false }), density: 0.5, sMin: 0.6, sMax: 2.2, yOff: -0.3, maxSlope: 0.9, colorA: '#ffffff', colorB: '#e8d8f0' },
    ];
    case 'spikes': return [
      { name: 'spike', geo: paint(new THREE.ConeGeometry(0.6, 4.2, 5).translate(0, 2.1, 0), '#ffffff'), mat: stdMat({ color: b }), density: 0.8, sMin: 0.7, sMax: 2.6, yOff: -0.3, maxSlope: 1.0, colorA: '#ffffff', colorB: '#d8c8c0' },
      { name: 'ember', geo: crystalGeo(1.8), mat: stdMat({ color: c, emissive: c, emissiveIntensity: 0.85, roughness: 0.4 }), density: 0.3, sMin: 0.6, sMax: 1.6, yOff: -0.25, maxSlope: 0.9, colorA: '#ffffff', colorB: '#ffe0c8' },
      { name: 'rock', geo: rock(), mat: stdMat({ color: a }), density: 0.6, sMin: 0.8, sMax: 3.0, yOff: -0.4, maxSlope: 1.4, colorA: '#ffffff', colorB: '#c8b8b0' },
    ];
    case 'frost': return [
      { name: 'shard', geo: crystalGeo(2.6), mat: stdMat({ color: a, roughness: 0.25, emissive: c, emissiveIntensity: 0.12 }), density: 0.6, sMin: 0.8, sMax: 2.4, yOff: -0.3, maxSlope: 0.9, colorA: '#ffffff', colorB: '#e0f0ff' },
      { name: 'pine', geo: tree(2.0, b, a), mat: stdMat(), density: 0.45, sMin: 1.0, sMax: 2.0, yOff: -0.3, maxSlope: 0.5, colorA: '#ffffff', colorB: '#e0e8f0' },
      { name: 'rock', geo: rock(), mat: stdMat({ color: b }), density: 0.4, sMin: 0.7, sMax: 2.4, yOff: -0.35, maxSlope: 1.4, colorA: '#ffffff', colorB: '#d0d8e0' },
    ];
    case 'candy': return [
      { name: 'gumdrop', geo: bulbTree(b, a), mat: stdMat({ roughness: 0.4 }), density: 0.8, sMin: 1.0, sMax: 2.2, yOff: -0.3, maxSlope: 0.55, colorA: '#ffffff', colorB: '#ffe0f0' },
      { name: 'lollipop', geo: lollipop(b, c), mat: stdMat({ roughness: 0.3 }), density: 0.5, sMin: 0.9, sMax: 2.0, yOff: -0.2, maxSlope: 0.5, colorA: '#ffffff', colorB: '#fff0d8' },
      grassTemplate(a, 1.6),
    ];
    case 'swamp': return [
      { name: 'shroom', geo: mushroom(b, a), mat: stdMat(), density: 0.6, sMin: 0.7, sMax: 2.2, yOff: -0.2, maxSlope: 0.6, colorA: '#ffffff', colorB: '#d8e8d0' },
      grassTemplate(a, 2.8),
      { name: 'rock', geo: rock(), mat: stdMat({ color: b }), density: 0.3, sMin: 0.7, sMax: 2.0, yOff: -0.35, maxSlope: 1.4, colorA: '#ffffff', colorB: '#c8d0c0' },
    ];
    case 'rocks': return [
      { name: 'rock', geo: rock(), mat: stdMat({ color: a }), density: 0.9, sMin: 0.8, sMax: 3.2, yOff: -0.4, maxSlope: 1.4, colorA: '#ffffff', colorB: '#d8d8d0' },
      { name: 'monolith', geo: paint(new THREE.BoxGeometry(0.9, 4.5, 0.9).translate(0, 2.1, 0).rotateY(0.4), '#ffffff'), mat: stdMat({ color: b, roughness: 0.4, metalness: 0.4 }), density: 0.15, sMin: 0.9, sMax: 2.2, yOff: -0.25, maxSlope: 0.5, colorA: '#ffffff', colorB: '#d0d0d8' },
      grassTemplate(c, 0.8),
    ];
    default: return [];
  }
}
