// Soft mining: glowing gem veins spawn near the player on foot. Aim at one
// (within range, roughly ahead) and hold the laser (E / mouse / MINAR button)
// to extract units one by one. A beam + sparks sell the effect; everything is
// kid-gentle — veins never fight back, they just sparkle and shrink.
import * as THREE from 'three';
import { getGlow, disposeTree } from './textures.js';
import { clamp } from './noise.js';

const _u = new THREE.Vector3();
const _t = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _probe = new THREE.Vector3();

export class MiningManager {
  constructor(scene) {
    this.scene = scene;
    this.nodes = [];
    this.timer = 0;
    this.glowTex = getGlow();
    this.progress = 0;
    this.target = null;

    // laser beam
    this.beamGeo = new THREE.BufferGeometry();
    this.beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.beam = new THREE.Line(this.beamGeo, new THREE.LineBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    scene.add(this.beam);
  }

  update(dt, anchor, planet, active) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (!active || n.planet !== planet || n.pos.distanceTo(anchor) > 200) {
        disposeTree(n.group);
        this.scene.remove(n.group);
        this.nodes.splice(i, 1);
      }
    }
    if (active) {
      this.timer -= dt;
      if (this.nodes.length < 3 && this.timer <= 0) {
        this.timer = 1.2;
        this.spawnOne(planet, anchor);
      }
    }
    const t = performance.now() * 0.003;
    for (const n of this.nodes) {
      n.halo.material.opacity = 0.35 + 0.2 * Math.sin(t + n.phase);
    }
  }

  spawnOne(planet, anchor) {
    _u.copy(anchor).sub(planet.center).normalize();
    let smp = null;
    for (let tries = 0; tries < 5 && !smp; tries++) {
      _t.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      _t.addScaledVector(_u, -_t.dot(_u));
      if (_t.lengthSq() < 1e-6) continue;
      _t.normalize();
      const d = 25 + Math.random() * 90;
      const probe = _probe.copy(anchor).addScaledVector(_t, d);
      const s = planet.sampleAt(probe);
      if (s.terrR >= s.floorR - 0.01) smp = s; // land only
    }
    if (!smp) return;

    const gemC = new THREE.Color((planet.def.biome.kitColors && planet.def.biome.kitColors.c) || '#d98aff');
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: gemC, emissive: gemC, emissiveIntensity: 0.55, roughness: 0.2, flatShading: true,
    });
    const crystals = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat);
      m.scale.set(0.8, 1.6 + i * 0.5, 0.8);
      m.position.set((i - 1) * 0.7, 0.7 + i * 0.2, (i % 2) * 0.5 - 0.25);
      m.rotation.z = (i - 1) * 0.25;
      group.add(m);
      crystals.push(m);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: gemC, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(5, 5, 1);
    halo.position.y = 1;
    group.add(halo);

    const pos = planet.center.clone().addScaledVector(smp.up, smp.floorR);
    group.position.copy(pos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), smp.up);
    this.scene.add(group);
    this.nodes.push({
      planet, group, halo, crystals, pos, units: 3,
      color: gemC, phase: Math.random() * 6,
    });
  }

  // best vein: within range and roughly where the player looks
  pickTarget(anchor, fwd, range = 15) {
    let best = null, bd = range;
    for (const n of this.nodes) {
      _rel.copy(n.pos).sub(anchor);
      const d = _rel.length();
      if (d < bd && _rel.divideScalar(d || 1).dot(fwd) > 0.35) { bd = d; best = n; }
    }
    return best;
  }

  // returns 'gem' each time a unit pops; 'done' handled internally
  mine(dt, node, fromPos, trail, speed = 1) {
    this.target = node;
    this.beam.visible = true;
    const arr = this.beamGeo.attributes.position.array;
    arr[0] = fromPos.x; arr[1] = fromPos.y; arr[2] = fromPos.z;
    const jx = (Math.random() - 0.5) * 0.3;
    arr[3] = node.pos.x + jx; arr[4] = node.pos.y + 1 + jx; arr[5] = node.pos.z;
    this.beamGeo.attributes.position.needsUpdate = true;
    // sparks at the vein
    _t.set(Math.random() - 0.5, Math.random() + 0.4, Math.random() - 0.5).multiplyScalar(6);
    _u.copy(node.pos);
    _u.y += 1;
    trail.spawn(_u, _t, node.color.r, node.color.g, node.color.b, 0.25 + Math.random() * 0.15);

    this.progress += dt * speed;
    if (this.progress >= 1.0) {
      this.progress = 0;
      node.units--;
      const c = node.crystals[node.units];
      if (c) c.visible = false;
      if (node.units <= 0) {
        for (let i = 0; i < 12; i++) {
          _t.set(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).multiplyScalar(10);
          trail.spawn(node.pos, _t, node.color.r, node.color.g, node.color.b, 0.4 + Math.random() * 0.3);
        }
        disposeTree(node.group);
        this.scene.remove(node.group);
        this.nodes.splice(this.nodes.indexOf(node), 1);
      }
      return 'gem';
    }
    return null;
  }

  stopBeam() {
    this.beam.visible = false;
    this.progress = Math.max(0, this.progress - 0.1);
    this.target = null;
  }

  blips() {
    return this.nodes.map((n) => ({ pos: n.pos, kind: 'ore' }));
  }
}
