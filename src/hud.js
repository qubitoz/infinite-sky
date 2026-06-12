// DOM-based HUD: telemetry, planet info card, toasts, world markers, help,
// species catalog, outfit/hangar/trade panels and celebration confetti.
// All visible text routes through i18n (t / pick) and re-renders on language
// switch via refreshLang().
import * as THREE from 'three';
import { MATERIALS, PIECES } from './gear.js';
import { SHIPS } from './ship.js';
import { t, pick } from './i18n.js';

const _v = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const HELP_KEYS = [
  ['MOUSE', 'help.mouse'], ['W / S', 'help.ws'], ['A / D', 'help.ad'],
  ['SHIFT', 'help.shift'], ['J / TAB', 'help.j'], ['SPACE', 'help.space'],
  ['L', 'help.l'], ['F', 'help.f'], ['C', 'help.c'], ['B', 'help.b'],
  ['E', 'help.e'], ['O', 'help.o'], ['M', 'help.m'], ['G', 'help.g'],
  ['←/→ + ENTER', 'help.arrows'], ['X', 'help.x'], ['N', 'help.n'], ['H', 'help.h'],
];

export class HUD {
  constructor(camera) {
    this.camera = camera;
    const $ = (id) => document.getElementById(id);
    this.els = {
      hud: $('hud'), speed: $('speed'), alt: $('altline'),
      thr: $('thr'), thrv: $('thrv'), bst: $('bst'), pls: $('pls'),
      sysname: $('sysname'), worlds: $('worlds'), species: $('species'), toasts: $('toasts'),
      pcard: $('pcard'), hint: $('hint'), help: $('help'), catalog: $('catalog'),
      outfit: $('outfit'), confetti: $('confetti'), hangar: $('hangar'), trade: $('trade'),
      lblthr: $('lblthr'), lblbst: $('lblbst'), lblpls: $('lblpls'), loadtxt: $('loading'),
      markers: $('markers'), scanring: $('scanring'), loading: $('loading'),
    };
    this.catalogOn = false;
    this.outfitOn = false;
    this.hangarOn = false;
    this.tradeOn = false;
    this.markerPool = [];
    this.cardKey = null;
    this.helpOn = false;
    this._sys = ['', ''];
    this._worlds = [0, 0];
    this._species = [0, 0];
    this._catalogArgs = null;
    this._outfitInv = null;
    this._hangarArgs = null;
    this._tradeArgs = null;
    this.refreshLang();
    this.setMode('fly');

    // tap/click support for panels: tapping a numbered row acts like its
    // digit key; tapping elsewhere on the panel closes it
    this.onDigit = null;
    this.onPanelClose = null;
    for (const [el, key] of [
      [this.els.outfit, 'KeyO'], [this.els.hangar, 'KeyG'],
      [this.els.trade, 'KeyT'], [this.els.catalog, 'KeyB'],
    ]) {
      el.addEventListener('click', (e) => {
        const row = e.target.closest('.piece');
        const n = row ? parseInt(row.querySelector('b')?.textContent, 10) : NaN;
        if (n >= 1 && n <= 9) this.onDigit?.(n);
        else this.onPanelClose?.(key);
      });
    }
  }

  refreshLang() {
    const rows = this.els.help.querySelector('.rows');
    rows.innerHTML = HELP_KEYS.map(([k, key]) => `<div class="hrow"><b>${k}</b><span>${t(key)}</span></div>`).join('');
    this.els.help.querySelector('h3').textContent = t('help.title');
    this.els.lblthr.textContent = t('tel.throttle');
    this.els.lblbst.textContent = t('tel.boost');
    this.els.lblpls.textContent = t('tel.pulse');
    this.els.loadtxt.textContent = t('ui.loading');
    if (this._sys[0]) this.setSystem(this._sys[0], this._sys[1]);
    this.setWorlds(this._worlds[0], this._worlds[1]);
    this.setSpecies(this._species[0], this._species[1]);
    this.cardKey = null;
    if (this.mode) this.setMode(this.mode);
    if (this.catalogOn && this._catalogArgs) { this.catalogOn = false; this.toggleCatalog(...this._catalogArgs); }
    if (this.outfitOn && this._outfitInv) this.renderOutfit(this._outfitInv);
    if (this.hangarOn && this._hangarArgs) this.renderHangar(...this._hangarArgs);
    if (this.tradeOn && this._tradeArgs) this.renderTrade(...this._tradeArgs);
  }

  closePanels() {
    this.catalogOn = false; this.els.catalog.classList.remove('on');
    this.outfitOn = false; this.els.outfit.classList.remove('on');
    this.hangarOn = false; this.els.hangar.classList.remove('on');
    this.tradeOn = false; this.els.trade.classList.remove('on');
  }

  show() { this.els.hud.classList.add('on'); }

  setSystem(name, seed) {
    this._sys = [name, seed];
    this.els.sysname.textContent = `${name} · ${t('ui.seed')} ${seed}`;
  }

  setWorlds(n, total) {
    this._worlds = [n, total];
    this.els.worlds.textContent = `${n}/${total} ${t('top.worlds')}`;
  }

  setSpecies(n, total) {
    this._species = [n, total];
    this.els.species.textContent = `${n}/${total} ${t('top.species')}`;
  }

  setMode(m) {
    this.mode = m;
    this.els.hint.innerHTML = t(`hint.${m}`) || '';
    document.body.classList.toggle('walking', m === 'walk');
  }

  toast(main, sub = '') {
    const div = document.createElement('div');
    div.className = 'toast panel';
    div.innerHTML = `<div class="t-main">${main}</div>${sub ? `<div class="t-sub">${sub}</div>` : ''}`;
    this.els.toasts.appendChild(div);
    while (this.els.toasts.children.length > 3) this.els.toasts.firstChild.remove();
    setTimeout(() => div.remove(), 4700);
  }

  scanFx() {
    const r = this.els.scanring;
    r.classList.remove('go');
    void r.offsetWidth;
    r.classList.add('go');
  }

  toggleHelp() {
    this.helpOn = !this.helpOn;
    this.els.help.classList.toggle('on', this.helpOn);
  }

  setLoading(on) { this.els.loading.classList.toggle('on', on); }

  showCard(planet, faunaGot = 0) {
    const d = planet.def;
    const key = `${d.id}:${faunaGot}`;
    if (this.cardKey !== key) {
      this.cardKey = key;
      const s = d.stats;
      const faunaVal = planet.species && planet.species.length
        ? `${pick(d.biome.fauna)} · ${faunaGot}/${planet.species.length} ${t('card.logged')}`
        : pick(d.biome.fauna);
      const rows = [
        [t('card.weather'), pick(s.weather)],
        [t('card.gravity'), `${s.gravity} M/S²`],
        [t('card.temp'), `${s.temp > 0 ? '+' : ''}${s.temp}°C`],
        [t('card.flora'), pick(d.biome.flora)],
        [t('card.fauna'), faunaVal],
        [t('card.sentinels'), pick(s.sentinels)],
      ];
      if (d.biome.hazard) rows.push([t('card.hazard'), `⚠ ${t('haz.' + d.biome.hazard)}`]);
      this.els.pcard.querySelector('.pc-name').textContent = d.name;
      this.els.pcard.querySelector('.pc-type').textContent = pick(d.biome.label);
      this.els.pcard.querySelector('.rows').innerHTML =
        rows.map(([k, v]) => `<div class="row"><b>${k}</b><span>${v}</span></div>`).join('');
    }
    this.els.pcard.querySelector('.pc-disc').textContent =
      planet.discovered ? t('card.discovered') : t('card.uncharted');
    this.els.pcard.querySelector('.pc-hint').textContent =
      this.mode === 'fly' ? t('card.hint') : '';
    this.els.pcard.classList.add('on');
  }

  hideCard() { this.els.pcard.classList.remove('on'); this.cardKey = null; }

  toggleCatalog(species, discovered, planets, firstBy = new Map()) {
    const turnOn = !this.catalogOn;
    this.closePanels();
    this.catalogOn = turnOn;
    this._catalogArgs = [species, discovered, planets, firstBy];
    this.els.catalog.classList.toggle('on', turnOn);
    if (!turnOn) return;
    let found = 0;
    for (const s of species) if (discovered.has(s.id)) found++;
    let html = `<h3>${t('cat.title')} · ${found}/${species.length}</h3>`;
    for (const p of planets) {
      const list = p.species || [];
      const got = list.filter((s) => discovered.has(s.id)).length;
      const status = !list.length ? t('cat.nofauna')
        : got === list.length ? `★ ${got}/${list.length} ${t('cat.complete')}` : `${got}/${list.length}`;
      html += `<div class="cat-planet"><b>${p.def.name}</b><span>${status}</span></div>`;
      if (!list.length) continue;
      html += '<div class="cat-row">';
      for (const s of list) {
        if (discovered.has(s.id)) {
          const first = firstBy.get(s.id);
          html += `<div class="sp-card"><span class="sw" style="background:#${s.body.getHexString()}"></span><span class="nm">${s.name}</span><div class="meta">${s.archetype.toUpperCase()} · <span class="r-${s.rarity}">${t('rar.' + s.rarity)}</span>${first ? ` · ${t('cat.first')} ${first}` : ''}</div></div>`;
        } else {
          html += `<div class="sp-card unknown"><span class="sw"></span><span class="nm">???</span><div class="meta">${t('cat.unknown')} · <span class="r-${s.rarity}">${t('rar.' + s.rarity)}</span></div></div>`;
        }
      }
      html += '</div>';
    }
    this.els.catalog.innerHTML = html;
  }

  toggleOutfit(inv) {
    const turnOn = !this.outfitOn;
    this.closePanels();
    this.outfitOn = turnOn;
    this.els.outfit.classList.toggle('on', turnOn);
    if (turnOn) this.renderOutfit(inv);
  }

  renderOutfit(inv) {
    this._outfitInv = inv;
    let html = `<h3>${t('fit.title')}</h3><div class="mats">`;
    for (const [k, m] of Object.entries(MATERIALS)) {
      const c = inv.count(k);
      html += `<span class="matchip${c ? '' : ' dim'}"><i style="background:${m.color}"></i>${pick(m.name)} × ${c}</span>`;
    }
    html += '</div><div class="pieces">';
    const unlocked = inv.unlockedList();
    for (const p of unlocked) {
      const idx = unlocked.indexOf(p) + 1;
      const eq = inv.equipped[p.slot] === p.id;
      html += `<div class="piece${eq ? ' eq' : ''}"><b>${idx}</b> ${pick(p.name)} <span>${t('slot.' + p.slot)}${eq ? ' · ' + t('fit.wearing') : ''}</span></div>`;
    }
    for (const p of PIECES) {
      if (!inv.unlocked(p)) {
        html += `<div class="piece locked"><b>·</b> ${pick(p.name)} <span>${inv.count(p.mat)}/${p.need} ${pick(MATERIALS[p.mat].name)}</span></div>`;
      }
    }
    html += `</div><div class="o-hint">${t('fit.hint')}</div>`;
    this.els.outfit.innerHTML = html;
  }

  toggleHangar(owned, active) {
    const turnOn = !this.hangarOn;
    this.closePanels();
    this.hangarOn = turnOn;
    this.els.hangar.classList.toggle('on', turnOn);
    if (turnOn) this.renderHangar(owned, active);
  }

  renderHangar(owned, active) {
    this._hangarArgs = [owned, active];
    let html = `<h3>${t('hangar.title')}</h3><div class="pieces">`;
    owned.forEach((key, i) => {
      const s = SHIPS[key];
      const eq = key === active;
      const resist = s.resist ? `${t('hangar.shield')}: ${t('haz.' + s.resist)}` : `${t('hangar.shield')}: ${t('hangar.none')}`;
      html += `<div class="piece${eq ? ' eq' : ''}"><b>${i + 1}</b> <i class="sw" style="background:${s.hull};display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px"></i>${pick(s.name)} <span>${resist}${eq ? ' · ' + t('hangar.active') : ''}</span></div>`;
    });
    html += `</div><div class="o-hint">${t('hangar.hint')}</div>`;
    this.els.hangar.innerHTML = html;
  }

  toggleTrade(piece, inv) {
    const turnOn = !this.tradeOn;
    this.closePanels();
    this.tradeOn = turnOn;
    this.els.trade.classList.toggle('on', turnOn);
    if (turnOn) this.renderTrade(piece, inv);
  }

  renderTrade(piece, inv) {
    this._tradeArgs = [piece, inv];
    const owned = inv.ownsVendor(piece.id);
    const cost = Object.entries(piece.cost)
      .map(([m, n]) => `${n} × ${pick(MATERIALS[m].name)} (${inv.count(m)})`)
      .join(' · ');
    let html = `<h3>${t('trade.title')}</h3><div class="pieces">`;
    html += `<div class="piece${owned ? ' eq' : ''}"><b>1</b> ${pick(piece.name)} <span>${owned ? t('trade.owned') : `${t('trade.cost')}: ${cost}`}</span></div>`;
    html += `</div><div class="o-hint">${t('trade.hint')}</div>`;
    this.els.trade.innerHTML = html;
  }

  celebrate() {
    const host = this.els.confetti;
    const colors = ['#5ef2d6', '#ffd97a', '#ff7ab8', '#7fc4ff', '#8aff6a'];
    for (let i = 0; i < 44; i++) {
      const d = document.createElement('i');
      d.style.left = `${Math.random() * 100}%`;
      d.style.background = colors[i % colors.length];
      d.style.animationDelay = `${Math.random() * 0.6}s`;
      d.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      host.appendChild(d);
      setTimeout(() => d.remove(), 3600);
    }
  }

  fmtDist(d) {
    if (d < 1000) return `${d | 0} U`;
    if (d < 1e6) return `${(d / 1000).toFixed(1)} KU`;
    return `${(d / 1e6).toFixed(2)} MU`;
  }

  update(state, markers) {
    const s = state.speed;
    this.els.speed.innerHTML = s >= 1000
      ? `${(s / 1000).toFixed(1)}<small> KU/S</small>`
      : `${s | 0}<small> U/S</small>`;
    this.els.alt.textContent = (state.alt != null && state.alt < 2e5)
      ? `${t('tel.alt')} ${this.fmtDist(Math.max(state.alt, 0))}` : `${t('tel.alt')} —`;
    this.els.thr.style.width = `${state.throttle * 100}%`;
    this.els.thrv.textContent = `${(state.throttle * 100) | 0}%`;
    this.els.bst.style.width = `${(state.mode === 'walk' ? state.fuel : state.boostAmt) * 100}%`;
    this.els.pls.style.width = `${state.pulseF * 100}%`;

    // markers
    while (this.markerPool.length < markers.length) {
      const div = document.createElement('div');
      div.className = 'mk';
      div.innerHTML = '<div class="d"></div><div class="nm"></div><div class="ds"></div>';
      this.els.markers.appendChild(div);
      this.markerPool.push(div);
    }
    _fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < this.markerPool.length; i++) {
      const div = this.markerPool[i];
      const mk = markers[i];
      if (!mk) { div.style.display = 'none'; continue; }
      _v.copy(mk.pos).sub(this.camera.position);
      const dist = _v.length();
      let off = _v.dot(_fwd) <= 0;
      let x = 0, y = 0;
      if (!off) {
        _v.copy(mk.pos).project(this.camera);
        x = (_v.x * 0.5 + 0.5) * W;
        y = (-_v.y * 0.5 + 0.5) * H;
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) off = true;
      }
      if (off) {
        if (!mk.clamp) { div.style.display = 'none'; continue; }
        // pin to the screen edge, pointing toward the target
        _v.copy(mk.pos).applyMatrix4(this.camera.matrixWorldInverse);
        let dx = _v.x, dy = -_v.y;
        if (_v.z > 0) { dx = -dx; dy = -dy; }
        const len = Math.hypot(dx, dy) || 1;
        x = W / 2 + (dx / len) * (W / 2 - 90);
        y = H / 2 + (dy / len) * (H / 2 - 90);
      }
      div.style.display = '';
      div.className = `mk${mk.discovered ? ' disc' : ''}${mk.kind === 'star' ? ' star' : ''}${mk.kind === 'creature' ? ' creature' : ''}`;
      div.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
      div.children[1].textContent = mk.name;
      div.children[2].textContent = `${mk.sub ? mk.sub + ' · ' : ''}${this.fmtDist(dist)}`;
    }
  }
}
