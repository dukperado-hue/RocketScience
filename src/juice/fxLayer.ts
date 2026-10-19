/**
 * Additive FX layer — the part of an explosion that should hurt your eyes (Phase J1).
 *
 *   smoke()      SOURCE-OVER, drawn after the bodies: dark billows that linger 4–9 s, rise,
 *                spread and drift with the wind
 *   additive()   'lighter' (RGB add, clamped at 255): fireballs, the expanding shockwave ring,
 *                sparks stretched along their velocity, dust glints
 *   flash()      SCREEN SPACE: one white frame (and a fading sheet) for big blasts
 *
 * Everything soft is a sprite pre-rendered once; per frame it is drawImage + a few strokes.
 * Pools are fixed-size arrays recycled in place. World units are metres (y up).
 */
import type { FxCue } from './impactDirector';
import type { Light } from '@/vfx/environment';

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; w: number; hot: number }
interface Ball { x: number; y: number; r: number; age: number; life: number; kind: 'fire' | 'dust' | 'steam' }
interface Ring { x: number; y: number; r: number; age: number; life: number; hot: boolean }
interface Puff { x: number; y: number; vx: number; vy: number; r: number; grow: number; age: number; life: number; shade: number }

function sprite(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
const rnd = () => Math.random();

export class FxLayer {
  private sparks: Spark[] = [];
  private balls: Ball[] = [];
  private rings: Ring[] = [];
  private puffs: Puff[] = [];
  private flashA = 0;
  private sp: { fire: HTMLCanvasElement; core: HTMLCanvasElement; dust: HTMLCanvasElement; smoke: HTMLCanvasElement; steam: HTMLCanvasElement } | null = null;
  /** Wind (m/s, +x) for smoke drift */
  wind = 2;

  private sprites() {
    return this.sp ??= {
      core: sprite(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,245,200,0.95)'], [0.55, 'rgba(255,190,90,0.5)'], [1, 'rgba(255,120,30,0)']]),
      fire: sprite(128, [[0, 'rgba(255,220,140,0.95)'], [0.35, 'rgba(255,130,40,0.7)'], [0.7, 'rgba(200,50,10,0.25)'], [1, 'rgba(120,20,0,0)']]),
      dust: sprite(64, [[0, 'rgba(255,225,170,0.5)'], [1, 'rgba(255,200,140,0)']]),
      smoke: sprite(64, [[0, 'rgba(60,58,56,0.85)'], [0.55, 'rgba(70,68,66,0.55)'], [1, 'rgba(80,78,76,0)']]),
      steam: sprite(64, [[0, 'rgba(245,250,255,0.85)'], [0.6, 'rgba(235,242,250,0.45)'], [1, 'rgba(230,240,250,0)']]),
    };
  }

  /** Spawn the visuals for one impact cue */
  play(c: FxCue, quality = 1) {
    const I = c.intensity, R = Math.max(0.6, c.size) * (1 + 2.2 * I);
    const n = (k: number) => Math.round(k * (0.4 + 0.6 * quality));
    if (c.kind === 'explosion' || (c.kind === 'ground' && I > 0.35)) {
      this.flashA = Math.max(this.flashA, 0.25 + 0.6 * I);
      this.balls.push({ x: c.x, y: c.y, r: R * 1.4, age: 0, life: 0.18, kind: 'fire' });           // the blink
      for (let i = 0; i < n(4 + 6 * I); i++) this.balls.push({ x: c.x + (rnd() - 0.5) * R, y: c.y + rnd() * R * 0.6, r: R * (0.5 + rnd() * 0.6), age: -rnd() * 0.12, life: 0.45 + 0.5 * I + rnd() * 0.3, kind: 'fire' });
      this.rings.push({ x: c.x, y: c.y, r: R * 5.5, age: 0, life: 0.45 + 0.3 * I, hot: true });
      for (let i = 0; i < n(30 + 90 * I); i++) {
        const a = rnd() * Math.PI * 2, v = (12 + rnd() * 40) * (0.6 + I) * Math.sqrt(Math.max(1, R) / 2);
        this.sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * v + c.vx * 0.2, vy: Math.abs(Math.sin(a)) * v * 0.9 + 4, life: 0.5 + rnd() * 0.9, max: 1.4, w: 1 + rnd() * 1.5, hot: 1 });
      }
      for (let i = 0; i < n(6 + 10 * I); i++) this.puffs.push({ x: c.x + (rnd() - 0.5) * R, y: c.y + rnd() * R * 0.5, vx: (rnd() - 0.5) * 3, vy: 1.5 + rnd() * 3, r: R * (0.5 + rnd() * 0.5), grow: R * (0.4 + rnd() * 0.5), age: -0.15 - rnd() * 0.3, life: 4 + rnd() * 5, shade: rnd() });
    } else if (c.kind === 'ground') {
      // dirt and dust kicked up, a low ring along the ground
      this.rings.push({ x: c.x, y: 0.1, r: R * 3.5, age: 0, life: 0.4, hot: false });
      for (let i = 0; i < n(10 + 30 * I); i++) {
        const a = Math.PI * (0.15 + rnd() * 0.7), v = (4 + rnd() * 12) * (0.6 + I);
        this.sparks.push({ x: c.x + (rnd() - 0.5) * R, y: 0.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + rnd() * 0.6, max: 1.1, w: 1.5 + rnd() * 2, hot: 0 });
      }
      for (let i = 0; i < n(4 + 8 * I); i++) this.balls.push({ x: c.x + (rnd() - 0.5) * R * 2, y: 0.2 + rnd() * R * 0.3, r: R * (0.6 + rnd()), age: -rnd() * 0.1, life: 1.2 + rnd(), kind: 'dust' });
    } else if (c.kind === 'water') {
      for (let i = 0; i < n(4 + 6 * I); i++) this.balls.push({ x: c.x + (rnd() - 0.5) * R * 1.5, y: 0.3 + rnd() * R * 0.6, r: R * (0.6 + rnd() * 0.6), age: -rnd() * 0.15, life: 1.5 + rnd(), kind: 'steam' });
    } else if (c.kind === 'firework') {
      this.rings.push({ x: c.x, y: c.y, r: 6, age: 0, life: 0.35, hot: true });
    }
    // cap the pools (oldest first)
    if (this.sparks.length > 900) this.sparks.splice(0, this.sparks.length - 900);
    if (this.puffs.length > 220) this.puffs.splice(0, this.puffs.length - 220);
  }

  /** Advance by (possibly slowed) simulation-feel time */
  update(dt: number) {
    if (dt <= 0) return;
    for (const s of this.sparks) { s.vy -= 9.81 * dt; s.vx *= 1 - 0.6 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.hot *= Math.exp(-dt * 2.2); if (s.y < 0) { s.y = 0; s.vy *= -0.3; s.vx *= 0.5; } }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const b of this.balls) { b.age += dt; if (b.kind !== 'fire') b.y += dt * 1.2; else b.y += dt * b.r * 0.4; }
    this.balls = this.balls.filter((b) => b.age < b.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const p of this.puffs) { p.age += dt; if (p.age > 0) { p.x += (p.vx + this.wind * 0.6) * dt; p.y += p.vy * dt; p.vy *= 1 - 0.15 * dt; } }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
  }

  /** Flash decays in REAL time (a flash is a flash, slow-mo or not) */
  updateReal(dt: number) { this.flashA *= Math.exp(-dt * 9); }

  get busy() { return this.sparks.length + this.balls.length + this.rings.length + this.puffs.length > 0 || this.flashA > 0.01; }

  /** Lights for the environment's additive pass (fireballs light the ground and the water) */
  lights(out: (l: Light) => void) {
    for (const b of this.balls) if (b.kind === 'fire' && b.age > 0) out({ x: b.x, y: b.y, r: b.r * 3, a: 0.9 * (1 - b.age / b.life), tint: 'fire' });
  }

  /** Lingering smoke (normal blending) — world transform, after the bodies */
  smoke(ctx: CanvasRenderingContext2D, night: boolean) {
    if (!this.puffs.length) return;
    const s = this.sprites().smoke;
    for (const p of this.puffs) {
      if (p.age <= 0) continue;
      const u = p.age / p.life, r = p.r + p.grow * Math.sqrt(p.age);
      ctx.globalAlpha = (night ? 0.55 : 0.75) * Math.min(1, p.age * 3) * (1 - u) * (0.7 + 0.3 * p.shade);
      ctx.drawImage(s, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** Fire, rings, sparks — additive. World transform; `lw` = one screen pixel in metres */
  additive(ctx: CanvasRenderingContext2D, lw: number) {
    if (!this.sparks.length && !this.balls.length && !this.rings.length) return;
    const sp = this.sprites();
    // soft, non-additive dust and steam first
    for (const b of this.balls) {
      if (b.kind === 'fire' || b.age <= 0) continue;
      const u = b.age / b.life, r = b.r * (0.7 + 0.8 * u);
      ctx.globalAlpha = 0.7 * (1 - u);
      ctx.drawImage(b.kind === 'dust' ? sp.dust : sp.steam, b.x - r, b.y - r, r * 2, r * 2);
    }
    // dirt clods: solid, normal blending
    ctx.lineCap = 'round'; ctx.strokeStyle = '#5a4630';
    for (const s of this.sparks) {
      if (s.hot > 0.2) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2)); ctx.lineWidth = lw * s.w * 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.balls) {
      if (b.kind !== 'fire' || b.age <= 0) continue;
      const u = b.age / b.life, r = b.r * (0.35 + 0.9 * Math.sqrt(u));
      ctx.globalAlpha = Math.min(1, (1 - u) * 1.3);
      ctx.drawImage(u < 0.3 ? sp.core : sp.fire, b.x - r, b.y - r, r * 2, r * 2);
    }
    for (const r of this.rings) {
      const u = r.age / r.life, rad = r.r * (1 - Math.pow(1 - u, 3));       // fast out, slowing
      ctx.globalAlpha = (1 - u) * (r.hot ? 0.9 : 0.6);
      ctx.strokeStyle = r.hot ? 'rgba(255,230,190,1)' : 'rgba(230,210,170,1)';
      ctx.lineWidth = lw * (r.hot ? 10 : 6) * (1 - u) + lw;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, r.hot ? rad : rad * 0.18, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.lineCap = 'round';
    for (const s of this.sparks) {
      if (s.hot <= 0.2) continue;
      const u = 1 - s.life / s.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
      ctx.strokeStyle = `rgb(255,${190 + 60 * s.hot | 0},${90 + 120 * s.hot | 0})`;
      ctx.lineWidth = lw * s.w * (1.4 - u * 0.6);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.045, s.y - s.vy * 0.045); ctx.stroke();    // stretched along the velocity
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /** The white frame — screen space, after everything */
  flash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flashA < 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,248,235,${Math.min(1, this.flashA)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  clear() { this.sparks = []; this.balls = []; this.rings = []; this.puffs = []; this.flashA = 0; }
}
