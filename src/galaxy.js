// Multi-system universe: a galaxy seed deterministically spawns N star
// systems with positions (abstract light-year units for the deep radar).
// System 0's seed IS the galaxy seed, so legacy ?seed= saves stay valid.
import { mulberry32 } from './noise.js';
import { systemHeader } from './universe.js';

export function systemSeedFor(galaxySeed, idx) {
  if (idx === 0) return galaxySeed >>> 0 || 1;
  return ((galaxySeed ^ Math.imul(idx + 1, 0x9e3779b9)) >>> 0) || 1;
}

export function makeGalaxy(galaxySeed, count = 14) {
  const rand = mulberry32((galaxySeed ^ 0x6a1a17) >>> 0);
  const systems = [];
  for (let i = 0; i < count; i++) {
    const seed = systemSeedFor(galaxySeed, i);
    const { star, name } = systemHeader(seed);
    const ang = rand() * Math.PI * 2;
    const r = i === 0 ? 0 : 14 + rand() * 150;
    systems.push({
      idx: i, seed, name, star,
      x: Math.cos(ang) * r,
      y: (rand() - 0.5) * 24,
      z: Math.sin(ang) * r,
    });
  }
  return systems;
}

export function galaxyDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
