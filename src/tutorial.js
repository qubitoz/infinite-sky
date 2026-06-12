// First-flight tutorial: six guided steps for a brand-new explorer, each one
// completed by simply playing (no extra UI to learn). Finishing grants a gift
// outfit piece. Tapping the banner skips it. Strings adapt to touch controls.
import { t, onLang } from './i18n.js';

const STEPS = [
  { key: 'throttle', done: (c) => c.speed > 80 },
  { key: 'atmo', done: (c) => c.atmoF > 0.3 },
  { key: 'land', done: (c) => c.mode === 'landed' || c.mode === 'walk' },
  { key: 'walk', done: (c) => c.mode === 'walk' },
  { key: 'scan', done: (c) => c.fauna > 0 },
  { key: 'collect', done: (c) => c.mats > 0 },
];

export class Tutorial {
  constructor(touchMode) {
    this.touch = touchMode;
    this.step = -1;
    this.skipped = false;
    this.el = document.createElement('div');
    this.el.id = 'tutorial';
    document.getElementById('hud').appendChild(this.el);
    this.el.addEventListener('click', () => {
      if (this.active()) { this.step = STEPS.length; this.skipped = true; }
    });
    onLang(() => { if (this.active()) this.render(); });
  }

  start() {
    this.step = 0;
    this.render();
  }

  active() { return this.step >= 0 && this.step < STEPS.length; }

  render() {
    if (!this.active()) { this.el.classList.remove('on'); return; }
    const s = STEPS[this.step];
    const touchKey = `tut.${s.key}T`;
    const text = this.touch && t(touchKey) !== touchKey ? t(touchKey) : t(`tut.${s.key}`);
    this.el.innerHTML = `
      <div class="tu-head">${t('tut.title')} · ${this.step + 1}/${STEPS.length}</div>
      <div class="tu-text">${text}</div>
      <div class="tu-skip">${t('tut.skip')}</div>`;
    this.el.classList.add('on');
  }

  // returns 'step' | 'done' | 'skip' | null
  update(ctx) {
    if (this.skipped) { this.skipped = false; this.render(); return 'skip'; }
    if (!this.active()) return null;
    if (STEPS[this.step].done(ctx)) {
      this.step++;
      this.render();
      return this.step >= STEPS.length ? 'done' : 'step';
    }
    return null;
  }
}
