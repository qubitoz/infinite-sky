// Touch controls: left virtual joystick (move / steer), right drag-pad for
// look/aim, context-sensitive hold/tap buttons, and galaxy-radar arrows.
// Everything funnels into the existing Input layer (keys + mouse deltas), so
// the game logic stays identical across desktop and touch.
import { t, onLang } from './i18n.js';

export const isTouch = () =>
  navigator.maxTouchPoints > 0
  || 'ontouchstart' in window
  || new URLSearchParams(location.search).has('touch');

const SETS = {
  fly: [
    ['thrup', 'KeyW', true, 'tb.thrUp'], ['thrdn', 'KeyS', true, 'tb.thrDn'],
    ['boost', 'ShiftLeft', true, 'tb.boost'], ['pulse', 'KeyJ', true, 'tb.pulse'],
    ['land', 'KeyL', false, 'tb.land'], ['scan', 'KeyC', false, 'tb.scan'],
    ['radar', 'KeyM', false, 'tb.radar'],
  ],
  landing: [],
  landed: [
    ['takeoff', 'Space', false, 'tb.takeoff'], ['exit', 'KeyF', false, 'tb.exit'],
    ['hangar', 'KeyG', false, 'tb.hangar'], ['radar', 'KeyM', false, 'tb.radar'],
  ],
  walk: [
    ['jet', 'Space', true, 'tb.jet'], ['run', 'ShiftLeft', true, 'tb.run'],
    ['collect', 'KeyE', false, 'tb.collect'], ['board', 'KeyF', false, 'tb.board'],
    ['scan', 'KeyC', false, 'tb.scan'], ['outfit', 'KeyO', false, 'tb.outfit'],
    ['trade', 'KeyT', false, 'tb.trade'], ['radar', 'KeyM', false, 'tb.radar'],
  ],
};

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.axes = { x: 0, y: 0 };
    this.held = new Set();
    this.mode = null;
    document.body.classList.add('touch');

    const hud = document.getElementById('hud');
    const ui = document.createElement('div');
    ui.id = 'touchui';
    ui.innerHTML = `
      <div id="lookpad"></div>
      <div id="joy"><div id="joynub"></div></div>
      <div id="tbtns"></div>`;
    hud.insertBefore(ui, hud.firstChild); // under panels/telemetry
    this.nub = ui.querySelector('#joynub');
    this.btnHost = ui.querySelector('#tbtns');

    // ---- joystick
    const joy = ui.querySelector('#joy');
    const joyAt = (e) => {
      const r = joy.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.axes.x = dx; this.axes.y = dy;
      this.nub.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
    };
    joy.addEventListener('pointerdown', (e) => {
      this.joyId = e.pointerId;
      try { joy.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      joyAt(e); e.preventDefault();
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) joyAt(e); });
    const joyEnd = (e) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.axes.x = 0; this.axes.y = 0;
      this.nub.style.transform = 'translate(0,0)';
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    // ---- look / steer pad (right side drag = mouse deltas)
    const lp = ui.querySelector('#lookpad');
    lp.addEventListener('pointerdown', (e) => {
      this.lookId = e.pointerId;
      this.lx = e.clientX; this.ly = e.clientY;
      try { lp.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      e.preventDefault();
    });
    lp.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.mdx += (e.clientX - this.lx) * 2.4;
      this.input.mdy += (e.clientY - this.ly) * 2.4;
      this.lx = e.clientX; this.ly = e.clientY;
    });
    const lookEnd = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    lp.addEventListener('pointerup', lookEnd);
    lp.addEventListener('pointercancel', lookEnd);

    // ---- galaxy radar buttons (live inside the radar panel)
    const rb = document.createElement('div');
    rb.id = 'radbtns';
    rb.innerHTML = `
      <button data-key="ArrowLeft">◀</button>
      <button data-key="Enter" id="rb-jump">★ GO</button>
      <button data-key="ArrowRight">▶</button>`;
    document.getElementById('radarwrap').appendChild(rb);
    rb.querySelectorAll('button').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        this.input.just.add(b.dataset.key);
      });
    });

    this.renderButtons('fly');
    onLang(() => { const m = this.mode; this.mode = null; this.renderButtons(m); });
  }

  renderButtons(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    // release any held keys from the previous layout
    for (const code of this.held) this.input.keys[code] = false;
    this.held.clear();
    this.btnHost.innerHTML = '';
    for (const [id, key, hold, label] of (SETS[mode] || [])) {
      const b = document.createElement('button');
      b.id = `tb-${id}`;
      b.textContent = t(label);
      if (hold) b.classList.add('hold');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        if (hold) { this.held.add(key); b.classList.add('on'); }
        else this.input.just.add(key);
      });
      const end = () => {
        if (hold) { this.held.delete(key); this.input.keys[key] = false; b.classList.remove('on'); }
      };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('pointerleave', end);
      this.btnHost.appendChild(b);
    }
  }

  // called once per frame from the main loop
  apply(dt, mode) {
    this.renderButtons(SETS[mode] ? mode : 'fly');
    for (const code of this.held) this.input.keys[code] = true;
    const { x, y } = this.axes;
    const k = this.input.keys;
    if (mode === 'walk') {
      k.KeyW = y < -0.25;
      k.KeyS = y > 0.25;
      k.KeyA = x < -0.3;
      k.KeyD = x > 0.3;
      if (Math.hypot(x, y) > 0.85) k.ShiftLeft = true;
    } else if (mode === 'fly' || mode === 'landing') {
      // joystick steers like the mouse
      this.input.mdx += x * 260 * dt;
      this.input.mdy += y * 260 * dt;
    }
  }
}
