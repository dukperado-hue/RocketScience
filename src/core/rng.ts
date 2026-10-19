/**
 * Seeded PRNG (mulberry32). Every random outcome in the game — misfires,
 * material flaws, ignition delays — goes through this so a flight can be
 * replayed exactly from its seed (great for "watch your failure again").
 */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }

  /** Uniform [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number { return min + (max - min) * this.next(); }

  chance(p: number): boolean { return this.next() < p; }

  /** Normal distribution via Box–Muller */
  normal(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Weibull sample with scale 1. Low modulus k ⇒ widely scattered strength
   * (natural materials, hand-made parts); high k ⇒ predictable (aerospace alloys).
   */
  weibull(k: number): number {
    return Math.pow(-Math.log(1 - this.next()), 1 / k);
  }
}
