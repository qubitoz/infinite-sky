// INFINITE SKY — main loop: scene setup, environment transitions (space ↔
// atmosphere), discovery flow, markers, and frame orchestration.
import * as THREE from 'three';
import { makeSystem } from './universe.js';
import { Planet, processBuildQueue, pendingBuilds } from './planet.js';
import { TIME } from './shaders.js';
import { makeStarfield, makeNebulae, makeSun, makeAsteroidBelt, WarpField, EngineTrail } from './effects.js';
import { makeShip, SHIPS } from './ship.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { buildSpeciesCatalog, CreatureManager } from './creatures.js';
import { buildAvatar } from './avatar.js';
import { MATERIALS, PIECES, buildPiece, Inventory, PickupManager } from './gear.js';
import { SiteManager } from './sites.js';
import { makeGalaxy, systemSeedFor } from './galaxy.js';
import { Radar } from './radar.js';
import { WeatherSystem, weatherKind } from './weather.js';
import { t, pick, toggleLang, onLang } from './i18n.js';
import { TouchControls, isTouch } from './touch.js';
import { reportDiscovery, fetchFirstBy } from './online.js';
import { mulberry32, clamp, lerp, hashStr } from './noise.js';

const params = new URLSearchParams(location.search);
// galaxy seed (g) + system index (s); legacy ?seed= maps to g with s=0 so old
// saves keep their seed
const galaxySeed = ((parseInt(params.get('g'), 10)
  || parseInt(params.get('seed'), 10)
  || ((Math.random() * 1e9) | 0)) >>> 0) || 1;
const sysIdx = Math.max(0, parseInt(params.get('s'), 10) || 0);
const seed = systemSeedFor(galaxySeed, sysIdx);
// quality: phones/tablets default to "low" (override with ?q=high) — the big
// mobile GPU costs are pixel ratio and MSAA, so both drop on touch devices
const qParam = params.get('q');
const autoLow = isTouch() && qParam !== 'high';
const QUAL = (qParam === 'low' || autoLow)
  ? { res: 13, pr: 1.5, budget: 5, stars: 4500, asteroids: 350, pop: 8, aa: false }
  : { res: 17, pr: 2, budget: 6, stars: 9000, asteroids: 800, pop: 12, aa: true };

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: QUAL.aa, logarithmicDepthBuffer: true, powerPreference: 'high-performance',
  });
} catch (e) {
  const err = document.getElementById('err');
  err.style.display = 'flex';
  err.textContent = 'WEBGL UNAVAILABLE — ' + e.message;
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, QUAL.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SPACE_COL = new THREE.Color('#02030a');
scene.fog = new THREE.Fog(SPACE_COL.clone(), 60, 4e6);
renderer.setClearColor(SPACE_COL);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.3, 4e6);

// ----------------------------------------------------------------- universe
const system = makeSystem(seed);
const rand = mulberry32(seed ^ 0xdecafbad);

const starsRoot = new THREE.Group();
const stars = makeStarfield(rand, QUAL.stars);
const nebulae = makeNebulae(rand);
starsRoot.add(stars.group, nebulae.group);
scene.add(starsRoot);
const skyMats = [...stars.mats, ...nebulae.mats];
skyMats.forEach((m) => { m.userData.baseOp = m.opacity; });

const sun = makeSun(system);
scene.add(sun.group);
const SUN_POS = new THREE.Vector3(0, 0, 0);

const sunLight = new THREE.DirectionalLight(system.star.color, 3.0);
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight('#88aaff', '#223344', 0.14);
scene.add(hemi);

const planets = system.planets.map((def) => new Planet(def, QUAL));
planets.forEach((p) => scene.add(p.group));
scene.add(makeAsteroidBelt(rand, system.belt, QUAL.asteroids));

const ship = makeShip('star');
scene.add(ship.group);
const trail = new EngineTrail(scene);
const warp = new WarpField(scene);
const weather = new WeatherSystem(scene, QUAL.aa ? 1 : 0.65);

const galaxy = makeGalaxy(galaxySeed);

const hud = new HUD(camera);
const audio = new AudioSys();
const player = new Player({ camera, ship, trail, hud, audio });
const input = player.input;

// on-foot explorer avatar + gathering + wardrobe
const avatar = buildAvatar();
avatar.group.visible = false;
scene.add(avatar.group);
player.avatar = avatar;
const pickups = new PickupManager(scene);
const inventory = new Inventory();
const sites = new SiteManager(scene);
const radar = new Radar(
  document.getElementById('radarwrap'),
  document.getElementById('radar'),
  document.getElementById('radarcap'),
);
radar.sel = sysIdx;
const touch = isTouch() ? new TouchControls(input) : null;
hud.onDigit = (n) => input.just.add(`Digit${n}`);
hud.onPanelClose = (key) => input.just.add(key);
let ownedShips = ['star'];
let visited = new Set([sysIdx]);
let vendorPieceOpen = null;

// landing beacon: pillar of light over the parked ship while on foot
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.1, 1.1, 360, 8, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0x66e0ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }),
);
beam.visible = false;
scene.add(beam);
const _beamUp = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

// spawn on the sunlit side of the first (lush) planet
const p0 = planets[0];
const sunward = p0.center.clone().negate().normalize();
const spawnPos = p0.center.clone().addScaledVector(sunward, p0.R * 2.7);
spawnPos.y += p0.R * 0.45;
player.spawn(spawnPos, p0.center);

// per-player persistence: saves are keyed by profile + seed, loaded once the
// explorer picks a name on the title screen
let profile = 'EXPLORER';
let storeKey = `infsky-${seed}`;
let firstBy = new Map();
const discoveredCount = () => planets.filter((p) => p.discovered).length;
const saveDiscoveries = () => {
  try {
    localStorage.setItem(storeKey, JSON.stringify(planets.filter((p) => p.discovered).map((p) => p.def.id)));
  } catch { /* storage unavailable */ }
};

// fauna: species are deterministic per seed; discovery progress is per-player
const allSpecies = buildSpeciesCatalog(planets);
const creatureMgr = new CreatureManager(scene, QUAL.pop);
let faunaKey = `infsky-fauna-${seed}`;
const discoveredFauna = new Set();
const saveFauna = () => {
  try { localStorage.setItem(faunaKey, JSON.stringify([...discoveredFauna])); } catch { /* unavailable */ }
};

function loadSaves() {
  storeKey = `infsky-${profile}-${seed}`;
  faunaKey = `infsky-fauna-${profile}-${seed}`;
  try {
    for (const id of JSON.parse(localStorage.getItem(storeKey) || '[]')) {
      if (planets[id]) planets[id].discovered = true;
    }
  } catch { /* fresh */ }
  try {
    for (const id of JSON.parse(localStorage.getItem(faunaKey) || '[]')) discoveredFauna.add(id);
  } catch { /* fresh */ }
  inventory.load(profile);
  avatar.setOutfit(inventory.equipped, buildPiece);
  sites.setContext(profile, seed);
  try {
    ownedShips = JSON.parse(localStorage.getItem(`infsky-ships-${profile}`) || '["star"]');
  } catch { ownedShips = ['star']; }
  if (!ownedShips.includes('star')) ownedShips.unshift('star');
  const active = (() => {
    try { return localStorage.getItem(`infsky-ship-${profile}`) || 'star'; } catch { return 'star'; }
  })();
  if (ownedShips.includes(active)) ship.setVariant(active);
  try {
    const vKey = `infsky-visited-${profile}-${galaxySeed}`;
    visited = new Set(JSON.parse(localStorage.getItem(vKey) || '[]'));
    visited.add(sysIdx);
    localStorage.setItem(vKey, JSON.stringify([...visited]));
  } catch { visited = new Set([sysIdx]); }
  hud.setWorlds(discoveredCount(), planets.length);
  hud.setSpecies(discoveredFauna.size, allSpecies.length);
  fetchFirstBy(seed).then((m) => { firstBy = m; });
}

const saveShips = () => {
  try {
    localStorage.setItem(`infsky-ships-${profile}`, JSON.stringify(ownedShips));
    localStorage.setItem(`infsky-ship-${profile}`, ship.variantKey);
  } catch { /* fine */ }
};

hud.setSystem(system.name, `${galaxySeed}·${sysIdx}`);
hud.setWorlds(discoveredCount(), planets.length);
hud.setSpecies(discoveredFauna.size, allSpecies.length);

// hyperspace arrival: skip the title after an in-game jump
let jumpedIn = false;
try {
  const j = sessionStorage.getItem('infsky-jump');
  if (j) { jumpedIn = true; profile = j; sessionStorage.removeItem('infsky-jump'); }
} catch { /* fine */ }

function renderTitle() {
  document.getElementById('subtitle').textContent = t('ui.subtitle');
  document.getElementById('proflabel').textContent = t('ui.name');
  document.getElementById('ctabtn').textContent = t('ui.cta');
  document.getElementById('pausedtxt').textContent = jumpedIn ? t('ui.arrival') : t('ui.paused');
  document.getElementById('langbtn').textContent = t('ui.lang');
  document.querySelector('#title .seedline').textContent =
    `${t('ui.system')} ${system.name} · ${t('ui.seed')} ${galaxySeed}·${sysIdx} · ${planets.length} ${t('ui.worldsN')}`;
  const rows = [
    ['MOUSE', t('ctl.mouse')], ['W / S', t('ctl.ws')], ['A / D', t('ctl.ad')],
    ['SHIFT', t('ctl.shift')], ['J', t('ctl.j')], ['L', t('ctl.l')], ['F', t('ctl.f')],
    ['SPACE', t('ctl.space')], ['C', t('ctl.c')], ['B', t('ctl.b')], ['E / O', t('ctl.eo')],
    ['M', t('ctl.m')], ['G', t('ctl.g')], ['H', t('ctl.h')],
  ];
  document.getElementById('ctlgrid').innerHTML =
    rows.map(([k, d]) => `<b>${k}</b><span>${d}</span>`).join('');
}
renderTitle();
onLang(() => { renderTitle(); hud.refreshLang(); });
document.getElementById('langbtn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleLang();
});

// -------------------------------------------------------- title / lock flow
let started = false;
const titleEl = document.getElementById('title');
const pausedEl = document.getElementById('paused');

function lock() {
  if (touch) { input.locked = true; pausedEl.classList.remove('on'); return; }
  try { renderer.domElement.requestPointerLock(); } catch { /* unsupported */ }
}

const pnameEl = document.getElementById('pname');
try { pnameEl.value = localStorage.getItem('infsky-lastname') || ''; } catch { /* fine */ }
pnameEl.addEventListener('click', (e) => e.stopPropagation());
pnameEl.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') titleEl.click();
});

titleEl.addEventListener('click', () => {
  if (started) return;
  started = true;
  profile = (pnameEl.value.trim().toUpperCase().replace(/[^A-Z0-9 _À-Ü-]/g, '') || 'EXPLORER').slice(0, 14);
  try { localStorage.setItem('infsky-lastname', profile); } catch { /* fine */ }
  loadSaves();
  titleEl.classList.add('off');
  document.body.classList.add('playing');
  hud.show();
  audio.ensure();
  hud.toast(`${t('toast.welcome')}, ${profile}`, `${system.name} — ${t('toast.throttleHint')}`);
  lock();
});

if (jumpedIn) {
  pnameEl.value = profile;
  setTimeout(() => titleEl.click(), 400);
}

function hyperjump(idx) {
  try { sessionStorage.setItem('infsky-jump', profile); } catch { /* fine */ }
  hud.toast(t('toast.jump'), galaxy[idx].name);
  audio.pulseUp();
  setTimeout(() => { location.href = `?g=${galaxySeed}&s=${idx}`; }, 900);
}
pausedEl.addEventListener('click', lock);
document.addEventListener('pointerlockchange', () => {
  if (touch) return; // no pointer lock on touch devices
  input.locked = !!document.pointerLockElement;
  if (started) pausedEl.classList.toggle('on', !input.locked);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let titleAng = 0;
function titleCam(dt) {
  titleAng += dt * 0.05;
  const r = p0.R * 2.4;
  camera.position.set(
    p0.center.x + Math.cos(titleAng) * r,
    p0.center.y + r * 0.35,
    p0.center.z + Math.sin(titleAng) * r,
  );
  camera.lookAt(p0.center);
}

// -------------------------------------------------------------------- loop
const _fogCol = new THREE.Color();
const _skyCol = new THREE.Color();
const _dirToSun = new THREE.Vector3();
const _vd = new THREE.Vector3();
let lastAtmoPlanet = null;
let callTimer = 3;
let pulsePrev = false;
const clock = new THREE.Clock();

// lightweight fps meter (?fps=1) so testers can report real device numbers
let fpsEl = null, fpsFrames = 0, fpsClock = 0, fpsLast = performance.now();
if (params.has('fps')) {
  fpsEl = document.createElement('div');
  fpsEl.id = 'fps';
  fpsEl.textContent = '— FPS';
  document.body.appendChild(fpsEl);
}

let FIXED_DT = null;
const loop = () => {
  const dt = clamp(FIXED_DT ?? clock.getDelta(), 0, 0.05);
  TIME.value += dt;

  // nearest planet by distance-to-surface (needed by the key handlers below)
  let nearest = planets[0], best = Infinity;
  const camRef = started ? player.bodyPos() : camera.position;
  for (const p of planets) {
    const d = camRef.distanceTo(p.center) - p.R;
    if (d < best) { best = d; nearest = p; }
  }

  if (started && input.locked) {
    if (input.pressed('KeyH')) hud.toggleHelp();
    if (input.pressed('KeyX')) toggleLang();
    if (input.pressed('KeyB')) hud.toggleCatalog(allSpecies, discoveredFauna, planets, firstBy);
    if (input.pressed('KeyO')) hud.toggleOutfit(inventory);
    if (input.pressed('KeyG')) hud.toggleHangar(ownedShips, ship.variantKey);
    if (input.pressed('KeyM')) {
      radar.cycle(best < nearest.R * 0.6 || player.mode !== 'fly');
    }
    if (radar.mode === 'galaxy') {
      if (input.pressed('ArrowLeft')) radar.sel = (radar.sel + galaxy.length - 1) % galaxy.length;
      if (input.pressed('ArrowRight')) radar.sel = (radar.sel + 1) % galaxy.length;
      if (input.pressed('Enter') && radar.sel !== sysIdx) {
        if (player.mode === 'fly' && best > nearest.R * 0.5) hyperjump(radar.sel);
        else hud.toast(t('toast.jumpSpace'));
      }
    }
    if (input.pressed('KeyT') && player.mode === 'walk') {
      if (hud.tradeOn) {
        hud.toggleTrade(vendorPieceOpen, inventory);
      } else {
        const piece = sites.vendorNear(nearest, player.bodyPos(), 9);
        if (piece) { vendorPieceOpen = piece; hud.toggleTrade(piece, inventory); }
      }
    }
    // digit routing: whichever panel is open
    for (let i = 1; i <= 9; i++) {
      if (!input.pressed(`Digit${i}`)) continue;
      if (hud.outfitOn) {
        const piece = inventory.unlockedList()[i - 1];
        if (piece) {
          inventory.toggleEquip(piece);
          avatar.setOutfit(inventory.equipped, buildPiece);
          hud.renderOutfit(inventory);
          audio.blip(880);
        }
      } else if (hud.hangarOn) {
        const key = ownedShips[i - 1];
        if (key && key !== ship.variantKey) {
          if (player.mode === 'landed' || player.mode === 'walk') {
            ship.setVariant(key);
            saveShips();
            hud.renderHangar(ownedShips, ship.variantKey);
            hud.toast(t('toast.shipEquipped'), pick(SHIPS[key].name));
            audio.blip(700);
          } else {
            hud.toast(t('toast.equipLanded'));
          }
        }
      } else if (hud.tradeOn && i === 1 && vendorPieceOpen) {
        if (inventory.ownsVendor(vendorPieceOpen.id)) break;
        if (inventory.buyVendor(vendorPieceOpen)) {
          hud.toast(t('toast.traded'), pick(vendorPieceOpen.name));
          hud.renderTrade(vendorPieceOpen, inventory);
          audio.jingle();
          hud.celebrate();
        } else {
          hud.toast(t('toast.noMats'));
          audio.blip(220);
        }
      }
    }
    if (player.mode === 'walk' && input.pressed('KeyE')) {
      const part = sites.nearestPart(nearest, player.bodyPos(), 6);
      if (part) {
        const res = sites.collectPart(nearest, part);
        if (res.done) {
          if (!ownedShips.includes(res.ship)) ownedShips.push(res.ship);
          saveShips();
          hud.toast(t('toast.shipRepaired'), pick(SHIPS[res.ship].name));
          hud.celebrate();
          audio.celebrate();
        } else {
          hud.toast(t('toast.partFound'), `${res.got}/3`);
          audio.jingle();
        }
      } else {
        const it = pickups.nearestWithin(player.bodyPos(), 5.5);
        if (it) {
          const mat = pickups.collect(it);
          const n = inventory.add(mat);
          hud.toast(`+1 ${pick(MATERIALS[mat].name)}`, `${n} ${t('toast.total')}`);
          audio.blip(740);
          for (const p of PIECES) {
            if (p.mat === mat && n === p.need) {
              hud.toast(t('toast.unlock'), `${pick(p.name)} — ${t('toast.wear')}`);
              audio.jingle();
            }
          }
          if (hud.outfitOn) hud.renderOutfit(inventory);
        }
      }
    }
    if (input.pressed('KeyC')) {
      hud.scanFx(); audio.blip(1100);
      let fresh = 0;
      for (const c of creatureMgr.scan(camera, 85)) {
        if (!discoveredFauna.has(c.spec.id)) {
          discoveredFauna.add(c.spec.id);
          fresh++;
          hud.toast(t('toast.newSpecies'),
            `${c.spec.name} — ${c.spec.archetype.toUpperCase()} · ${c.spec.planetName}`);
          reportDiscovery({
            seed, species_id: c.spec.id, species_name: c.spec.name,
            planet_name: c.spec.planetName, player: profile,
          });
          if (!firstBy.has(c.spec.id)) firstBy.set(c.spec.id, profile);
        }
      }
      if (fresh) {
        audio.jingle();
        saveFauna();
        hud.setSpecies(discoveredFauna.size, allSpecies.length);
        const sp = nearest.species || [];
        if (sp.length && sp.every((s) => discoveredFauna.has(s.id))) {
          hud.toast(t('toast.planetDone'), nearest.def.name);
          hud.celebrate();
          audio.celebrate();
        }
        if (discoveredFauna.size === allSpecies.length) {
          hud.toast(t('toast.systemDone'), system.name);
          hud.celebrate();
        }
      }
    }
    if (input.pressed('KeyN')) location.href = `?g=${(Math.random() * 1e9) | 0}`;
  }

  if (touch && started) touch.apply(dt, player.mode);

  if (!started) titleCam(dt);
  else if (input.locked) player.update(dt, nearest, planets);

  // cinematic pulse feedback: flash on engage/disengage + tunnel vignette
  if (started) {
    if (player.pulse.active !== pulsePrev) {
      pulsePrev = player.pulse.active;
      hud.warpFlash();
    }
    document.body.classList.toggle('pulsing', player.pulse.factor > 0.45);
  }

  for (const p of planets) p.update(camera.position, p === nearest, dt);
  processBuildQueue(started ? QUAL.budget : 22);
  hud.setLoading(pendingBuilds() > 3);

  // live fauna + gatherable materials near the surface
  const faunaActive = started && best < 500 && !!(nearest.species && nearest.species.length);
  creatureMgr.update(dt, started ? player.bodyPos() : camera.position, nearest, faunaActive);
  pickups.update(dt, started ? player.bodyPos() : camera.position, nearest,
    started && player.mode === 'walk');
  sites.update(dt, started ? player.bodyPos() : camera.position, nearest, started);

  // ship beacon while on foot
  if (started && player.mode === 'walk') {
    _beamUp.copy(player.pos).sub(nearest.center).normalize();
    beam.visible = true;
    beam.position.copy(player.pos).addScaledVector(_beamUp, 178);
    beam.quaternion.setFromUnitVectors(_Y, _beamUp);
  } else beam.visible = false;

  // ambient creature chirps
  if (faunaActive && audio.ok) {
    callTimer -= dt;
    if (callTimer <= 0) {
      callTimer = 2.5 + Math.random() * 3.5;
      const nearC = creatureMgr.nearestList(player.bodyPos(), 85, 6);
      if (nearC.length) {
        const c = nearC[(Math.random() * nearC.length) | 0];
        audio.creatureCall(hashStr(c.spec.id),
          clamp(1 - c.pos.distanceTo(player.bodyPos()) / 95, 0.15, 1));
      }
    }
  }

  // ------- environment: space <-> atmosphere blend
  const smp = nearest.sampleAt(camera.position);
  const atmoF = clamp(1 - (smp.len - nearest.R) / nearest.atmoH, 0, 1);
  const sunDot = smp.up.dot(nearest.sunDir);
  const bright = 0.05 + 0.95 * clamp(sunDot + 0.25, 0, 1);
  _skyCol.set(nearest.def.biome.sky).multiplyScalar(bright);
  _fogCol.copy(SPACE_COL).lerp(_skyCol, Math.pow(atmoF, 1.4));
  scene.fog.color.copy(_fogCol);
  renderer.setClearColor(_fogCol);
  scene.fog.far = atmoF > 0.02
    ? lerp(4e6, 9000 + Math.max(smp.alt, 0) * 4, Math.pow(atmoF, 1.2))
    : 4e6;
  const starOp = clamp(1 - atmoF * (0.3 + bright * 1.2), 0, 1);
  for (const m of skyMats) m.opacity = starOp * m.userData.baseOp;
  // subtle per-layer star twinkle
  stars.mats.forEach((m, i) => {
    m.opacity *= 0.88 + 0.12 * Math.sin(TIME.value * (0.7 + i * 0.45) + i * 2.1);
  });

  // visual weather inside atmospheres, driven by the planet's weather report
  const wkind = atmoF > 0.3
    ? weatherKind(nearest.def.biome, nearest.def.stats.weather.en) : null;
  weather.update(dt, camera.position, smp.up, wkind, clamp((atmoF - 0.3) / 0.3, 0, 1));
  hemi.intensity = 0.14 + atmoF * 0.85 * (0.25 + 0.75 * bright);
  hemi.color.set(nearest.def.biome.sky);
  hemi.groundColor.set(nearest.def.biome.rock);

  sun.update(camera.position);
  _dirToSun.copy(camera.position).negate().normalize();
  sunLight.position.copy(camera.position).addScaledVector(_dirToSun, 8000);
  sunLight.target.position.copy(camera.position).addScaledVector(_dirToSun, -100);

  // ------- discovery / atmosphere toasts / planet card
  if (started) {
    if (best < nearest.R * 1.6 && !nearest.discovered) {
      nearest.discovered = true;
      hud.setWorlds(discoveredCount(), planets.length);
      hud.toast(t('toast.discovered'), `${nearest.def.name} — ${pick(nearest.def.biome.label)}`);
      audio.jingle();
      saveDiscoveries();
    }
    const inAtmo = atmoF > 0.05 ? nearest : null;
    if (inAtmo !== lastAtmoPlanet) {
      if (inAtmo) hud.toast(t('toast.atmo'), inAtmo.def.name);
      lastAtmoPlanet = inAtmo;
    }
    if (best < nearest.R * 1.9) {
      const got = nearest.species
        ? nearest.species.filter((s) => discoveredFauna.has(s.id)).length : 0;
      hud.showCard(nearest, got);
    } else hud.hideCard();
  }

  // ------- effects
  trail.update(dt);
  const st = player.state();
  if (st.speed > 1) _vd.copy(player.vel).normalize();
  else _vd.set(0, 0, -1).applyQuaternion(player.quat);
  warp.update(camera.position, _vd, st.speed, player.pulse.factor);
  starsRoot.position.copy(camera.position);

  // ------- hud + audio
  if (started) {
    const markers = [];
    const shortLabel = (b) => pick(b.label).replace(' WORLD', '').replace('MUNDO ', '');
    for (const p of planets) {
      if (p === nearest && best < p.R * 1.2) continue;
      markers.push({
        name: p.def.name, sub: shortLabel(p.def.biome),
        pos: p.center, kind: 'planet', discovered: p.discovered,
      });
    }
    markers.push({ name: system.name, sub: t('mk.star'), pos: SUN_POS, kind: 'star', discovered: true });
    if (player.mode === 'walk') {
      markers.push({
        name: t('mk.ship'), sub: t('mk.board'), pos: player.pos,
        kind: 'ship', discovered: true, clamp: true,
      });
      const it = pickups.nearestWithin(player.bodyPos(), 70);
      if (it) {
        markers.push({
          name: pick(MATERIALS[it.mat].name), sub: t('mk.collect'), pos: it.pos,
          kind: 'pickup', discovered: true,
        });
      }
      for (const blip of sites.blips(nearest)) {
        if (blip.pos.distanceTo(player.bodyPos()) > 600) continue;
        markers.push({
          name: t(`mk.${blip.kind}`),
          sub: blip.kind === 'vendor' ? t('mk.trade') : blip.kind === 'part' ? t('mk.collect') : '',
          pos: blip.pos, kind: blip.kind === 'vendor' ? 'creature' : 'pickup', discovered: true,
        });
      }
    }
    if (faunaActive) {
      for (const c of creatureMgr.nearestList(player.bodyPos(), 95, 3)) {
        const known = discoveredFauna.has(c.spec.id);
        markers.push({
          name: known ? c.spec.name : '???',
          sub: known ? t('mk.registered') : t('mk.scanC'),
          pos: c.pos, kind: 'creature', discovered: known,
        });
      }
    }
    hud.update({ ...st, alt: best < nearest.R * 2 ? st.alt : null }, markers);

    // ---- radar
    if (radar.mode !== 'off') {
      const data = {};
      if (radar.mode === 'system') {
        let maxOrbit = 1;
        const ps = planets.map((p) => {
          maxOrbit = Math.max(maxOrbit, Math.hypot(p.center.x, p.center.z));
          return {
            x: p.center.x, z: p.center.z, col: p.def.biome.sky, disc: p.discovered,
            name: p.def.name.split(' ')[0], hazard: !!p.def.biome.hazard,
          };
        });
        _vd.set(0, 0, -1).applyQuaternion(player.quat);
        data.system = {
          planets: ps, maxOrbit: maxOrbit * 1.12, belt: system.belt.radius,
          ship: { x: player.pos.x, z: player.pos.z, heading: Math.atan2(_vd.x, -_vd.z) },
          sunCol: system.star.color, sysName: system.name,
        };
      } else if (radar.mode === 'galaxy') {
        data.galaxy = {
          systems: galaxy.map((s) => ({ ...s, visited: visited.has(s.idx) })),
          current: sysIdx, sel: radar.sel,
        };
      } else if (radar.mode === 'planet') {
        const body = player.bodyPos();
        const up = _beamUp.copy(body).sub(nearest.center).normalize();
        const fwd = new THREE.Vector3();
        if (player.mode === 'walk') fwd.copy(player.walk.fwd);
        else {
          fwd.set(0, 0, -1).applyQuaternion(player.quat);
          fwd.addScaledVector(up, -fwd.dot(up));
          if (fwd.lengthSq() < 1e-6) fwd.set(1, 0, 0);
          fwd.normalize();
        }
        const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
        const rel = new THREE.Vector3();
        const ents = [];
        const proj = (pos, kind, disc = true) => {
          rel.copy(pos).sub(body);
          ents.push({ x: rel.dot(right), y: rel.dot(fwd), kind, disc });
        };
        for (const c of creatureMgr.alive) proj(c.pos, 'creature', discoveredFauna.has(c.spec.id));
        for (const it of pickups.items) proj(it.pos, 'pickup');
        for (const blip of sites.blips(nearest)) proj(blip.pos, blip.kind);
        if (player.mode === 'walk') proj(player.pos, 'ship');
        const sp = nearest.species || [];
        data.planet = {
          ents, range: 300, planetName: nearest.def.name,
          speciesGot: sp.filter((s) => discoveredFauna.has(s.id)).length,
          speciesTotal: sp.length,
        };
      }
      radar.draw(data, dt);
    }
    audio.update(dt, st, atmoF);
  }

  input.endFrame();
  renderer.render(scene, camera);

  if (fpsEl) {
    const now = performance.now();
    fpsFrames++;
    fpsClock += now - fpsLast;
    fpsLast = now;
    if (fpsClock >= 500) {
      fpsEl.textContent = `${Math.round((fpsFrames * 1000) / fpsClock)} FPS · ${QUAL.aa ? 'HQ' : 'LQ'}`;
      fpsFrames = 0;
      fpsClock = 0;
    }
  }
};
renderer.setAnimationLoop(loop);

// debug / automation hook
window.__game = {
  start: () => titleEl.click(), player, planets, camera, system, input, hud,
  creatureMgr, allSpecies, discoveredFauna, inventory, pickups, avatar,
  radar, sites, galaxy, ship, hyperjump, weather, get ownedShips() { return ownedShips; },
  step(n = 1, dt = 1 / 60) {
    FIXED_DT = dt;
    for (let i = 0; i < n; i++) loop();
    FIXED_DT = null;
  },
};
