/**
 * 1D terrain heightfield — craters that the physics actually respects (Phase J2).
 *
 * The flight is a 2D cut through a round Earth: the ground is the line `altitude = 0`.
 * A crater lowers that line locally. We store the offset (≤ 0, metres) on a regular grid
 * along the ground distance `s` (the view's x axis), in chunks so the field can cover any
 * downrange without a giant array:
 *
 *   chunk  = Float32Array(CHUNK) samples, spacing DX metres;  key = floor(s / (CHUNK·DX))
 *   heightAt(s)  linear interpolation; 0 where nothing was ever carved
 *   carve(s, r, d)  min(existing, bowl) — craters overlap, they never fill each other in
 *
 * The pad (|s| ≤ PAD_HALF) is concrete: it scorches, it does not crater.
 * Crater size from impact energy (≈ cube-root scaling, tuned for a cartoon but ordered right):
 *   r = 0.11 · E^0.27   (E in J, r in m)   → 20 kg Bang Fai at 100 m/s ≈ 2.4 m, 1 t at 100 m/s ≈ 7 m
 *   depth = 0.32 · r;  no crater under MIN_E (lanterns, gentle touchdowns)
 */
export const DX = 0.25;
export const CHUNK = 256;
export const PAD_HALF = 4.5;
export const MIN_E = 20_000;
export const MAX_R = 25;

export interface TerrainSampler { heightAt(s: number): number }

export interface Crater { s: number; r: number; depth: number; at: number }

export function craterSize(energyJ: number): { r: number; depth: number } | null {
  if (!(energyJ >= MIN_E)) return null;
  const r = Math.min(MAX_R, 0.11 * Math.pow(energyJ, 0.27));
  return { r, depth: 0.32 * r };
}

export class Heightfield implements TerrainSampler {
  private chunks = new Map<number, Float32Array>();
  /** Every crater ever carved, for the renderer's rims and scorch decals */
  readonly craters: Crater[] = [];
  /** Bumped on every carve, so renderers can cache */
  version = 0;

  heightAt(s: number): number {
    const span = CHUNK * DX;
    const k = Math.floor(s / span), c = this.chunks.get(k);
    if (!c) return 0;
    const u = (s - k * span) / DX, i = Math.floor(u), f = u - i;
    const a = c[i], b = i + 1 < CHUNK ? c[i + 1] : (this.chunks.get(k + 1)?.[0] ?? 0);
    return a + (b - a) * f;
  }

  /** Carve a bowl of radius r and depth d centred at s (parabolic profile, flat on the pad) */
  carve(s: number, r: number, depth: number, at = 0): boolean {
    if (!(r > 0 && depth > 0)) return false;
    const span = CHUNK * DX;
    let changed = false;
    for (let x = Math.floor((s - r) / DX) * DX; x <= s + r; x += DX) {
      if (Math.abs(x) <= PAD_HALF) continue;              // concrete pad
      const q = (x - s) / r;
      if (q <= -1 || q >= 1) continue;
      const h = -depth * (1 - q * q);
      const k = Math.floor(x / span);
      let c = this.chunks.get(k);
      if (!c) { c = new Float32Array(CHUNK); this.chunks.set(k, c); }
      const i = Math.min(CHUNK - 1, Math.round((x - k * span) / DX));
      if (h < c[i]) { c[i] = h; changed = true; }
    }
    if (changed) { this.craters.push({ s, r, depth, at }); this.version++; }
    return changed;
  }

  /** Impact → crater (if the energy is big enough). Returns the crater, or null. */
  impact(s: number, energyJ: number, at = 0): Crater | null {
    const c = craterSize(energyJ);
    if (!c) return null;
    return this.carve(s, c.r, c.depth, at) ? this.craters[this.craters.length - 1] : null;
  }

  /** Lowest point between a and b (for drawing) */
  sampleRange(a: number, b: number, step = DX): [number, number][] {
    const out: [number, number][] = [];
    for (let x = a; x <= b; x += step) out.push([x, this.heightAt(x)]);
    return out;
  }

  get empty() { return this.craters.length === 0; }
  clear() { this.chunks.clear(); this.craters.length = 0; this.version++; }
}
