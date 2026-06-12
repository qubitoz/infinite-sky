// Fully procedural WebAudio: engine hum, wind, ambient pad, UI cues.
export class AudioSys {
  constructor() { this.ok = false; }

  ensure() {
    if (this.ok) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // engine
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc.frequency.value = 42;
    this.engLP = ctx.createBiquadFilter();
    this.engLP.type = 'lowpass';
    this.engLP.frequency.value = 220;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc.connect(this.engLP).connect(this.engGain).connect(this.master);
    this.engOsc.start();

    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 30;
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.subOsc.connect(this.subGain).connect(this.master);
    this.subOsc.start();

    // wind (looped noise)
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    this.windBP = ctx.createBiquadFilter();
    this.windBP.type = 'bandpass';
    this.windBP.frequency.value = 400;
    this.windBP.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windBP).connect(this.windGain).connect(this.master);
    wind.start();

    // ambient pad
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    const padLP = ctx.createBiquadFilter();
    padLP.type = 'lowpass';
    padLP.frequency.value = 600;
    this.padGain.connect(padLP).connect(this.master);
    for (const f of [110, 138.59, 164.81, 220]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      o.connect(g).connect(this.padGain);
      o.start();
    }
    this.ok = true;
  }

  _to(param, target, dt, rate = 6) {
    param.value += (target - param.value) * Math.min(dt * rate, 1);
  }

  update(dt, s, atmoF) {
    if (!this.ok) return;
    const flying = s.mode === 'fly' || s.mode === 'landing';
    const thr = flying ? s.throttle : 0;
    const boost = flying && s.boosting ? 1 : 0;
    this._to(this.engOsc.frequency, 42 + thr * 60 + boost * 26 + s.pulseF * 130, dt);
    this._to(this.engLP.frequency, 180 + thr * 900 + s.pulseF * 1400, dt);
    this._to(this.engGain.gain, flying ? 0.035 + thr * 0.1 + boost * 0.05 + s.pulseF * 0.08 : 0, dt);
    this._to(this.subGain.gain, flying ? 0.04 + thr * 0.05 : 0, dt);
    const speedK = Math.min(s.speed / 260, 1);
    const windT = atmoF * (s.mode === 'walk' ? 0.05 : 0.04 + speedK * 0.14);
    this._to(this.windGain.gain, windT, dt);
    this._to(this.windBP.frequency, 280 + s.speed * 2.2, dt, 3);
    this._to(this.padGain.gain, 0.05 * (1 - atmoF * 0.75), dt, 2);
  }

  _env(type, freq, t0, dur, peak = 0.18, slide = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(slide, 1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  blip(freq = 880) {
    if (!this.ok) return;
    this._env('square', freq, this.ctx.currentTime, 0.12, 0.06);
  }

  jingle() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._env('sine', f, t + i * 0.13, 0.5, 0.1));
  }

  land() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._env('sine', 392, t, 0.3, 0.12);
    this._env('sine', 523.25, t + 0.16, 0.4, 0.12);
  }

  pulseUp() {
    if (!this.ok) return;
    this._env('sawtooth', 160, this.ctx.currentTime, 0.9, 0.1, 980);
  }

  pulseDown() {
    if (!this.ok) return;
    this._env('sawtooth', 900, this.ctx.currentTime, 0.7, 0.1, 140);
  }

  thud() {
    if (!this.ok) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.35);
  }

  // short melodic chirp; pitch pattern derived from the species hash so each
  // species has its own recognizable voice
  creatureCall(seedNum, vol = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const v = Math.max(0.1, Math.min(vol, 1));
    const base = 240 + (seedNum % 7) * 85 + ((seedNum >> 3) % 4) * 30;
    const notes = 2 + (seedNum % 3);
    for (let i = 0; i < notes; i++) {
      const f = base * (1 + (((seedNum >> (i * 4)) % 5) - 2) * 0.09);
      this._env('triangle', f, t + i * 0.15, 0.22, 0.05 * v);
    }
  }

  celebrate() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
      this._env('sine', f, t + i * 0.1, 0.55, 0.09);
      this._env('triangle', f / 2, t + i * 0.1, 0.4, 0.05);
    });
  }
}
