/**
 * Environment renderer for the launch view — sky, festival, weather, sea, lights.
 *
 * Frame order (LaunchView.frame calls these in this order):
 *
 *   1  backdrop()      SCREEN  sky gradient (day / full-moon night), moon, stars,
 *                              two far parallax layers of festival lanterns (bokeh)
 *   2  ── world transform (metres, y up) ──
 *      clouds()        WORLD   soft puff clouds (more when cloudy), moon-lit at night
 *      surface()       WORLD   land stretches + sea (waves, foam, moon & light reflections)
 *      …LaunchView draws pad, shadows, particles, bodies, and calls light() per light source…
 *      lights()        WORLD   every collected light in ONE additive batch ('lighter')
 *      waterFront()    WORLD   translucent water over anything sitting in the sea, splashes, shark
 *   3  ── back to screen ──
 *      front()         SCREEN  rain, wind streaks, near out-of-focus lanterns, night vignette
 *
 * Cost control
 *   • every soft shape is a sprite rendered ONCE to an offscreen canvas (bokeh, glow, cloud
 *     puff, rain streak); per-frame work is drawImage only — no per-particle gradients
 *   • particle state lives in Float32Arrays sized at the maximum; `quality` (0.35–1, adapted
 *     from frame time by LaunchView) decides how many of them are drawn
 *   • layers gate themselves on altitude / weather / time of day and return early
 *   • shadowBlur (expensive) is used only by the hero lantern, and only when quality > 0.5
 *
 * Rendering only: reads camera numbers and a SurfaceTrack; never touches the Flight.
 */
import { isSea, type SurfaceTrack } from '@/world/surface';
import { CEL } from './celStyle';

export type Weather = 'clear' | 'cloudy' | 'rain';
export interface SceneConfig {
  night: boolean;
  /** Full Moon lantern festival in the sky (Koh Phangan, night) */
  festival: boolean;
  weather: Weather;
  surface: SurfaceTrack;
  /** Ground wind at the site (m/s) — drives streaks, waves and flutter */
  wind: number;
  seed: number;
}
export interface Cam { x: number; y: number; k: number; w: number; h: number }
export interface Light { x: number; y: number; r: number; a: number; tint: 'warm' | 'fire' | 'cool' }

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
type RGB = [number, number, number];
const DAY: [number, RGB][] = [[0, [206, 228, 255]], [2_000, [176, 210, 250]], [10_000, [110, 162, 230]], [22_000, [52, 102, 182]], [40_000, [22, 46, 104]], [65_000, [8, 15, 44]], [100_000, [1, 2, 8]]];
const NIGHT: [number, RGB][] = [[0, [34, 38, 78]], [1_500, [22, 26, 60]], [8_000, [12, 15, 38]], [30_000, [5, 7, 20]], [100_000, [1, 2, 8]]];
function skyAt(pal: [number, RGB][], h: number): string {
  let c = pal[pal.length - 1][1];
  if (h <= pal[0][0]) c = pal[0][1];
  else for (let i = 1; i < pal.length; i++) if (h <= pal[i][0]) {
    const [h0, c0] = pal[i - 1], [h1, c1] = pal[i], t = (h - h0) / (h1 - h0);
    c = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]; break;
  }
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}
/** Deterministic hash → [0,1) */
const hash = (i: number, s: number) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- sprites (rendered once) ---------- */
function sprite(size: number, paint: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = size;
  paint(c.getContext('2d')!, size); return c;
}
const radial = (stops: [number, string][]) => (g: CanvasRenderingContext2D, s: number) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
};

const STARS = Array.from({ length: 260 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), r: 0.4 + hash(i, 3) * 1.1, tw: hash(i, 4) * 40 }));
const CLOUDS = Array.from({ length: 30 }, (_, i) => ({ x: (i - 15) * 900 + hash(i, 5) * 500, y: 1100 + hash(i, 6) * 2800, w: 260 + hash(i, 7) * 420, n: 4 + Math.floor(hash(i, 8) * 4) }));

interface Layer { n: number; px: number; size: [number, number]; alpha: number; rise: number; front?: boolean }
/** Festival lantern layers: far, mid (backdrop) and near (foreground, blurred) — parallax px per metre of camera move */
const FESTIVAL: Layer[] = [
  { n: 240, px: 0.12, size: [1.6, 3.2], alpha: 0.75, rise: 5 },
  { n: 110, px: 0.45, size: [4, 8], alpha: 0.8, rise: 11 },
  { n: 14, px: 5, size: [28, 64], alpha: 0.42, rise: 30, front: true },
];

export class Environment {
  cfg: SceneConfig = { night: false, festival: false, weather: 'clear', surface: { land: [[-1e7, 1e7]], inland: true }, wind: 2, seed: 1 };
  /** 0.35–1: scales particle counts and switches off the dearest effects; LaunchView adapts it */
  quality = 1;
  private t = 0;
  private sp: Record<'bokeh' | 'bokehNear' | 'warm' | 'fire' | 'cool' | 'puff' | 'moon', HTMLCanvasElement>;
  // weather particles (screen space)
  private rain = new Float32Array(700 * 3);     // x, y, speed factor
  private streak = new Float32Array(90 * 3);    // x, y, length
  // splashes & the shark (world space)
  private drops: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private ripples: { x: number; t0: number; size: number }[] = [];
  private sharks: { x: number; t0: number; r: number }[] = [];
  /** Lights collected this frame (world space), drawn in one additive batch */
  private lightList: Light[] = [];
  /** Screen x of the moon (for sea reflections) */
  private moonX = 0;

  constructor() {
    this.sp = {
      bokeh: sprite(32, radial([[0, 'rgba(255,236,190,1)'], [0.25, 'rgba(255,190,100,0.9)'], [0.6, 'rgba(255,140,50,0.25)'], [1, 'rgba(255,120,40,0)']])),
      bokehNear: sprite(96, (g, s) => {                       // out-of-focus disc: soft body, slightly brighter rim
        radial([[0, 'rgba(255,190,90,0.9)'], [0.7, 'rgba(255,150,50,0.75)'], [0.86, 'rgba(255,195,110,0.95)'], [1, 'rgba(255,140,40,0)']])(g, s);
      }),
      warm: sprite(64, radial([[0, 'rgba(255,215,140,0.6)'], [0.25, 'rgba(255,170,80,0.3)'], [0.6, 'rgba(255,130,50,0.1)'], [1, 'rgba(255,120,40,0)']])),
      fire: sprite(64, radial([[0, 'rgba(255,250,220,1)'], [0.2, 'rgba(255,170,60,0.7)'], [0.55, 'rgba(255,90,20,0.22)'], [1, 'rgba(255,60,0,0)']])),
      cool: sprite(64, radial([[0, 'rgba(220,240,255,0.9)'], [0.35, 'rgba(150,200,255,0.35)'], [1, 'rgba(120,170,255,0)']])),
      puff: sprite(64, radial([[0, 'rgba(255,255,255,0.95)'], [0.55, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']])),
      moon: sprite(128, (g, s) => {
        radial([[0, 'rgba(255,250,225,0.5)'], [0.3, 'rgba(255,245,215,0.18)'], [1, 'rgba(255,240,200,0)']])(g, s);
        g.fillStyle = '#fbf5df'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.16, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(200,190,160,0.35)';                  // maria
        for (const [dx, dy, r] of [[-0.04, -0.03, 0.05], [0.05, 0.02, 0.035], [-0.01, 0.06, 0.03]]) { g.beginPath(); g.arc(s / 2 + dx * s, s / 2 + dy * s, r * s, 0, Math.PI * 2); g.fill(); }
      }),
    };
    this.seedWeather();
  }

  configure(c: SceneConfig) { this.cfg = c; this.drops = []; this.ripples = []; this.sharks = []; this.seedWeather(); }

  private seedWeather() {
    for (let i = 0; i < 700; i++) { this.rain[i * 3] = hash(i, 11); this.rain[i * 3 + 1] = hash(i, 12); this.rain[i * 3 + 2] = 0.7 + hash(i, 13) * 0.6; }
    for (let i = 0; i < 90; i++) { this.streak[i * 3] = hash(i, 21); this.streak[i * 3 + 1] = hash(i, 22); this.streak[i * 3 + 2] = 0.4 + hash(i, 23); }
  }

  /** Wind at altitude (m/s) — the same shape as the flight's wind profile, for visuals only */
  windAt(alt: number) { return this.cfg.wind * Math.min(3, Math.pow(Math.max(1, alt) / 10, 0.14)) * Math.exp(-Math.max(0, alt) / 8500); }

  /** Advance animated state by real time (s). `cam` in metres / px-per-metre. */
  update(dt: number, cam: Cam) {
    this.t += dt;
    const g = 9.81;
    for (const d of this.drops) { d.vy -= g * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; }
    this.drops = this.drops.filter((d) => d.life > 0 && d.y > -0.5);
    this.ripples = this.ripples.filter((r) => this.t - r.t0 < 3.5);
    // screen-space rain and streaks: wrap in [0,1)
    const w = Math.max(1, cam.w), h = Math.max(1, cam.h), wind = this.windAt(cam.y);
    for (let i = 0; i < 700; i++) {
      const s = this.rain[i * 3 + 2];
      this.rain[i * 3 + 1] = (this.rain[i * 3 + 1] + (dt * 900 * s) / h) % 1;
      this.rain[i * 3] = (((this.rain[i * 3] + (dt * wind * 25 * s) / w) % 1) + 1) % 1;
    }
    for (let i = 0; i < 90; i++) this.streak[i * 3] = (((this.streak[i * 3] + (dt * (80 + wind * 60) * this.streak[i * 3 + 2]) / w) % 1) + 1) % 1;
  }

  /** Something hit the water at ground distance x (m): spray, rings, and — once — a shark */
  splash(x: number, size: number) {
    const n = Math.min(80, 20 + size * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (hash(i, this.t * 7) - 0.5) * 1.6, v = (3 + hash(i, this.t * 3) * 7) * Math.sqrt(Math.max(0.5, size / 2));
      this.drops.push({ x: x + (hash(i, 31) - 0.5) * size, y: 0.1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.2 + hash(i, 33) });
    }
    this.ripples.push({ x, t0: this.t, size: Math.max(1, size) });
    if (!this.sharks.some((s) => Math.abs(s.x - x) < 30)) this.sharks.push({ x, t0: this.t + 1.4, r: Math.max(5, size * 2.2) });
  }

  isSea(x: number) { return isSea(this.cfg.surface, x); }

  /* ---------------- 1. backdrop (screen space) ---------------- */
  backdrop(ctx: CanvasRenderingContext2D, cam: Cam) {
    const { w, h, k } = cam, c = this.cfg;
    const pal = c.night ? NIGHT : DAY;
    const top = cam.y + h / 2 / k, bot = cam.y - h / 2 / k;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, skyAt(pal, Math.max(top, cam.y + 400)));
    g.addColorStop(1, skyAt(pal, Math.max(0, bot)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (c.weather !== 'clear' && cam.y < 4000) {                 // overcast: flatten and grey the sky below the deck
      ctx.fillStyle = c.night ? 'rgba(20,22,30,0.35)' : `rgba(150,160,175,${c.weather === 'rain' ? 0.45 : 0.22})`;
      ctx.globalAlpha = 1 - smooth(2500, 4500, cam.y); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
    // stars: night from the ground, everyone above ~50 km
    const stars = Math.max(c.night && c.weather !== 'rain' ? 0.85 : 0, smooth(45_000, 100_000, cam.y));
    if (stars > 0.01) {
      ctx.fillStyle = '#fff';
      for (const s of STARS) {
        const x = (((s.x * w - cam.x * 0.002) % w) + w) % w, y = (((s.y * h + cam.y * 0.001) % h) + h) % h;
        ctx.globalAlpha = stars * (0.45 + 0.55 * Math.sin(this.t * 2 + s.tw));
        ctx.fillRect(x, y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }
    // the full moon (it is the Full Moon festival)
    this.moonX = w * 0.78 - cam.x * 0.01;
    if (c.night && c.weather !== 'rain') { const m = this.sp.moon, s = Math.min(w, h) * 0.42; ctx.drawImage(m, this.moonX - s / 2, h * 0.2 - s / 2 + cam.y * 0.004, s, s); }
    // far festival lanterns
    if (c.festival) for (const L of FESTIVAL) if (!L.front) this.bokehLayer(ctx, cam, L);
  }

  /** One parallax layer of drifting lanterns: positions on a wrapped screen-sized tile */
  private bokehLayer(ctx: CanvasRenderingContext2D, cam: Cam, L: Layer) {
    const { w, h } = cam, n = Math.floor(L.n * (L.front ? 1 : this.quality));
    // the festival hangs over the island: it thins out as we climb above ~1.5 km
    const fade = 1 - smooth(600, 3000, cam.y);
    if (fade <= 0.01) return;
    const spr = L.front ? this.sp.bokehNear : this.sp.bokeh;
    const ox = -cam.x * L.px, oy = cam.y * L.px, wind = this.windAt(Math.max(30, cam.y));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const sz = L.size[0] + hash(i, L.px * 9) * (L.size[1] - L.size[0]);
      const tx = w * 1.2, ty = h * 1.25;
      const x = ((((hash(i, L.px) * tx + ox + this.t * wind * L.px * 3 + Math.sin(this.t * 0.6 + i) * 3) % tx) + tx) % tx) - w * 0.1;
      const y = ((((hash(i, L.px * 3) * ty + oy - this.t * L.rise * (0.6 + hash(i, 7) * 0.8)) % ty) + ty) % ty) - h * 0.1;
      ctx.globalAlpha = L.alpha * fade * (0.65 + 0.35 * Math.sin(this.t * 3 + i * 1.7));   // flame flicker
      ctx.drawImage(spr, x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- 2. world layers ---------------- */
  clouds(ctx: CanvasRenderingContext2D, cam: Cam) {
    const c = this.cfg, n = c.weather === 'clear' ? 14 : CLOUDS.length;
    const tint = c.night ? 'rgba(70,78,110,0.85)' : c.weather === 'rain' ? 'rgba(170,176,188,0.95)' : 'rgba(255,255,255,0.92)';
    const halfW = cam.w / 2 / cam.k, halfH = cam.h / 2 / cam.k;
    const drift = this.t * this.cfg.wind * 0.6;
    for (let i = 0; i < n; i++) {
      const cl = CLOUDS[i];
      const cx = cl.x + drift;
      if (cx + cl.w < cam.x - halfW || cx - cl.w > cam.x + halfW || cl.y - cl.w * 0.4 > cam.y + halfH || cl.y + cl.w * 0.4 < cam.y - halfH) continue;
      ctx.globalAlpha = c.night ? 0.6 : 0.9;
      for (let j = 0; j < cl.n; j++) {
        const px = cx + (j - cl.n / 2) * cl.w * 0.22, py = cl.y + hash(j, i) * cl.w * 0.12, r = cl.w * (0.28 + hash(j, i + 50) * 0.18);
        ctx.drawImage(this.sp.puff, px - r, py - r, r * 2, r * 2);
      }
      // shaded belly
      ctx.fillStyle = tint; ctx.globalAlpha = c.night ? 0.35 : 0.18;
      ctx.beginPath(); ctx.ellipse(cx, cl.y - cl.w * 0.06, cl.w * 0.55, cl.w * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Land stretches and the sea, between the camera's left and right edge */
  surface(ctx: CanvasRenderingContext2D, cam: Cam, lw: number) {
    const halfW = cam.w / 2 / cam.k + 50, bot = cam.y - cam.h / 2 / cam.k;
    if (bot > 60) return;
    const x0 = cam.x - halfW, x1 = cam.x + halfW, c = this.cfg, night = c.night;
    // sea everywhere first (the land is drawn over it)
    if (!c.surface.inland || x0 < c.surface.land[0][0] || x1 > c.surface.land[0][1]) {
      const sg = ctx.createLinearGradient(0, 0.5, 0, -Math.max(20, halfW * 0.4));
      sg.addColorStop(0, night ? '#1d2c52' : '#4fa3c7'); sg.addColorStop(1, night ? '#0a1024' : '#1d5f8a');
      ctx.fillStyle = sg; ctx.fillRect(x0, -4000, x1 - x0, 4000);
    }
    // land
    const land = c.surface.inland ? c.surface.land : c.surface.land.filter(([a, b]) => b > x0 && a < x1);
    for (const [a0, b0] of land) {
      const a = Math.max(a0, x0), b = Math.min(b0, x1);
      if (b <= a) continue;
      ctx.fillStyle = night ? '#2c3f2e' : '#7a9a5c'; ctx.fillRect(a, -4000, b - a, 3998);
      ctx.fillStyle = night ? '#3d5a3c' : '#9cc27a'; ctx.fillRect(a, -2, b - a, 2);
      // beaches where land meets sea
      ctx.fillStyle = night ? '#6b6550' : '#e8d7a5';
      if (a0 > x0 && !c.surface.inland) ctx.fillRect(a0, -2, Math.min(25, b0 - a0), 2.05);
      if (b0 < x1 && !c.surface.inland) ctx.fillRect(b0 - Math.min(25, b0 - a0), -2, Math.min(25, b0 - a0), 2.05);
      ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 2;
      ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(b, 0); ctx.stroke();
    }
    this.waves(ctx, cam, lw, x0, x1);
  }

  /** Animated wave line over every sea stretch, plus moon / light glints on the water */
  private waves(ctx: CanvasRenderingContext2D, cam: Cam, lw: number, x0: number, x1: number) {
    const c = this.cfg, step = Math.max(0.15, 6 / cam.k), A = 0.12 + this.cfg.wind * 0.03;
    ctx.strokeStyle = c.night ? 'rgba(160,190,255,0.55)' : 'rgba(235,248,255,0.9)'; ctx.lineWidth = lw * 2;
    ctx.beginPath();
    let pen = false;
    for (let x = x0; x <= x1; x += step) {
      if (!this.isSea(x)) { pen = false; continue; }
      const y = A * Math.sin(x * 0.9 + this.t * 2.2) + A * 0.5 * Math.sin(x * 2.3 - this.t * 3.1);
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    }
    ctx.stroke();
    if (!c.night) return;
    // moon glitter path straight below the moon
    const mx = cam.x + (this.moonX - cam.w / 2) / cam.k;
    if (c.weather !== 'rain' && this.isSea(mx)) {
      ctx.fillStyle = 'rgba(255,245,210,0.55)';
      const n = Math.floor(26 * this.quality);
      for (let i = 0; i < n; i++) {
        const d = hash(i, 41) * Math.min(60, cam.h / 2 / cam.k), wv = (0.6 + hash(i, 42)) * (0.5 + d * 0.06);
        const jx = mx + Math.sin(this.t * 2 + i) * wv * 0.6;
        ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(this.t * 3 + i * 2.1));
        ctx.fillRect(jx - wv / 2, -d, wv, Math.max(lw * 1.5, 0.05));
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Forget queued lights (after an offscreen bake) */
  dropLights() { this.lightList.length = 0; }

  /** Queue a light (flame, glowing lantern, fire) for the additive pass */
  light(l: Light) { if (this.lightList.length < 64) this.lightList.push(l); }

  /** One additive pass for every light; at night lights also paint the ground / water below */
  lights(ctx: CanvasRenderingContext2D) {
    const night = this.cfg.night, gain = night ? 1 : 0.45;
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lightList) {
      const s = this.sp[l.tint];
      ctx.globalAlpha = Math.min(1, l.a * gain);
      ctx.drawImage(s, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      // pool of light on the ground / a reflection column on the water
      const reach = l.r * 6;
      if (night && l.y < reach) {
        const k = (1 - l.y / reach) * l.a * 0.6;
        ctx.globalAlpha = k;
        if (this.isSea(l.x)) { ctx.save(); ctx.translate(l.x, 0); ctx.scale(0.35, 1.8); ctx.drawImage(s, -l.r, -l.r * 2, l.r * 2, l.r * 2); ctx.restore(); }
        else { ctx.save(); ctx.translate(l.x, 0); ctx.scale(2.2, 0.35); ctx.drawImage(s, -l.r, -l.r, l.r * 2, l.r * 2); ctx.restore(); }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    this.lightList.length = 0;
  }

  /** Translucent water over anything resting in the sea; spray, rings and the shark */
  waterFront(ctx: CanvasRenderingContext2D, cam: Cam, lw: number) {
    const halfW = cam.w / 2 / cam.k + 10, x0 = cam.x - halfW, x1 = cam.x + halfW, night = this.cfg.night;
    if (cam.y - cam.h / 2 / cam.k > 60) return;
    ctx.fillStyle = night ? 'rgba(20,34,70,0.55)' : 'rgba(40,120,170,0.5)';
    const step = Math.max(0.2, 8 / cam.k);
    let run = -1;
    for (let x = x0; x <= x1 + step; x += step) {
      const sea = x <= x1 && this.isSea(x);
      if (sea && run < 0) run = x;
      if (!sea && run >= 0) { ctx.fillRect(run, -400, x - run, 400.05 + 0.1 * Math.sin(this.t * 2 + run)); run = -1; }
    }
    // spray
    ctx.fillStyle = night ? 'rgba(200,220,255,0.85)' : 'rgba(255,255,255,0.95)';
    for (const d of this.drops) { const r = Math.max(lw * 2, 0.08); ctx.globalAlpha = Math.min(1, d.life); ctx.fillRect(d.x - r, d.y - r, r * 2, r * 2); }
    ctx.globalAlpha = 1;
    // rings
    ctx.strokeStyle = night ? 'rgba(180,200,255,0.7)' : 'rgba(255,255,255,0.85)';
    for (const r of this.ripples) {
      const age = this.t - r.t0;
      for (let i = 0; i < 3; i++) {
        const a = age - i * 0.45; if (a <= 0) continue;
        ctx.globalAlpha = Math.max(0, 1 - a / 3); ctx.lineWidth = lw * 2;
        ctx.beginPath(); ctx.ellipse(r.x, 0.05, r.size * (0.6 + a * 2.2), r.size * 0.12 * (1 + a * 0.4), 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const s of this.sharks) this.shark(ctx, s, lw);
  }

  /** A dorsal fin circling the wreck: side-on view of a circle = back and forth, nearer = bigger */
  private shark(ctx: CanvasRenderingContext2D, s: { x: number; t0: number; r: number }, lw: number) {
    const age = this.t - s.t0;
    if (age < 0) return;
    const ph = age * (2 * Math.PI / 8);                    // one lap every 8 s
    const x = s.x + Math.cos(ph) * s.r, depth = Math.sin(ph);   // depth > 0: in front of the wreck
    const dir = -Math.sin(ph) >= 0 ? 1 : -1;                     // moving right or left
    const sc = Math.max(1.1, s.r * 0.12) * (1 + 0.18 * depth) * Math.min(1, age / 1.2);   // cartoon-sized: the joke has to read at any zoom
    const bob = Math.sin(age * 3) * 0.04;
    ctx.save();
    ctx.translate(x, bob); ctx.scale(dir * sc, sc);
    ctx.globalAlpha = 0.75 + 0.25 * depth;
    // wake
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = lw * 2 / sc; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.15, 0.02); ctx.lineTo(-0.9, 0.12); ctx.moveTo(-0.15, 0.02); ctx.lineTo(-0.9, -0.05); ctx.stroke();
    // fin
    const fin = new Path2D(); fin.moveTo(-0.32, 0); fin.quadraticCurveTo(-0.2, 0.55, 0.22, 0.95); fin.quadraticCurveTo(0.12, 0.45, 0.36, 0); fin.closePath();
    ctx.fillStyle = '#6f7d8c'; ctx.fill(fin);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(-0.2, 0.05); ctx.quadraticCurveTo(-0.12, 0.45, 0.16, 0.8); ctx.lineTo(0.02, 0.1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 2.2 / sc; ctx.stroke(fin);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------------- 3. front (screen space) ---------------- */
  front(ctx: CanvasRenderingContext2D, cam: Cam) {
    const { w, h } = cam, c = this.cfg, q = this.quality;
    // rain below the cloud deck
    const rainK = c.weather === 'rain' ? 1 - smooth(2200, 3200, cam.y) : 0;
    if (rainK > 0.01) {
      const n = Math.floor(700 * q * rainK), slant = Math.max(-0.6, Math.min(0.6, this.windAt(cam.y) * 0.05));
      ctx.strokeStyle = c.night ? 'rgba(170,190,230,0.45)' : 'rgba(80,95,120,0.38)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = this.rain[i * 3] * w, y = this.rain[i * 3 + 1] * h, L = 10 + 12 * this.rain[i * 3 + 2];
        ctx.moveTo(x, y); ctx.lineTo(x + slant * L, y + L);
      }
      ctx.stroke();
    }
    // wind streaks: visible when it blows (fade out in the thin air)
    const wind = this.windAt(cam.y), sk = Math.min(1, Math.max(0, (wind - 2.5) / 6)) * (1 - smooth(8000, 15000, cam.y));
    if (sk > 0.02) {
      const n = Math.floor(90 * q * sk);
      ctx.strokeStyle = c.night ? 'rgba(200,210,255,0.22)' : 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = this.streak[i * 3] * w * 1.2 - w * 0.1, y = this.streak[i * 3 + 1] * h, L = 30 + 70 * this.streak[i * 3 + 2];
        const wob = Math.sin(this.t * 2 + i) * 3;
        ctx.moveTo(x, y + wob); ctx.quadraticCurveTo(x + L * 0.5, y + wob - 4, x + L, y + wob);
      }
      ctx.stroke();
    }
    // near, out-of-focus lanterns sliding past the lens
    if (c.festival) this.bokehLayer(ctx, cam, FESTIVAL[2]);
    // night vignette
    if (c.night && cam.y < 30_000) {
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0,0,10,0)'); v.addColorStop(1, 'rgba(0,0,10,0.45)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    }
  }
}
