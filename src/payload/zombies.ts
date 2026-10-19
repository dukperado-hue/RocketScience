/**
 * Zombie test payloads — "Zombie vs Physics".
 *
 * Instead of animals or people, the test passengers are cartoon zombies.
 * They're already dead, so the game can put them through 18 g, cartwheels
 * and hard landings and play it as slapstick. They are still honest
 * instruments, though: every limb lost is a real reading of the g-load
 * at the seat, including the spin of a tumbling rocket (ω²·r).
 *
 * The data here is pure (no DOM, no rendering). `ZombiePayload` is a small
 * state machine the flight simulator feeds with the g-load felt at the seat;
 * it returns log lines and visual-effects requests for the Launch phase.
 */
import { Rng } from '@/core/rng';

export type ZombieId = 'standard' | 'fat' | 'brittle';
export type Limb = 'left arm' | 'right arm' | 'left leg' | 'right leg' | 'head';

export interface ZombieVariant {
  id: ZombieId;
  name: string;
  nameTh: string;
  mass: number;              // kg
  /** g where the first limb comes off (sustained ≥ 0.15 s) */
  limbG: number;
  /** g where the whole zombie comes apart */
  fallApartG: number;
  /**
   * g where it doesn't come apart — it gets *compressed*: a short, savage spike
   * (≥ 0.05 s above this) folds the whole zombie into something jar-sized.
   * Always above fallApartG: you have to overshoot "apart" fast enough that it
   * never gets the chance.
   */
  jarG: number;
  /** Landing speeds (m/s): limbs pop off above `limbImpact`, total splat above `splatImpact` */
  limbImpact: number;
  splatImpact: number;
  /** Worms aboard (the brittle zombie's passengers) */
  worms: number;
  /** Side-on area of the body (m²) and of one limb, for the aerodynamics */
  area: number;
  limbArea: number;
  /** Fraction of the mass in each limb (arms, legs, head) */
  limbMass: Record<Limb, number>;
  slime: string;             // fill colour of its slime
  skin: string;
  description: string;
}

const LIMB_MASS: Record<Limb, number> = { 'left arm': 0.05, 'right arm': 0.05, 'left leg': 0.16, 'right leg': 0.16, head: 0.08 };

export const ZOMBIES: Record<ZombieId, ZombieVariant> = {
  standard: {
    id: 'standard', name: 'Standard zombie', nameTh: 'ซอมบี้ธรรมดา', mass: 70,
    limbG: 11, fallApartG: 15, jarG: 18, limbImpact: 12, splatImpact: 28, worms: 0,
    area: 0.55, limbArea: 0.05, limbMass: LIMB_MASS, slime: '#7bd34a', skin: '#8fbf6a',
    description: 'Off-the-shelf undead. 70 kg, comes apart at 15 g.',
  },
  fat: {
    id: 'fat', name: 'Fat zombie', nameTh: 'ซอมบี้อ้วน', mass: 140,
    limbG: 15, fallApartG: 20, jarG: 26, limbImpact: 18, splatImpact: 40, worms: 0,
    area: 0.85, limbArea: 0.07, limbMass: LIMB_MASS, slime: '#a6d63c', skin: '#9cc47a',
    description: 'Twice the mass, built-in padding. Survives 20 g and bounces on landing.',
  },
  brittle: {
    id: 'brittle', name: 'Brittle zombie', nameTh: 'ซอมบี้เปื่อย', mass: 40,
    limbG: 8, fallApartG: 12, jarG: 16, limbImpact: 6, splatImpact: 16, worms: 574,
    area: 0.45, limbArea: 0.04, limbMass: LIMB_MASS, slime: '#5fc27a', skin: '#a9b98a',
    description: 'Light and well past its best — with 574 symbiotic worms. Limbs go at 8 g.',
  },
};
export const ZOMBIE_IDS = Object.keys(ZOMBIES) as ZombieId[];

/* ----------------------------------------------------------------
 * Visual-effects requests (consumed by the Launch canvas)
 * ---------------------------------------------------------------- */

export type GoreKind = 'limb' | 'slime' | 'worms' | 'splat' | 'jar';
export interface GoreFx {
  t: number;
  kind: GoreKind;
  /** World position and velocity of the seat when it happened */
  x: number; y: number; vx: number; vy: number;
  /** Which limb flew off (kind = 'limb') */
  limb?: Limb;
  /** How much: particle count hint for slime/worms */
  amount: number;
  zombie: ZombieId;
}

export interface ZombieLog { t: number; kind: 'limb' | 'fall-apart' | 'impact' | 'survived' | 'worms' | 'gloat' | 'jarred'; text: string }

/**
 * 'intact' → 'damaged' (limbs gone) → one of two terminal states:
 *   'pieces'  fell apart, splatted or cremated — mass leaves the seat
 *   'jarred'  compressed by a g-spike into a jar-sized lump — mass STAYS in the seat
 *             (it is technically still one piece, which matters for Zombie-Sat)
 */
export type ZombieState = 'intact' | 'damaged' | 'pieces' | 'jarred';
export const isTerminal = (s: ZombieState) => s === 'pieces' || s === 'jarred';

export interface SeatState { t: number; g: number; x: number; y: number; vx: number; vy: number; alt: number }

/* ----------------------------------------------------------------
 * The payload
 * ---------------------------------------------------------------- */

const LIMB_LINES: ((l: Limb, g: string) => string)[] = [
  (l, g) => `${cap(l)} detached at ${g} g. Aerodynamics slightly improved.`,
  (l, g) => `${cap(l)} has left the vehicle (${g} g). It did not file a flight plan.`,
  (l, g) => `Lost the ${l} at ${g} g. Mass budget thanks you.`,
  (l, g) => `${cap(l)} went its own way at ${g} g. Tracking it as debris.`,
];
const HEAD_LINES: ((g: string) => string)[] = [
  (g) => `Head detached at ${g} g. Still the smartest part of the vehicle.`,
  (g) => `Head off at ${g} g. It keeps looking back at us.`,
];

export class ZombiePayload {
  readonly v: ZombieVariant;
  readonly limbs = new Set<Limb>(['left arm', 'right arm', 'left leg', 'right leg', 'head']);
  wormsLeft: number;
  state: ZombieState = 'intact';
  /** Limbs still attached at the moment of jarring (they're in the jar too) */
  jarredLimbs = 0;
  /** Re-entry heat at the seat: lightly toasted above 150 °C */
  crispy = false;
  seatTemp = 25;
  peakG = 0;
  readonly log: ZombieLog[] = [];
  readonly fx: GoreFx[] = [];
  private rng: Rng;
  private gFilt = 0;          // low-pass g so one numerical spike doesn't count
  private overLimbSince = -1;
  private overApartSince = -1;
  private overJarSince = -1;
  private peakInWindow = 0;
  private nextLimbG: number;

  constructor(id: ZombieId, seed = 1) {
    this.v = ZOMBIES[id];
    this.wormsLeft = this.v.worms;
    this.rng = new Rng(seed);
    this.nextLimbG = this.v.limbG;
  }

  get mass(): number {
    if (this.state === 'pieces') return 0;
    let m = this.v.mass;
    for (const l of Object.keys(this.v.limbMass) as Limb[]) if (!this.limbs.has(l)) m -= this.v.mass * this.v.limbMass[l];
    return m;
  }

  /** Side-on area still strapped in (m²) */
  get area(): number {
    if (this.state === 'pieces') return 0;
    if (this.state === 'jarred') return this.v.area * 0.08;     // a jar's worth of zombie
    return this.v.area - (5 - this.limbs.size) * this.v.limbArea;
  }

  /** Feed one simulation step with the g-load felt at the seat. Returns mass shed this step (kg). */
  update(s: SeatState, dt: number): number {
    if (isTerminal(this.state)) return 0;
    const before = this.mass;
    this.gFilt += (s.g - this.gFilt) * Math.min(1, dt / 0.05);
    const g = this.gFilt;
    this.peakG = Math.max(this.peakG, g);

    // Compression: a short spike far past "apart" — checked first, it wins the race
    if (g >= this.v.jarG) { if (this.overJarSince < 0) this.overJarSince = s.t; }
    else this.overJarSince = -1;
    if (this.overJarSince >= 0 && s.t - this.overJarSince >= 0.05) {
      this.jar(s, g);
      return 0;                                   // nothing leaves the seat
    }

    // Whole-body failure
    if (g >= this.v.fallApartG) { if (this.overApartSince < 0) { this.overApartSince = s.t; this.peakInWindow = 0; } this.peakInWindow = Math.max(this.peakInWindow, g); }
    else this.overApartSince = -1;
    if (this.overApartSince >= 0 && s.t - this.overApartSince >= 0.15) {
      // if the load passed the jar line on its way through, it was a compression, not a tear
      if (this.peakInWindow >= this.v.jarG) { this.jar(s, this.peakInWindow); return 0; }
      this.fallApart(s, g);
      return before;
    }

    // Limbs: one at a time, each needing a little more g than the last
    if (g >= this.nextLimbG) { if (this.overLimbSince < 0) this.overLimbSince = s.t; }
    else this.overLimbSince = -1;
    if (this.overLimbSince >= 0 && s.t - this.overLimbSince >= 0.15) {
      this.loseLimb(s, g);
      this.overLimbSince = -1;
      this.nextLimbG += (this.v.fallApartG - this.v.limbG) / 5;
    }
    return before - this.mass;
  }

  /** Seat temperature from re-entry heating (°C) */
  heat(temp: number, s: SeatState) {
    this.seatTemp = temp;
    if (isTerminal(this.state)) return;
    if (!this.crispy && temp > 150) {
      this.crispy = true;
      this.push(s, 'gloat', `Seat at ${temp.toFixed(0)} °C. Zombie is now extra crispy. Smells like grilled moo ping.`);
    }
    if (temp > 450) {
      for (const l of [...this.limbs]) this.limbs.delete(l);
      this.state = 'pieces';
      this.push(s, 'fall-apart', `Seat at ${temp.toFixed(0)} °C. The zombie has been cremated. Respectfully.`);
      this.gore(s, 'splat', 20);
      this.spillWorms(s);
    }
  }

  /** Called once when the vehicle hits the ground (or the flight ends). */
  land(s: SeatState, impactSpeed: number) {
    if (this.state === 'pieces') { this.epitaph(s); return; }
    if (this.state === 'jarred') {
      this.push(s, 'jarred', impactSpeed > 20 ? 'The jar survived the landing. The jar always survives.' : 'Jar recovered. Contents: one zombie, concentrated.');
      return;
    }
    const v = impactSpeed;
    if (v >= this.v.splatImpact) {
      this.state = 'pieces';
      this.push(s, 'impact', `Hit the ground at ${v.toFixed(0)} m/s. Zombie redistributed across ${(v * 0.6).toFixed(0)} m².`);
      this.gore(s, 'splat', 60);
      this.spillWorms(s);
    } else if (v >= this.v.limbImpact) {
      const n = Math.min(this.limbs.size, 1 + Math.floor(((v - this.v.limbImpact) / (this.v.splatImpact - this.v.limbImpact)) * 3));
      for (let i = 0; i < n; i++) this.loseLimb(s, 0, true);
      this.push(s, 'impact', this.v.id === 'fat'
        ? `Landed at ${v.toFixed(0)} m/s and bounced. Twice. The padding works.`
        : `Landed at ${v.toFixed(0)} m/s. Picked itself up, minus ${n} limb${n > 1 ? 's' : ''}.`);
    } else {
      this.push(s, 'survived', this.limbs.size === 5
        ? `Touchdown at ${v.toFixed(1)} m/s. Zombie intact and visibly disappointed.`
        : `Touchdown at ${v.toFixed(1)} m/s with ${this.limbs.size} of 5 parts attached.`);
    }
    this.epitaph(s);
  }

  /** One-line summary for the post-flight report */
  verdict(): string {
    const lost = 5 - this.limbs.size;
    if (this.state === 'jarred') return `Jarred at ${this.peakG.toFixed(1)} g. Shelf-stable. Best before: never.`;
    if (this.state === 'pieces') {
      return this.v.worms
        ? `Zombie died… again. ${this.v.worms - this.wormsLeft} symbiotic worms lost in action.`
        : 'Zombie died… again. Peak ' + this.peakG.toFixed(1) + ' g.';
    }
    if (lost) return `Returned with ${lost} part${lost > 1 ? 's' : ''} missing (peak ${this.peakG.toFixed(1)} g).`;
    return `Zombie intact (peak ${this.peakG.toFixed(1)} g). Ready to fly again, unfortunately.`;
  }

  /* ---------- internals ---------- */

  private loseLimb(s: SeatState, g: number, quiet = false) {
    if (isTerminal(this.state)) return;
    const order: Limb[] = ['left arm', 'right arm', 'left leg', 'right leg', 'head'];
    const left = order.filter((l) => this.limbs.has(l) && l !== 'head');
    const limb = left.length ? left[Math.floor(this.rng.next() * left.length)] : 'head';
    this.limbs.delete(limb);
    if (this.state === 'intact') this.state = 'damaged';
    if (!quiet) {
      const gs = g.toFixed(1);
      const text = limb === 'head' ? this.pick(HEAD_LINES)(gs) : this.pick(LIMB_LINES)(limb, gs);
      this.push(s, 'limb', text);
    }
    this.gore(s, 'limb', 1, limb);
    this.gore(s, 'slime', 12);
    if (this.v.worms && this.wormsLeft > 0) {
      const n = Math.min(this.wormsLeft, Math.round(this.v.worms * (0.05 + this.rng.next() * 0.1)));
      this.wormsLeft -= n;
      this.gore(s, 'worms', n);
    }
    if (this.limbs.size === 0) this.fallApart(s, g);
  }

  /** Terminal compression: limbs stay (in the jar), mass stays in the seat */
  private jar(s: SeatState, g: number) {
    if (isTerminal(this.state)) return;
    this.jarredLimbs = this.limbs.size;
    this.state = 'jarred';
    this.overJarSince = this.overApartSince = -1;
    this.push(s, 'jarred', this.pick([
      `${g.toFixed(1)} g. The zombie has been compressed into a jar. Eyes against the glass. Still blinking.`,
      `Peak ${g.toFixed(1)} g: zombie condensed to 1/12 its volume. It is now a condiment.`,
      `${g.toFixed(1)} g. Structurally, the zombie is now a jar. Emotionally, unchanged.`,
    ]));
    this.gore(s, 'jar', 1);
    this.gore(s, 'slime', 6);
    if (this.wormsLeft) this.push(s, 'worms', `All ${this.wormsLeft} worms are in the jar too. They seem fine with it.`);
  }

  private fallApart(s: SeatState, g: number) {
    if (isTerminal(this.state)) return;
    for (const l of [...this.limbs]) { this.limbs.delete(l); this.gore(s, 'limb', 1, l); }
    this.state = 'pieces';
    this.push(s, 'fall-apart', g > 0
      ? `Zombie came apart at ${g.toFixed(1)} g. The seat belt held; nothing else did.`
      : 'Zombie came apart.');
    this.gore(s, 'splat', 40);
    this.spillWorms(s);
  }

  private spillWorms(s: SeatState) {
    if (!this.wormsLeft) return;
    this.gore(s, 'worms', this.wormsLeft);
    this.wormsLeft = 0;
  }

  private epitaph(s: SeatState) {
    if (this.state !== 'pieces') return;
    if (this.v.worms) this.push(s, 'worms', `Zombie died… again. ${this.v.worms - this.wormsLeft} symbiotic worms lost in action.`);
    else this.push(s, 'gloat', 'Zombie died… again. Paperwork: none.');
  }

  private gore(s: SeatState, kind: GoreKind, amount: number, limb?: Limb) {
    this.fx.push({ t: s.t, kind, x: s.x, y: s.y, vx: s.vx, vy: s.vy, amount, limb, zombie: this.v.id });
  }

  private push(s: SeatState, kind: ZombieLog['kind'], text: string) {
    this.log.push({ t: +s.t.toFixed(1), kind, text });
  }

  private pick<T>(xs: T[]): T { return xs[Math.floor(this.rng.next() * xs.length)]; }
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Pre-flight: what a steady g-load will do to this zombie. null = nothing happens. */
export function zombieForecast(id: ZombieId, g: number): string | null {
  const z = ZOMBIES[id];
  if (g >= z.fallApartG) return `Up to ${g.toFixed(1)} g by burnout — the ${z.name.toLowerCase()} comes apart above ${z.fallApartG} g. Bring a bucket.`;
  if (g >= z.limbG) return `Up to ${g.toFixed(1)} g by burnout — the ${z.name.toLowerCase()} starts shedding limbs above ${z.limbG} g.`;
  return null;
}
