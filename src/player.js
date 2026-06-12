// Input handling and the player controller: ship flight (throttle/boost/pulse),
// landing sequence, and first-person on-foot mode with sphere-aligned gravity.
import * as THREE from 'three';
import { clamp, lerp } from './noise.js';
import { t, pick } from './i18n.js';
import { SHIPS } from './ship.js';

const HAZARD_SHIP = { cold: 'frost', heat: 'ember', acid: 'mist', storm: 'prism' };

export class Input {
  constructor() {
    this.keys = Object.create(null);
    this.just = new Set();
    this.mdx = 0; this.mdy = 0;
    this.locked = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.just.add(e.code);
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; }
    });
    window.addEventListener('blur', () => { this.keys = Object.create(null); });
  }
  key(c) { return !!this.keys[c]; }
  pressed(c) { if (this.just.has(c)) { this.just.delete(c); return true; } return false; }
  consumeMouse() { const r = { dx: this.mdx, dy: this.mdy }; this.mdx = 0; this.mdy = 0; return r; }
  endFrame() { this.just.clear(); }
}

const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
const _f = new THREE.Vector3();
const _up = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class Player {
  constructor({ camera, ship, trail, hud, audio }) {
    this.camera = camera;
    this.ship = ship;
    this.trail = trail;
    this.hud = hud;
    this.audio = audio;
    this.input = new Input();

    this.mode = 'fly';
    this.pos = ship.group.position;
    this.quat = ship.group.quaternion;
    this.vel = new THREE.Vector3();
    this.throttle = 0;
    this.boostAmt = 1;
    this.boosting = false;
    this.pulse = { spool: 0, active: false, factor: 0 };
    this.walk = {
      pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0),
      pitch: 0, vRad: 0, fuel: 1, grounded: false, phase: 0,
    };
    this.avatar = null; // set by main after construction
    this.landAnim = null;
    this.hazardT = 0;
    this.camPos = new THREE.Vector3();
    this.camInit = false;
    this.shake = 0;
    this.orbitAng = 0;
    this.speed = 0;
    this.alt = 0;
  }

  spawn(pos, lookAt) {
    this.pos.copy(pos);
    _m.lookAt(pos, lookAt, _Y);
    this.quat.setFromRotationMatrix(_m);
    this.camInit = false;
  }

  // world position of the player body (ship or walker)
  bodyPos() { return this.mode === 'walk' ? this.walk.pos : this.pos; }

  state() {
    return {
      mode: this.mode, speed: this.speed, alt: this.alt,
      throttle: this.throttle, boostAmt: this.boostAmt,
      pulseF: Math.max(this.pulse.factor, this.pulse.spool * 0.8),
      boosting: this.boosting, fuel: this.walk.fuel,
    };
  }

  update(dt, nearest, planets) {
    if (this.avatar) this.avatar.group.visible = this.mode === 'walk';
    if (this.mode === 'fly') this.updateFly(dt, nearest, planets);
    else if (this.mode === 'landing') this.updateLanding(dt, nearest);
    else if (this.mode === 'landed') this.updateLanded(dt, nearest);
    else if (this.mode === 'walk') this.updateWalk(dt, nearest);
  }

  // ------------------------------------------------------------------ flight
  updateFly(dt, nearest, planets) {
    const inp = this.input;
    if (inp.key('KeyW')) this.throttle = clamp(this.throttle + dt * 0.55, 0, 1);
    if (inp.key('KeyS')) this.throttle = clamp(this.throttle - dt * 0.85, 0, 1);

    const wantBoost = (inp.key('ShiftLeft') || inp.key('ShiftRight')) && this.throttle > 0.05;
    this.boosting = wantBoost && this.boostAmt > 0.03 && !this.pulse.active;
    this.boostAmt = clamp(this.boostAmt + (this.boosting ? -dt / 3.5 : dt / 5), 0, 1);

    const smp = nearest.sampleAt(this.pos);
    const atmoF = clamp(1 - (smp.len - nearest.R) / nearest.atmoH, 0, 1);

    // climate hazard: without the matching shield the upper atmosphere acts
    // as a bouncy, impassable floor (kid-friendly — no damage, just a "nope")
    this.hazardT -= dt;
    const hazard = nearest.def.biome.hazard;
    if (hazard && this.ship.resist !== hazard) {
      const floorR = nearest.R + nearest.atmoH * 0.75;
      if (smp.len < floorR) {
        this.pos.copy(nearest.center).addScaledVector(smp.up, floorR);
        const rad = this.vel.dot(smp.up);
        if (rad < 0) this.vel.addScaledVector(smp.up, -rad * 1.5);
        this.shake = Math.max(this.shake, 0.35);
        if (this.hazardT <= 0) {
          this.hazardT = 4;
          this.hud.toast(t('toast.hazard'),
            `${t('toast.needShip')} ${pick(SHIPS[HAZARD_SHIP[hazard]].name)}`);
          this.audio.thud();
        }
      }
    }

    // pulse drive
    const wantPulse = inp.key('KeyJ') || inp.key('Tab');
    if (wantPulse && atmoF < 0.12) {
      this.pulse.spool = Math.min(this.pulse.spool + dt, 1);
      if (this.pulse.spool > 0.85 && !this.pulse.active) {
        this.pulse.active = true;
        this.audio.pulseUp();
        this.hud.toast(t('toast.pulseOn'));
      }
    } else {
      if (wantPulse && atmoF >= 0.12 && this.pulse.spool === 0 && inp.pressed('KeyJ')) {
        this.hud.toast(t('toast.pulseBlocked'), t('toast.leaveAtmo'));
      }
      this.pulse.spool = Math.max(this.pulse.spool - dt * 2, 0);
      if (this.pulse.active && !wantPulse) { this.pulse.active = false; this.audio.pulseDown(); }
    }
    if (this.pulse.active) {
      for (const p of planets) {
        _v2.copy(p.center).sub(this.pos);
        // only drop out of pulse when closing in on a world, not when leaving one
        if (_v2.length() - p.R < p.R * 1.15 && this.vel.dot(_v2) > 0) {
          this.pulse.active = false;
          this.vel.clampLength(0, 280);
          this.throttle = Math.min(this.throttle, 0.4);
          this.hud.toast(t('toast.pulseOff'), `${p.def.name} ${t('toast.ahead')}`);
          this.audio.pulseDown();
          break;
        }
      }
    }
    this.pulse.factor = lerp(this.pulse.factor, this.pulse.active ? 1 : 0, 1 - Math.exp(-dt * 1.8));

    // steering
    const m = inp.consumeMouse();
    const agility = 1 / (1 + this.pulse.factor * 4);
    _q1.setFromAxisAngle(_Y, clamp(-m.dx * 0.0021, -0.09, 0.09) * agility);
    this.quat.multiply(_q1);
    _q1.setFromAxisAngle(_X, clamp(-m.dy * 0.0021, -0.09, 0.09) * agility);
    this.quat.multiply(_q1);
    const roll = ((inp.key('KeyA') ? 1 : 0) - (inp.key('KeyD') ? 1 : 0)) * 1.9 * dt;
    _q1.setFromAxisAngle(_Z, roll * agility);
    this.quat.multiply(_q1).normalize();

    // inside an atmosphere the ship auto-levels its roll toward the local
    // horizon whenever A/D are released
    if (atmoF > 0.2 && this.pulse.factor < 0.1 && !inp.key('KeyA') && !inp.key('KeyD')) {
      _up.set(0, 1, 0).applyQuaternion(this.quat);
      _v1.set(1, 0, 0).applyQuaternion(this.quat);
      const rollErr = Math.atan2(_v1.dot(smp.up), _up.dot(smp.up));
      if (Math.abs(rollErr) > 0.003) {
        _q1.setFromAxisAngle(_Z, -rollErr * Math.min(dt * 2.2, 0.25) * atmoF);
        this.quat.multiply(_q1).normalize();
      }
    }

    // velocity
    _f.set(0, 0, -1).applyQuaternion(this.quat);
    let target = this.throttle * 230 * (this.boosting ? 2.9 : 1);
    target = lerp(target, 24000, this.pulse.factor);
    _v1.copy(_f).multiplyScalar(target);
    if (inp.key('Space')) _v1.addScaledVector(_up.set(0, 1, 0).applyQuaternion(this.quat), 45);
    this.vel.lerp(_v1, 1 - Math.exp(-dt * 2.6));
    this.pos.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();

    // terrain collision
    const smp2 = nearest.sampleAt(this.pos);
    this.alt = smp2.alt;
    const minAlt = 7;
    if (smp2.len < smp2.floorR + minAlt) {
      this.pos.copy(nearest.center).addScaledVector(smp2.up, smp2.floorR + minAlt);
      const rad = this.vel.dot(smp2.up);
      if (rad < 0) {
        this.vel.addScaledVector(smp2.up, -rad * 1.02);
        if (rad < -55) { this.audio.thud(); this.shake = 0.9; }
      }
    }

    // landing
    if (inp.pressed('KeyL')) {
      if (this.alt < 60 && this.speed < 90) {
        if (smp2.terrR < smp2.floorR - 0.01) {
          this.hud.toast(t('toast.noground'), t('toast.liquid'));
        } else {
          _v2.copy(nearest.center).addScaledVector(smp2.up, smp2.floorR + 1.55);
          _f.set(0, 0, -1).applyQuaternion(this.quat);
          _f.addScaledVector(smp2.up, -_f.dot(smp2.up));
          if (_f.lengthSq() < 1e-4) _f.set(0, 1, 0).addScaledVector(smp2.up, -smp2.up.y);
          _f.normalize();
          _v3.copy(_f).negate(); // +Z basis
          _v4.crossVectors(smp2.up, _v3);
          _m.makeBasis(_v4, smp2.up, _v3);
          this.landAnim = {
            t: 0, from: this.pos.clone(), to: _v2.clone(),
            q0: this.quat.clone(), q1: new THREE.Quaternion().setFromRotationMatrix(_m),
          };
          this.mode = 'landing';
          this.hud.setMode('landing');
          this.audio.blip(520);
        }
      } else {
        this.hud.toast(t('toast.noland'), t('toast.slowdown'));
      }
    }

    // engine visuals
    const thrustF = this.throttle * (this.boosting ? 1.6 : 1) + this.pulse.factor;
    this.ship.setThrust(thrustF);
    if (this.throttle > 0.04 && this.pulse.factor < 0.5) {
      this.ship.group.updateMatrixWorld();
      _f.set(0, 0, -1).applyQuaternion(this.quat);
      for (const n of this.ship.nozzles) {
        _v1.copy(n).applyMatrix4(this.ship.group.matrixWorld);
        _v2.copy(this.vel).addScaledVector(_f, -26 - this.speed * 0.05);
        _v2.x += (Math.random() - 0.5) * 5;
        _v2.y += (Math.random() - 0.5) * 5;
        _v2.z += (Math.random() - 0.5) * 5;
        this.trail.spawn(_v1, _v2, 0.45, 0.8, 1.0, 0.4 + Math.random() * 0.3);
      }
    }

    this.updateChaseCam(dt, nearest);
  }

  updateChaseCam(dt, nearest) {
    _v1.set(0, 3.1, 11.8).applyQuaternion(this.quat).add(this.pos);
    if (!this.camInit) this.camPos.copy(_v1);
    this.camPos.lerp(_v1, 1 - Math.exp(-dt * 7));
    const cs = nearest.sampleAt(this.camPos);
    if (cs.len < cs.floorR + 2.5) this.camPos.copy(nearest.center).addScaledVector(cs.up, cs.floorR + 2.5);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 4);
    }
    _v2.set(0, 0.8, -26).applyQuaternion(this.quat).add(this.pos);
    _up.set(0, 1, 0).applyQuaternion(this.quat);
    _m.lookAt(this.camera.position, _v2, _up);
    _q1.setFromRotationMatrix(_m);
    if (!this.camInit) { this.camera.quaternion.copy(_q1); this.camInit = true; }
    else this.camera.quaternion.slerp(_q1, 1 - Math.exp(-dt * 10));

    const fovT = 72 + (this.boosting ? 7 : 0) + this.pulse.factor * 16;
    if (Math.abs(this.camera.fov - fovT) > 0.05) {
      this.camera.fov = lerp(this.camera.fov, fovT, 1 - Math.exp(-dt * 4));
      this.camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ landing
  updateLanding(dt, nearest) {
    const la = this.landAnim;
    la.t = Math.min(la.t + dt / 1.5, 1);
    const s = la.t * la.t * (3 - 2 * la.t);
    this.pos.lerpVectors(la.from, la.to, s);
    this.quat.slerpQuaternions(la.q0, la.q1, s);
    this.vel.set(0, 0, 0);
    this.throttle = 0;
    this.speed = 0;
    this.ship.setThrust(0.25 * (1 - la.t));
    if (la.t >= 1) {
      this.mode = 'landed';
      this.ship.setGear(true);
      this.hud.setMode('landed');
      this.hud.toast(t('toast.landed'), nearest.def.name);
      this.audio.land();
      this.orbitAng = 0;
    }
    this.updateChaseCam(dt, nearest);
  }

  // ------------------------------------------------------------------ landed
  updateLanded(dt, nearest) {
    const inp = this.input;
    const smp = nearest.sampleAt(this.pos);
    this.speed = 0;
    this.alt = smp.alt;

    if (inp.pressed('KeyF')) {
      _v1.set(1, 0, 0).applyQuaternion(this.quat);
      this.walk.pos.copy(this.pos).addScaledVector(_v1, 5.5).addScaledVector(smp.up, 1);
      const ws = nearest.sampleAt(this.walk.pos);
      this.walk.pos.copy(nearest.center).addScaledVector(ws.up, ws.floorR + 1.75);
      this.walk.fwd.set(0, 0, -1).applyQuaternion(this.quat);
      this.walk.fwd.addScaledVector(ws.up, -this.walk.fwd.dot(ws.up)).normalize();
      this.walk.pitch = 0; this.walk.vRad = 0; this.walk.fuel = 1; this.walk.grounded = true;
      this.mode = 'walk';
      this.hud.setMode('walk');
      this.hud.toast(t('toast.disembark'), t('toast.boardHint'));
      this.camera.fov = 72; this.camera.updateProjectionMatrix();
      this.camInit = false;
      this.audio.blip(420);
      return;
    }
    if (inp.pressed('KeyL') || inp.pressed('Space')) {
      this.mode = 'fly';
      this.hud.setMode('fly');
      this.ship.setGear(false);
      this.throttle = 0.35;
      this.vel.copy(smp.up).multiplyScalar(40);
      this.pos.addScaledVector(smp.up, 0.6);
      this.audio.blip(700);
      this.camInit = false;
      return;
    }

    // slow orbit camera around the parked ship
    this.orbitAng += dt * 0.14;
    _v1.set(0, 1, 0);
    if (Math.abs(smp.up.dot(_v1)) > 0.95) _v1.set(1, 0, 0);
    _v2.crossVectors(smp.up, _v1).normalize();
    _q1.setFromAxisAngle(smp.up, this.orbitAng);
    _v2.applyQuaternion(_q1);
    this.camera.position.copy(this.pos).addScaledVector(smp.up, 5).addScaledVector(_v2, 15);
    const cs = nearest.sampleAt(this.camera.position);
    if (cs.len < cs.floorR + 2) this.camera.position.copy(nearest.center).addScaledVector(cs.up, cs.floorR + 2);
    this.camera.up.copy(smp.up);
    this.camera.lookAt(this.pos);
    this.ship.setThrust(0);
  }

  // ------------------------------------------------------------------ on foot
  updateWalk(dt, nearest) {
    const inp = this.input;
    const w = this.walk;
    const smp = nearest.sampleAt(w.pos);
    const up = smp.up;

    const m = inp.consumeMouse();
    _q1.setFromAxisAngle(up, -m.dx * 0.0023);
    w.fwd.applyQuaternion(_q1);
    w.pitch = clamp(w.pitch - m.dy * 0.0023, -1.45, 1.45);
    w.fwd.addScaledVector(up, -w.fwd.dot(up));
    if (w.fwd.lengthSq() < 1e-6) w.fwd.set(up.y, up.z, -up.x);
    w.fwd.normalize();
    const right = _v1.crossVectors(w.fwd, up).normalize();

    _v2.set(0, 0, 0);
    if (inp.key('KeyW')) _v2.add(w.fwd);
    if (inp.key('KeyS')) _v2.sub(w.fwd);
    if (inp.key('KeyD')) _v2.add(right);
    if (inp.key('KeyA')) _v2.sub(right);
    const run = inp.key('ShiftLeft') || inp.key('ShiftRight');
    const movingNow = _v2.lengthSq() > 0;
    if (movingNow) _v2.normalize().multiplyScalar(run ? 11 : 6.5);

    const g = nearest.def.stats.gravity;
    if (inp.pressed('Space') && w.grounded) {
      w.vRad = 6.4; w.grounded = false;
    } else if (inp.key('Space') && !w.grounded && w.fuel > 0.02) {
      w.vRad += (g + 8) * dt;
      w.vRad = Math.min(w.vRad, 16);
      w.fuel = clamp(w.fuel - dt / 3.2, 0, 1);
    }
    w.vRad -= g * dt;
    w.pos.addScaledVector(_v2, dt).addScaledVector(up, w.vRad * dt);

    const s2 = nearest.sampleAt(w.pos);
    const standR = s2.floorR + 1.75;
    if (s2.len <= standR) {
      w.pos.copy(nearest.center).addScaledVector(s2.up, standR);
      if (w.vRad < -16) this.audio.thud();
      w.vRad = 0;
      w.grounded = true;
      w.fuel = clamp(w.fuel + dt / 2.2, 0, 1);
    } else {
      w.grounded = false;
    }
    this.speed = _v2.length();
    this.alt = s2.len - s2.floorR;

    const jetting = inp.key('Space') && !w.grounded && w.fuel > 0.02;

    // avatar (feet sit 1.75 below the walker anchor)
    _v3.crossVectors(right, s2.up).normalize(); // back
    _m.makeBasis(right, s2.up, _v3);
    _q1.setFromRotationMatrix(_m);
    if (this.avatar) {
      const av = this.avatar;
      av.group.position.copy(w.pos).addScaledVector(s2.up, -1.75);
      av.group.quaternion.slerp(_q1, 1 - Math.exp(-dt * 9));
      w.phase += dt * (movingNow ? (run ? 1.5 : 1) : 0);
      av.animate(dt, w.phase, movingNow, jetting);
    }

    // third-person camera orbiting the walker
    const P = clamp(0.32 - w.pitch * 0.75, -0.95, 1.25);
    const camD = 5.4;
    this.camera.position.copy(w.pos)
      .addScaledVector(_v3, Math.cos(P) * camD)
      .addScaledVector(s2.up, Math.sin(P) * camD - 0.4);
    const cs = nearest.sampleAt(this.camera.position);
    if (cs.len < cs.floorR + 0.5) {
      this.camera.position.copy(nearest.center).addScaledVector(cs.up, cs.floorR + 0.5);
    }
    _v2.copy(w.pos).addScaledVector(w.fwd, 3.5).addScaledVector(s2.up, w.pitch * 3.0 - 0.2);
    _m.lookAt(this.camera.position, _v2, s2.up);
    this.camera.quaternion.setFromRotationMatrix(_m);

    if (inp.pressed('KeyF')) {
      if (w.pos.distanceTo(this.pos) < 9) {
        this.mode = 'landed';
        this.hud.setMode('landed');
        this.hud.toast(t('toast.aboard'), t('toast.takeoffHint'));
        this.camInit = false;
        this.audio.blip(600);
      } else {
        this.hud.toast(t('toast.shipFar'), t('toast.followBeam'));
      }
    }
  }
}
