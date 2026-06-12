// Three-mode HUD radar drawn on a 2D canvas:
//  planet — local surface sweep: creatures, materials, ship parts, vendors
//  system — top-down map of the current solar system
//  galaxy — deep-space chart of neighbor systems; ←/→ select, ENTER jump
import { t } from './i18n.js';

const SZ = 290; // css px; backing store 2x

export class Radar {
  constructor(wrapEl, canvasEl, capEl) {
    this.wrap = wrapEl;
    this.cap = capEl;
    this.cv = canvasEl;
    this.cv.width = SZ * 2;
    this.cv.height = SZ * 2;
    this.ctx = canvasEl.getContext('2d');
    this.ctx.scale(2, 2);
    this.mode = 'off';
    this.sel = 0;
    this.sweep = 0;
  }

  cycle(onPlanet) {
    const order = onPlanet ? ['planet', 'system', 'galaxy', 'off'] : ['system', 'galaxy', 'off'];
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
    this.wrap.classList.toggle('on', this.mode !== 'off');
    this.wrap.classList.toggle('galaxy', this.mode === 'galaxy');
  }

  off() { this.mode = 'off'; this.wrap.classList.remove('on', 'galaxy'); }

  _frame(title) {
    const c = this.ctx;
    c.clearRect(0, 0, SZ, SZ);
    c.strokeStyle = 'rgba(120,190,240,.25)';
    c.fillStyle = 'rgba(140,210,255,.06)';
    const m = SZ / 2;
    for (const r of [0.33, 0.66, 1]) {
      c.beginPath();
      c.arc(m, m, (m - 12) * r, 0, Math.PI * 2);
      c.stroke();
    }
    c.beginPath(); c.moveTo(m, 12); c.lineTo(m, SZ - 12); c.stroke();
    c.beginPath(); c.moveTo(12, m); c.lineTo(SZ - 12, m); c.stroke();
    c.fillStyle = 'rgba(180,230,255,.9)';
    c.font = '700 11px Rajdhani';
    c.fillText(title, 10, 16);
  }

  dot(x, y, r, col, hollow = false) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    if (hollow) { c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1; }
    else { c.fillStyle = col; c.fill(); }
  }

  tri(x, y, ang, col, s = 6) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.7, s); c.lineTo(-s * 0.7, s); c.closePath();
    c.fillStyle = col; c.fill(); c.restore();
  }

  // ---------------------------------------------------------------- planet
  drawPlanet(d, dt) {
    this._frame(t('radar.planet'));
    const c = this.ctx, m = SZ / 2, R = m - 14;
    this.sweep += dt * 1.6;
    // sweep wedge
    c.save(); c.translate(m, m);
    const g = c.createConicGradient ? null : null;
    c.fillStyle = 'rgba(94,242,214,.10)';
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, this.sweep, this.sweep + 0.6); c.closePath(); c.fill();
    c.restore();
    const k = R / d.range;
    for (const e of d.ents) {
      let x = e.x * k, y = -e.y * k;
      const len = Math.hypot(x, y);
      const clamped = len > R - 4;
      if (clamped) { x *= (R - 6) / len; y *= (R - 6) / len; }
      const px = m + x, py = m + y;
      if (e.kind === 'creature') this.dot(px, py, 3, '#8aff9f', !e.disc);
      else if (e.kind === 'pickup') this.dot(px, py, 3, '#ffd97a');
      else if (e.kind === 'part') { this.dot(px, py, 4, '#ffb347'); this.dot(px, py, 7, '#ffb347', true); }
      else if (e.kind === 'wreck') { this.dot(px, py, 5, '#ff8a4a', true); this.dot(px, py, 2, '#ff8a4a'); }
      else if (e.kind === 'vendor') this.dot(px, py, 4, '#ff7ab8');
      else if (e.kind === 'ore') { this.dot(px, py, 3, '#ffd34d'); this.dot(px, py, 6, '#ffd34d', true); }
      else if (e.kind === 'ship') this.tri(px, py, Math.atan2(x, -y), '#7fd4ff', 6);
    }
    this.tri(m, m, 0, '#ffffff', 5); // you, facing up
    this.cap.textContent = `${t('radar.species')} ${d.speciesGot}/${d.speciesTotal} · ${d.planetName}`;
  }

  // ---------------------------------------------------------------- system
  drawSystem(d) {
    this._frame(t('radar.system'));
    const c = this.ctx, m = SZ / 2, R = m - 16;
    const k = R / d.maxOrbit;
    // belt
    if (d.belt) {
      c.strokeStyle = 'rgba(190,170,140,.35)';
      c.setLineDash([3, 4]);
      c.beginPath(); c.arc(m, m, d.belt * k, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    // sun
    this.dot(m, m, 5, d.sunCol);
    c.font = '9px Rajdhani';
    for (const p of d.planets) {
      const px = m + p.x * k, py = m + p.z * k;
      c.strokeStyle = 'rgba(140,200,255,.15)';
      c.beginPath(); c.arc(m, m, Math.hypot(p.x, p.z) * k, 0, Math.PI * 2); c.stroke();
      this.dot(px, py, 4, p.col, !p.disc);
      if (p.hazard) this.dot(px, py, 7, '#ff8a4a', true);
      c.fillStyle = 'rgba(215,236,255,.85)';
      c.fillText(p.name, px + 7, py + 3);
    }
    this.tri(m + d.ship.x * k, m + d.ship.z * k, d.ship.heading, '#ffffff', 5);
    this.cap.textContent = `${d.sysName}`;
  }

  // ---------------------------------------------------------------- galaxy
  drawGalaxy(d, dt) {
    this._frame(t('radar.galaxy'));
    const c = this.ctx, m = SZ / 2, R = m - 18;
    let maxR = 1;
    for (const s of d.systems) maxR = Math.max(maxR, Math.hypot(s.x, s.z));
    const k = R / (maxR * 1.08);
    this.sweep += dt;
    c.font = '9px Rajdhani';
    for (const s of d.systems) {
      const px = m + s.x * k, py = m + s.z * k;
      const col = s.idx === d.current ? '#5ef2d6' : s.visited ? '#8aff9f' : '#9fb9cf';
      this.dot(px, py, s.idx === d.current ? 4 : 3, col, !(s.visited || s.idx === d.current));
      if (s.idx === d.sel) {
        const pul = 7 + Math.sin(this.sweep * 5) * 2;
        this.dot(px, py, pul, '#ffd97a', true);
        c.fillStyle = '#ffd97a';
        c.fillText(s.name, px + 9, py + 3);
      }
    }
    const sel = d.systems[d.sel];
    const cur = d.systems[d.current];
    const dist = Math.hypot(sel.x - cur.x, sel.y - cur.y, sel.z - cur.z).toFixed(1);
    const tag = sel.idx === d.current ? t('radar.current') : sel.visited ? t('radar.visited') : '';
    this.cap.textContent = `${sel.name} · ${dist} LY ${tag ? '· ' + tag : ''} — ${t('radar.galaxyHint')}`;
  }

  draw(data, dt) {
    if (this.mode === 'planet' && data.planet) this.drawPlanet(data.planet, dt);
    else if (this.mode === 'system') this.drawSystem(data.system);
    else if (this.mode === 'galaxy') this.drawGalaxy(data.galaxy, dt);
  }
}
