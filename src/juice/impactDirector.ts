/**
 * ImpactDirector — turns physics events into "game feel" (Phase J1).
 *
 * Pure logic: no DOM, no canvas, no audio. Every impact goes in through ONE call; out come
 *
 *   time     timeScale(now): 0 during hit-stop, 0.25 during slow-mo, eased back to 1
 *   camera   camera(now): screen offset (px) + zoom from a trauma model
 *              shake  = trauma² · A · (sum of incommensurate sines)  — smooth, not white noise
 *              kick   = damped spring, impulse OPPOSITE to the impact velocity
 *              punch  = brief zoom-in that decays
 *   cues     drain(): FX and audio cues for the renderer and the synth to play
 *
 * Energy → intensity on a log scale (1 kJ → 0, 1 GJ → 1), so a lantern bump, a Bang Fai and
 * a 30 t booster all land somewhere sensible.
 */

export type ImpactKind = 'ground' | 'water' | 'explosion' | 'firework' | 'limb' | 'burnup';

export interface Impact {
  kind: ImpactKind;
  /** World position (m, flat local frame: x = ground distance, y = altitude) */
  x: number; y: number;
  /** Velocity at the moment of impact (m/s, local frame) — direction of the hit */
  vx: number; vy: number;
  /** Kinetic (or explosive) energy, J */
  energy: number;
  /** Rough size of the thing (m) */
  size: number;
  /** The main vehicle (gets the full treatment) or debris */
  hero: boolean;
}

export interface FxCue { kind: ImpactKind; x: number; y: number; vx: number; vy: number; size: number; intensity: number }
export interface AudioCue { kind: 'thud' | 'boom' | 'splash' | 'pop' | 'crunch' | 'sizzle'; intensity: number; x: number; y: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 1 kJ → 0 … 1 GJ → 1 */
export const intensityOf = (energyJ: number) => clamp((Math.log10(Math.max(1, energyJ)) - 3) / 6, 0, 1);
/** Hit-stop length: 60 ms for a knock, 120 ms for a disaster */
export const hitstopMs = (energyJ: number) => 60 + 60 * intensityOf(energyJ);

/**
 * Auto-warp drop: will we hit the ground within `leadReal` seconds of REAL time at this warp?
 * Ballistic estimate with gravity only (drag makes the real impact later — erring early is fine).
 */
export function impactSoon(altAGL: number, vUp: number, warp: number, leadReal = 1.5, g = 9.81): { soon: boolean; tSim: number; vImpact: number } {
  if (altAGL <= 0) return { soon: false, tSim: 0, vImpact: 0 };
  const tSim = (vUp + Math.sqrt(vUp * vUp + 2 * g * altAGL)) / g;
  const vImpact = Math.sqrt(vUp * vUp + 2 * g * altAGL);
  return { soon: tSim / Math.max(1, warp) < leadReal, tSim, vImpact };
}

export class ImpactDirector {
  /** Hit-stop and slow-motion windows (ms, performance.now clock) */
  private stopUntil = 0;
  private slowUntil = 0;
  private slowFrom = 0;
  /** Camera: trauma 0–1, kick spring (px), zoom punch */
  trauma = 0;
  private kx = 0; private ky = 0; private kvx = 0; private kvy = 0;
  private punch = 0;
  private t = 0;
  private fx: FxCue[] = [];
  private audio: AudioCue[] = [];
  /** Slow-motion speed and length */
  readonly slow = { scale: 0.25, ms: 600 };

  /** The single entry point: something hit something */
  impact(i: Impact, now: number) {
    const I = intensityOf(i.energy);
    const big = i.kind === 'explosion' || i.kind === 'ground' || i.kind === 'water';
    // time: hit-stop for anything with weight; slow-mo when the hero vehicle (or a big blast) goes
    if (I > 0.08 && i.kind !== 'firework' && i.kind !== 'limb') {
      this.stopUntil = Math.max(this.stopUntil, now + hitstopMs(i.energy) * (i.hero ? 1 : 0.6));
      if (i.hero || I > 0.5) { this.slowFrom = this.stopUntil; this.slowUntil = Math.max(this.slowUntil, this.stopUntil + this.slow.ms); }
    }
    // camera
    const weight = i.hero ? 1 : 0.55;
    this.trauma = clamp(this.trauma + (i.kind === 'limb' ? 0.12 : i.kind === 'firework' ? 0.15 : 0.25 + 0.75 * I) * weight, 0, 1);
    const v = Math.hypot(i.vx, i.vy);
    if (v > 0.5 && big) {
      // screen space: +x right, +y DOWN; kick against the direction of travel
      const kick = (250 + 900 * I) * weight;
      this.kvx += (-i.vx / v) * kick;
      this.kvy += (i.vy / v) * kick;
    }
    this.punch = Math.max(this.punch, (i.kind === 'limb' ? 0.05 : 0.08 + 0.22 * I) * weight);
    // cues
    this.fx.push({ kind: i.kind, x: i.x, y: i.y, vx: i.vx, vy: i.vy, size: i.size, intensity: I });
    const a: AudioCue['kind'] = i.kind === 'water' ? 'splash' : i.kind === 'explosion' ? 'boom' : i.kind === 'firework' ? 'pop' : i.kind === 'limb' ? 'crunch' : i.kind === 'burnup' ? 'sizzle' : I > 0.45 ? 'boom' : 'thud';
    this.audio.push({ kind: a, intensity: Math.max(I, i.kind === 'limb' ? 0.3 : 0.15), x: i.x, y: i.y });
  }

  /** Simulation speed multiplier right now */
  timeScale(now: number): number {
    if (now < this.stopUntil) return 0;
    if (now < this.slowUntil) {
      const u = (now - this.slowFrom) / Math.max(1, this.slowUntil - this.slowFrom);
      return u < 0.75 ? this.slow.scale : this.slow.scale + (1 - this.slow.scale) * ((u - 0.75) / 0.25);   // ease back
    }
    return 1;
  }

  get frozen() { return this.stopUntil > performance.now(); }

  /** Advance the camera model by REAL time (it keeps moving during hit-stop — that is the point) */
  update(dtReal: number) {
    const dt = Math.min(0.05, dtReal);
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - 1.1 * dt);
    // under-damped spring: one visible bounce, then settles
    const k = 160, c = 2 * Math.sqrt(k) * 0.42;
    this.kvx += (-k * this.kx - c * this.kvx) * dt; this.kvy += (-k * this.ky - c * this.kvy) * dt;
    this.kx += this.kvx * dt; this.ky += this.kvy * dt;
    this.punch *= Math.exp(-dt * 6);
  }

  /** Camera offset in screen px and zoom multiplier */
  camera(): { dx: number; dy: number; zoom: number; roll: number } {
    const s = this.trauma * this.trauma, A = 26, t = this.t;
    const nx = (Math.sin(t * 47.3) + 0.6 * Math.sin(t * 83.1 + 1.3) + 0.3 * Math.sin(t * 131.7 + 2.1)) / 1.9;
    const ny = (Math.sin(t * 53.9 + 0.7) + 0.6 * Math.sin(t * 97.3 + 2.9) + 0.3 * Math.sin(t * 149.1 + 0.4)) / 1.9;
    const nr = Math.sin(t * 37.7 + 1.1);
    return { dx: this.kx + s * A * nx, dy: this.ky + s * A * ny, zoom: 1 + this.punch, roll: s * 0.035 * nr };
  }

  /** Cues produced since the last call */
  drain(): { fx: FxCue[]; audio: AudioCue[] } {
    const out = { fx: this.fx, audio: this.audio };
    this.fx = []; this.audio = [];
    return out;
  }

  reset() { this.stopUntil = this.slowUntil = 0; this.trauma = 0; this.kx = this.ky = this.kvx = this.kvy = 0; this.punch = 0; this.fx = []; this.audio = []; }
}
