/**
 * ProceduralAudio — every sound in the game, synthesised with WebAudio (no sound files).
 *
 *   graph      voices → [StereoPanner] → bus → DynamicsCompressor (limiter) → master → speakers
 *   sources    one shared 2 s white-noise buffer and one brown-noise buffer, made once
 *
 *   thud(I)    ground hit: sine 90→32 Hz pitch drop + a short low-passed noise "click"
 *   boom(I)    explosion: noise → waveshaper (distortion grows with I) → low-pass sweep
 *              3 kHz → 120 Hz, a sub-bass drop under it, and a crackle tail of random bursts
 *   splash(I)  band-passed noise swept up and down + rising sine "bubbles"
 *   pop(I)     firework: short bright noise burst + a high chirp
 *   crunch(I)  a limb coming off: two clipped noise ticks and a wet low blip
 *   sizzle     CONTINUOUS: high-passed noise with a jittering gain (re-entry plasma, burning paper)
 *   rumble     CONTINUOUS: brown noise, low-passed — engines; level follows thrust
 *
 * Browsers only start audio after a user gesture: call unlock() from a click/keydown.
 * Where WebAudio does not exist (tests, old browsers) every method is a silent no-op.
 */
import { safeKV } from '@/core/safeStorage';

type Ctx = AudioContext;
const KEY = 'rs.audio.muted';

export class ProceduralAudio {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private bus!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private loops: Partial<Record<'sizzle' | 'rumble', { gain: GainNode; filter: BiquadFilterNode }>> = {};
  muted = (() => { try { return safeKV.getItem(KEY) === '1'; } catch { return false; } })();

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /** The context, or null until the first gesture creates it (audioUnlock reads this) */
  get context(): AudioContext | null { return this.ctx; }

  /** Create the context (and its graph) without resuming it; throws where WebAudio is missing. audioUnlock resumes it inside the gesture. */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
      if (!AC) throw new Error('WebAudio unavailable');
      this.ctx = new AC();
      this.build();
    }
    return this.ctx;
  }

  /** Create / resume the context. Call from a user gesture. */
  unlock() {
    try { this.ensureContext(); } catch { return; }
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { safeKV.setItem(KEY, m ? '1' : '0'); } catch { /* session only */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private build() {
    const c = this.ctx!;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -14; lim.knee.value = 10; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.25;
    this.bus = c.createGain(); this.bus.gain.value = 1;
    this.bus.connect(lim).connect(this.master).connect(c.destination);
    const n = c.sampleRate * 2;
    this.white = c.createBuffer(1, n, c.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, n, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }

  /* ---------- building blocks ---------- */
  private out(pan: number): AudioNode {
    const c = this.ctx!;
    if (!c.createStereoPanner) return this.bus;
    const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.bus);
    return p;
  }
  private noise(buf: AudioBuffer, t: number, dur: number, loop = false): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource(); s.buffer = buf; s.loop = loop;
    s.start(t, Math.random() * 1.5); if (!loop) s.stop(t + dur + 0.05);
    return s;
  }
  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  private drop(t: number, f0: number, f1: number, dur: number, peak: number, dest: AudioNode, type: OscillatorType = 'sine') {
    const c = this.ctx!, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, peak, 0.004, dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  private distortion(k: number): WaveShaperNode {
    const ws = this.ctx!.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    ws.curve = curve; ws.oversample = '2x';
    return ws;
  }
  private can() { return !!this.ctx && !this.muted && this.ctx.state === 'running'; }

  /* ---------- one-shots ---------- */
  thud(I: number, pan = 0) {
    if (!this.can()) return;
    const c = this.ctx!, t = c.currentTime, o = this.out(pan);
    this.drop(t, 90 + 40 * (1 - I), 32, 0.35 + 0.5 * I, 0.6 + 0.4 * I, o);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260 + 400 * I;
    const g = this.env(t, 0.5 + 0.4 * I, 0.002, 0.08 + 0.12 * I);
    this.noise(this.white, t, 0.3).connect(lp).connect(g).connect(o);
  }

  boom(I: number, pan = 0) {
    if (!this.can()) return;
    const c = this.ctx!, t = c.currentTime, o = this.out(pan);
    const dur = 1.2 + 2.2 * I;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(3000 + 3000 * I, t); lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = this.env(t, 0.9, 0.006, dur);
    this.noise(this.white, t, dur).connect(this.distortion(40 + 400 * I)).connect(lp).connect(g).connect(o);
    this.drop(t, 70, 26, 0.6 + 0.9 * I, 0.9, o);                                   // sub
    // crackle tail: short random bursts through a high-pass
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const cg = c.createGain(); cg.gain.value = 0;
    for (let i = 0, tt = t + 0.15; i < 10 + 30 * I && tt < t + dur; i++, tt += 0.02 + Math.random() * 0.09) {
      cg.gain.setValueAtTime(0.25 * Math.random() * (1 - (tt - t) / dur), tt); cg.gain.setValueAtTime(0, tt + 0.012);
    }
    this.noise(this.white, t, dur).connect(hp).connect(cg).connect(o);
  }

  splash(I: number, pan = 0) {
    if (!this.can()) return;
    const c = this.ctx!, t = c.currentTime, o = this.out(pan);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.12); bp.frequency.exponentialRampToValueAtTime(600, t + 0.9 + I);
    this.noise(this.white, t, 1.2 + I).connect(bp).connect(this.env(t, 0.7, 0.01, 0.9 + I)).connect(o);
    this.drop(t, 80, 40, 0.3, 0.4 * (0.4 + I), o);
    for (let i = 0; i < 4 + 6 * I; i++) {                                          // bubbles
      const tt = t + 0.25 + Math.random() * (0.6 + I), f = 500 + Math.random() * 900;
      const bo = c.createOscillator(); bo.frequency.setValueAtTime(f, tt); bo.frequency.exponentialRampToValueAtTime(f * 1.9, tt + 0.05);
      bo.connect(this.env(tt, 0.08, 0.004, 0.05)).connect(o); bo.start(tt); bo.stop(tt + 0.08);
    }
  }

  pop(I: number, pan = 0) {
    if (!this.can()) return;
    const c = this.ctx!, t = c.currentTime, o = this.out(pan);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    this.noise(this.white, t, 0.25).connect(hp).connect(this.env(t, 0.5 + 0.3 * I, 0.002, 0.18)).connect(o);
    this.drop(t, 1800, 3400, 0.12, 0.12, o, 'triangle');
  }

  crunch(I: number, pan = 0) {
    if (!this.can()) return;
    const c = this.ctx!, t = c.currentTime, o = this.out(pan);
    for (const dt of [0, 0.045]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 800; bp.Q.value = 3;
      this.noise(this.white, t + dt, 0.06).connect(this.distortion(200)).connect(bp).connect(this.env(t + dt, 0.45 * (0.5 + I), 0.001, 0.05)).connect(o);
    }
    this.drop(t + 0.03, 220, 90, 0.12, 0.25, o, 'triangle');                      // the wet bit
  }

  /* ---------- continuous voices ---------- */
  private loop(name: 'sizzle' | 'rumble') {
    const c = this.ctx!;
    let L = this.loops[name];
    if (L) return L;
    const filter = c.createBiquadFilter(), gain = c.createGain();
    gain.gain.value = 0;
    if (name === 'sizzle') {
      filter.type = 'highpass'; filter.frequency.value = 4200; filter.Q.value = 0.5;
      // crackle: a fast square LFO wobbling a fixed 0.65 ± 0.35 stage (so level 0 stays silent)
      const lfo = c.createOscillator(), depth = c.createGain(), crackle = c.createGain();
      lfo.type = 'square'; lfo.frequency.value = 23; depth.gain.value = 0.35; crackle.gain.value = 0.65;
      lfo.connect(depth).connect(crackle.gain); lfo.start();
      this.noise(this.white, c.currentTime, 0, true).connect(crackle).connect(filter);
    } else {
      filter.type = 'lowpass'; filter.frequency.value = 180; filter.Q.value = 0.8;
      this.noise(this.brown, c.currentTime, 0, true).connect(filter);
    }
    filter.connect(gain).connect(this.bus);
    L = { gain, filter };
    this.loops[name] = L;
    return L;
  }

  /** Re-entry plasma / burning paper, 0–1 */
  sizzle(level: number) { this.setLoop('sizzle', level * 0.35, 4200 + 3000 * level); }
  /** Engine roar, 0–1 (thrust) */
  rumble(level: number) { this.setLoop('rumble', level * 0.55, 120 + 260 * level); }

  private setLoop(name: 'sizzle' | 'rumble', g: number, freq: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (g < 0.002 && !this.loops[name]) return;
    const L = this.loop(name), t = this.ctx.currentTime;
    L.gain.gain.setTargetAtTime(this.muted ? 0 : g, t, 0.08);
    L.filter.frequency.setTargetAtTime(freq, t, 0.1);
  }

  /** Silence the continuous voices (leaving the launch screen, relaunch) */
  quiet() { this.sizzle(0); this.rumble(0); }
}

/** The game's one synth (an AudioContext is a heavy object; share it across phases) */
export const sfx = new ProceduralAudio();
