/**
 * Tier 1 flight logic: Wan Hu's Rocket Chair, Bang Fai (tail-stick stability)
 * and Talai (spin stability).
 *
 *   m·a = F_thrust(world) + m·g + F_drag
 *   I·α = τ_thrust + τ_aero
 *
 * Both sims are *steppable*: the UI calls step() each animation frame and
 * reads the live state, so the canvas shows exactly what the physics computes.
 */
import { Rng } from '@/core/rng';
import { G0 } from '@/data/parts';
import { PROPELLANTS } from '@/data/propellants';
import { TIER1_PARTS, type PartV2 } from '@/data/schema';
import {
  createCluster, stepCluster, wanHuMounts,
  type ClusterConfig, type ClusterEngine, type ClusterEvent, type ClusterOutput, type Vec2,
} from './cluster';
import { checkIntegrity, createPartState, dryMass, propellantCapacity, type IntegrityReport } from './structure';
import { MATERIALS } from '@/data/materials';

const RHO_SL = 1.225;
const SCALE_HEIGHT = 8500;
const airDensity = (h: number) => RHO_SL * Math.exp(-Math.max(0, h) / SCALE_HEIGHT);

/* =================================================================
 * Wan Hu's Rocket Chair
 * ================================================================= */

export interface WanHuOptions {
  seed: number;
  propellantQuality?: number;      // 0–1 from the Powder Mill
  ignition?: 'servants' | 'fuse';  // 47 torches vs. one shared fuse (an upgrade)
  rocketCount?: number;            // default 47 — legend says so
}

export interface FlightSample { t: number; x: number; y: number; vy: number; tilt: number; burning: number; cot: Vec2 | null; thrust: number }

export type WanHuOutcome = 'never-left-ground' | 'blew-apart' | 'tumbled' | 'hard-landing' | 'survived';

export interface WanHuResult {
  outcome: WanHuOutcome;
  maxAltitude: number;
  maxTiltDeg: number;
  landingSpeed: number;
  peakThrust: number;
  peakTwr: number;
  /** Sum of thrust of every motor that worked — what "all at once" would give */
  idealThrust: number;
  samples: FlightSample[];
  events: ClusterEvent[];
  story: string;
}

export class WanHuSim {
  readonly dt = 1 / 240;
  readonly engines: ClusterEngine[];
  readonly cfg: ClusterConfig;
  /** Live state — read by the renderer */
  t = 0; x = 0; y = 0; vx = 0; vy = 0; tilt = 0; omega = 0;
  hp = 1; airborne = false; mass = 0;
  lastOut: ClusterOutput | null = null;
  outcome: WanHuOutcome | null = null;
  readonly events: ClusterEvent[] = [];
  readonly samples: FlightSample[] = [];

  private rng: Rng;
  private propLeft: number[];
  private rocketDry: number;
  private chairMass: number;
  private isp: number;
  private step_ = 0;
  private maxAlt = 0; private maxTilt = 0; private landingSpeed = 0; private peakThrust = 0; private peakTwr = 0;

  constructor(opts: WanHuOptions) {
    this.rng = new Rng(opts.seed);
    const chair = TIER1_PARTS['wan-hu-chair'];
    const rocket = TIER1_PARTS['gunpowder-rocket'];
    this.isp = PROPELLANTS[rocket.engine!.propellantId].ispSL;
    this.cfg = {
      part: rocket,
      mounts: wanHuMounts().slice(0, opts.rocketCount ?? 47),
      ignition: opts.ignition === 'fuse'
        ? { mode: 'electric', sd: 0.15 }                 // a shared fuse: better, still not simultaneous
        : { mode: 'manual', meanDelay: 1.2, sd: 0.9 },    // 47 people, 47 torches, one shout
      propellantQuality: opts.propellantQuality ?? 0.5,
      chainReaction: 0.3,
    };
    this.engines = createCluster(this.cfg, this.rng);
    this.propLeft = this.engines.map(() => propellantCapacity(rocket));
    this.rocketDry = dryMass(rocket);
    this.chairMass = dryMass(chair);
    this.mass = this.chairMass + this.engines.length * this.rocketDry + this.propLeft.reduce((a, b) => a + b, 0);
  }

  get done() { return this.outcome !== null; }

  /** Advance one physics tick. Returns the cluster events from this tick. */
  step(): ClusterEvent[] {
    if (this.outcome) return [];
    const { dt, engines, rng } = this;
    const t = this.step_ * dt;
    this.t = t;
    const out = stepCluster(engines, t, dt, this.cfg, rng);
    this.lastOut = out;
    this.events.push(...out.events);

    // Propellant burn → mass drops as each motor burns
    engines.forEach((e, i) => {
      if (e.status === 'burning') this.propLeft[i] = Math.max(0, this.propLeft[i] - (e.thrust / (this.isp * G0)) * dt);
      if (e.status === 'burst') this.propLeft[i] = 0;
    });
    const mass = this.chairMass + engines.length * this.rocketDry + this.propLeft.reduce((a, b) => a + b, 0);
    this.mass = mass;
    const inertia = mass * (1.2 ** 2) / 12; // chair + occupant ≈ 1.2 m block

    // Bursts damage the wooden chair
    if (out.burstCount) this.hp -= out.burstCount * rng.range(0.06, 0.16);
    if (this.hp <= 0) { this.finish('blew-apart'); return out.events; }

    // Body → world (tilt from vertical, +ve = leaning left)
    const c = Math.cos(this.tilt), s = Math.sin(this.tilt);
    const Fx = out.force.x * c - out.force.y * s;
    const Fy = out.force.x * s + out.force.y * c;
    const thrustMag = Math.hypot(out.force.x, out.force.y);
    this.peakThrust = Math.max(this.peakThrust, thrustMag);
    this.peakTwr = Math.max(this.peakTwr, thrustMag / (mass * G0));

    // Drag: bluff body (chair + person)
    const v = Math.hypot(this.vx, this.vy);
    const drag = 0.5 * airDensity(this.y) * 1.1 * 0.8 * v * v;
    const dx = v > 0 ? -drag * this.vx / v : 0;
    const dy = v > 0 ? -drag * this.vy / v : 0;

    let ax = (Fx + dx) / mass;
    let ay = (Fy + dy) / mass - G0;
    if (!this.airborne) {
      if (ay <= 0) { ax = 0; ay = 0; this.vx = 0; this.vy = 0; } // still on the ground
      else this.airborne = true;
    }
    // Only aerodynamic damping — a chair has no fins, nothing restores it
    const alpha = this.airborne ? (out.torque - 0.6 * this.omega * v) / inertia : 0;

    this.vx += ax * dt; this.vy += ay * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.omega += alpha * dt; this.tilt += this.omega * dt;
    this.maxAlt = Math.max(this.maxAlt, this.y);
    this.maxTilt = Math.max(this.maxTilt, Math.abs(this.tilt));

    if (this.step_ % 12 === 0) {
      this.samples.push({ t, x: this.x, y: this.y, vy: this.vy, tilt: this.tilt, burning: out.burning, cot: out.cot, thrust: thrustMag });
    }
    this.step_++;

    if (this.airborne && this.y <= 0) {
      this.landingSpeed = Math.hypot(this.vx, this.vy);
      this.y = 0;
      this.finish(this.maxTilt > Math.PI / 2 ? 'tumbled'
        : this.maxAlt < 1 ? 'never-left-ground'   // a hop doesn't count as flight
        : this.landingSpeed > 6 ? 'hard-landing'
        : 'survived');
    } else if (!this.airborne && engines.every((e) => e.status !== 'waiting' && e.status !== 'burning')) {
      this.finish('never-left-ground');
    } else if (this.step_ >= 240 * 30) {
      this.finish('tumbled');
    }
    return out.events;
  }

  private finish(o: WanHuOutcome) { this.outcome = o; }

  result(): WanHuResult {
    const r: WanHuResult = {
      outcome: this.outcome ?? 'tumbled',
      maxAltitude: this.maxAlt,
      maxTiltDeg: (this.maxTilt * 180) / Math.PI,
      landingSpeed: this.landingSpeed,
      peakThrust: this.peakThrust,
      peakTwr: this.peakTwr,
      idealThrust: this.engines.reduce((s, e) => s + (e.fate === 'ok' ? e.thrust : 0), 0),
      samples: this.samples,
      events: this.events,
      story: '',
    };
    r.story = wanHuStory(r, this.engines.length);
    return r;
  }
}

export function simulateWanHu(opts: WanHuOptions): WanHuResult {
  const sim = new WanHuSim(opts);
  while (!sim.done) sim.step();
  return sim.result();
}

function wanHuStory(r: WanHuResult, n: number): string {
  const duds = r.events.filter((e) => e.kind === 'dud').length;
  const bursts = r.events.filter((e) => e.kind === 'burst' || e.kind === 'chain').length;
  const lost = Math.round((1 - r.peakThrust / Math.max(1, r.idealThrust)) * 100);
  const why = `${duds} of ${n} rockets fizzled, ${bursts} burst.` + (lost >= 10
    ? ` They were lit at different moments, so peak thrust was ${lost}% below all of them firing together.`
    : ' Ignition was well synchronised — the trouble was the rockets themselves.');
  switch (r.outcome) {
    case 'never-left-ground': return `The chair shook, smoked, and ${r.maxAltitude > 0.05 ? `hopped ${(r.maxAltitude * 100).toFixed(0)} cm` : 'stayed put'}. ${why} Lesson: thrust must beat weight at the same instant — TWR > 1.`;
    case 'blew-apart': return `Smoke cleared. The chair did not. ${why} Lesson: many unreliable engines multiply the chance of failure.`;
    case 'tumbled': return `Up ${r.maxAltitude.toFixed(1)} m, then over it went (${r.maxTiltDeg.toFixed(0)}° tilt). ${why} Lesson: when the centre of thrust wanders away from the centre of mass, the vehicle rotates.`;
    case 'hard-landing': return `Reached ${r.maxAltitude.toFixed(1)} m and came down at ${r.landingSpeed.toFixed(1)} m/s. The kites were decorative. Lesson: going up is half the mission.`;
    case 'survived': return `Against all odds: ${r.maxAltitude.toFixed(1)} m and a survivable landing. Historians will not believe you.`;
  }
}

/* =================================================================
 * Static stability (Bang Fai)
 * ================================================================= */

export interface StackItem { part: PartV2; /** distance of the part's top below the nose (m) */ top: number; propellantFraction?: number }

/**
 * Centre of pressure by the "cardboard cut-out" method: the centroid of the
 * side-on area. Fins/tail sticks add their extra area at their own centre.
 * (Barrowman equations replace this in Tier 2.)
 */
export function centreOfPressure(stack: StackItem[]): number {
  let area = 0, moment = 0;
  for (const s of stack) {
    const a = (s.part.lateralAreaM2 ?? s.part.shell.diameterM * s.part.shell.lengthM) + (s.part.finAreaM2 ?? 0);
    area += a;
    moment += a * (s.top + s.part.shell.lengthM / 2);
  }
  return area > 0 ? moment / area : 0;
}

export function centreOfMass(stack: StackItem[]): number {
  let mass = 0, moment = 0;
  for (const s of stack) {
    const m = dryMass(s.part) + propellantCapacity(s.part) * (s.propellantFraction ?? 1);
    mass += m;
    moment += m * (s.top + s.part.shell.lengthM / 2);
  }
  return mass > 0 ? moment / mass : 0;
}

export type StabilityVerdict = 'unstable' | 'marginal' | 'stable' | 'overstable';

/**
 * Static margin in calibers (body diameters). Positive = stable: the CoP sits
 * behind the CoM, so air pushes the nose back into the wind.
 * Below 0 the rocket flips; very large margins make it turn hard into any wind.
 */
export function staticMargin(stack: StackItem[]): { cp: number; cg: number; calibers: number; verdict: StabilityVerdict } {
  const cp = centreOfPressure(stack);
  const cg = centreOfMass(stack);
  const d = Math.max(...stack.map((s) => s.part.shell.diameterM));
  const calibers = (cp - cg) / d;
  const verdict: StabilityVerdict = calibers < 0.3 ? 'unstable' : calibers < 1 ? 'marginal' : calibers <= 6 ? 'stable' : 'overstable';
  return { cp, cg, calibers, verdict };
}

/** Tail stick of any length (fin area scales with length) */
export function tailStick(lengthM: number): PartV2 {
  const base = TIER1_PARTS['tail-stick'];
  const k = lengthM / base.shell.lengthM;
  return { ...base, shell: { ...base.shell, lengthM: Math.max(0.001, lengthM) }, finAreaM2: (base.finAreaM2 ?? 0) * k };
}

/* =================================================================
 * Bang Fai flight (3D point mass + heading dynamics)
 * ================================================================= */

export interface BangFaiOptions {
  seed: number;
  casing: 'bamboo' | 'steel';
  tailLengthM: number;      // 0 – 6
  elevationDeg: number;     // ramp angle above horizontal, 45 – 90
  azimuthDeg: number;       // compass direction the ramp points
  wind: { speed: number; fromDeg: number }; // m/s, meteorological "from" direction
  humidity?: number;
}

export interface BangFaiState {
  t: number;
  /** metres east, north, up from the pad */
  e: number; n: number; u: number;
  speed: number;
  /** angle between heading and air-relative velocity, degrees */
  aoaDeg: number;
  burning: boolean;
  onRamp: boolean;
}

export type BangFaiOutcome = 'flew' | 'casing-split' | 'cartwheeled';

const RAMP_LENGTH = 8; // m — the bamboo launch tower (ค้าง)

export class BangFaiSim {
  readonly dt = 1 / 120;
  readonly motor: PartV2;
  readonly margin: ReturnType<typeof staticMargin>;
  readonly integrity: IntegrityReport;
  /** Seconds into the burn when the casing fails, if it does */
  readonly splitAt: number | null;
  state: BangFaiState;
  outcome: BangFaiOutcome | null = null;
  maxAlt = 0;
  readonly track: BangFaiState[] = [];

  private rng: Rng;
  private v = { e: 0, n: 0, u: 0 };
  private h = { e: 0, n: 0, u: 1 };     // heading unit vector
  private prop: number;
  private dry: number;
  private thrust: number;
  private isp: number;
  private wind: { e: number; n: number };
  private tumbleRate = 0;
  private tumbleAxis: { e: number; n: number; u: number } | null = null;
  private step_ = 0;

  constructor(readonly opts: BangFaiOptions) {
    this.rng = new Rng(opts.seed);
    this.motor = TIER1_PARTS[opts.casing === 'steel' ? 'bang-fai-steel' : 'bang-fai-bamboo'];
    const tail = tailStick(opts.tailLengthM);
    const stack: StackItem[] = [{ part: this.motor, top: 0 }];
    if (opts.tailLengthM > 0.01) stack.push({ part: tail, top: this.motor.shell.lengthM });
    this.margin = staticMargin(stack);

    // Casing check: hoop stress while burning, with this casing's random flaw
    const ps = { ...createPartState(this.motor, this.rng), burning: true };
    this.integrity = checkIntegrity(ps, { axialN: this.motor.engine!.thrustSL, momentNm: 0 }, { humidity: opts.humidity ?? 0.6 });
    this.splitAt = this.integrity.safetyFactor < 1 ? this.rng.range(0.3, 3) : null;

    this.prop = propellantCapacity(this.motor);
    this.dry = dryMass(this.motor) + (opts.tailLengthM > 0.01 ? dryMass(tail) : 0);
    this.thrust = this.motor.engine!.thrustSL;
    this.isp = PROPELLANTS[this.motor.engine!.propellantId].ispSL;

    const el = (opts.elevationDeg * Math.PI) / 180;
    const az = (opts.azimuthDeg * Math.PI) / 180;
    this.h = { e: Math.cos(el) * Math.sin(az), n: Math.cos(el) * Math.cos(az), u: Math.sin(el) };
    // Wind blows FROM fromDeg, so it moves air toward fromDeg + 180°
    const wTo = ((opts.wind.fromDeg + 180) * Math.PI) / 180;
    this.wind = { e: opts.wind.speed * Math.sin(wTo), n: opts.wind.speed * Math.cos(wTo) };
    this.state = { t: 0, e: 0, n: 0, u: 0, speed: 0, aoaDeg: 0, burning: true, onRamp: true };
    this.track.push({ ...this.state });
  }

  get done() { return this.outcome !== null; }
  get mass() { return this.dry + this.prop; }
  get headingVec() { return { ...this.h }; }
  get massFlow() { return this.thrust / (this.isp * G0); }

  step(): void {
    if (this.outcome) return;
    const { dt, v, h } = this;
    const t = this.step_ * dt;
    let burning = this.prop > 0;

    // Casing split: the motor stops dead and the rest is a falling bamboo tube
    if (this.splitAt !== null && t >= this.splitAt && burning) {
      this.prop = 0; burning = false;
      this.split = true;
    }

    const mass = this.mass;
    const F = burning ? this.thrust : 0;
    if (burning) this.prop = Math.max(0, this.prop - this.massFlow * dt);

    // Air-relative velocity (wind only acts above the treeline-ish 10 m)
    const windK = Math.min(1, this.state.u / 10);
    const rel = { e: v.e - this.wind.e * windK, n: v.n - this.wind.n * windK, u: v.u };
    const vr = Math.hypot(rel.e, rel.n, rel.u);
    const rho = airDensity(this.state.u);
    const area = Math.PI * (this.motor.shell.diameterM / 2) ** 2;
    const drag = 0.5 * rho * 0.6 * area * vr * vr;

    const along = Math.hypot(this.state.e, this.state.n, this.state.u);
    const onRamp = along < RAMP_LENGTH && this.step_ < 120 * 5;

    // ---- Heading dynamics ----
    if (!onRamp && vr > 1) {
      const rhat = { e: rel.e / vr, n: rel.n / vr, u: rel.u / vr };
      const m = this.margin.calibers;
      if (m >= 0.3) {
        // Weathercocking: heading turns toward the airflow. Bigger margin → turns harder
        // (an overstable Bang Fai turns INTO the wind).
        const rate = 0.0035 * Math.min(m, 12) * vr * (rho / RHO_SL);
        rotateToward(h, rhat, Math.min(1, rate * dt));
        // Marginal rockets wobble
        if (m < 1) jitter(h, this.rng, (1 - m) * 0.6 * Math.sqrt(dt));
      } else {
        // Unstable: aerodynamics pushes the nose AWAY from the airflow → cartwheel
        const push = 0.15 * vr * (0.5 - m);   // destabilising aero torque grows with speed
        this.tumbleRate += (this.rng.normal(0, 6) + Math.sign(this.tumbleRate || 1) * push) * dt;
        this.tumbleRate = Math.max(-25, Math.min(25, this.tumbleRate));
        // Fix the tumble axis when the tumble starts; recomputing it from the
        // heading each tick would flip its sign every time the nose passes vertical.
        this.tumbleAxis ??= perpendicular(h);
        rotateAbout(h, this.tumbleAxis, this.tumbleRate * dt);
      }
    }

    // ---- Forces ----
    const ae = (F * h.e - (vr > 0 ? drag * rel.e / vr : 0)) / mass;
    const an = (F * h.n - (vr > 0 ? drag * rel.n / vr : 0)) / mass;
    const au = (F * h.u - (vr > 0 ? drag * rel.u / vr : 0)) / mass - G0;

    if (onRamp) {
      // Constrained to the ramp: only acceleration along the heading survives
      const a = ae * h.e + an * h.n + au * h.u;
      const aAlong = Math.max(0, a);
      v.e += aAlong * h.e * dt; v.n += aAlong * h.n * dt; v.u += aAlong * h.u * dt;
    } else {
      v.e += ae * dt; v.n += an * dt; v.u += au * dt;
    }
    const s = this.state;
    s.e += v.e * dt; s.n += v.n * dt; s.u += v.u * dt;
    s.t = t;
    s.speed = Math.hypot(v.e, v.n, v.u);
    s.burning = burning;
    s.onRamp = onRamp;
    s.aoaDeg = vr > 1 ? (Math.acos(Math.max(-1, Math.min(1, (h.e * rel.e + h.n * rel.n + h.u * rel.u) / vr))) * 180) / Math.PI : 0;
    this.maxAlt = Math.max(this.maxAlt, s.u);
    if (this.step_ % 6 === 0) this.track.push({ ...s });
    this.step_++;

    const landed = s.u <= 0 && t > 0.5 && (!onRamp || this.split);
    if (landed || this.step_ > 120 * 400) {
      s.u = Math.max(0, s.u);
      this.track.push({ ...s });
      this.outcome = this.split ? 'casing-split' : this.margin.calibers < 0.3 ? 'cartwheeled' : 'flew';
    }
  }

  /** True once the casing has failed (flight continues as a falling body) */
  split = false;

  summary() {
    const last = this.state;
    return {
      outcome: this.outcome,
      maxAltitude: this.maxAlt,
      rangeM: Math.hypot(last.e, last.n),
      flightTime: last.t,
      margin: this.margin,
      casingSafetyFactor: this.integrity.safetyFactor,
      material: MATERIALS[this.motor.materialId],
    };
  }
}

function rotateToward(h: { e: number; n: number; u: number }, target: { e: number; n: number; u: number }, k: number) {
  h.e += (target.e - h.e) * k; h.n += (target.n - h.n) * k; h.u += (target.u - h.u) * k;
  normalise(h);
}
function jitter(h: { e: number; n: number; u: number }, rng: Rng, sd: number) {
  h.e += rng.normal(0, sd); h.n += rng.normal(0, sd); h.u += rng.normal(0, sd);
  normalise(h);
}
function normalise(h: { e: number; n: number; u: number }) {
  const l = Math.hypot(h.e, h.n, h.u) || 1;
  h.e /= l; h.n /= l; h.u /= l;
}
function perpendicular(h: { e: number; n: number; u: number }) {
  // Horizontal axis perpendicular to heading → pitch-over rotation
  const p = { e: -h.n, n: h.e, u: 0 };
  const l = Math.hypot(p.e, p.n);
  return l > 1e-6 ? { e: p.e / l, n: p.n / l, u: 0 } : { e: 1, n: 0, u: 0 };
}
function rotateAbout(v: { e: number; n: number; u: number }, k: { e: number; n: number; u: number }, a: number) {
  // Rodrigues rotation
  const c = Math.cos(a), s = Math.sin(a);
  const dot = v.e * k.e + v.n * k.n + v.u * k.u;
  const cross = { e: k.n * v.u - k.u * v.n, n: k.u * v.e - k.e * v.u, u: k.e * v.n - k.n * v.e };
  v.e = v.e * c + cross.e * s + k.e * dot * (1 - c);
  v.n = v.n * c + cross.n * s + k.n * dot * (1 - c);
  v.u = v.u * c + cross.u * s + k.u * dot * (1 - c);
  normalise(v);
}

/* =================================================================
 * Talai — spin stabilisation
 * ================================================================= */

/**
 * A thrust misalignment ε produces a body-fixed torque τ = F·ε·d.
 * Without spin, the heading error grows without bound:  θ(t) = τ t² / (2I).
 * With spin rate ω, that torque rotates with the body and averages out; the
 * heading error stays bounded at roughly                θ_max ≈ τ / (I ω²).
 * That is why a Talai or a rifled bullet flies straight without fins.
 */
export function headingError(torque: number, inertia: number, spinRad: number, t: number): number {
  const unbounded = (torque * t * t) / (2 * inertia);
  if (spinRad <= 0) return unbounded;
  return Math.min(unbounded, torque / (inertia * spinRad * spinRad));
}
