/**
 * Launch canvas renderer — draws a live `Flight`.
 *
 *   camera   follows a target (vehicle CoM, a dropped stage, or a flying
 *            zombie head) with a critically damped lerp; auto zoom frames
 *            the vehicle, the player's zoom multiplies it
 *   sky      colour by altitude: pale blue → stratosphere blue → black,
 *            stars fading in above ~50 km
 *   world    ground, pad rail / bamboo ramp, clouds and an altitude ladder
 *            for a sense of speed when the ground is out of sight
 *   bodies   every part drawn with the factory's drawings, rotated with
 *            its body; flames at burning nozzles (with gimbal), canopies
 *   vfx      the cel-shaded particle system (smoke, slime, limbs, worms)
 *   env      vfx/environment.ts: day / full-moon night sky, festival lanterns in parallax,
 *            clouds, rain, wind streaks, land vs sea, one additive light pass, splashes, shark
 *
 * Frame (v0.19):  backdrop → [world: clouds, surface, pad, shadows, particles, bodies,
 *                 lights, water front] → front weather → ladder.  Quality adapts to frame time.
 */
import { PART, materialFor } from '@/phases/assembly/model/catalog';
import { riderOf } from '@/phases/assembly/model/vehicle';
import { drawPart } from '@/phases/assembly/ui/drawParts';
import { toLocal, R_EARTH, MU_EARTH, type Body, type Flight } from '@/physics/flight2d';
import { ZombieRig } from '@/rig/zombieRig';
import { ParticleSystem, type Particle } from '@/vfx/particles';
import { CEL, celFill } from '@/vfx/celStyle';
import { drawZombie, drawJar } from '@/vfx/zombieArt';
import type { Limb } from '@/payload/zombies';
import { Environment, type Cam } from '@/vfx/environment';
import { drawLantern, drawBurntLantern } from '@/vfx/lanternArt';
import { FxLayer } from '@/juice/fxLayer';
import { drawSilhouette } from '@/juice/silhouette';
import type { Heightfield } from '@/world/terrain';

/** A wreck from an earlier flight, baked to an image (decor — not a collider) */
export interface Wreck { c: HTMLCanvasElement; x0: number; y1: number; k: number }
/** A scorch mark on the ground at ground distance s, radius r (m) */
export interface Mark { s: number; r: number }
/** What the view reports when a body first comes to rest */
export interface Touch { x: number; vx: number; vy: number; sp: number; mass: number; size: number; sea: boolean; hero: boolean }

export type CamTarget = { kind: 'vehicle' } | { kind: 'body'; id: number } | { kind: 'head' } | { kind: 'eva' };


export class LaunchView {
  readonly particles = new ParticleSystem(3000);
  /** Sky, weather, sea and lights (configured per flight by LaunchPhase) */
  readonly env = new Environment();
  /** A body came to rest (ground or sea): LaunchPhase turns it into craters, FX and sound */
  onTouch: (t: Touch) => void = () => {};
  /** Additive explosions, sparks, lingering smoke (Phase J1) */
  readonly fx = new FxLayer();
  /** Camera juice from the ImpactDirector: screen offset (px), zoom, roll */
  juice = { dx: 0, dy: 0, zoom: 1, roll: 0 };
  /** Visual time scale (hit-stop / slow-mo) for the weather and decor animation */
  timeScale = 1;
  /** A severed limb landed in the sea (LaunchPhase: a sound and one CAPCOM line) */
  onLimbSea: ((limb: Limb, x: number) => void) | null = null;
  /** This site's terrain (craters), scorch marks and old wrecks — owned by LaunchPhase */
  terrain: Heightfield | null = null;
  marks: Mark[] = [];
  wrecks: Wreck[] = [];
  /** How close each part is to failing (Flight.strain), for the damage flicker */
  strainOf: ((b: Body, it: Body['items'][number]) => number) | null = null;
  private groundCanvas: HTMLCanvasElement | null = null;
  /** J3: the zombie's bone rig (null when nobody is aboard) and what it feels */
  rig: ZombieRig | null = null;
  private feltSrc = { vx: 0, vy: 0, t: -1, fx: 0, fy: -9.81 };
  private landedSeen = new Set<number>();
  /** Bodies resting in the sea: when they splashed (real s) and how big they are — they sink and list */
  private sinking = new Map<number, { t0: number; span: number }>();
  private frameMs = 8;
  target: CamTarget = { kind: 'vehicle' };
  /** Player zoom on top of the automatic framing */
  zoom = 1;
  private cam = { x: 0, y: 0, k: 40 };
  private ctx: CanvasRenderingContext2D;
  private w = 1; private h = 1; private dpr = 1;
  private ro: ResizeObserver;
  private flicker = 0;
  private off = { x: 0, y: 0 };
  /** Pull the camera back to frame a burst (until real time `until`), and shake */
  private burstK = 0; private burstUntil = 0;

  /** Called when an explosion fx appears: frame it, and shake for real blasts */
  private burstAt: [number, number] | null = null;
  burst(radius: number, firework: boolean, x?: number, y?: number) {
    this.burstK = (this.h * 0.42) / Math.max(4, radius);
    this.burstAt = firework && x !== undefined && y !== undefined ? [x, y] : null;
    this.burstUntil = performance.now() + (firework ? 2800 : 1800);
  }
  private lastKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  dispose() { this.ro.disconnect(); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
  }

  /** Snap the camera to the vehicle (on load / relaunch) */
  reset(f: Flight) {
    { const xs = f.vehicle.corners.map(([x]) => Math.abs(x - f.vehicle.cx)); this.spiritX = -((xs.length ? Math.max(...xs) : 1) + 1.8); }
    this.particles.pool.forEach((p) => (p.alive = false));
    this.landedSeen.clear(); this.sinking.clear();
    this.rig = f.zombieId ? new ZombieRig(f.zombieId, f.zombie?.limbs) : null;
    // flying limbs land on the real ground (crater floors) and float at sea level offshore
    this.particles.groundAt = (s) => (this.env.isSea(s) ? 0 : this.terrain ? Math.min(0, this.terrain.heightAt(s)) : 0);
    this.particles.onRest = (p) => {
      if (!this.env.isSea(p.x)) return;
      this.env.splash(p.x, 0.5);           // spray, rings — and the shark comes to look
      p.y = -0.08;                         // floats low in the water (the water layer draws over it)
      if (p.limb) this.onLimbSea?.(p.limb, p.x);
    };
    this.feltSrc = { vx: 0, vy: 0, t: -1, fx: 0, fy: -9.81 };
    this.target = { kind: 'vehicle' };
    this.zoom = 1;
    const [x, y] = this.focus(f);
    this.cam = { x, y, k: this.autoK(f) };
    this.off = { x: 0, y: 0 };
    this.lastKey = JSON.stringify(this.target);
  }

  /** Where the camera wants to look */
  private focus(f: Flight): [number, number] {
    // a firework gets the camera for a moment
    if (this.burstAt && performance.now() < this.burstUntil) return this.burstAt;
    if (this.target.kind === 'head') {
      const h = this.head();
      if (h) return [h.x, h.y];
      this.target = { kind: 'vehicle' };
    }
    if (this.target.kind === 'body') {
      const id = this.target.id;
      const b = f.bodies.find((q) => q.id === id);
      if (b) return this.centre(b);
      this.target = { kind: 'vehicle' };
    }
    if (this.target.kind === 'eva') {
      if (f.eva && !f.eva.ended) { const L = toLocal(f.eva.body.x, f.eva.body.y); return [L.s, L.h]; }
      this.target = { kind: 'vehicle' };
    }
    return this.centre(f.vehicle);
  }

  /** Middle of a body's outline (not its CoM — a heavy engine would push the nose off screen) */
  private centre(b: Body): [number, number] {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [bx, by] of b.corners) { x0 = Math.min(x0, bx); x1 = Math.max(x1, bx); y0 = Math.min(y0, by); y1 = Math.max(y1, by); }
    const [wx, wy] = b.toWorld((x0 + x1) / 2, (y0 + y1) / 2);
    const L = toLocal(wx, wy);
    return [L.s, L.h];
  }

  head(): Particle | undefined {
    return this.particles.pool.find((p) => p.alive && p.kind === 'limb' && p.limb === 'head');
  }

  private targetBody(f: Flight): Body {
    if (this.target.kind === 'body') { const id = this.target.id; return f.bodies.find((b) => b.id === id) ?? f.vehicle; }
    return f.vehicle;
  }

  /** px per metre so the followed thing fills ~40% of the screen height */
  private autoK(f: Flight): number {
    if (this.target.kind === 'head') return 420;
    if (this.target.kind === 'eva') return Math.min(160, (this.h * 0.4) / 3);     // zombie + a few metres around it
    const b = this.targetBody(f);
    let lo = Infinity, hi = -Infinity;
    for (const [, y] of b.corners) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    for (const [x] of b.corners) { lo = Math.min(lo, x); hi = Math.max(hi, x); }   // rough size incl. width
    const size = Math.max(1, hi - lo);
    return Math.max(2, Math.min(260, (this.h * 0.4) / size));
  }

  frame(f: Flight, realDt: number) {
    const { ctx } = this;
    // Camera: locked on the target; when the target changes, the old view eases over (offset decays)
    const [fx, fy] = this.focus(f);
    const key = JSON.stringify(this.target) + (this.burstAt && performance.now() < this.burstUntil ? 'burst' : '');
    if (key !== this.lastKey) { this.off = { x: this.cam.x - fx, y: this.cam.y - fy }; this.lastKey = key; }
    const decay = Math.exp(-realDt * 4);
    this.off.x *= decay; this.off.y *= decay;
    this.cam.x = fx + this.off.x; this.cam.y = fy + this.off.y;
    let kWant = this.autoK(f) * this.zoom;
    if (performance.now() < this.burstUntil) kWant = Math.min(kWant, this.burstK);
    this.cam.k += (kWant - this.cam.k) * (1 - Math.exp(-realDt * 3));
    const k = this.cam.k;
    this.flicker += realDt;

    const t0 = performance.now();
    const cam: Cam = { x: this.cam.x, y: this.cam.y, k, w: this.w, h: this.h };
    const env = this.env;
    env.update(realDt * this.timeScale, cam);
    this.touches(f);
    this.updateRig(f, realDt * this.timeScale);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 1. backdrop (screen, NOT shaken — the sky is far away): sky, moon, stars, far festival lanterns
    env.backdrop(ctx, cam);
    // trauma camera: kick + shake + roll + zoom punch about the screen centre (world and front layers)
    const J = this.juice;
    ctx.translate(this.w / 2 + J.dx, this.h / 2 + J.dy); ctx.rotate(J.roll); ctx.scale(J.zoom, J.zoom); ctx.translate(-this.w / 2, -this.h / 2);
    // 2. world (metres, +y up, centred on the camera)
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(k, -k);
    ctx.translate(-this.cam.x, -this.cam.y);
    const lw = 1.3 / k;
    env.clouds(ctx, cam);
    this.groundPass(cam, lw);
    this.ground(f, lw);
    this.drawWrecks();
    this.shadows(f);
    this.particles.smokeAlpha = env.cfg.night ? 0.3 : 1;
    this.particles.draw(ctx, lw);
    for (const b of f.bodies) this.body(f, b, lw);
    if (f.eva && !f.eva.ended) this.evaBody(f, lw);
    this.fx.smoke(ctx, env.cfg.night);
    this.fx.lights((l) => env.light(l));
    env.lights(ctx);
    this.fx.additive(ctx, lw);
    env.waterFront(ctx, cam, lw);
    if (this.guide !== null && !f.vehicle.landed) this.guideMarker(f, k, lw);
    ctx.restore();
    // 3. front (screen): rain, wind streaks, near bokeh, vignette — then the white flash
    env.front(ctx, cam);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.fx.flash(ctx, this.w, this.h);
    this.ladder();
    // adapt: keep the whole frame under ~12 ms on this device
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.1;
    env.quality = Math.max(0.35, Math.min(1, env.quality + (this.frameMs > 12 ? -0.02 : this.frameMs < 7 ? 0.01 : 0)));
  }

  /** First frame a body comes to rest: sea → spray, rings, shark, sinking; always → onTouch */
  private touches(f: Flight) {
    for (const b of f.bodies) {
      if (!b.landed || this.landedSeen.has(b.id)) continue;
      this.landedSeen.add(b.id);
      const L = toLocal(b.x, b.y);
      let span = 0.5;
      for (const [bx] of b.corners) span = Math.max(span, Math.abs(bx - b.cx));
      const sea = this.env.isSea(L.s);
      if (sea) {
        this.env.splash(L.s, Math.min(8, span * 2));
        this.sinking.set(b.id, { t0: performance.now() / 1000, span });
      }
      const t = b.touch, V = t ? toLocal(b.x, b.y, t.vx, t.vy) : { vs: 0, vh: 0 };
      this.onTouch({ x: L.s, vx: V.vs, vy: V.vh, sp: t?.sp ?? 0, mass: b.M, size: span * 2, sea, hero: b === f.vehicle });
    }
  }

  /** A body at rest sinks with the crater dug under it (the crater is carved after it lands) — drawing only */
  private settle(b: Body, s: number) { return b.landed && this.terrain ? Math.min(0, this.terrain.heightAt(s)) : 0; }

  /**
   * J3: what the zombie FEELS. Proper acceleration a_p = dv/dt − g (an accelerometer's reading),
   * felt pull F = −a_p, rotated into the seat frame. Sitting still: F = (0, −g). Free fall: F = 0.
   * A touchdown that stops the vehicle in one step gives a huge spike → the limbs whip.
   */
  private updateRig(f: Flight, dt: number) {
    const r = this.rig, z = f.zombie;
    if (!r || !z) return;
    r.sync(z.limbs);
    const eva = f.eva && !f.eva.ended ? f.eva.body : null;
    const b = eva ?? f.vehicle;
    const S = this.feltSrc;
    if (S.t >= 0 && f.t - S.t > 1e-6) {
      const h = f.t - S.t;
      const ax = (b.vx - S.vx) / h, ay = (b.vy - S.vy) / h;
      const ry = b.y + R_EARTH, rr = Math.hypot(b.x, ry), gk = -MU_EARTH / (rr * rr * rr);
      const Fx = -(ax - gk * b.x), Fy = -(ay - gk * ry);                   // −(a − g)
      const seatRot = eva ? 0 : this.seatRot(f);
      const th = -(b.th + seatRot), c = Math.cos(th), sn = Math.sin(th);
      const lx = c * Fx - sn * Fy, ly = sn * Fx + c * Fy;
      const k = 1 - Math.exp(-Math.min(0.1, h) / 0.03);
      S.fx += (lx - S.fx) * k; S.fy += (ly - S.fy) * k;
    }
    S.vx = b.vx; S.vy = b.vy; S.t = f.t;
    r.update(dt, { x: S.fx, y: S.fy }, !eva && f.vehicle.landed ? 0 : b.om);
  }

  /** Rotation of the seat part inside its body (quarter turns, rad) */
  private seatRot(f: Flight) {
    const seat = f.vehicle.items.find((it) => riderOf(it.part));
    return seat ? (seat.part.rot * Math.PI) / 2 : 0;
  }

  /** A limb just flew off: hand its rig subtree to the newest matching limb particle */
  attachFragment(limb: Limb) {
    const frag = this.rig?.detach(limb);
    const p = this.particles.newestLimb(limb);
    if (frag && p) p.fragment = frag;
  }

  /** Screen x of a world x, as a stereo pan −1…1 */
  panFor(x: number) { return Math.max(-1, Math.min(1, ((x - this.cam.x) * this.cam.k) / (this.w / 2))); }

  /** Re-entry plasma strength 0–1 for a body (same formula as the drawing) */
  plasmaLevel(b: Body): number {
    const v = Math.hypot(b.vx, b.vy);
    if (b.landed || v < 1500 || b.alt > 95_000) return 0;
    const rho = 1.225 * Math.exp(-Math.max(0, b.alt) / 8500);
    return Math.min(1, ((v - 1500) / 4000) * Math.min(1, rho / 0.002));
  }

  /**
   * Ground with craters. When this site has craters or scorch marks in view, the land/sea is
   * drawn into an offscreen layer with the SAME transform, craters are cut out of it with
   * 'destination-out' (the sky shows through the hole, Worms-style), scorch is laid on with
   * 'source-atop' (it only lands on ground pixels), then the layer is stamped onto the frame.
   */
  private groundPass(cam: Cam, lw: number) {
    const { ctx } = this, env = this.env, T = this.terrain;
    const halfW = cam.w / 2 / cam.k + 60, x0 = cam.x - halfW, x1 = cam.x + halfW;
    const craters = T ? T.craters.filter((c) => c.s + c.r * 1.3 > x0 && c.s - c.r * 1.3 < x1) : [];
    const marks = this.marks.filter((m) => m.s + m.r > x0 && m.s - m.r < x1);
    const low = cam.y - cam.h / 2 / cam.k;
    if ((!craters.length && !marks.length) || low > 60) { env.surface(ctx, cam, lw); return; }
    const gc = (this.groundCanvas ??= document.createElement('canvas'));
    if (gc.width !== this.canvas.width || gc.height !== this.canvas.height) { gc.width = this.canvas.width; gc.height = this.canvas.height; }
    const g = gc.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, gc.width, gc.height);
    g.setTransform(ctx.getTransform());
    env.surface(g, cam, lw);
    // scorch first (on the ground surface around each mark)
    g.globalCompositeOperation = 'source-atop';
    for (const m of marks) {
      const gr = g.createRadialGradient(m.s, 0, 0, m.s, 0, m.r);
      gr.addColorStop(0, 'rgba(20,14,10,0.85)'); gr.addColorStop(0.55, 'rgba(35,25,15,0.5)'); gr.addColorStop(1, 'rgba(40,30,20,0)');
      g.fillStyle = gr; g.save(); g.translate(m.s, 0); g.scale(1, 0.35); g.translate(-m.s, 0);
      g.fillRect(m.s - m.r, -m.r, m.r * 2, m.r * 2); g.restore();
    }
    // carve the bowls: everything between the old ground line (and the grass above it) and the new floor
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';                                              // fully opaque: cut a clean hole
    const step = Math.max(0.1, 2 / cam.k);
    for (const c of craters) {
      g.beginPath(); g.moveTo(c.s - c.r, 3);
      for (let x = c.s - c.r; x <= c.s + c.r; x += step) g.lineTo(x, T!.heightAt(x));
      g.lineTo(c.s + c.r, 3); g.closePath(); g.fill();
    }
    // the new surface: a burnt soil band along each bowl, and ejecta lips on the rims
    g.globalCompositeOperation = 'source-over';
    for (const c of craters) {
      g.beginPath();
      for (let x = c.s - c.r; x <= c.s + c.r; x += step) { const y = T!.heightAt(x); if (x === c.s - c.r) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokeStyle = env.cfg.night ? '#2a2018' : '#4a3626'; g.lineWidth = Math.max(lw * 5, c.depth * 0.12); g.stroke();
      g.strokeStyle = CEL.ink; g.lineWidth = lw * 2; g.stroke();
      g.fillStyle = env.cfg.night ? '#3a3024' : '#6b5238';
      for (const side of [-1, 1]) {
        const ex = c.s + side * c.r, lip = c.r * 0.09;
        g.beginPath(); g.moveTo(ex - side * c.r * 0.05, 0); g.quadraticCurveTo(ex + side * c.r * 0.12, lip * 2, ex + side * c.r * 0.45, 0); g.closePath(); g.fill();
        g.strokeStyle = CEL.ink; g.lineWidth = lw * 1.5; g.stroke();
      }
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(gc, 0, 0); ctx.restore();
  }

  /** Wrecks from earlier flights at this site (baked images) */
  private drawWrecks() {
    const { ctx } = this;
    for (const w of this.wrecks) {
      ctx.save(); ctx.translate(w.x0, w.y1); ctx.scale(1 / w.k, -1 / w.k);
      ctx.drawImage(w.c, 0, 0);
      ctx.restore();
    }
  }

  /**
   * Bake every body that crashed on land into a still image, so it stays at the site after a
   * relaunch. Called by LaunchPhase just before it replaces the flight.
   */
  bakeWrecks(f: Flight): Wreck[] {
    const out: Wreck[] = [];
    const main = this.ctx;
    for (const b of f.bodies) {
      if (!b.landed || !b.touch || b.touch.sp < 4) continue;
      const L = toLocal(b.x, b.y);
      if (this.env.isSea(L.s)) continue;                                   // the sea keeps its own
      let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
      for (const [bx, by] of b.corners) { const [wx, wy] = this.world(b, L, bx, by); xa = Math.min(xa, wx); xb = Math.max(xb, wx); ya = Math.min(ya, wy); yb = Math.max(yb, wy); }
      const dz = this.settle(b, L.s);
      xa -= 0.5; xb += 0.5; ya += dz - 0.5; yb += dz + 0.5;
      const k = Math.min(80, 600 / Math.max(xb - xa, yb - ya));
      const c = document.createElement('canvas'); c.width = Math.ceil((xb - xa) * k); c.height = Math.ceil((yb - ya) * k);
      const g = c.getContext('2d')!;
      g.translate(-xa * k, yb * k); g.scale(k, -k);
      this.ctx = g;
      try { this.body(f, b, 1.3 / k); } finally { this.ctx = main; }
      this.env.dropLights();
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(25,18,12,0.35)'; g.fillRect(0, 0, c.width, c.height);   // soot
      out.push({ c, x0: xa, y1: yb, k });
    }
    return out;
  }

  /**
   * Contact shadows: a soft dark ellipse under anything near the ground (daylight), shrinking
   * and fading with height. At night the light pass paints pools of light instead.
   */
  private shadows(f: Flight) {
    if (this.env.cfg.night) return;
    const { ctx } = this;
    for (const b of f.bodies) {
      const L = toLocal(b.x, b.y), alt = Math.max(0, b.alt);
      if (alt > 60) continue;
      let span = 0.3;
      for (const [bx] of b.corners) span = Math.max(span, Math.abs(bx - b.cx));
      const a = 0.3 * (1 - alt / 60);
      ctx.fillStyle = `rgba(20,30,20,${a})`;
      ctx.beginPath(); ctx.ellipse(L.s, 0.02, span * (1.2 + alt / 25), Math.max(0.05, span * 0.18), 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  /**
   * The spacewalker: the zombie (missing limbs and bone stubs included) or the jar,
   * at its own attitude; the fire extinguisher in its hands with the nozzle on the
   * thrust line's offset side, or an RCS backpack. Puffs come from the particle system.
   */
  private evaBody(f: Flight, lw: number) {
    const e = f.eva!, b = e.body, { ctx } = this;
    const L = toLocal(b.x, b.y);
    ctx.save();
    ctx.translate(L.s, L.h);
    ctx.rotate(b.th + L.phi);
    if (e.jarred) { drawJar(ctx, e.zombie, 0.42, lw, performance.now() / 1000); ctx.translate(0, 0.21); }
    else {
      ctx.save(); ctx.translate(0, -0.3);
      if (b.kit.id === 'rcs-pack' && b.holding) {
        const pack = new Path2D(); pack.roundRect(-0.2, 0.05, 0.4, 0.4, 0.05);
        celFill(ctx, pack, '#c9ccd2', lw, { x: 0.15, y: 0.1, r: 0.25 }, null);
      }
      if (this.rig && this.rig.id === e.zombie) this.rig.draw(ctx, lw);
      else drawZombie(ctx, e.zombie, lw, e.limbs as ReadonlySet<Limb>);
      if (b.kit.id === 'extinguisher' && b.holding) {
        // red CO₂ bottle held across the chest, horn pointing "down" (thrust pushes "up")
        const x = b.kit.offset;
        const can = new Path2D(); can.roundRect(x - 0.07, 0.12, 0.14, 0.42, 0.06);
        celFill(ctx, can, '#e2483d', lw, { x: x + 0.05, y: 0.15, r: 0.2 }, { x: x - 0.03, y: 0.45, r: lw * 2 });
        ctx.fillStyle = CEL.ink; ctx.fillRect(x - 0.04, 0.54, 0.08, 0.05);
        ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, 0.12); ctx.quadraticCurveTo(x + 0.06, -0.02, x, -0.1); ctx.stroke();
        const horn = new Path2D(); horn.moveTo(x - 0.03, -0.1); horn.lineTo(x + 0.03, -0.1); horn.lineTo(x + 0.07, -0.22); horn.lineTo(x - 0.07, -0.22); horn.closePath();
        celFill(ctx, horn, '#2b2f36', lw);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** Ascent Assist: target pitch from the local vertical (rad), drawn as a ghost arrow; null = off */
  guide: number | null = null;

  /** Dashed "fly here" arrow from the vehicle along the target attitude, plus the current nose line */
  private guideMarker(f: Flight, k: number, lw: number) {
    const { ctx } = this;
    const v = f.vehicle, L = toLocal(v.x, v.y);
    const len = 150 / k, tp = this.guide!;
    const tx = Math.sin(tp), ty = Math.cos(tp);                 // target direction in the local frame
    const np = v.pitch, nx = Math.sin(np), ny = Math.cos(np);   // where the nose points now
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(27,34,48,0.35)'; ctx.lineWidth = lw * 2;
    ctx.beginPath(); ctx.moveTo(L.s, L.h); ctx.lineTo(L.s + nx * len * 0.8, L.h + ny * len * 0.8); ctx.stroke();
    ctx.setLineDash([8 / k, 6 / k]);
    ctx.strokeStyle = '#1f9d5a'; ctx.lineWidth = lw * 3;
    ctx.beginPath(); ctx.moveTo(L.s, L.h); ctx.lineTo(L.s + tx * len, L.h + ty * len); ctx.stroke();
    ctx.setLineDash([]);
    // arrow head
    const hx = L.s + tx * len, hy = L.h + ty * len, a = 10 / k;
    ctx.fillStyle = '#1f9d5a';
    ctx.beginPath(); ctx.moveTo(hx + tx * a, hy + ty * a); ctx.lineTo(hx - ty * a * 0.6, hy + tx * a * 0.6); ctx.lineTo(hx + ty * a * 0.6, hy - tx * a * 0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /**
   * San phra phum — the spirit house beside the pad. The guardian spirit watches every
   * launch: a calm house before and during flight, a hand reaching out after a crash
   * (it wants a word), and an accepted offering (red soda) after a good flight.
   */
  private spirits = (() => {
    const load = (n: string) => { const i = new Image(); i.src = `assets/site/${n}.png`; return i; };
    return { calm: load('spirit_house'), reach: load('spirit_house_reach'), offering: load('spirit_house_offering') };
  })();

  /** Where the spirit house stands: set at reset from the vehicle's width */
  private spiritX = -6;

  private spiritHouse(f: Flight) {
    const bad = f.outcome === 'impact' || f.outcome === 'structural-failure' || f.outcome === 'no-liftoff';
    const good = f.outcome === 'landed' || f.missionPhase === 'orbital';
    const img = bad ? this.spirits.reach : good ? this.spirits.offering : this.spirits.calm;
    if (!img.complete || !img.naturalWidth) return;
    const { ctx } = this;
    const H = 2.4, W = (H * img.naturalWidth) / img.naturalHeight;   // a real one stands ~2–2.5 m
    const x = this.spiritX;   // just left of the vehicle, clear of the rails
    ctx.save();
    ctx.translate(x, 0); ctx.scale(1, -1);                               // world is y-up; images are y-down
    ctx.drawImage(img, -W / 2, -H, W, H);
    ctx.restore();
  }

  /* ---------- Layers ---------- */

  private ground(f: Flight, lw: number) {
    const { ctx } = this;
    const k = this.cam.k;
    const halfW = this.w / 2 / k + 50;
    const bot = this.cam.y - this.h / 2 / k;
    if (bot > 50 || this.cam.x - halfW > 60 || this.cam.x + halfW < -60) return;   // the pad is out of view
    ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 2;
    this.spiritHouse(f);
    // Pad slab
    ctx.fillStyle = '#c9ccd2';
    ctx.fillRect(-4, -0.4, 8, 0.4); ctx.strokeRect(-4, -0.4, 8, 0.4);
    // Rail or ramp
    const s = f.site;
    if (s.rail > 0) {
      const a = (s.railAngleDeg * Math.PI) / 180;
      const dx = Math.sin(a), dy = Math.cos(a);
      const L = s.rail + 1.5;
      const ramp = s.rail >= 15;
      // rails stand just clear of the vehicle's widest point
      const xs = f.vehicle.corners.map(([x]) => x - f.vehicle.cx);
      const off = (xs.length ? Math.max(...xs.map(Math.abs)) : 0.3) + 0.2;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const ox = -dy * side * off, oy = dx * side * off;
        ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * (ramp ? 7 : 5);
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx * L, oy + dy * L); ctx.stroke();
        ctx.strokeStyle = ramp ? '#d7b46a' : '#9aa3ae'; ctx.lineWidth = lw * (ramp ? 4.5 : 3);
        ctx.stroke();
      }
      // Bamboo nodes / tower cross-braces
      ctx.strokeStyle = ramp ? '#a8843f' : '#7d8794'; ctx.lineWidth = lw * 2;
      for (let d = 1.5; d < L; d += ramp ? 1.6 : 1.2) {
        const px = dx * d, py = dy * d;
        ctx.beginPath(); ctx.moveTo(px + dy * 0.45, py - dx * 0.45); ctx.lineTo(px - dy * 0.45, py + dx * 0.45); ctx.stroke();
      }
      if (ramp) {
        // A-frame props holding the ramp up
        ctx.strokeStyle = '#b8924a'; ctx.lineWidth = lw * 3;
        const tx = dx * L * 0.7, ty = dy * L * 0.7;
        ctx.beginPath(); ctx.moveTo(tx - 3, 0); ctx.lineTo(tx, ty); ctx.lineTo(tx + 3 + dx * 4, 0); ctx.stroke();
      }
    }
  }

  private body(f: Flight, b: Body, lw: number) {
    const { ctx } = this;
    const z = f.zombie;
    ctx.save();
    // draw in the flat local frame: ground distance & altitude, attitude relative to the local vertical
    const L = toLocal(b.x, b.y);
    ctx.translate(L.s, L.h + this.settle(b, L.s));
    // wreck in the sea: settles to about half its size under water, listing as it goes (drawing only)
    const sink = this.sinking.get(b.id);
    if (sink) {
      const age = performance.now() / 1000 - sink.t0, s = 1 - Math.exp(-age / 4);
      ctx.translate(0, -sink.span * 1.1 * s + 0.08 * Math.sin(age * 1.7));
      ctx.rotate(0.35 * s + 0.04 * Math.sin(age * 1.3));
    }
    ctx.rotate(b.th + L.phi);
    ctx.translate(-b.cx, -b.cy);
    // Canopies first, behind the vehicle
    for (const it of b.items) {
      const c = it.chute;
      if (!c || (c.state !== 'opening' && c.state !== 'open' && c.state !== 'shredded')) continue;
      this.canopy(b, it.x, it.y, Math.sqrt(c.area / Math.PI) * 2, c.state === 'shredded' ? 0.25 : Math.max(0.15, c.frac), c.state === 'shredded', lw);
    }
    // level of detail for big lantern clusters: the full translucent lantern costs a blur and a
    // clip each; past a dozen on one body (or under ~30 px tall) draw the cheap one
    const pxPerM = 1.3 / lw;
    let envelopes = 0; for (const it of b.items) if (it.envelope) envelopes++;
    const crowd = envelopes > 12;
    for (const it of b.items) {
      const p = it.part, def = PART[p.defId];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 2);
      ctx.scale(p.fx ? -1 : 1, p.fy ? -1 : 1);
      const rider = riderOf(p);
      const show = rider && z && z.state !== 'pieces' && !f.eva ? rider : null;
      if (it.envelope && b.hot) {
        if (it.envelope.burnt) drawBurntLantern(ctx, def, lw, this.flicker);
        else drawLantern(ctx, def, lw, {
          glow: Math.max(0, Math.min(1, (b.hot.tIn - 300) / 160)), t: this.flicker,
          wind: this.env.windAt(b.alt), night: this.env.cfg.night, halo: this.env.quality > 0.5 && !crowd,
          simple: crowd || def.h * pxPerM < 30,
        }, it.uid);
      } else drawPart(ctx, def, lw, materialFor(def, p.mat), show, z?.limbs, 0, z?.state === 'jarred', show && this.rig ? this.rig : null);
      // damage flicker: a part close to failing blinks white (load or heat)
      const strain = this.strainOf && !b.landed ? this.strainOf(b, it) : 0;
      if (strain > 0.82 && Math.floor(performance.now() / 55) % 2 === 0) drawSilhouette(ctx, def, materialFor(def, p.mat), `${def.id}|${p.mat ?? ''}`, Math.min(0.95, 0.35 + (strain - 0.82) * 4));
      // Heat glow: dull red from ~400 °C to white-orange near the melting point (shields glow, don't melt)
      if (it.temp > 400) {
        const k = Math.min(1, (it.temp - 400) / Math.max(200, (it.shield ? 2400 : it.melt) - 400));
        ctx.fillStyle = `rgba(255,${Math.round(60 + 150 * k)},${Math.round(20 + 60 * k)},${0.25 + 0.5 * k})`;
        ctx.fillRect(-def.w / 2, -def.h / 2, def.w, def.h);
      }
      ctx.restore();
      // Tier 0: burnt paper keeps burning; a hot lantern lights the night (one light per envelope)
      if (it.envelope && b.hot) {
        const d2 = PART[it.part.defId];
        const W = this.world(b, L, it.x, it.y);
        if (it.envelope.burnt) {
          ctx.save(); ctx.translate(it.x, it.y);
          for (let i = 0; i < 4; i++) { const fx = (i - 1.5) * d2.w * 0.22, fh = d2.h * (0.25 + 0.15 * Math.sin(this.flicker * 17 + i)); this.flame(fx, -d2.h * 0.15, 0, -1, 0, fh, d2.w * 0.18, lw); }
          ctx.restore();
          this.env.light({ x: W[0], y: W[1], r: d2.h * 1.6, a: 0.9, tint: 'fire' });
        } else {
          const g = Math.max(0, Math.min(1, (b.hot.tIn - 300) / 160));
          if (g > 0.03) this.env.light({ x: W[0], y: W[1], r: d2.h * 2.6, a: 0.8 * g, tint: 'warm' });
        }
      }
      const ht = it.heater;
      if (ht && ht.lit && !ht.out) {
        const d2 = PART[it.part.defId];
        const L2 = (ht.kind === 'flare' ? 0.25 : ht.kind === 'candle' ? 0.04 : 0.12) * (0.85 + 0.15 * Math.sin(this.flicker * 23 + it.uid));
        // a flame under 2 px is invisible; in a crowd the lantern's own glow carries the light
        if (L2 * pxPerM > 2) this.flame(it.x, it.y + d2.h / 2, 0, -1, 0, L2, d2.w * 0.9, lw);
        if (!crowd) { const W = this.world(b, L, it.x, it.y + d2.h / 2); this.env.light({ x: W[0], y: W[1], r: Math.max(0.3, L2 * 4), a: 0.8, tint: 'fire' }); }
      }
      const e = it.engine;
      if (e && e.lit && !e.out && e.level > 0.01) {
        const size = Math.sqrt(e.fSL / 1000) * (0.35 + 0.65 * e.level);
        this.flame(e.nx, e.ny, e.dx, e.dy, e.delta + e.trim, size, def.w, lw);
        const W = this.world(b, L, e.nx, e.ny);
        this.env.light({ x: W[0], y: W[1], r: Math.max(0.6, Math.min(40, size * 1.2)), a: 0.55 * e.level, tint: 'fire' });
      }
    }
    ctx.restore();
    this.plasma(b, lw);
  }

  /** Body-frame point → flat local world (s, h), matching the transform used in body() */
  private world(b: Body, L: { s: number; h: number; phi: number }, x: number, y: number): [number, number] {
    const a = b.th + L.phi, c = Math.cos(a), sn = Math.sin(a), dx = x - b.cx, dy = y - b.cy;
    return [L.s + dx * c - dy * sn, L.h + dx * sn + dy * c];
  }

  /** Re-entry plasma: a glowing bow shock ahead of the body, scaled by Mach and air density */
  private plasma(b: Body, lw: number) {
    const v = Math.hypot(b.vx, b.vy);
    if (b.landed || v < 1500 || b.alt > 95_000) return;
    const rho = 1.225 * Math.exp(-Math.max(0, b.alt) / 8500);
    const k = Math.min(1, ((v - 1500) / 4000) * Math.min(1, rho / 0.002));
    if (k < 0.05) return;
    const { ctx } = this;
    const Lv = toLocal(b.x, b.y, b.vx, b.vy);
    const ux = Lv.vs / v, uy = Lv.vh / v;
    // front-most corner along the motion
    let best = -Infinity, fx = b.x, fy = b.y;
    for (const [bx, by] of b.corners) { const [wx0, wy0] = b.toWorld(bx, by); const P = toLocal(wx0, wy0); const d = P.s * ux + P.h * uy; if (d > best) { best = d; fx = P.s; fy = P.h; } }
    let span = 0;
    for (const [bx] of b.corners) span = Math.max(span, Math.abs(bx - b.cx));
    const R = Math.max(0.8, span * 1.6);
    const ang = Math.atan2(uy, ux);
    ctx.save();
    ctx.translate(fx + ux * R * 0.35, fy + uy * R * 0.35);
    ctx.rotate(ang);
    const flick = 0.9 + 0.1 * Math.sin(this.flicker * 50);
    for (const [col, s, a] of [['#ff5a1f', 1, 0.55], ['#ffb347', 0.75, 0.6], ['#fff3c4', 0.45, 0.7]] as const) {
      ctx.globalAlpha = a * k * flick;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(-R * 0.25 * s, 0, R * 0.55 * s, R * s, 0, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-R * 2.6 * s, R * 0.35 * s); ctx.lineTo(-R * 2.6 * s, -R * 0.35 * s);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.5 * k;
    ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 2;
    ctx.beginPath(); ctx.ellipse(-R * 0.25, 0, R * 0.55, R, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.restore();
  }

  private flame(nx: number, ny: number, dx: number, dy: number, delta: number, size: number, w: number, lw: number) {
    const { ctx } = this;
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const ex = -(dx * cd - dy * sd), ey = -(dx * sd + dy * cd);
    const L = Math.max(0.25, Math.min(8, size * 0.35)) * (0.85 + 0.15 * Math.sin(this.flicker * 40));
    const W = Math.max(0.05, w * 0.42);
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(Math.atan2(ey, ex) - Math.PI / 2);
    // local +y now runs downstream along the exhaust
    for (const [col, f] of [[CEL.flame[2], 1], [CEL.flame[1], 0.72], [CEL.flame[0], 0.42]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-W * f, 0);
      ctx.quadraticCurveTo(-W * f * 0.9, L * f * 0.5, 0, L * f);
      ctx.quadraticCurveTo(W * f * 0.9, L * f * 0.5, W * f, 0);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.5;
    ctx.beginPath(); ctx.moveTo(-W, 0); ctx.quadraticCurveTo(-W * 0.9, L * 0.5, 0, L); ctx.quadraticCurveTo(W * 0.9, L * 0.5, W, 0); ctx.stroke();
    ctx.restore();
  }

  /** Canopy: drawn in the body frame, pointing up-stream (against the body's motion) */
  private canopy(b: Body, mx: number, my: number, diameter: number, open: number, shredded: boolean, lw: number) {
    const { ctx } = this;
    // up-stream direction in the body frame
    const sp = Math.hypot(b.vx, b.vy);
    let ux = 0, uy = 1;
    if (sp > 0.5) {
      const wx = -b.vx / sp, wy = -b.vy / sp, c = Math.cos(-b.th), s = Math.sin(-b.th);
      ux = c * wx - s * wy; uy = s * wx + c * wy;
    }
    const D = diameter * open, L = diameter * 0.9;
    const cx = mx + ux * L, cy = my + uy * L;
    const ang = Math.atan2(uy, ux) - Math.PI / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    // risers
    ctx.strokeStyle = 'rgba(27,34,48,0.7)'; ctx.lineWidth = lw * 1.2;
    const back = -L;
    for (const sx of [-0.5, -0.2, 0.2, 0.5]) { ctx.beginPath(); ctx.moveTo(sx * D, 0); ctx.lineTo(0, back); ctx.stroke(); }
    // dome, orange/white gores
    const dome = new Path2D();
    dome.moveTo(-D / 2, 0);
    dome.quadraticCurveTo(-D / 2, D * 0.55, 0, D * 0.55);
    dome.quadraticCurveTo(D / 2, D * 0.55, D / 2, 0);
    dome.quadraticCurveTo(0, D * 0.12, -D / 2, 0);
    ctx.fillStyle = shredded ? '#e8b48a' : '#ff8a1f';
    ctx.fill(dome);
    if (!shredded) {
      ctx.save(); ctx.clip(dome); ctx.fillStyle = '#fff';
      for (let i = -2; i <= 2; i += 2) ctx.fillRect(i * D * 0.1 - D * 0.05, 0, D * 0.1, D);
      ctx.restore();
    }
    ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * CEL.outline;
    ctx.stroke(dome);
    ctx.restore();
  }

  /** Altitude ladder on the left edge: a sense of speed with no ground in view */
  private ladder() {
    const { ctx, h } = this;
    const k = this.cam.k;
    const span = h / k;
    const step = 10 ** Math.floor(Math.log10(span / 4));
    const nice = span / step > 20 ? step * 5 : span / step > 8 ? step * 2 : step;
    const top = this.cam.y + h / 2 / k;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const dark = this.cam.y > 30_000;
    for (let y = Math.floor((this.cam.y - h / 2 / k) / nice) * nice; y <= top; y += nice) {
      if (y < 0) continue;
      const sy = h / 2 - (y - this.cam.y) * k;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(27,34,48,0.45)';
      ctx.fillRect(0, sy, 10, 1);
      const dec = Math.max(0, Math.min(3, 3 - Math.floor(Math.log10(nice))));
      ctx.fillText(y >= 1000 ? `${(y / 1000).toFixed(dec)} km` : `${y.toFixed(nice < 1 ? 1 : 0)} m`, 14, sy);
    }
  }
}
