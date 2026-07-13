// AudioEngine — drives the visuals from live frequency analysis.
// Works with a loaded file, or a built-in generative ambient pad as fallback.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.freq = null;
    // Five perceptual bands (0..1) + overall level. sub/air are new so different
    // elements can react to different frequencies instead of everything tracking bass.
    this.bands = { sub: 0, bass: 0, mid: 0, treble: 0, air: 0, level: 0 };
    this.beat = 0;            // decays after each detected kick (low-flux onset)
    this.hat = 0;             // decays after each detected hat/snare (high-flux onset)
    this._agcMax = 0;         // rolling max loudness for adaptive gain
    this._prevFreq = null;    // previous FFT frame, for spectral-flux onsets
    this._fluxLowAvg = 0;     // rolling baselines the onsets are compared against
    this._fluxHighAvg = 0;
    this.source = null;       // current node feeding the analyser
    this.audioEl = null;      // <audio> when a file is playing
    this.placeholderNodes = [];
    this.mode = "none";       // "file" | "placeholder"
    this.chimeVolume = 0.18;  // 0..1 ring-pickup bell volume (main.js binds the setting)
  }

  _ensureCtx() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    // Lower than the old 0.8 so transients survive the FFT — our own attack/
    // release envelope (in update) does the shaping instead of the analyser.
    this.analyser.smoothingTimeConstant = 0.6;
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

  // iOS/Safari only start an AudioContext from inside a user gesture, and — the
  // big one — route Web Audio to the *ringer* channel, which the hardware
  // silent switch mutes. Keeping a silent HTMLAudioElement looping flips iOS
  // into "media playback" mode so the whole graph plays through the media
  // channel instead, ignoring the switch (the unmute trick Howler/Tone use).
  // Call this SYNCHRONOUSLY from the tap handler (before any await).
  unlock() {
    this._ensureCtx();
    if (this.ctx.state === "suspended") this.ctx.resume();
    // Silent buffer nudge (helps some browsers actually leave "suspended").
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch { /* already unlocked */ }
    // Silent looping media element -> media channel -> bypasses the mute switch.
    try {
      if (!this._silentEl) {
        const el = new Audio(this._silentWavUrl());
        el.loop = true;
        el.playsInline = true;
        el.setAttribute("playsinline", "");
        el.volume = 0.001; // effectively silent, but a nonzero media stream
        this._silentEl = el;
      }
      const p = this._silentEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch { /* ignore */ }
  }

  // A tiny silent 16-bit PCM WAV as an object URL (built once), for the unmute
  // element above — avoids shipping a big base64 blob.
  _silentWavUrl() {
    if (this._silentUrl) return this._silentUrl;
    const rate = 8000, n = rate * 0.5; // 0.5s of silence, looped
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const s = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
    s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    s(36, "data"); v.setUint32(40, n * 2, true); // samples already zero = silence
    this._silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    return this._silentUrl;
  }

  // Cheap periodic nudge (call on touch / visibility): resume the context and
  // make sure the silent unmute element is still playing after any interruption.
  keepAlive() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    if (this._silentEl && this._silentEl.paused) {
      const p = this._silentEl.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }

  _disconnectSource() {
    this._stopPlaceholder();
    if (this.audioEl) { this.audioEl.pause(); this.audioEl = null; }
    if (this.source) { try { this.source.disconnect(); } catch {} this.source = null; }
  }

  // Stream an audio file (URL or File). Best for long 1h tracks — no full decode.
  // Options:
  //   crossOrigin: "anonymous" routes the audio through the analyser so the
  //     world reacts — but the host MUST send CORS headers, else it errors.
  //   analyse:false plays the element directly (no Web Audio), for hosts that
  //     serve audio but no CORS: you still hear it, visuals just don't react.
  // Rejects on media/network error (or a load stall) so callers can fall back.
  async playFile(src, { crossOrigin = "anonymous", analyse = true } = {}) {
    this._ensureCtx();
    this._disconnectSource();
    const el = new Audio();
    if (crossOrigin) el.crossOrigin = crossOrigin;
    el.loop = true;
    el.playsInline = true;            // iOS: play inline, don't hand off to fullscreen
    el.setAttribute("playsinline", "");
    el.preload = "auto";
    el.src = typeof src === "string" ? src : URL.createObjectURL(src);
    this.audioEl = el;
    if (analyse) {
      // MediaElementSource redirects the element's output into the graph.
      this.source = this.ctx.createMediaElementSource(el);
      this.source.connect(this.analyser);
    }
    this.mode = "file";

    await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, arg) => { if (!settled) { settled = true; clearTimeout(timer); fn(arg); } };
      const timer = setTimeout(() => done(reject, new Error("load stalled")), 20000);
      el.addEventListener("canplay", () => done(resolve), { once: true });
      el.addEventListener("error", () => done(reject, new Error("media error " + (el.error && el.error.code))), { once: true });
      el.play().then(() => done(resolve)).catch((e) => done(reject, e));
    });
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

  // Call once per frame. Fills this.bands (0..1) plus decaying this.beat/this.hat.
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

    // Raw per-band energy (0..1), pre-gain. Five bands so visuals can react to
    // distinct parts of the spectrum instead of all following the bass.
    const raw = {
      sub: avg(20, 80),
      bass: avg(80, 250),
      mid: avg(250, 2000),
      treble: avg(2000, 8000),
      air: avg(8000, 16000),
    };
    const rawLevel = (raw.sub * 0.6 + raw.bass + raw.mid + raw.treble + raw.air * 0.6) / 4.2;

    // --- Adaptive gain (AGC) ---
    // Track a slowly-decaying max loudness and scale so the loudest recent moment
    // maps to ~0.9. Quiet mixes get lifted, hot masters get tamed, and because all
    // bands share one gain their relative dynamics are preserved.
    this._agcMax = Math.max(rawLevel, this._agcMax * (1 - dt * 0.05)); // ~20 s memory
    const gain = 0.9 / Math.max(this._agcMax, 0.06);                    // capped by the floor

    // --- Attack / release envelopes ---
    // Snap UP on a transient (punch), fall SLOWLY (graceful decay). This is the
    // core fix for weak reactivity: symmetric smoothing used to kill every hit.
    const attack = Math.min(1, dt * 30);
    const release = Math.min(1, dt * 4.5);
    const env = (cur, target) => cur + (target - cur) * (target > cur ? attack : release);
    const b = this.bands;
    for (const key in raw) b[key] = env(b[key], Math.min(1, raw[key] * gain));
    b.level = env(b.level, Math.min(1, rawLevel * gain));

    // --- Spectral-flux onset detection (kick + hat) ---
    // The summed positive bin-to-bin rise in a band = newly-arrived energy = an
    // onset. Compared against a rolling baseline so it adapts to the track rather
    // than a fixed cutoff, and (being rise-based) it won't retrigger on a sustained
    // note — only on the attack.
    const prev = this._prevFreq || (this._prevFreq = new Uint8Array(this.freq.length));
    const flux = (loHz, hiHz) => {
      const lo = Math.max(1, Math.floor(loHz / binHz));
      const hi = Math.min(this.freq.length - 1, Math.ceil(hiHz / binHz));
      let s = 0;
      for (let i = lo; i <= hi; i++) { const d = this.freq[i] - prev[i]; if (d > 0) s += d; }
      return s / (hi - lo + 1) / 255;
    };
    const fluxLow = flux(40, 180);      // kick / low drum
    const fluxHigh = flux(4000, 11000); // hats / snare snap
    const fk = Math.min(1, dt * 3);     // baseline tracking rate
    this._fluxLowAvg += (fluxLow - this._fluxLowAvg) * fk;
    this._fluxHighAvg += (fluxHigh - this._fluxHighAvg) * fk;
    prev.set(this.freq);

    if (fluxLow > this._fluxLowAvg * 1.6 + 0.006 && b.bass > 0.12) this.beat = 1;
    if (fluxHigh > this._fluxHighAvg * 1.8 + 0.004) this.hat = 1;
    this.beat *= Math.pow(0.02, dt); // decay
    this.hat *= Math.pow(0.02, dt);

    return this.bands;
  }

  // A small meditation bell for ring pickups, routed through the analyser so
  // the world "hears" it too. Steps walk gently up a pentatonic scale as the
  // streak grows. Volume follows this.chimeVolume (0..1, quiet by default).
  chime(step = 0) {
    if (!this.ctx || this.chimeVolume <= 0) return;
    const ctx = this.ctx;
    const scale = [0, 2, 4, 7, 9, 12]; // major pentatonic — calm, consonant
    const f = 523.25 * Math.pow(2, scale[step % scale.length] / 12); // small bright bell
    const t0 = ctx.currentTime;
    const peak = 0.4 * this.chimeVolume; // default 0.3 -> ~0.12, gentle

    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.analyser);

    // Real bells are inharmonic: partials at non-integer ratios, each with its
    // own decay (higher partials quieter and shorter). Two voices per partial,
    // a few cents apart, give the slow shimmering beat of a struck bowl.
    const partials = [
      { r: 1.0,  a: 1.0,  d: 3.4 },
      { r: 2.76, a: 0.50, d: 2.4 },
      { r: 5.40, a: 0.22, d: 1.5 },
      { r: 8.93, a: 0.09, d: 0.9 },
    ];
    for (const p of partials) {
      for (const cents of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * p.r * Math.pow(2, cents / 1200);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak * p.a * 0.5, t0 + 0.006); // soft strike
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.d);             // long decay
        o.connect(g).connect(out);
        o.start(t0);
        o.stop(t0 + p.d + 0.1);
      }
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
