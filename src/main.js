// INFINITE SKY — main loop: scene setup, environment transitions (space ↔
// atmosphere), discovery flow, markers, and frame orchestration.
import * as THREE from 'three';
import { makeSystem } from './universe.js';
import { Planet, processBuildQueue, pendingBuilds } from './planet.js';
import { TIME } from './shaders.js';
import { makeStarfield, makeNebulae, makeSun, makeAsteroidBelt, WarpField, EngineTrail } from './effects.js';
import { makeShip, SHIPS, PAINTS } from './ship.js';
import { MiningManager } from './mining.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { buildSpeciesCatalog, CreatureManager } from './creatures.js';
import { buildAvatar } from './avatar.js';
import { MATERIALS, PIECES, buildPiece, Inventory, PickupManager } from './gear.js';
import { SiteManager } from './sites.js';
import { SpaceportManager } from './spaceport.js';
import { makeGalaxy, systemSeedFor } from './galaxy.js';
import { Radar } from './radar.js';
import { WeatherSystem, weatherKind } from './weather.js';
import { Tutorial } from './tutorial.js';
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

const galaxy = makeGalaxy(galaxySeed, 18);

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
const mining = new MiningManager(scene);
const spaceport = new SpaceportManager(scene);
spaceport.init(planets, seed);
const _beamFrom = new THREE.Vector3();
let currentKiosk = null;
function awardStelars(n, reason) {
  inventory.earn(n);
  hud.setStelars(inventory.estelars);
  hud.toast(reason, `+${n} ★`);
}
let ownedPaints = [];
let paintMap = {};
const paintsState = () => ({ owned: ownedPaints, current: paintMap[ship.variantKey] || null });
const savePaints = () => {
  try {
    localStorage.setItem(`infsky-paints-${profile}`, JSON.stringify(ownedPaints));
    localStorage.setItem(`infsky-paint-${profile}`, JSON.stringify(paintMap));
  } catch { /* fine */ }
};
const applyPaint = () => {
  const pid = paintMap[ship.variantKey];
  const p = pid && PAINTS.find((x) => x.id === pid);
  ship.setPaint(p ? p.hex : null);
};
const radar = new Radar(
  document.getElementById('radarwrap'),
  document.getElementById('radar'),
  document.getElementById('radarcap'),
);
radar.sel = sysIdx;
const touch = isTouch() ? new TouchControls(input) : null;
const tutorial = new Tutorial(!!touch);
hud.onDigit = (n) => input.just.add(`Digit${n}`);
hud.onPanelClose = (key) => input.just.add(key);
let ownedShips = ['star'];
let visited = new Set([sysIdx]);
let vendorPieceOpen = null;
let landedSet = new Set();
const saveLanded = () => {
  try { localStorage.setItem(`infsky-landed-${profile}-${seed}`, JSON.stringify([...landedSet])); } catch { /* fine */ }
};
// touchdown: log it for the system chart and pop the live planet radar
player.onLanded = (planet) => {
  if (!landedSet.has(planet.def.id)) {
    landedSet.add(planet.def.id);
    saveLanded();
  }
  radar.force('planet');
};

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
  hud.setStelars(inventory.estelars);
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
    ownedPaints = JSON.parse(localStorage.getItem(`infsky-paints-${profile}`) || '[]');
    paintMap = JSON.parse(localStorage.getItem(`infsky-paint-${profile}`) || '{}');
  } catch { ownedPaints = []; paintMap = {}; }
  applyPaint();
  try {
    const vKey = `infsky-visited-${profile}-${galaxySeed}`;
    visited = new Set(JSON.parse(localStorage.getItem(vKey) || '[]'));
    visited.add(sysIdx);
    localStorage.setItem(vKey, JSON.stringify([...visited]));
  } catch { visited = new Set([sysIdx]); }
  try {
    landedSet = new Set(JSON.parse(localStorage.getItem(`infsky-landed-${profile}-${seed}`) || '[]'));
  } catch { landedSet = new Set(); }
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

// proximity collection (no button needed — kid-friendly)
function collectPickupItem(it) {
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

function collectPartItem(nearestPlanet, part) {
  const res = sites.collectPart(nearestPlanet, part);
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
}

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
  // brand-new explorers get the 60-second first flight
  let tutDone = false;
  try { tutDone = !!localStorage.getItem(`infsky-tut-${profile}`); } catch { /* fine */ }
  if (!tutDone && !jumpedIn) tutorial.start();
  lock();
});

function finishTutorial(skipped) {
  try { localStorage.setItem(`infsky-tut-${profile}`, '1'); } catch { /* fine */ }
  if (skipped) return;
  if (!inventory.ownsVendor('goldcrown')) {
    inventory.vendor.push('goldcrown');
    inventory.save();
  }
  hud.toast(t('tut.done'), t('tut.reward'));
  hud.celebrate();
  audio.celebrate();
}

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
// mouse wheel scrolls the catalog even under pointer lock
window.addEventListener('wheel', (e) => {
  if (hud.catalogOn) hud.els.catalog.scrollTop += e.deltaY;
  else if (hud.hangarOn) hud.els.hangar.scrollTop += e.deltaY;
}, { passive: true });
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
    if (input.pressed('KeyG')) hud.toggleHangar(ownedShips, ship.variantKey, inventory, paintsState());
    if (input.pressed('KeyM')) {
      const onSurface = player.mode !== 'fly';
      radar.cycle(onSurface ? 'surface' : best < nearest.R * 0.6 ? 'near' : 'space');
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
      if (hud.kioskOn) {
        if (currentKiosk && currentKiosk.id === 'exchange') {
          const mat = inventory.sellableList()[i - 1];
          if (mat) {
            const gain = inventory.sellAll(mat);
            hud.setStelars(inventory.estelars);
            hud.toast(`${t('toast.sold')} ${pick(MATERIALS[mat].name)}`, `+${gain} ★`);
            hud.renderKiosk(currentKiosk, inventory);
            audio.blip(990);
          }
        }
      } else if (hud.outfitOn) {
        const piece = inventory.unlockedList()[i - 1];
        if (piece) {
          inventory.toggleEquip(piece);
          avatar.setOutfit(inventory.equipped, buildPiece);
          hud.renderOutfit(inventory);
          audio.blip(880);
        }
      } else if (hud.hangarOn) {
        if (i <= ownedShips.length) {
          const key = ownedShips[i - 1];
          if (key && key !== ship.variantKey) {
            if (player.mode === 'landed' || player.mode === 'walk') {
              ship.setVariant(key);
              applyPaint();
              saveShips();
              hud.renderHangar(ownedShips, ship.variantKey, inventory, paintsState());
              hud.toast(t('toast.shipEquipped'), pick(SHIPS[key].name));
              audio.blip(700);
            } else {
              hud.toast(t('toast.equipLanded'));
            }
          }
        } else {
          const paint = PAINTS[i - ownedShips.length - 1];
          if (paint) {
            if (!ownedPaints.includes(paint.id)) {
              if (inventory.count('gem') >= paint.cost) {
                inventory.counts.gem -= paint.cost;
                inventory.save();
                ownedPaints.push(paint.id);
                hud.toast(t('toast.paintUnlocked'), pick(paint.name));
                audio.jingle();
              } else {
                hud.toast(t('toast.needGems'));
                audio.blip(220);
              }
            }
            if (ownedPaints.includes(paint.id)) {
              paintMap[ship.variantKey] = paintMap[ship.variantKey] === paint.id ? null : paint.id;
              applyPaint();
              savePaints();
              if (paintMap[ship.variantKey]) hud.toast(t('toast.painted'), pick(paint.name));
              hud.renderHangar(ownedShips, ship.variantKey, inventory, paintsState());
              audio.blip(820);
            }
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
        awardStelars(fresh * 15, t('toast.bonusSpecies'));
        const sp = nearest.species || [];
        if (sp.length && sp.every((s) => discoveredFauna.has(s.id))) {
          hud.toast(t('toast.planetDone'), nearest.def.name);
          awardStelars(50, t('toast.bonusFauna'));
          hud.celebrate();
          audio.celebrate();
        }
        if (discoveredFauna.size === allSpecies.length) {
          hud.toast(t('toast.systemDone'), system.name);
          awardStelars(100, t('toast.bonusSystem'));
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
  mining.update(dt, started ? player.bodyPos() : camera.position, nearest,
    started && player.mode === 'walk');
  spaceport.update(dt, started ? player.bodyPos() : camera.position, started);

  // visibility logic: on the surface only the local radar exists
  const onSurface = started && player.mode !== 'fly';
  if (onSurface && (radar.mode === 'system' || radar.mode === 'galaxy')) radar.force('planet');
  if (radar.mode === 'planet' && started && player.mode === 'fly' && best > nearest.R * 0.8) radar.off();

  // on foot: pieces and materials collect by proximity; gems need the laser
  if (started && player.mode === 'walk' && input.locked) {
    const body = player.bodyPos();

    // spaceport kiosks: the screen lights up and opens when you walk up,
    // and closes by itself when you walk away (no button to learn)
    const kiosk = spaceport.isPortPlanet(nearest) ? spaceport.activeKiosk(body) : null;
    if (kiosk !== currentKiosk) {
      currentKiosk = kiosk;
      if (kiosk) { hud.openKiosk(kiosk, inventory); audio.blip(620); }
      else if (hud.kioskOn) hud.closeKiosk();
    }

    const part = sites.nearestPart(nearest, body, 4.5);
    if (part) collectPartItem(nearest, part);
    const it = pickups.nearestWithin(body, 3.5);
    if (it) collectPickupItem(it);
    if (sites.ruinNear(nearest, body, 8)) {
      sites.claimRuin(nearest);
      for (let i = 0; i < 3; i++) inventory.add('gem');
      hud.toast(t('toast.ruins'), `+3 ${pick(MATERIALS.gem.name)}`);
      hud.celebrate();
      audio.jingle();
    }

    let lasering = false;
    if (input.key('KeyE') || input.mouseDown) {
      const node = (mining.target && mining.nodes.includes(mining.target)
        && mining.target.pos.distanceTo(body) < 16)
        ? mining.target
        : mining.pickTarget(body, player.walk.fwd, 15);
      if (node) {
        _beamFrom.copy(body).addScaledVector(player.walk.fwd, 0.8);
        const got = mining.mine(dt, node, _beamFrom, trail);
        lasering = true;
        if (got === 'gem') {
          const n = inventory.add('gem');
          hud.toast(`+1 ${pick(MATERIALS.gem.name)}`, `${n} ${t('toast.total')}`);
          audio.blip(990);
          if (hud.hangarOn) hud.renderHangar(ownedShips, ship.variantKey, inventory, paintsState());
          if (hud.outfitOn) hud.renderOutfit(inventory);
        }
      }
    }
    if (!lasering) mining.stopBeam();
    audio.setLaser(lasering, dt);
  } else {
    mining.stopBeam();
    audio.setLaser(false, dt);
    if (currentKiosk) { currentKiosk = null; if (hud.kioskOn) hud.closeKiosk(); }
  }

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
  _skyCol.set(nearest.def.sky || nearest.def.biome.sky).multiplyScalar(bright);
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
  hemi.color.set(nearest.def.sky || nearest.def.biome.sky);
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
      awardStelars(25, t('toast.bonusWorld'));
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

  // ------- first-flight tutorial progress
  if (started && (tutorial.active() || tutorial.skipped)) {
    let mats = 0;
    for (const k in inventory.counts) mats += inventory.counts[k];
    const evt = tutorial.update({
      speed: player.speed, atmoF, mode: player.mode,
      fauna: discoveredFauna.size, mats,
    });
    if (evt === 'step') audio.blip(1200);
    else if (evt === 'done') finishTutorial(false);
    else if (evt === 'skip') finishTutorial(true);
  }

  // ------- hud + audio
  if (started) {
    const markers = [];
    const shortLabel = (b) => pick(b.label).replace(' WORLD', '').replace('MUNDO ', '');
    // planet/star markers clutter the surface view — space flight only
    if (!onSurface && atmoF < 0.35) {
      for (const p of planets) {
        if (p === nearest && best < p.R * 1.2) continue;
        markers.push({
          name: p.def.name, sub: shortLabel(p.def.biome),
          pos: p.center, kind: 'planet', discovered: p.discovered,
        });
      }
      markers.push({ name: system.name, sub: t('mk.star'), pos: SUN_POS, kind: 'star', discovered: true });
    }
    // spaceport guidance (only while near the host planet; built === near)
    if (spaceport.isPortPlanet(nearest) && spaceport.built) {
      markers.push({
        name: t('mk.port'), sub: player.mode === 'fly' ? t('mk.portLand') : '',
        pos: spaceport.anchor.pos, kind: 'port', discovered: true, clamp: true,
      });
      if (player.mode === 'walk') {
        for (const b of spaceport.blips()) {
          if (b.kind !== 'kiosk' || b.pos.distanceTo(player.bodyPos()) > 55) continue;
          markers.push({
            name: t('kiosk.' + b.id), sub: t('mk.kiosk'), pos: b.pos,
            kind: 'pickup', discovered: true,
          });
        }
      }
    }
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
      for (const blip of mining.blips()) {
        if (blip.pos.distanceTo(player.bodyPos()) > 80) continue;
        markers.push({
          name: t('mk.ore'), sub: t('mk.mine'), pos: blip.pos,
          kind: 'pickup', discovered: true,
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
          const sp = p.species || [];
          const complete = sp.length > 0 && sp.every((s) => discoveredFauna.has(s.id));
          return {
            x: p.center.x, z: p.center.z, col: p.def.sky || p.def.biome.sky,
            state: complete ? 3 : landedSet.has(p.def.id) ? 2 : p.discovered ? 1 : 0,
            name: p.def.name.split(' ')[0], hazard: !!p.def.biome.hazard,
            port: spaceport.isPortPlanet(p),
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
        for (const blip of mining.blips()) proj(blip.pos, 'ore');
        if (spaceport.isPortPlanet(nearest)) for (const b of spaceport.blips()) proj(b.pos, b.kind);
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
  radar, sites, galaxy, ship, hyperjump, weather, mining, spaceport,
  get ownedShips() { return ownedShips; },
  step(n = 1, dt = 1 / 60) {
    FIXED_DT = dt;
    for (let i = 0; i < n; i++) loop();
    FIXED_DT = null;
  },
};
