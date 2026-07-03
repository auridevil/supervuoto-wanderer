// AudioEngine — drives the visuals from live frequency analysis.
// Works with a loaded file, or a built-in generative ambient pad as fallback.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.freq = null;
    this.bands = { bass: 0, mid: 0, treble: 0, level: 0 };
    this.beat = 0;            // decays after each detected kick
    this._lastBass = 0;
    this.source = null;       // current node feeding the analyser
    this.audioEl = null;      // <audio> when a file is playing
    this.placeholderNodes = [];
    this.mode = "none";       // "file" | "placeholder"
  }

  _ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize); // time-domain waveform
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.analyser.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  async resume() {
    this._ensureCtx();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  // iOS/Safari only start an AudioContext from inside a user gesture, and often
  // need a real (silent) buffer to play before they'll unlock. Call this
  // SYNCHRONOUSLY from the tap handler (before any await), not after.
  unlock() {
    this._ensureCtx();
    if (this.ctx.state === "suspended") this.ctx.resume();
    try {
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch { /* already unlocked */ }
  }

  _disconnectSource() {
    this._stopPlaceholder();
    if (this.audioEl) { this.audioEl.pause(); this.audioEl = null; }
    if (this.source) { try { this.source.disconnect(); } catch {} this.source = null; }
  }

  // Stream an audio file (URL or File). Best for long 1h tracks — no full decode.
  async playFile(src) {
    this._ensureCtx();
    this._disconnectSource();
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.loop = true;
    el.playsInline = true;            // iOS: play inline, don't hand off to fullscreen
    el.setAttribute("playsinline", "");
    el.src = typeof src === "string" ? src : URL.createObjectURL(src);
    this.audioEl = el;
    this.source = this.ctx.createMediaElementSource(el);
    this.source.connect(this.analyser);
    this.mode = "file";
    await el.play();
  }

  // Generative ambient pad so the world breathes even with no track loaded.
  startPlaceholder() {
    this._ensureCtx();
    this._disconnectSource();
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0;
    out.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 4;

    // Slowly sweeping filter cutoff -> shifting mid/treble energy.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 600;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    // Detuned pad voices over a drifting chord.
    const freqs = [110, 164.81, 220, 277.18];
    const voices = [];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? "triangle" : "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      osc.connect(g).connect(filter);
      osc.start();
      voices.push(osc, g);
    });

    // Sub pulse ~ every 2s -> gives the analyser a bass "beat".
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 55;
    const subGain = ctx.createGain();
    subGain.gain.value = 0;
    sub.connect(subGain).connect(out);
    sub.start();
    const pulse = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    pulse.type = "sawtooth";       // sharper -> more percussive transients
    pulse.frequency.value = 1.1;   // ~1 kick per second
    pulseGain.gain.value = 0.7;
    pulse.connect(pulseGain).connect(subGain.gain);
    pulse.start();

    filter.connect(out);
    out.connect(this.analyser);

    this.placeholderNodes = [lfo, lfoGain, filter, sub, subGain, pulse, pulseGain, out, ...voices];
    this.mode = "placeholder";
  }

  _stopPlaceholder() {
    for (const n of this.placeholderNodes) {
      try { n.stop && n.stop(); } catch {}
      try { n.disconnect(); } catch {}
    }
    this.placeholderNodes = [];
  }

  // Call once per frame. Fills this.bands (0..1) and a decaying this.beat.
  update(dt) {
    if (!this.analyser) return this.bands;
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const avg = (loHz, hiHz) => {
      const lo = Math.max(1, Math.floor(loHz / binHz));
      const hi = Math.min(this.freq.length - 1, Math.ceil(hiHz / binHz));
      let s = 0;
      for (let i = lo; i <= hi; i++) s += this.freq[i];
      return s / (hi - lo + 1) / 255;
    };

    const k = 1 - Math.pow(0.001, dt); // frame-rate independent smoothing
    // Boost + clamp so even a quietly-mixed track drives strong visuals.
    const gain = 1.7;
    const target = {
      bass: Math.min(1, avg(20, 250) * gain),
      mid: Math.min(1, avg(250, 2000) * gain),
      treble: Math.min(1, avg(2000, 8000) * gain),
    };
    target.level = (target.bass + target.mid + target.treble) / 3;
    for (const key in target) {
      this.bands[key] += (target[key] - this.bands[key]) * k;
    }

    // Onset detection on the bass band -> beat impulse (sensitive).
    const rise = this.bands.bass - this._lastBass;
    if (rise > 0.025 && this.bands.bass > 0.3) this.beat = 1;
    this.beat *= Math.pow(0.02, dt); // decay
    this._lastBass = this.bands.bass;

    return this.bands;
  }

  // A soft bell for ring pickups, routed through the analyser so the world
  // "hears" it too. Steps walk up a pentatonic scale as the streak grows.
  chime(step = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const f = 392 * Math.pow(2, scale[step % scale.length] / 12);
    const t0 = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    g.connect(this.analyser);
    // Slightly inharmonic partials -> small glass bell.
    for (const [mul, amp] of [[1, 1], [2.01, 0.4], [2.99, 0.15]]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t0);
      o.stop(t0 + 1.2);
    }
  }

  // Playback position 0..1, drives the day/night arc.
  // File: real currentTime/duration. Generative pad: a virtual 3600s loop
  // keyed off the AudioContext clock so the sky still cycles with no track.
  progress() {
    if (this.mode === "file" && this.audioEl) {
      return (this.audioEl.currentTime / (this.audioEl.duration || 3600)) % 1;
    }
    if (this.ctx) {
      return (this.ctx.currentTime % 3600) / 3600;
    }
    return 0;
  }
}
