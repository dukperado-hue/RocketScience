/**
 * Particle logic for the Launch phase — engine smoke, flame puffs and the
 * zombie's slapstick bits (green slime, cartoon limbs, worms).
 *
 * Fed by `FlightResult.fx` from physics/flight2d.ts while a flight is replayed:
 *   const sys = new ParticleSystem();
 *   sys.spawnFrom(result.fx, t0, t1);   // all fx with t0 ≤ t < t1
 *   sys.update(dt, airDensityAt);       // world metres, +y up
 *   sys.draw(ctx, pxPerMetre);          // after the camera transform
 *
 * Physics per kind:
 *   smoke  — drifts with the exhaust then the wind, quadratic drag, grows and fades;
 *            puffs are thicker (and live longer) for smoky powder (density 0…1)
 *   slime  — ballistic droplets with light drag; they splat (flatten) on the ground
 *   limb   — a rigid sprite: own spin, drag ~ its area, bounces once, then lies still
 *   worms  — like slime but wriggle (a sine on their heading) and stay on the ground
 *   splat  — a radial burst of slime at ground impact
 * Pool-based: a fixed array, oldest particles recycled, no per-frame allocation.
 */
import type { FlightFx } from '@/physics/flight2d';
import type { Limb, ZombieId } from '@/payload/zombies';
import { Rng } from '@/core/rng';
import { CEL, shade } from './celStyle';
import { drawLimb } from './zombieArt';

export type ParticleKind = 'smoke' | 'flame' | 'slime' | 'limb' | 'worm' | 'splat' | 'fireball' | 'shock' | 'spark' | 'star' | 'rcs';

export interface Particle {
  alive: boolean;
  kind: ParticleKind;
  x: number; y: number; vx: number; vy: number;
  rot: number; spin: number;
  size: number; grow: number;
  age: number; life: number;
  /** ballistic coefficient-ish: drag acceleration = k · ρ · v² */
  drag: number;
  colour: string;
  /** Peak opacity (smoke) */
  opacity: number;
  limb?: Limb; zombie?: ZombieId;
  /** J3: a rig subtree that came off — it keeps flopping and draws itself instead of drawLimb */
  fragment?: { spin: number; step(dt: number): void; draw(ctx: CanvasRenderingContext2D): void };
  grounded: boolean;
  bounces: number;
}

const G = 9.81;

export class ParticleSystem {
  readonly pool: Particle[];
  private next = 0;
  private rng: Rng;
  /** Wind at the ground (m/s, +x); smoke drifts with it */
  wind = 2;

  constructor(capacity = 2500, seed = 7) {
    this.rng = new Rng(seed);
    this.pool = Array.from({ length: capacity }, () => ({
      alive: false, kind: 'smoke' as ParticleKind, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, size: 0, grow: 0,
      age: 0, life: 0, drag: 0, colour: '', opacity: 1, grounded: false, bounces: 0,
    }));
  }

  private take(): Particle {
    // Prefer a free slot; otherwise recycle the oldest-in-order slot
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[(this.next + i) % this.pool.length];
      if (!p.alive) { this.next = (this.next + i + 1) % this.pool.length; return p; }
    }
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    return p;
  }

  private emit(o: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y'>) {
    const p = this.take();
    Object.assign(p, {
      alive: true, vx: 0, vy: 0, rot: 0, spin: 0, size: 0.2, grow: 0, age: 0, life: 2, drag: 0.02,
      colour: '#fff', opacity: 1, grounded: false, bounces: 0, limb: undefined, zombie: undefined, fragment: undefined,
    }, o);
  }

  /** Spawn particles for every fx event with t0 ≤ t < t1 (call once per replay frame). */
  spawnFrom(fx: readonly FlightFx[], t0: number, t1: number) {
    for (const f of fx) if (f.t >= t0 && f.t < t1) this.spawn(f);
  }

  /** The newest live flying limb of this kind (to hand it a rig fragment right after spawn) */
  newestLimb(limb: Limb): Particle | undefined {
    let best: Particle | undefined;
    for (const p of this.pool) if (p.alive && p.kind === 'limb' && p.limb === limb && !p.fragment && (!best || p.age < best.age)) best = p;
    return best;
  }

  spawn(f: FlightFx) {
    const r = this.rng;
    if (f.kind === 'smoke') {
      const n = Math.max(1, Math.min(4, Math.round(f.amount * 0.3)));
      for (let i = 0; i < n; i++) {
        // Puff size ∝ √thrust; smoky powder (density → 1) is thicker, grows more and lingers
        const scale = 0.12 * Math.sqrt(Math.max(0.05, f.amount));
        this.emit({
          kind: 'smoke', x: f.x, y: f.y, vx: f.vx * 0.5 + r.normal(0, 3), vy: f.vy * 0.5 + r.normal(0, 3),
          size: 0.08 + scale, grow: scale * (0.25 + 0.8 * f.density), life: 2.5 + 7 * f.density, drag: 0.05,
          colour: CEL.smoke[Math.floor(r.next() * 3)], opacity: 0.35 + 0.55 * f.density,
        });
        if (i === 0) this.emit({ kind: 'flame', x: f.x, y: f.y, vx: f.vx * 0.3, vy: f.vy * 0.3, size: 0.35, grow: -0.6, life: 0.25, drag: 0.02, colour: CEL.flame[Math.floor(r.next() * 3)] });
      }
      return;
    }
    if (f.kind === 'explode') { this.boom(f); return; }
    if (f.kind === 'rcs') {
      {
        // puff > 1: CO₂ from a fire extinguisher — fatter, slower, longer-lived white clouds
        const k = f.puff ?? 1, sp = k > 1 ? 9 : 25;
        for (let i = 0; i < 3; i++) this.emit({ kind: 'rcs', x: f.x, y: f.y, vx: f.vx + f.dx * (sp + r.next() * sp * 0.4) + r.normal(0, 3 / k), vy: f.vy + f.dy * (sp + r.next() * sp * 0.4) + r.normal(0, 3 / k), size: 0.12 * k, grow: 1.2 * k, life: 0.35 * (k > 1 ? 2.2 : 1), drag: 0, colour: '#ffffff' });
      }
      return;
    }
    if ('inside' in f && f.inside) return;     // it happened inside a closed pod: heard, not seen
    switch (f.kind) {
      case 'limb':
        this.emit({
          kind: 'limb', x: f.x, y: f.y, vx: f.vx + r.normal(0, 6), vy: f.vy + r.normal(2, 6),
          spin: r.normal(0, 12), size: 1, life: 60, drag: 0.004, limb: f.limb, zombie: f.zombie, colour: '',
        });
        return;
      case 'slime': case 'splat': {
        const n = Math.min(80, f.amount);
        const burst = f.kind === 'splat' ? 9 : 4;
        for (let i = 0; i < n; i++) {
          const a = r.next() * Math.PI * 2, s = burst * (0.3 + r.next());
          this.emit({
            kind: f.kind === 'splat' ? 'splat' : 'slime', x: f.x, y: Math.max(0.02, f.y),
            vx: f.vx * 0.6 + Math.cos(a) * s, vy: (f.kind === 'splat' ? Math.abs(Math.sin(a)) * s : f.vy * 0.6 + Math.sin(a) * s),
            size: 0.03 + r.next() * 0.06, life: f.kind === 'splat' ? 30 : 8, drag: 0.03,
            colour: r.chance(0.3) ? CEL.slimeDark : CEL.slime,
          });
        }
        return;
      }
      case 'jar': {
        // the moment of compression: a ring of glassy glints popping off the seat
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2, sp = 6 + r.next() * 6;
          this.emit({ kind: 'spark', x: f.x, y: f.y, vx: f.vx + Math.cos(a) * sp, vy: f.vy + Math.sin(a) * sp, size: 0.05, life: 0.5, drag: 0.06, colour: '#dff6ff' });
        }
        return;
      }
      case 'worms': {
        const n = Math.min(60, Math.ceil(f.amount / 10));   // one sprite ≈ ten worms
        for (let i = 0; i < n; i++) {
          this.emit({
            kind: 'worm', x: f.x, y: Math.max(0.02, f.y), vx: f.vx * 0.5 + r.normal(0, 4), vy: f.vy * 0.5 + r.normal(3, 3),
            rot: r.next() * Math.PI * 2, spin: r.normal(0, 3), size: 0.06, life: 40, drag: 0.02, colour: CEL.worm,
          });
        }
      }
    }
  }

  /**
   * Explosion: an orange fireball, a white shockwave ring racing outward, hot debris
   * sparks — and, for every firework salt aboard, a sphere of stars in its flame-test
   * colour (Sr red, Ba green, Cu blue, Na yellow, Li crimson) that droops and twinkles.
   */
  private boom(f: Extract<FlightFx, { kind: 'explode' }>) {
    const r = this.rng, S = f.size;
    if (!f.firework) {
      this.emit({ kind: 'fireball', x: f.x, y: f.y, vx: f.vx * 0.7, vy: f.vy * 0.7, size: S * 0.3, grow: S * 1.3, life: 0.9, drag: 0, colour: '#ff9a2e' });
      this.emit({ kind: 'shock', x: f.x, y: f.y, vx: f.vx * 0.2, vy: f.vy * 0.2, size: S * 0.3, grow: S * 9, life: 0.55, drag: 0, colour: '#ffffff' });
      for (let i = 0; i < 18; i++) {
        const a = r.next() * Math.PI * 2, v = S * (6 + r.next() * 10);
        this.emit({ kind: 'spark', x: f.x, y: f.y, vx: f.vx * 0.5 + Math.cos(a) * v, vy: f.vy * 0.5 + Math.sin(a) * v, size: 0.05 + r.next() * 0.08, life: 0.8 + r.next(), drag: 0.01, colour: r.chance(0.5) ? '#ffd34a' : '#ff7a1a' });
      }
      for (let i = 0; i < 6; i++) this.emit({ kind: 'smoke', x: f.x + r.normal(0, S * 0.3), y: f.y + r.normal(0, S * 0.3), vx: f.vx * 0.2, vy: f.vy * 0.2, size: S * 0.5, grow: S * 0.6, life: 5, drag: 0.05, colour: '#5d5a55', opacity: 0.7 });
    } else {
      this.emit({ kind: 'shock', x: f.x, y: f.y, vx: f.vx, vy: f.vy, size: 0.2, grow: 14, life: 0.35, drag: 0, colour: '#ffffff' });
    }
    for (const col of f.colors) {
      const n = f.firework ? 90 : 60;
      for (let i = 0; i < n; i++) {
        // even sphere of stars (Fibonacci spread), each with a little scatter
        const a = i * 2.39996 + r.next() * 0.2, k = 0.6 + 0.4 * Math.sqrt((i + 0.5) / n);
        const v = (f.firework ? 34 : 24) * k * (0.9 + r.next() * 0.2);
        this.emit({ kind: 'star', x: f.x, y: f.y, vx: f.vx * 0.15 + Math.cos(a) * v, vy: f.vy * 0.15 + Math.sin(a) * v, size: 0.35 + r.next() * 0.2, life: 2.4 + r.next() * 0.8, drag: 0.012, colour: col });
      }
    }
  }

  /** Ground height under x (m): the crater heightfield on land, 0 at sea (set by the view) */
  groundAt: (x: number) => number = () => 0;
  /** Called once when a limb comes to rest (the view adds the splash and the shark at sea) */
  onRest: ((p: Particle) => void) | null = null;

  /** Advance every particle. `rhoAt(y)` gives air density (kg/m³) at height y. */
  update(dt: number, rhoAt: (y: number) => number = (y) => 1.225 * Math.exp(-Math.max(0, y) / 8500)) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      if (p.fragment) { p.fragment.spin = p.grounded ? 0 : p.spin; p.fragment.step(dt); }
      if (p.grounded) { if (p.kind === 'worm') p.x += Math.sin(p.age * 6 + p.rot) * 0.05 * dt; continue; }
      const rho = rhoAt(p.y);
      if (p.kind === 'fireball' || p.kind === 'shock' || p.kind === 'rcs') {
        p.size = Math.max(0.01, p.size + p.grow * dt * (p.kind === 'shock' ? 1 : Math.max(0.2, 1 - p.age / p.life)));
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'rcs') { p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; }
        continue;
      }
      if (p.kind === 'smoke' || p.kind === 'flame') {
        // relax toward the wind; buoyant, so a little lift
        const k = 1 - Math.exp(-dt * (1.5 + 30 * p.drag * rho));
        p.vx += (this.wind - p.vx) * k;
        p.vy += (0.6 - p.vy) * k;
        p.size = Math.max(0.02, p.size + p.grow * dt);
      } else {
        const v = Math.hypot(p.vx, p.vy);
        const a = p.drag * rho * v;                       // quadratic drag, per unit velocity
        p.vx -= p.vx * a * dt;
        p.vy -= (p.vy * a + G) * dt;
        if (p.kind === 'worm') p.rot += Math.sin(p.age * 9) * 4 * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      const gy = p.y < 30 ? this.groundAt(p.x) : 0;
      if (p.y <= gy && (p.kind === 'spark' || p.kind === 'star')) { p.alive = false; continue; }
      if (p.y <= gy && p.kind !== 'smoke' && p.kind !== 'flame') {
        p.y = gy;
        if (p.kind === 'limb' && p.bounces < 1 && Math.abs(p.vy) > 3) {
          p.vy = -p.vy * 0.35; p.vx *= 0.6; p.spin *= -0.5; p.bounces++;   // one cartoon bounce
        } else {
          p.grounded = true; p.vx = 0; p.vy = 0; p.spin = 0;
          if (p.kind === 'limb') this.onRest?.(p);
          if (p.kind === 'slime' || p.kind === 'splat') { p.kind = 'splat'; p.life = Math.max(p.life, p.age + 20); }
        }
      }
    }
  }

  get count() { return this.pool.reduce((n, p) => n + (p.alive ? 1 : 0), 0); }

  /**
   * Draw, cel-style, in world metres (+y up — call after the camera transform).
   * `lw` is the base line width in metres (≈ 1.3 px ÷ zoom). Smoke first, gore on top.
   */
  /** Smoke opacity multiplier: lit cel-grey smoke reads as solid balls on a night sky (set by the view) */
  smokeAlpha = 1;

  draw(ctx: CanvasRenderingContext2D, lw: number) {
    const order: ParticleKind[] = ['smoke', 'rcs', 'flame', 'fireball', 'shock', 'splat', 'slime', 'worm', 'limb', 'spark', 'star'];
    for (const kind of order) {
      for (const p of this.pool) {
        if (!p.alive || p.kind !== kind) continue;
        const fade = 1 - p.age / p.life;
        ctx.save();
        ctx.translate(p.x, p.y);
        switch (kind) {
          case 'smoke': {
            ctx.globalAlpha = Math.min(p.opacity, fade * 1.2) * this.smokeAlpha;
            ctx.fillStyle = p.colour;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = shade(p.colour, 0.12);                 // single cel shadow band
            ctx.beginPath(); ctx.arc(p.size * 0.25, -p.size * 0.25, p.size * 0.75, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(27,34,48,0.18)'; ctx.lineWidth = lw * 1.4;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
            break;
          }
          case 'flame':
            ctx.globalAlpha = fade;
            ctx.fillStyle = p.colour;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
            break;
          case 'slime': case 'splat': {
            ctx.globalAlpha = Math.min(1, fade * 3);
            const flat = p.grounded ? 0.35 : 1;
            ctx.scale(1 / Math.sqrt(flat), flat);
            ctx.fillStyle = p.colour;
            ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.6;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = CEL.highlight;
            ctx.beginPath(); ctx.arc(-p.size * 0.35, p.size * 0.35, p.size * 0.25, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'worm': {
            ctx.rotate(p.rot);
            ctx.lineCap = 'round';
            ctx.strokeStyle = CEL.wormDark; ctx.lineWidth = p.size * 0.9;
            const wig = Math.sin(p.age * 10) * p.size * 0.6;
            ctx.beginPath(); ctx.moveTo(-p.size * 1.4, 0); ctx.quadraticCurveTo(0, wig, p.size * 1.4, 0); ctx.stroke();
            ctx.strokeStyle = CEL.worm; ctx.lineWidth = p.size * 0.5; ctx.stroke();
            break;
          }
          case 'rcs':
            ctx.globalAlpha = 0.8 * fade;
            ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(27,34,48,0.25)'; ctx.lineWidth = lw;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            break;
          case 'fireball': {
            // cel fireball: three flat rings, hot core, thick ink edge
            ctx.globalAlpha = Math.min(1, fade * 1.6);
            for (const [col, k] of [['#ff6a1a', 1], ['#ffb02e', 0.72], ['#fff1a8', 0.42]] as const) {
              ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, p.size * k, 0, Math.PI * 2); ctx.fill();
            }
            ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * CEL.outline;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
            break;
          }
          case 'shock':
            ctx.globalAlpha = fade * 0.9;
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(lw * 3, p.size * 0.08);
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(27,34,48,0.35)'; ctx.lineWidth = lw * 1.5;
            ctx.beginPath(); ctx.arc(0, 0, p.size * 1.04, 0, Math.PI * 2); ctx.stroke();
            break;
          case 'spark': case 'star': {
            // a short streak along the velocity, star = coloured with a twinkle
            const sp = Math.hypot(p.vx, p.vy) || 1, L = Math.min(1.5, sp * 0.04) + p.size;
            const tw = kind === 'star' ? 0.6 + 0.4 * Math.sin(p.age * 30 + p.x) : 1;
            ctx.globalAlpha = Math.min(1, fade * 2) * tw;
            ctx.strokeStyle = p.colour; ctx.lineCap = 'round'; ctx.lineWidth = p.size * 1.6;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo((-p.vx / sp) * L, (-p.vy / sp) * L); ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'limb':
            if (p.fragment) { ctx.rotate(p.rot); p.fragment.draw(ctx); }
            else if (p.zombie && p.limb) { ctx.rotate(p.rot); drawLimb(ctx, p.zombie, p.limb, lw); }
            break;
        }
        ctx.restore();
      }
    }
  }
}
