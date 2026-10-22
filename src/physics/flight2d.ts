/**
 * Planar flight simulator for any vehicle built in the factory — the engine
 * behind Phase 2 (live) and the headless `simulateFlight()` used by tests.
 *
 * Multi-body: the vehicle starts as one rigid body; decouplers and structural
 * failures split it into several, each flown with the same physics.
 *
 * Per body, state (x, y, vx, vy, θ, ω) of the CoM + roll rate p, and — only
 * while spinning — an out-of-plane yaw ψ for gyroscopic coupling:
 *     I·ω̇ = M − Ix·p·ψ̇        I·ψ̈ = M_ψ + Ix·p·ω     (applied as an exact rotation)
 *
 *   thrust      each engine from its own nozzle; liquid engines can GIMBAL (± a few °)
 *   SAS         PID attitude hold → gimbal angle, with aero-moment feed-forward,
 *               actuator rate limit and anti-windup
 *   aero        physics/aero.ts — 360° AoA, per-part local flow, stall, reverse flow
 *   launch      rail / tall bamboo ramp at an angle: attitude and line held until clear
 *   staging     next decoupler group fires → bodies split; upper-stage engines ignite
 *   parachutes  inflate over ~2 s (opening shock), drag at the canopy, hang the
 *               vehicle under it; shred if opened too fast
 *   zombie      feels the specific force at the seat: a_CoM + α×r − ω²r
 *   ground      contact on the lowest hull corner; soft = landed, hard = impact
 *
 * Limits: no aerodynamic heating, no throttle, engines on a stage ignite together.
 */
import { PART, engineStats, propellantMass, propellantKind, meltPoint, shapeVolume, materialFor } from '@/phases/assembly/model/catalog';
import { flameColour, toCss } from '@/chemistry/flameLab';
import type { TerrainSampler } from '@/world/terrain';
import { aeroBody, analyse, joints, orient, partBounds, placedDryMass, riderOf, telemetry, type PlacedPart } from '@/phases/assembly/model/vehicle';
import { aeroLoads, type AeroBody } from './aero';
import { elements, propagateState, timeToRadiusDescending, invariants, type Orbit } from '@/orbit/kepler';
import { EvaSim, type EvaFx } from '@/eva/evaSim';
import { airTemp, heatStep, buoyantLift, carriedAirMass, U_ENVELOPE } from './buoyancy';
import { evaBlocker, type EvaKitId } from '@/eva/eva';
import { OrbitStateMachine, type OrbitClass, type MissionPhase, type PropagationMode, type Transition } from '@/orbit/state';
import { ZombiePayload, type GoreFx, type ZombieId, type SeatState } from '@/payload/zombies';

const G0 = 9.80665;
const R_EARTH = 6_371_000;
const RHO0 = 1.225;
const H_SCALE = 8500;
const KARMAN = 100_000;
/** Earth's gravitational parameter μ = g₀R² (m³/s²) */
export const MU_EARTH = G0 * R_EARTH * R_EARTH;
export { R_EARTH };
const SPIN_MIN = 0.5;
/** Above this, with no thrust, the vehicle can fly on analytic Kepler rails (air density < 10⁻⁷ kg/m³) */
export const RAILS_ALT = 140_000;
const D2R = Math.PI / 180;

/**
 * Gate A — one record per change of propagation mode. The "seam" compares the two
 * propagators over the same step across the switch:
 *   physics → rails : exact Kepler from the state before the last physics step,
 *                     vs where that physics step actually put the vehicle
 *   rails → physics : exact Kepler from the rails exit state, vs the first physics step
 * In vacuum with nothing firing the difference is the integrator's local error
 * (sub-millimetre). `validated` is false when thrust or air made a match impossible.
 */
export interface Handoff {
  t: number; from: PropagationMode; to: PropagationMode; alt: number;
  /** position / velocity mismatch across the seam (m, m/s) */
  dr: number; dv: number;
  /** relative change of the energy and angular-momentum invariants across the seam */
  dE: number; dH: number;
  validated: boolean; ok: boolean;
}
export const SEAM_TOL = { dr: 0.01, dv: 1e-3, rel: 1e-7 };

/** Inverse-square gravity at a point of the flight frame (pad at origin, Earth's centre at (0, −R)) */
export function gravityAt(x: number, y: number): [number, number] {
  const Y = y + R_EARTH, r = Math.max(R_EARTH * 0.5, Math.hypot(x, Y));
  const k = -MU_EARTH / (r * r * r);
  return [k * x, k * Y];
}

/* ================================================================
 * Public types
 * ================================================================ */

export interface FlightSample {
  t: number; x: number; alt: number; speed: number;
  tiltDeg: number; aoaDeg: number; pitchRate: number; spinRps: number;
  gLoad: number; seatG: number; mass: number; thrust: number;
  mach: number; q: number; stalled: number; gimbalDeg: number;
}
export interface FlightEvent { t: number; kind: string; text: string }
export type FlightOutcome = 'no-liftoff' | 'impact' | 'landed' | 'structural-failure' | 'timeout';
export type FlightFx =
  | (GoreFx & { inside: boolean })
  | { t: number; kind: 'smoke'; x: number; y: number; vx: number; vy: number; amount: number; density: number }
  /** A part (or the whole vehicle) blowing up; `colors` = firework salts aboard, `firework` = a deliberate charge */
  | { t: number; kind: 'explode'; x: number; y: number; vx: number; vy: number; size: number; colors: string[]; firework?: boolean }
  /** An RCS thruster puff: position and exhaust direction (world) */
  | { t: number; kind: 'rcs'; x: number; y: number; vx: number; vy: number; dx: number; dy: number; puff?: number };

export interface LaunchSite {
  /** Guide length (m): 0 = bare ground, 6 = pad rail, 20–25 = bamboo ramp */
  rail: number;
  /** Ramp tilt from vertical, degrees (+ = leaning downrange, +x) */
  railAngleDeg: number;
  /** Crosswind at 10 m (m/s, +x); grows as (h/10)^0.14 and dies out with the air */
  wind: number;
}
export const SITES = {
  ground: { rail: 0, railAngleDeg: 0, wind: 2 },
  pad: { rail: 6, railAngleDeg: 0, wind: 2 },
  ramp: { rail: 22, railAngleDeg: 8, wind: 2 },
} satisfies Record<string, LaunchSite>;

export interface FlightOptions {
  dt?: number;
  /**
   * Feature flag (J2): a terrain heightfield (craters) for ground contact. Omitted → the
   * ground is the plain line altitude = 0, bit-identical to every version before v0.20.
   */
  terrain?: TerrainSampler;
  maxTime?: number;
  spinRps?: number;
  seed?: number;
  sampleEvery?: number;
  /** Overrides for the launch site */
  wind?: number;
  rail?: number;
  railAngleDeg?: number;
  /** Autopilot (headless runs) */
  sas?: boolean;
  /** Pitch target for SAS, degrees from vertical (+ = toward +x) */
  pitchDeg?: number;
  /** Fire the next stage automatically when the vehicle's engines are spent */
  autoStage?: boolean;
  /** Deploy parachutes automatically on the way down (default on) */
  autoChute?: boolean;
  /**
   * Mixing Bench stir quality (0–1) of the powder in the solid motors. A lumpy batch leaves unburnt grains, so the motor
   * delivers up to IMPULSE_LOSS_MAX less impulse at quality 0 (same burn time, less thrust). 1 (the default, and every test) adds nothing.
   */
  propellantQuality?: number;
}

/** Fraction of impulse a solid motor loses when filled with the worst possible powder (quality 0) */
export const IMPULSE_LOSS_MAX = 0.12;

export interface FlightResult {
  outcome: FlightOutcome;
  samples: FlightSample[];
  events: FlightEvent[];
  fx: FlightFx[];
  maxAlt: number; maxSpeed: number; maxG: number; maxSeatG: number;
  impactSpeed: number; range: number;
  maxTiltDeg: number; maxAoaDeg: number; maxPitchRate: number;
  spinSg: number | null;
  seat: 'none' | 'chair' | 'pod';
  zombie: ZombieId | null;
  zombieVerdict: string;
}

/* ================================================================
 * Internals
 * ================================================================ */

interface Engine {
  fSL: number; fVac: number; ispSL: number; ispVac: number;
  nx: number; ny: number; dx: number; dy: number;
  liquid: boolean; smoke: number;
  gimbal: number;        // max, rad
  delta: number;         // current, rad
  lit: boolean; out: boolean;
  /** Fixed thrust-line offset (rad): a Bang Fai nozzle carved to aim through the CoM */
  trim: number;
  /** Current output 0–1 (throttle), for the flame drawing */
  level: number;
  /** Firework salt aboard (solid motors) */
  salt?: string;
}
interface Chute {
  area: number; maxSpeed: number;
  state: 'packed' | 'opening' | 'open' | 'shredded' | 'cut';
  frac: number;
}
export interface Item {
  uid: number; name: string; part: PlacedPart;
  /** Skin temperature (°C) and the point where this part melts or burns */
  temp: number; melt: number; shield: boolean;
  /** Mass of skin that soaks the heat (kg): about half the structural shell, or 10 % of an engine */
  skin: number;
  /** Reaction control (pods): torque (N·m) and monopropellant left (kg, included in `dry`) */
  rcs?: { torque: number; mono: number };
  dry: number; prop: number; prop0: number; kind: 'liquid' | 'solid' | null;
  x: number; y: number; w: number; h: number; roll: number;
  engine?: Engine; chute?: Chute;
  /** Tier 0: hot-air envelope (burnt = caught fire, holds no air) */
  envelope?: { volume: number; area: number; igniteC: number; burnt: boolean };
  /** Tier 0: heat source; fuel is `prop` and burns off with `left` */
  heater?: { kind: string; power: number; burnTime: number; left: number; lit: boolean; out: boolean; smoke: number };
}

export class Body {
  id: number;
  items: Item[];
  aero!: AeroBody;
  isVehicle = false;
  x = 0; y = 0; vx = 0; vy = 0; th = 0; om = 0;
  p = 0; psi = 0; psiDot = 0;
  landed = false;
  /** How it hit the ground (world-frame velocity just before touchdown) — read-only bookkeeping for the renderer */
  touch: { sp: number; vx: number; vy: number; t: number } | null = null;
  // cached mass properties (body frame)
  M = 0; cx = 0; cy = 0; I = 1; Ix = 1;
  // last-step observations (for HUD / samples)
  thrust = 0; aoa = 0; mach = 0; q = 0; stalled = 0; gLoad = 1; lastAeroM = 0; dragArea = 0;
  /** Tier 0: temperature of the air inside the envelopes (K); null = no envelope */
  hot: { tIn: number; lift: number } | null = null;
  /** Corners of every part in the body frame, for ground contact */
  corners: [number, number][] = [];

  constructor(id: number, items: Item[]) {
    this.id = id;
    this.items = items;
    this.rebuild();
  }

  /** Fuel groups: tanks feed only the engines they reach without crossing a decoupler */
  fuelGroups: { tanks: Item[]; engines: Item[] }[] = [];

  rebuild() {
    this.aero = aeroBody(this.items.map((i) => i.part), this.massProps().cx);
    this.hot = this.items.some((i) => i.envelope) ? (this.hot ?? { tIn: 288.15, lift: 0 }) : null;
    const byUid = new Map(this.items.map((i) => [i.uid, i]));
    this.fuelGroups = components(this.items.map((i) => i.part).filter((p) => !isDecoupler(p)))
      .map((c) => c.map((p) => byUid.get(p.uid)!))
      .map((g) => ({ tanks: g.filter((i) => i.kind === 'liquid'), engines: g.filter((i) => i.engine?.liquid) }))
      .filter((g) => g.engines.length || g.tanks.length);
    this.corners = this.items.flatMap((i) => [[i.x - i.w / 2, i.y - i.h / 2], [i.x + i.w / 2, i.y - i.h / 2], [i.x - i.w / 2, i.y + i.h / 2], [i.x + i.w / 2, i.y + i.h / 2]] as [number, number][]);
  }

  massProps() {
    let M = 0, cx = 0, cy = 0;
    for (const it of this.items) { const m = it.dry + it.prop; M += m; cx += m * it.x; cy += m * it.y; }
    cx /= M || 1; cy /= M || 1;
    let I = 0, Ix = 0;
    for (const it of this.items) {
      const m = it.dry + it.prop;
      I += m * ((it.x - cx) ** 2 + (it.y - cy) ** 2) + (m * (it.w ** 2 + it.h ** 2)) / 12;
      Ix += m * (it.roll + (it.x - cx) ** 2);
    }
    Object.assign(this, { M, cx, cy, I: Math.max(I, 1e-3), Ix: Math.max(Ix, 1e-4) });
    return { M, cx, cy };
  }

  /** Body-frame point → world */
  toWorld(bx: number, by: number): [number, number] {
    const c = Math.cos(this.th), s = Math.sin(this.th);
    const rx = bx - this.cx, ry = by - this.cy;
    return [this.x + c * rx - s * ry, this.y + s * rx + c * ry];
  }

  /** World velocity of a body-frame point */
  velocityAt(bx: number, by: number): [number, number] {
    const c = Math.cos(this.th), s = Math.sin(this.th);
    const rx = c * (bx - this.cx) - s * (by - this.cy), ry = s * (bx - this.cx) + c * (by - this.cy);
    return [this.vx - this.om * ry, this.vy + this.om * rx];
  }

  /* ---- curved Earth: the frame is Earth-centred, the pad at (0, 0), Earth's centre at (0, −R) ---- */
  /** Distance from Earth's centre */
  get r() { return Math.hypot(this.x, this.y + R_EARTH); }
  /** Altitude of the CoM */
  get alt() { return this.r - R_EARTH; }
  /** Angle of the local vertical from +y, toward +x (= downrange angle round the Earth) */
  get phi() { return Math.atan2(this.x, this.y + R_EARTH); }
  /** Speed up / along the local horizon */
  get vUp() { return (this.vx * this.x + this.vy * (this.y + R_EARTH)) / this.r; }
  get vEast() { const p = this.phi; return this.vx * Math.cos(p) - this.vy * Math.sin(p); }
  /** Ground distance from the pad (m) */
  get downrange() { return R_EARTH * this.phi; }
  /** Nose angle from the local vertical, toward +x (rad) */
  get pitch() { return wrapPi(-this.th - this.phi); }

  /** Lowest height of any part corner above the terrain surface (craters lower the surface) */
  lowestAboveGround(t: TerrainSampler): number {
    let m = Infinity;
    for (const [bx, by] of this.corners) {
      const [wx, wy] = this.toWorld(bx, by), R = Math.hypot(wx, wy + R_EARTH);
      m = Math.min(m, R - R_EARTH - t.heightAt(R_EARTH * Math.atan2(wx, wy + R_EARTH)));
    }
    return m;
  }

  /** Lowest altitude of any part corner (ground contact) */
  lowestAlt(): number {
    let m = Infinity;
    for (const [bx, by] of this.corners) { const [wx, wy] = this.toWorld(bx, by); m = Math.min(m, Math.hypot(wx, wy + R_EARTH) - R_EARTH); }
    return m;
  }

  lowestPoint(): number {
    let m = Infinity;
    for (const [bx, by] of this.corners) m = Math.min(m, this.toWorld(bx, by)[1]);
    return m;
  }

  get parts() { return this.items.map((i) => i.part); }
  get engines() { return this.items.filter((i) => i.engine); }
  get gimbals() { return this.items.filter((i) => i.engine && i.engine.gimbal > 0); }
}

/**
 * Earth-centred world → the Launch view's flat local frame (s = ground distance from the
 * pad along the surface, h = altitude). Velocities rotate into (east, up). Near the
 * vehicle the frame is locally flat, so the 2D view keeps working at any range.
 */
export function toLocal(x: number, y: number, vx = 0, vy = 0) {
  const phi = Math.atan2(x, y + R_EARTH), c = Math.cos(phi), sn = Math.sin(phi);
  return { s: R_EARTH * phi, h: Math.hypot(x, y + R_EARTH) - R_EARTH, vs: vx * c - vy * sn, vh: vx * sn + vy * c, phi };
}

const speedOfSound = (h: number) => (h < 11_000 ? 340.3 - 0.00409 * h : 295.1);
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const isDecoupler = (p: PlacedPart) => PART[p.defId].shape === 'decoupler' || PART[p.defId].shape === 'decoupler-radial';

function makeItem(p: PlacedPart): Item {
  const def = PART[p.defId];
  const b = partBounds(p);
  const item: Item = {
    uid: p.uid, name: def.name, part: p,
    dry: placedDryMass(p), prop: propellantMass(def), prop0: propellantMass(def), kind: propellantKind(def),
    x: p.x, y: p.y, w: b.w, h: b.h, roll: (Math.min(b.w, b.h) ** 2) / 8,
    temp: 25, melt: meltPoint(def, p.mat), shield: !!def.heatShield,
    skin: Math.max(2, 0.5 * Math.max(shapeVolume(def.structure) * materialFor(def, p.mat).density, 0.1 * (def.fixedMass ?? 0))),
  };
  if (def.rcs) { item.rcs = { ...def.rcs }; item.dry += def.rcs.mono; }
  const es = engineStats(def);
  if (es && def.engine) {
    const [ox, oy] = orient(p, 0, -def.h / 2);
    const [dx, dy] = orient(p, 0, 1);
    const liquid = def.engine.kind === 'liquid';
    const le = def.engine as { thrustVac: number; ispVac: number; gimbalDeg?: number };
    item.engine = {
      fSL: es.thrust, fVac: liquid ? le.thrustVac : es.thrust * 1.1,
      ispSL: es.isp, ispVac: liquid ? le.ispVac : es.isp * 1.1,
      nx: p.x + ox, ny: p.y + oy, dx, dy, liquid, smoke: es.smoke,
      gimbal: liquid ? (le.gimbalDeg ?? 0) * D2R : 0, delta: 0, lit: false, out: false, trim: 0, level: 0, salt: p.salt,
    };
  }
  if (def.chute) item.chute = { area: Math.PI * (def.chute.diameter / 2) ** 2, maxSpeed: def.chute.maxSpeed, state: 'packed', frac: 0 };
  if (def.envelope) item.envelope = { ...def.envelope, burnt: false };
  if (def.heater) item.heater = { kind: def.heater.kind, power: def.heater.power, burnTime: def.heater.burnTime, left: def.heater.burnTime, lit: false, out: false, smoke: def.heater.smoke };
  return item;
}

/** Connected components of parts, using the factory's node joints */
function components(parts: PlacedPart[]): PlacedPart[][] {
  const adj = new Map<number, number[]>();
  for (const j of joints(parts)) {
    adj.set(j.a.uid, [...(adj.get(j.a.uid) ?? []), j.b.uid]);
    adj.set(j.b.uid, [...(adj.get(j.b.uid) ?? []), j.a.uid]);
  }
  const seen = new Set<number>(), out: PlacedPart[][] = [];
  for (const p of parts) {
    if (seen.has(p.uid)) continue;
    const comp: PlacedPart[] = [], q = [p.uid];
    seen.add(p.uid);
    while (q.length) {
      const u = q.shift()!;
      comp.push(parts.find((x) => x.uid === u)!);
      for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); q.push(v); }
    }
    out.push(comp);
  }
  return out;
}

/* ================================================================
 * The flight
 * ================================================================ */

export interface Controls {
  sas: boolean;
  /** SAS pitch target, rad from vertical (+ = toward +x, i.e. clockwise) */
  target: number;
  /** −1 / 0 / +1: A/D nudge. With SAS it moves the target; without, it swings the gimbals */
  nudge: number;
  autoChute: boolean;
  /** Auto gravity turn: lean the SAS target this fast (rad/s) until it reaches `turnTo` */
  turnRate: number;
  turnTo: number;
  /** Liquid-engine throttle 0–1 */
  throttle: number;
  /** SAS: hold a pitch, or point along / against the velocity */
  sasMode: 'hold' | 'prograde' | 'retrograde';
  /** Use the pod's RCS thrusters when steering */
  rcs: boolean;
}

export class Flight {
  t = 0;
  bodies: Body[] = [];
  vehicle: Body;
  events: FlightEvent[] = [];
  /** Visual effects since the last drain */
  fxQueue: FlightFx[] = [];
  readonly fxAll: FlightFx[] = [];
  readonly samples: FlightSample[] = [];
  zombie: ZombiePayload | null;
  zombieId: ZombieId | null;
  seat: FlightResult['seat'];
  outcome: FlightOutcome | null = null;
  ignited = false;
  airborne = false;
  controls: Controls = { sas: false, target: 0, nudge: 0, autoChute: true, turnRate: 0, turnTo: 80 * D2R, throttle: 1, sasMode: 'hold', rcs: true };
  site: LaunchSite;
  /** J2 terrain (craters) for ground contact; null = flat ground (the default) */
  readonly terrain: TerrainSampler | null;
  /** Stage groups still to fire: decoupler uids, then 'chutes' */
  stages: ('chutes' | number[])[] = [];
  readonly stageCount: number;

  // records
  maxAlt = 0; maxSpeed = 0; maxG = 0; maxSeatG = 0; maxTilt = 0; maxAoa = 0; maxRate = 0; impactSpeed = 0;
  seatG = 1; spinSg: number | null = null;

  private dt: number;
  private wind: number;
  private railS = 0; private railV = 0; private railClear: boolean;
  private seatUid: number | null;
  private nextBodyId = 1;
  private integ: ReturnType<typeof telemetry>['integrity'];
  private n0: number;
  private flags = new Set<string>();
  private maxQ = 0;
  private iErr = 0;
  private smokeAcc = 0;
  private seatWorld = { x: 0, y: 0, vx: 0, vy: 0 };
  private sampleEvery: number;
  private stepCount = 0;
  private padTime = 0;

  constructor(parts: PlacedPart[], opts: FlightOptions & { site?: LaunchSite } = {}) {
    this.dt = opts.dt ?? 1 / 100;
    this.terrain = opts.terrain ?? null;
    this.sampleEvery = opts.sampleEvery ?? 10;
    const base = opts.site ?? SITES.pad;
    this.site = { rail: opts.rail ?? base.rail, railAngleDeg: opts.railAngleDeg ?? base.railAngleDeg, wind: opts.wind ?? base.wind };
    this.wind = this.site.wind;
    this.railClear = this.site.rail <= 0;
    if (opts.autoChute === false) this.controls.autoChute = false;
    if (opts.sas) this.controls.sas = true;
    if (opts.pitchDeg !== undefined) this.controls.target = opts.pitchDeg * D2R;

    const st = analyse(parts);
    const tel0 = telemetry(parts);
    this.integ = tel0.integrity;
    this.n0 = Math.max(1, tel0.twr);
    const items = st.active.map(makeItem);
    this.vehicle = new Body(this.nextBodyId++, items);
    this.vehicle.isVehicle = true;
    this.bodies.push(this.vehicle);

    const seatPart = st.active.find((p) => PART[p.defId].crew) ?? null;
    this.seatUid = seatPart?.uid ?? null;
    this.seat = !seatPart ? 'none' : seatPart.defId === 'wooden-chair' ? 'chair' : 'pod';
    this.zombieId = seatPart ? riderOf(seatPart) : null;
    this.zombie = this.zombieId ? new ZombiePayload(this.zombieId, opts.seed ?? 1) : null;

    // Pose on the pad: lowest point on the ground, leaning with the ramp
    const v = this.vehicle;
    v.massProps();
    v.th = -this.site.railAngleDeg * D2R;
    v.p = (opts.spinRps ?? 0) * 2 * Math.PI;
    v.y = 0; v.x = 0;
    v.y = -v.lowestPoint() + 1e-4;

    // Carved nozzles: aim each trimmed motor's thrust line through the centre of mass
    for (const it of items) {
      const e = it.engine;
      if (!e || !PART[it.part.defId].thrustTrim) continue;
      const rx = v.cx - e.nx, ry = v.cy - e.ny;
      e.trim = Math.max(-8 * D2R, Math.min(8 * D2R, Math.atan2(e.dx * ry - e.dy * rx, e.dx * rx + e.dy * ry)));
    }

    // A lumpy batch leaves unburnt grains: less impulse from the same motor (none at quality 1)
    const q = Math.min(1, Math.max(0, opts.propellantQuality ?? 1));
    if (q < 1) for (const it of items) { const e = it.engine; if (e && !e.liquid && PART[it.part.defId].engine?.kind === 'solid') { const k = 1 - (1 - q) * IMPULSE_LOSS_MAX; e.fSL *= k; e.fVac *= k; e.ispSL *= k; e.ispVac *= k; } }

    // Stage plan: radial decouplers first (boosters), then axial ones from the bottom up; chutes last
    const decs = st.active.filter(isDecoupler);
    const radial = decs.filter((p) => PART[p.defId].shape === 'decoupler-radial').map((p) => p.uid);
    if (radial.length) this.stages.push(radial);
    const axial = decs.filter((p) => PART[p.defId].shape === 'decoupler').sort((a, b) => a.y - b.y);
    for (const d of axial) this.stages.push([d.uid]);
    if (items.some((i) => i.chute)) this.stages.push('chutes');
    this.stageCount = this.stages.length;

    // Engines that ignite at launch: everything except those above an axial decoupler
    const cut = new Set(axial.map((d) => d.uid));
    const lower = components(st.active.filter((p) => !cut.has(p.uid)));
    const bottomY = Math.min(...st.active.map((p) => p.y));
    const first = lower.find((c) => c.some((p) => p.y === bottomY)) ?? lower[0] ?? [];
    const firstUids = new Set(first.map((p) => p.uid));
    // radial boosters hang off the first stage through radial decouplers: include them
    for (const it of items) if (it.engine && (firstUids.has(it.uid) || axial.length === 0)) it.engine.lit = true;
    this.armed = new Set(items.filter((i) => i.engine && !i.engine.lit).map((i) => i.uid));
    for (const it of items) if (it.engine) it.engine.lit = false;

    // Structural checks that fail at ignition (pressure, heat)
    this.preflight = [];
    for (const it of items) {
      const i = this.integ.get(it.uid);
      if (i && i.mode !== 'load' && i.safetyFactor < 1) this.preflight.push(`${it.name} ${i.mode === 'pressure' ? 'splits under internal pressure' : i.mode === 'heat' ? 'fails from heat' : 'snaps'} (safety factor ${i.safetyFactor.toFixed(2)}).`);
    }
    this.record();
  }

  private armed: Set<number>;
  private preflight: string[];

  /* ---------- Orbit (Gates A & B) ---------- */

  /** The vehicle's osculating two-body orbit (Earth-centred) */
  get orbit(): Orbit {
    const v = this.vehicle;
    return elements({ x: v.x, y: v.y + R_EARTH }, { x: v.vx, y: v.vy }, MU_EARTH);
  }
  get reachedSpace() { return this.flags.has('karman'); }
  /** A stable orbit (Pe above 140 km) was reached at some point this flight */
  get reachedOrbit() { return this.flags.has('orbit'); }
  laps = 0;

  /** What the conic is — see orbit/state.ts */
  get orbitClass(): OrbitClass { return this.osm.orbitClass; }
  /** Where the story is */
  get missionPhase(): MissionPhase { return this.osm.missionPhase; }
  /** How the last advance was computed */
  propagationMode: PropagationMode = 'physics';
  /** Every physics ⇄ rails switch, with its seam check (Gate A) */
  readonly handoffs: Handoff[] = [];
  get seamsOk() { return this.handoffs.every((h) => h.ok); }

  private osm = new OrbitStateMachine(R_EARTH);

  /* ---------- Spacewalk (EVA) ---------- */

  /** The payload, once it has left the seat (null before) */
  eva: EvaSim | null = null;
  /** Kit it will take: fire extinguisher by default (the chair's only option, spiritually) */
  evaKit: EvaKitId = 'extinguisher';

  /** null when an EVA can start now, else a one-line reason */
  get evaBlockedBy(): string | null {
    if (this.eva) return 'Already outside.';
    if (this.seatUid === null) return 'No seat on this vehicle.';
    return evaBlocker({
      missionPhase: this.missionPhase, propagationMode: this.propagationMode, seat: this.seat,
      zombieState: this.zombie ? this.zombie.state : null,
      thrusting: this.vehicle.thrust > 0,
    });
  }

  /**
   * Push the payload out of the seat. It becomes its own body (EvaSim) with its own orbit
   * state machine; the vehicle loses its mass and recoils (momentum is conserved).
   */
  startEva(kit: EvaKitId = this.evaKit): boolean {
    if (this.evaBlockedBy) return false;
    const v = this.vehicle, z = this.zombie!;
    const seat = v.items.find((i) => i.uid === this.seatUid)!;
    v.massProps();
    const [wx, wy] = v.toWorld(seat.x, seat.y);
    const rx = wx - v.x, ry = wy - v.y;
    const sv = { x: wx, y: wy, vx: v.vx - v.om * ry, vy: v.vy + v.om * rx, th: v.th };
    const m = z.mass, push = 0.6;
    const state = z.state === 'jarred' ? 'jarred' : z.state === 'damaged' ? 'damaged' : 'intact';
    this.eva = new EvaSim(this.nextBodyId++, v.id, this.t, sv, z.v.id, state, m, z.area, new Set(z.limbs), kit, {
      ev: (k, text) => this.ev(k, text),
      fx: (f: EvaFx) => this.pushFx(f),
      rnd: () => Math.random(),
    }, push);
    // the seat empties; the ship recoils opposite the push-off
    seat.dry = Math.max(0.1, seat.dry - m);
    this.areaLoss.set(seat.uid, z.v.area);
    v.massProps();
    const ux = -Math.sin(v.th), uy = Math.cos(v.th), k = (m * push) / Math.max(1, v.M);
    v.vx -= ux * k; v.vy -= uy * k;
    const e = this.eva;
    this.ev('eva', e.jarred
      ? 'Hatch open. The jar has been ejected. It floats away, blinking. It cannot do anything about it.'
      : e.armless ? 'The zombie pushed off — with no arms to hold anything. Pure drift.'
      : e.body.kit.id === 'extinguisher' ? `EVA! The ${z.v.name.toLowerCase()} pushed off ${this.seat === 'chair' ? 'the chair' : 'the pod'} with a fire extinguisher. Every push will also spin it.`
      : `EVA! The ${z.v.name.toLowerCase()} is outside with an RCS backpack.`);
    return true;
  }

  private lapAngle = 0;
  private lastAngle: number | null = null;
  /** Vehicle state just before the most recent physics step (for the physics → rails seam) */
  private prevPhys: { x: number; y: number; vx: number; vy: number; dt: number } | null = null;
  /** Rails exit state awaiting comparison with the first physics step */
  private railsExit: { x: number; y: number; vx: number; vy: number } | null = null;

  /**
   * Rails are allowed only in vacuum with nothing firing: above RAILS_ALT, no lit
   * engine able to push, no open chute, still flying. The rails segment itself
   * ends exactly at the atmosphere interface (see railChunk), so an orbit that
   * meets the ground is always handed back to physics — drag and the crash are
   * never computed on rails.
   */
  get onRailsOk(): boolean {
    const v = this.vehicle;
    if (!this.airborne || v.landed || this.outcome || v.alt < RAILS_ALT) return false;
    if (v.items.some((i) => i.chute && (i.chute.state === 'opening' || i.chute.state === 'open'))) return false;
    if (this.eva && !this.eva.ended && !this.eva.railsOk) return false;     // a zombie firing an extinguisher needs real physics
    return !v.engines.some((i) => {
      const e = i.engine!;
      if (!e.lit || e.out) return false;
      return !e.liquid || this.controls.throttle > 0;     // a solid can't be switched off
    });
  }

  /**
   * Advance `seconds` of game time. On rails the vehicle follows its exact Kepler
   * conic in segments that end precisely where it would descend through RAILS_ALT;
   * otherwise fixed 100 Hz physics steps.
   */
  advanceWarp(seconds: number) {
    let left = seconds;
    let guard = 0;
    while (left > 1e-9 && guard++ < 1_000_000) {
      const chunk = this.onRailsOk ? Math.min(left, this.railChunk()) : 0;
      if (chunk >= this.dt) { this.coast(chunk); left -= chunk; }
      else { this.step(); left -= this.dt; }
      if (this.done) break;
    }
  }

  /** Time until the conic comes down through the atmosphere interface (capped so the HUD keeps ticking) */
  private railChunk() {
    const v = this.vehicle;
    const r = { x: v.x, y: v.y + R_EARTH }, vel = { x: v.vx, y: v.vy };
    const tCross = timeToRadiusDescending(elements(r, vel, MU_EARTH), r, vel, R_EARTH + RAILS_ALT);
    const tEva = this.eva && !this.eva.ended ? this.eva.railChunk() : Infinity;
    return Math.min(60, tCross, tEva);
  }

  private setMode(m: PropagationMode) {
    if (m === this.propagationMode) return;
    const from = this.propagationMode;
    this.propagationMode = m;
    const v = this.vehicle;
    if (m === 'rails') {
      // physics → rails: replay the last physics step analytically
      const p = this.prevPhys;
      if (!p) return;
      const k = propagateState({ x: p.x, y: p.y + R_EARTH }, { x: p.vx, y: p.vy }, p.dt, MU_EARTH);
      this.recordSeam(from, m, k.r, k.v, { x: p.x, y: p.y + R_EARTH }, { x: p.vx, y: p.vy }, v.thrust === 0);
    } else {
      // rails → physics: compared after the first physics step (see step())
      this.railsExit = { x: v.x, y: v.y, vx: v.vx, vy: v.vy };
    }
  }

  private recordSeam(from: PropagationMode, to: PropagationMode, kr: { x: number; y: number }, kv: { x: number; y: number }, r0: { x: number; y: number }, v0: { x: number; y: number }, clean: boolean) {
    const v = this.vehicle;
    const altSwitch = Math.hypot(r0.x, r0.y) - R_EARTH;   // where the switch happened (start of the compared step)
    const r = { x: v.x, y: v.y + R_EARTH }, vel = { x: v.vx, y: v.vy };
    const a = invariants(r, vel, MU_EARTH), b = invariants(r0, v0, MU_EARTH);
    const dr = Math.hypot(r.x - kr.x, r.y - kr.y), dv = Math.hypot(vel.x - kv.x, vel.y - kv.y);
    const dE = Math.abs(a.energy - b.energy) / Math.abs(b.energy), dH = Math.abs(a.h - b.h) / Math.max(1, Math.abs(b.h));
    const validated = clean && altSwitch > RAILS_ALT - 5000 && !v.items.some((i) => i.chute && i.chute.state !== 'packed' && i.chute.state !== 'shredded');
    const ok = !validated || (dr < SEAM_TOL.dr && dv < SEAM_TOL.dv && dE < SEAM_TOL.rel && dH < SEAM_TOL.rel);
    this.handoffs.push({ t: this.t, from, to, alt: from === 'physics' ? v.alt : altSwitch, dr, dv, dE, dH, validated, ok });
    if (this.handoffs.length > 200) this.handoffs.splice(0, this.handoffs.length - 200);
  }

  private coast(dt: number) {
    const v = this.vehicle;
    this.setMode('rails');
    // Debris left behind can't be tracked at warp: let it go
    const loose = this.bodies.filter((b) => b !== v && !b.landed);
    if (loose.length) {
      this.bodies = this.bodies.filter((b) => !loose.includes(b));
      this.ev('debris', `${loose.length} spent stage${loose.length > 1 ? 's' : ''} out of tracking range.`);
    }
    const st = propagateState({ x: v.x, y: v.y + R_EARTH }, { x: v.vx, y: v.vy }, dt, MU_EARTH);
    v.x = st.r.x; v.y = st.r.y - R_EARTH; v.vx = st.v.x; v.vy = st.v.y;
    this.eva?.coast(dt);
    // SAS locks attitude at warp (as in KSP); otherwise it keeps turning
    if (this.controls.sas) {
      const ctl = this.controls;
      if (ctl.sasMode !== 'hold') {
        const pro = wrapPi(Math.atan2(v.vx, v.vy) - v.phi);
        ctl.target = ctl.sasMode === 'prograde' ? pro : wrapPi(pro + Math.PI);
      }
      v.th = -(ctl.target + v.phi); v.om = 0;
    } else v.th += v.om * dt;
    this.t += dt;
    this.seatG = 0;
    v.gLoad = 0;
    if (this.zombie && !this.eva) { this.zombie.update(this.seatState(), Math.min(dt, 0.2)); this.drainZombie(); }
    this.maxAlt = Math.max(this.maxAlt, v.alt);
    this.updateOrbitState();
    if (this.stepCount++ % 2 === 0) this.record();
  }

  /**
   * Gate B: feed the state machine and turn its transitions — and only those —
   * into story events (CAPCOM lines and milestones key off these event kinds).
   */
  private updateOrbitState() {
    const v = this.vehicle;
    if (!this.airborne && !this.outcome) return;
    const grounded = !!this.outcome && this.outcome !== 'timeout' && (v.landed || !this.airborne || this.outcome === 'structural-failure');
    const o = this.orbit;
    const tr: Transition[] = this.osm.update(o, grounded);
    const pe = (o.rP - R_EARTH) / 1000, ap = (o.rA - R_EARTH) / 1000;
    for (const t of tr) {
      if (t.kind === 'class') {
        if (t.to === 'escape') this.ev('escape', 'Escape trajectory — this zombie is leaving Earth for good.');
        else if (t.from === 'stable' && t.to === 'decaying') this.ev('decaying', `Periapsis down to ${pe.toFixed(0)} km — skimming the upper air. This orbit is decaying.`);
      } else {
        if (t.to === 'orbital' && this.osm.orbitClass === 'stable') {
          if (!this.flags.has('orbit')) {
            this.flags.add('orbit');
            this.ev('orbit', `Stable orbit! Ap ${ap.toFixed(0)} km × Pe ${pe.toFixed(0)} km, one lap every ${(o.period / 60).toFixed(0)} minutes.`);
            if (this.zombie && this.zombie.state !== 'pieces') this.ev('zombie-sat', `Zombie-Sat achieved: the ${this.zombie.v.name.toLowerCase()} is now officially an artificial satellite.`);
          } else this.ev('reboost', `Orbit restored: Pe ${pe.toFixed(0)} km.`);
          this.lapAngle = 0; this.lastAngle = null;
        }
        if (t.to === 'deorbit') this.ev('deorbit', `Periapsis now ${pe.toFixed(0)} km — inside the atmosphere. Coming home.`);
      }
    }
    // Laps: swept angle around Earth while orbital and stable (robust to any warp chunk < half a lap)
    if (this.osm.missionPhase === 'orbital' && this.osm.orbitClass === 'stable') {
      const ang = Math.atan2(v.y + R_EARTH, v.x);
      if (this.lastAngle !== null) this.lapAngle += Math.abs(wrapPi(ang - this.lastAngle));
      this.lastAngle = ang;
      if (this.lapAngle >= 2 * Math.PI) { this.lapAngle -= 2 * Math.PI; this.laps++; this.ev('lap', `Orbit ${this.laps} complete.`); }
    } else this.lastAngle = null;
  }

  /* ---------- Commands ---------- */

  ignite() {
    if (this.ignited || this.outcome) return;
    this.ignited = true;
    const v = this.vehicle;
    let n = 0;
    for (const it of v.items) if (it.engine && !this.armed.has(it.uid)) { it.engine.lit = true; n++; }
    const heaters = v.items.filter((i) => i.heater);
    for (const it of heaters) { it.heater!.lit = true; n++; }
    const tw = this.twrNow();
    if (heaters.length && !v.engines.length) this.ev('ignition', `Lit ${heaters.length} heat source${heaters.length > 1 ? 's' : ''} (${heaters.reduce((s2, i) => s2 + i.heater!.power, 0).toFixed(0)} W). Warming the air inside…`);
    else this.ev('ignition', n ? `Ignition. ${n} engine${n === 1 ? '' : 's'}, thrust-to-weight ${tw.toFixed(2)}${this.zombie ? `, payload: ${this.zombie.v.name.toLowerCase()}` : ''}.` : 'Ignition… nothing to ignite. It’s furniture.');
    if (this.preflight.length) {
      for (const msg of this.preflight) this.ev('failure', msg);
      this.breakUp(new Set(this.vehicle.items.filter((it) => { const i = this.integ.get(it.uid); return i && i.mode !== 'load' && i.safetyFactor < 1; }).map((i) => i.uid)));
      this.outcome = 'structural-failure';
    }
    if (!n) this.outcome = 'no-liftoff';
    for (const it of this.vehicle.items) if (it.engine?.lit && Math.abs(it.engine.trim) > 0.02 * D2R)
      this.ev('trim', `${it.name}: nozzle carved ${(Math.abs(it.engine.trim) / D2R).toFixed(1)}° off-axis so the thrust runs through the centre of mass.`);
  }

  /** Fire the next stage. Returns a short description, or null if nothing is left. */
  stage(): string | null {
    const next = this.stages.shift();
    if (!next) return null;
    if (next === 'chutes') { this.deployChutes(); return 'Parachutes'; }
    const before = this.bodies.length;
    this.split(new Set(next), 'stage');
    const dropped = this.bodies.slice(before);
    const kg = dropped.reduce((s, b) => s + b.M, 0);
    const label = next.length > 1 ? 'Boosters' : 'Stage';
    this.ev('stage', `${label} away: ${dropped.reduce((s, b) => s + b.items.length, 0)} parts, ${kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${kg.toFixed(0)} kg`} dropped.`);
    // Upper-stage engines now at the bottom of the vehicle light up
    // …but only those with no axial decoupler left below them
    let lit = 0;
    const below = this.vehicle.items.filter((i) => PART[i.part.defId].shape === 'decoupler').map((i) => i.y);
    for (const it of this.vehicle.items) {
      if (!it.engine || !this.armed.has(it.uid) || !this.ignited) continue;
      if (below.some((y) => y < it.y)) continue;
      this.armed.delete(it.uid); it.engine.lit = true; lit++;
    }
    if (lit) this.ev('ignition', `Upper stage ignition: ${lit} engine${lit > 1 ? 's' : ''}.`);
    return label;
  }

  deployChutes() {
    const chutes = this.vehicle.items.filter((i) => i.chute?.state === 'packed');
    if (!chutes.length) return;
    const v = Math.hypot(this.vehicle.vx, this.vehicle.vy);
    for (const it of chutes) {
      const c = it.chute!;
      if (v > c.maxSpeed) { c.state = 'shredded'; this.ev('chute', `${it.name} opened at ${v.toFixed(0)} m/s and shredded. Rated for ${c.maxSpeed} m/s.`); }
      else { c.state = 'opening'; this.ev('chute', `${it.name} deployed at ${(this.vehicle.alt / 1000).toFixed(2)} km, ${v.toFixed(0)} m/s.`); }
    }
    this.stages = this.stages.filter((s) => s !== 'chutes');
  }

  /* ---------- Stepping ---------- */

  /** Speed (m/s) the vehicle had when it left the rail or ramp; null before that, or with no guide */
  get railExitSpeed(): number | null { return this.site.rail > 0 && this.railS >= this.site.rail ? this.railV : null; }

  /** Nothing left moving */
  get done() {
    return !!this.outcome && this.bodies.every((b) => b.landed || (b === this.vehicle && !this.airborne));
  }

  /** Advance by `seconds` of flight time (fixed internal steps). */
  advance(seconds: number) {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step();
  }

  step() {
    const dt = this.dt;
    const ended = !!this.outcome;
    if (!this.ignited && !ended) { return; }
    this.t += dt;
    this.stepCount++;
    const v0 = this.vehicle;
    this.prevPhys = { x: v0.x, y: v0.y, vx: v0.vx, vy: v0.vy, dt };
    this.setMode('physics');
    for (const b of this.bodies) if (!b.landed) this.stepBody(b, dt);
    this.eva?.step(this.t, dt);
    if (this.railsExit) {
      const e = this.railsExit; this.railsExit = null;
      const k = propagateState({ x: e.x, y: e.y + R_EARTH }, { x: e.vx, y: e.vy }, dt, MU_EARTH);
      this.recordSeam('rails', 'physics', k.r, k.v, { x: e.x, y: e.y + R_EARTH }, { x: e.vx, y: e.vy }, v0.thrust === 0);
    }
    if (!ended) this.observe(dt);
    if (this.stepCount % 10 === 0 || (this.outcome && !ended)) this.updateOrbitState();
    if (this.stepCount % this.sampleEvery === 0 && !ended) this.record();
  }

  private stepBody(b: Body, dt: number) {
    const isV = b === this.vehicle;
    const alt = Math.max(0, b.alt);
    const rho = RHO0 * Math.exp(-alt / H_SCALE);
    const vacFrac = 1 - rho / RHO0;
    const g = G0 * (R_EARTH / (R_EARTH + alt)) ** 2;
    // gravity points at Earth's centre: −μ r / |r|³
    const [gx, gy] = gravityAt(b.x, b.y);
    const phi = b.phi, cphi = Math.cos(phi), sphi = Math.sin(phi);
    const a = speedOfSound(alt);

    // --- Engines: propellant (liquid: per fuel group; solid: each motor its own) ---
    const burning: Item[] = [];
    const groupOf = new Map<number, { tanks: Item[]; engines: Item[] }>();
    for (const g of b.fuelGroups) for (const e of g.engines) groupOf.set(e.uid, g);
    const flow = new Map<{ tanks: Item[]; engines: Item[] }, number>();
    for (const it of b.items) {
      const e = it.engine;
      if (!e || !e.lit || e.out) continue;
      const g = groupOf.get(it.uid);
      const has = e.liquid ? !!g && g.tanks.reduce((s2, t) => s2 + t.prop, 0) > 1e-6 : it.prop > 0;
      if (!has) { e.out = true; e.level = 0; if (isV) this.ev('burnout', `${it.name} burnout.`); this.firework(b, it); continue; }
      const F = this.thrustOf(e, vacFrac, isV), isp = e.ispSL + (e.ispVac - e.ispSL) * vacFrac;
      e.level = F / Math.max(1, e.fSL + (e.fVac - e.fSL) * vacFrac);
      if (F <= 0) continue;
      burning.push(it);
      if (e.liquid) flow.set(g!, (flow.get(g!) ?? 0) + F / (isp * G0));
      else it.prop = Math.max(0, it.prop - (F / (isp * G0)) * dt);
    }
    for (const [g, mdot] of flow) {
      const pool = g.tanks.reduce((s2, t) => s2 + t.prop, 0);
      const pool0 = g.tanks.reduce((s2, t) => s2 + t.prop0, 0);
      const f = pool0 > 0 ? Math.max(0, pool - mdot * dt) / pool0 : 0;
      for (const tk of g.tanks) tk.prop = tk.prop0 * f;
    }

    // --- Mass properties ---
    b.massProps();
    const { M, cx, cy, I } = b;

    // --- Air-relative velocity (body frame) ---
    const c = Math.cos(b.th), s = Math.sin(b.th);
    const w = this.wind * Math.min(3, (Math.max(alt, 1) / 10) ** 0.14) * (rho / RHO0);
    // the air is at rest; wind blows along the local horizon
    const rvx = b.vx - w * cphi, rvy = b.vy + w * sphi;
    const u = c * rvx + s * rvy, v = -s * rvx + c * rvy;
    const air = aeroLoads(b.aero, { u, v, om: b.om, cx, cy, rho, a, p: b.p, areaLoss: isV ? this.areaLoss : undefined });
    const vmag = Math.hypot(b.vx, b.vy);
    b.aoa = air.alpha; b.mach = air.mach; b.q = 0.5 * rho * vmag * vmag; b.stalled = air.stalled; b.lastAeroM = air.m;
    b.dragArea = b.q > 1 ? Math.abs(air.fy) / b.q : b.dragArea;

    // --- Re-entry heating ---
    this.heat(b, dt, rho, vmag);

    // --- Gimbal + RCS: SAS / manual ---
    const rcsTorque = isV ? this.steer(b, dt, air.m, vacFrac) : 0;
    if (!isV) for (const it of b.gimbals) it.engine!.delta *= 0.9;

    // --- Thrust ---
    let fbx = 0, fby = 0, torque = 0, thrustNow = 0;
    for (const it of burning) {
      const e = it.engine!;
      const F = this.thrustOf(e, vacFrac, isV);
      const cd = Math.cos(e.delta + e.trim), sd = Math.sin(e.delta + e.trim);
      const dx = e.dx * cd - e.dy * sd, dy = e.dx * sd + e.dy * cd;
      fbx += F * dx; fby += F * dy;
      torque += (e.nx - cx) * (F * dy) - (e.ny - cy) * (F * dx);
      thrustNow += F;
    }
    b.thrust = thrustNow;
    torque += rcsTorque;

    // --- Parachutes: force at the canopy's riser point, plus pendulum hang ---
    let chuteFx = 0, chuteFy = 0, hang = 0;
    for (const it of b.items) {
      const ch = it.chute;
      if (!ch || (ch.state !== 'opening' && ch.state !== 'open')) continue;
      if (ch.state === 'opening') { ch.frac = Math.min(1, ch.frac + dt / 6); if (ch.frac >= 1) ch.state = 'open'; }
      const [pvx, pvy] = b.velocityAt(it.x, it.y);
      const ax2 = pvx - w, ay2 = pvy, sp = Math.hypot(ax2, ay2);
      const A = ch.area * ch.frac ** 3;               // reefed inflation: area grows ~ t³ over 6 s
      const F = 0.5 * rho * 1.5 * A * sp;
      chuteFx -= F * ax2; chuteFy -= F * ay2;           // world frame, applied (for stability) at the CoM
      // Hang: rotate so the canopy's mount points up-stream
      const [mx, my] = b.toWorld(it.x, it.y);
      const want = Math.atan2(-(ax2), -(ay2) || -1e-9);   // direction opposite the motion
      const now = Math.atan2(mx - b.x, my - b.y);
      if (sp > 0.5) hang += wrapPi(now - want) * Math.min(1, ch.frac);
    }

    // --- Tier 0: hot-air buoyancy — one more world-frame force, plus carried air mass ---
    let bfx = 0, bfy = 0, mCarry = 0;
    if (b.hot) {
      const L = this.lantern(b, dt, alt, rho, isV);
      bfx = L.F * sphi; bfy = L.F * cphi;                 // straight up the local vertical
      mCarry = L.mCarry;
      // applied at the envelopes' centre of volume: above the CoM, so it hangs like a pendulum
      const rx = c * (L.cx - cx) - s * (L.cy - cy), ry = s * (L.cx - cx) + c * (L.cy - cy);
      torque += rx * bfy - ry * bfx;
    }

    // --- Rails and ramps ---
    const onRail = isV && !this.railClear;
    const bx = fbx + air.fx, by = fby + air.fy;
    let wx = c * bx - s * by + chuteFx + bfx, wy = s * bx + c * by + chuteFy + bfy;

    if (isV && !this.airborne && this.outcome) return;
    if (isV && !this.airborne) {
      // Pad hold until the push along the rail (or up, on bare ground) beats gravity
      const ang = this.site.railAngleDeg * D2R;
      const along = wx * Math.sin(ang) + wy * Math.cos(ang) - M * g * Math.cos(ang);
      if (along > 0) { this.airborne = true; this.ev('liftoff', b.hot ? `Lift-off at ${this.t.toFixed(1)} s: the air inside is ${(b.hot.tIn - 273.15).toFixed(0)} °C.` : `Liftoff at ${this.t.toFixed(1)} s.`); }
      else {
        this.padTime += dt;
        // a lantern needs time to warm up — hold it like at a real launch, up to five minutes
        const warming = !!b.hot && b.items.some((i) => i.heater?.lit && !i.heater.out);
        if ((!burning.length && !warming) || this.padTime > (warming ? 300 : 30)) {
          this.outcome = 'no-liftoff';
          this.ev('no-liftoff', b.hot ? `It never floated: the air inside only reached ${(b.hot.tIn - 273.15).toFixed(0)} °C — not enough lift for its weight.` : 'It never left the pad.');
        }
        b.gLoad = 1;
        return;
      }
    }

    let alphaAng = (torque + air.m) / I;
    if (onRail) {
      const ang = this.site.railAngleDeg * D2R, dxr = Math.sin(ang), dyr = Math.cos(ang);
      const acc = (wx * dxr + wy * dyr) / M - g * dyr;
      this.railV = Math.max(0, this.railV + acc * dt);
      this.railS += this.railV * dt;
      b.vx = this.railV * dxr; b.vy = this.railV * dyr;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.om = 0; alphaAng = 0;
      // (as in free flight below: with envelopes the carried air shares the push)
      if (mCarry > 0) { const Me = M + mCarry, k = M / Me; b.gLoad = Math.hypot(wx / Me + gx * (k - 1), wy / Me + gy * (k - 1)) / G0; }
      else b.gLoad = Math.hypot(wx, wy) / (M * G0);
      if (this.railS >= this.site.rail) {
        this.railClear = true;
        this.ev('rail', `Cleared the ${this.site.rail} m ${this.site.rail >= 15 ? 'bamboo ramp' : 'rail'} at ${this.railV.toFixed(0)} m/s.`);
      }
    } else {
      // Velocity Verlet (kick–drift–kick): symplectic and 2nd order for gravity, so an
      // unpowered orbit keeps its energy for as many laps as you like. Thrust, drag and
      // chutes are held constant across the step.
      // M_eff carries the hot air (and added mass) but only the structure M has weight.
      // Without envelopes mCarry = 0, so Meff = M and gk = 1: bit-identical to before.
      const Meff = M + mCarry, gk = M / Meff;
      const anx = wx / Meff, any_ = wy / Meff, h2 = dt / 2;
      b.vx += (anx + gx * gk) * h2; b.vy += (any_ + gy * gk) * h2;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const [gx2, gy2] = gravityAt(b.x, b.y);
      b.vx += (anx + gx2 * gk) * h2; b.vy += (any_ + gy2 * gk) * h2;
      // g-load = what the structure feels (proper acceleration a − g). Without envelopes that is
      // |w|/M exactly as before. With envelopes the hot and displaced air share the push
      // (a = w/M_eff + g·M/M_eff), so a gust on 400 m² of paper is not 5 g on the bamboo.
      b.gLoad = mCarry > 0 ? Math.hypot(anx + gx2 * (gk - 1), any_ + gy2 * (gk - 1)) / G0 : Math.hypot(wx, wy) / (M * G0);
      this.rotate(b, dt, torque, air.m, { rvx, rho, a, cx, cy }, hang);
      if (mCarry > 0) b.om *= Math.exp(-dt * 1.5);           // a big light envelope is heavily damped by the air
    }
    if (isV) this.lastAlpha = alphaAng;
    if (isV) this.lastAccel = [wx / M, wy / M];

    // --- Smoke for the Launch canvas (≈ 20 puffs/s) ---
    if (burning.length) {
      this.smokeAcc += dt * 20 / Math.max(1, this.bodies.length);
      if (this.smokeAcc >= 1) {
        this.smokeAcc -= 1;
        for (const it of burning) {
          const e = it.engine!;
          const [nwx, nwy] = b.toWorld(e.nx, e.ny);
          const cd = Math.cos(e.delta + e.trim), sd = Math.sin(e.delta + e.trim);
          const dxb = e.dx * cd - e.dy * sd, dyb = e.dx * sd + e.dy * cd;
          const ex = -(c * dxb - s * dyb), ey = -(s * dxb + c * dyb);
          const F = this.thrustOf(e, vacFrac, isV);
          this.pushFx({ t: this.t, kind: 'smoke', x: nwx, y: nwy, vx: b.vx + ex * 60, vy: b.vy + ey * 60, amount: F / 10_000, density: e.smoke * (1 - vacFrac * 0.8) });
        }
      }
    }

    // --- Ground ---
    const low = this.terrain ? b.lowestAboveGround(this.terrain) : b.lowestAlt();
    if (low < 0 && (this.airborne || !isV) && (isV ? this.railClear || this.site.rail <= 0 || b.vUp < 0 : true)) {
      const sp = Math.hypot(b.vx, b.vy);
      b.x -= sphi * low; b.y -= cphi * low;           // back out along the local vertical
      // A lantern drifting along the ground at walking pace is resting, not landing
      const resting = !!b.hot && b.vUp > -0.3 && sp < 3 && this.maxAlt < 2;
      if (resting) { const vu = b.vUp; if (vu < 0) { b.vx -= sphi * vu; b.vy -= cphi * vu; } }
      else if (b.vUp < 0 || sp > 0.5) this.touchdown(b, sp);
    }
  }

  /**
   * Tier 0 per-step: burn the heaters, update the inside air temperature (exact exponential
   * step for constant power), check the envelope for fire, return lift and carried mass.
   */
  private lantern(b: Body, dt: number, alt: number, rho: number, isV: boolean) {
    const hot = b.hot!, Tout = airTemp(alt);
    let V = 0, UA = 0, P = 0, cx = 0, cy = 0;
    for (const it of b.items) {
      const h = it.heater;
      if (h && h.lit && !h.out) {
        h.left -= dt;
        it.prop = it.prop0 * Math.max(0, h.left / h.burnTime);
        if (h.left <= 0) {
          h.out = true; it.prop = 0;
          if (isV) this.ev('lantern-burnout', `${it.name} burnt out at ${(Math.max(0, b.alt)).toFixed(0)} m. The air inside starts to cool…`);
        } else P += h.power;
        // smoke puffs are presentation: a body with hundreds of heaters gets ~a dozen per tick, not 800
        if (h.smoke > 0 && isV && Math.floor((this.t - dt) * 8) !== Math.floor(this.t * 8) && (it.uid + Math.floor(this.t * 8)) % Math.max(1, Math.ceil(b.items.length / 120)) === 0) {
          const [hx, hy] = b.toWorld(it.x, it.y);
          this.pushFx({ t: this.t, kind: 'smoke', x: hx, y: hy, vx: b.vx, vy: b.vy - 0.5, amount: 0.05 + h.smoke * 0.3, density: h.smoke });
        }
      }
      const e = it.envelope;
      if (e && !e.burnt) { V += e.volume; UA += U_ENVELOPE * e.area; cx += it.x * e.volume; cy += it.y * e.volume; }
    }
    if (V <= 0) { hot.tIn = Tout; hot.lift = 0; return { F: 0, mCarry: 0, cx: b.cx, cy: b.cy }; }
    hot.tIn = heatStep(hot.tIn, Tout, P, UA, V, rho, dt);
    // fire: the paper reaches its ignition point
    const tC = hot.tIn - 273.15;
    for (const it of b.items) {
      const e = it.envelope;
      if (!e || e.burnt || tC < e.igniteC) continue;
      e.burnt = true; it.temp = 700;
      if (isV) {
        this.ev('lantern-fire', `${it.name} caught fire at ${tC.toFixed(0)} °C inside — paper ignites around 233 °C (451 °F). Burning debris falling.`);
        const [ex, ey] = b.toWorld(it.x, it.y);
        this.pushFx({ t: this.t, kind: 'explode', x: ex, y: ey, vx: b.vx, vy: b.vy, size: 1.2, colors: [] });
      }
    }
    const F = buoyantLift(V, rho, hot.tIn, Tout);
    hot.lift = F;
    return { F, mCarry: carriedAirMass(V, rho, hot.tIn, Tout), cx: cx / V, cy: cy / V };
  }

  private lastAlpha = 0;
  private lastAccel: [number, number] = [0, 0];
  private areaLoss = new Map<number, number>();

  /** Attitude integration: plain, or gyroscopically coupled & sub-stepped while spinning */
  private rotate(b: Body, dt: number, thrustTorque: number, aeroM: number, f: { rvx: number; rho: number; a: number; cx: number; cy: number }, hang: number) {
    const { I, Ix } = b;
    const spinning = Math.abs(b.p) > SPIN_MIN && Math.hypot(b.vx, b.vy) > 1;
    if (!spinning) {
      b.om += ((thrustTorque + aeroM) / I) * dt;
      if (hang) {
        // Parachute pendulum, implicit so a huge canopy can't make it ring: ω̈ = −k·err − c·ω
        const k = 6, cdamp = 4.5;
        b.om = (b.om + k * hang * dt) / (1 + cdamp * dt);
      }
      b.th += b.om * dt;
      return;
    }
    const Om = (Ix * b.p) / I;
    const n = Math.min(40, Math.max(1, Math.ceil((Math.abs(Om) * dt) / 0.1)));
    const h = dt / n, cw = Math.cos(Om * h), sw = Math.sin(Om * h);
    for (let i = 0; i < n; i++) {
      const ci = Math.cos(b.th), si = Math.sin(b.th);
      const vi = -si * f.rvx + ci * b.vy;
      const mP = i === 0 ? aeroM : aeroLoads(b.aero, { u: ci * f.rvx + si * b.vy, v: vi, om: b.om, cx: f.cx, cy: f.cy, rho: f.rho, a: f.a, p: b.p }).m;
      const mY = aeroLoads(b.aero, { u: Math.sin(b.psi) * vi, v: Math.cos(b.psi) * vi, om: b.psiDot, cx: f.cx, cy: f.cy, rho: f.rho, a: f.a, centreline: true }).m;
      b.om += ((thrustTorque + mP) / I) * h;
      b.psiDot += (mY / I) * h;
      const o2 = b.om * cw - b.psiDot * sw;
      b.psiDot = b.om * sw + b.psiDot * cw;
      b.om = o2;
      b.th += b.om * h;
      b.psi = wrapPi(b.psi + b.psiDot * h);
    }
  }

  /** Thrust of one engine now: sea-level→vacuum blend × throttle (liquid engines on the vehicle) */
  private thrustOf(e: Engine, vacFrac: number, isV: boolean) {
    const F = e.fSL + (e.fVac - e.fSL) * vacFrac;
    return e.liquid && isV ? F * Math.max(0, Math.min(1, this.controls.throttle)) : F;
  }

  /** Monopropellant left for RCS (kg) */
  get mono() { return this.vehicle.items.reduce((s2, i) => s2 + (i.rcs?.mono ?? 0), 0); }
  get monoMax() { return this.vehicle.items.reduce((s2, i) => s2 + (i.rcs ? PART[i.part.defId].rcs!.mono : 0), 0); }

  /**
   * Attitude control. SAS: PID on pitch error → required torque (aero moment and thrust
   * offset fed forward). Gimbals take what they can (clamped, 30°/s slew); RCS thrusters
   * make up the rest — which is everything once the engines are off or in vacuum.
   * Without SAS the A/D keys swing the gimbals and fire RCS directly.
   * Returns the RCS torque (N·m).
   */
  private steer(b: Body, dt: number, aeroM: number, vacFrac: number): number {
    const ctl = this.controls;
    const sp = Math.hypot(b.vx, b.vy);
    if (ctl.sas && ctl.sasMode !== 'hold' && sp > 5) {
      // targets are measured from the local vertical, toward +x
      const pro = wrapPi(Math.atan2(b.vx, b.vy) - b.phi);
      ctl.target = ctl.sasMode === 'prograde' ? pro : wrapPi(pro + Math.PI);
    } else if (ctl.sas) ctl.target += ctl.nudge * 12 * D2R * dt;
    if (ctl.sas && ctl.turnRate > 0 && this.airborne) {
      ctl.target = Math.min(ctl.turnTo, ctl.target + ctl.turnRate * dt);
      if (ctl.target >= ctl.turnTo) ctl.turnRate = 0;
    }
    const gs = b.gimbals.filter((it) => it.engine!.lit && !it.engine!.out && it.engine!.level > 0);
    // Control effectiveness B = Σ F·(rx·dx + ry·dy): torque per radian of gimbal (negative for engines below the CoM)
    let B = 0, base = 0;
    for (const it of b.items) {
      const en = it.engine;
      if (!en || !en.lit || en.out) continue;
      const F = this.thrustOf(en, vacFrac, true);
      base += (en.nx - b.cx) * F * en.dy - (en.ny - b.cy) * F * en.dx;
      if (en.gimbal > 0) B += F * ((en.nx - b.cx) * en.dx + (en.ny - b.cy) * en.dy);
    }
    let need = 0;
    if (ctl.sas) {
      // θ is CCW-positive; the target is "toward +x" (clockwise), so θ_target = −target
      const e = wrapPi(-(ctl.target + b.phi) - b.th);
      this.iErr = Math.max(-0.5, Math.min(0.5, this.iErr + e * dt));
      const wn = 2.0, zeta = 0.9;
      const alphaCmd = wn * wn * e + 0.6 * this.iErr - 2 * zeta * wn * b.om;
      need = b.I * alphaCmd - aeroM - base;
    }
    // Gimbals
    let gimbalTorque = 0;
    if (gs.length && Math.abs(B) > 1e-6) {
      const want = ctl.sas ? need / B : -ctl.nudge * Math.sign(B);
      const rate = 30 * D2R * dt;
      for (const it of gs) {
        const e = it.engine!;
        const target = Math.max(-e.gimbal, Math.min(e.gimbal, want));
        e.delta += Math.max(-rate, Math.min(rate, target - e.delta));
      }
      gimbalTorque = B * gs[0].engine!.delta;
    }
    // RCS: whatever the gimbals can't do
    const pods = b.items.filter((i) => i.rcs && i.rcs.mono > 0);
    if (!ctl.rcs || !pods.length) return 0;
    const max = pods.reduce((s2, i) => s2 + i.rcs!.torque, 0);
    let tau = ctl.sas ? need - gimbalTorque : -ctl.nudge * max;
    if (Math.abs(tau) < 0.03 * max) tau = 0;
    tau = Math.max(-max, Math.min(max, tau));
    if (!tau) return 0;
    // Thrusters ~0.6 m from the axis, Isp 220 s: ṁ = |τ| / (r·Isp·g₀)
    const used = (Math.abs(tau) / (0.6 * 220 * G0)) * dt;
    for (const pod of pods) {
      const share = (used * pod.rcs!.torque) / max;
      const take = Math.min(pod.rcs!.mono, share);
      pod.rcs!.mono -= take; pod.dry -= take;
      if (pod.rcs!.mono <= 0 && !this.flags.has('mono-out')) { this.flags.add('mono-out'); this.ev('rcs', 'RCS monopropellant exhausted — no more attitude control without the engines.'); }
    }
    if (this.stepCount % 6 === 0 && Math.abs(tau) > 0.15 * max) {
      const pod = pods[0];
      const side = Math.sign(tau);   // CCW torque: puff from the right side pushing up-left
      const [px, py] = b.toWorld(pod.x + side * pod.w * 0.45, pod.y + pod.h * 0.3);
      const c = Math.cos(b.th), s = Math.sin(b.th);
      this.pushFx({ t: this.t, kind: 'rcs', x: px, y: py, vx: b.vx, vy: b.vy, dx: c * side - s * 0, dy: s * side });
    }
    return tau;
  }

  /**
   * Re-entry heating. The flow carries ½ρv³ W/m² of kinetic energy; the share that reaches
   * the wall at the stagnation point follows Sutton–Graves, q̇ = 1.74·10⁻⁴·√(ρ/rₙ)·v³, driven
   * by (1 − T_wall/T_recovery). The leading part takes it over the frontal area; its wake less.
   * A heat shield in front shadows the rest. Parts radiate (εσT⁴); only the skin
   * soaks the heat. Past its melting/burning point a part
   * burns up and the vehicle comes apart.
   */
  private heat(b: Body, dt: number, rho: number, v: number) {
    const flux = 0.5 * rho * v * v * v;
    const ux = v > 1 ? b.vx / v : 0, uy = v > 1 ? b.vy / v : 1;
    let lead: Item | null = null, best = -Infinity;
    if (flux > 2e5) for (const it of b.items) {
      const [wx, wy] = b.toWorld(it.x, it.y);
      const ext = Math.abs(ux * Math.cos(b.th) + uy * Math.sin(b.th)) * it.w / 2 + Math.abs(-ux * Math.sin(b.th) + uy * Math.cos(b.th)) * it.h / 2;
      const proj = wx * ux + wy * uy + ext;
      if (proj > best) { best = proj; lead = it; }
    }
    const shielded = !!lead?.shield;
    const burnt: Item[] = [];
    // A wall can't get hotter than the recovery temperature of the flow: T_r = T_air·(1 + 0.2·M²)
    const Tair = Math.max(217, 288 - 0.0065 * Math.max(0, b.alt));
    const Tr = Tair * (1 + 0.2 * (v / speedOfSound(Math.max(0, b.alt))) ** 2);
    for (const it of b.items) {
      const K = it.temp + 273.15;
      let qIn = 0;
      if (lead) {
        const drive = Math.max(0, 1 - K / Tr);
        // Stagnation heating (Sutton–Graves): q̇ = 1.74·10⁻⁴·√(ρ/rₙ)·v³ W/m² — a fraction of the ½ρv³ flow energy
        const rn = Math.max(0.1, Math.min(lead.w, lead.h) / 2);
        const qs = 1.74e-4 * Math.sqrt(rho / rn) * v * v * v;
        if (it === lead) qIn = qs * Math.max(0.05, b.aero.frontArea || it.w * it.w) * drive;
        else qIn = (shielded ? 0.02 : 0.15) * qs * it.w * it.h * drive;
      }
      const area = 2 * it.w * it.h + 0.05;
      const qOut = 0.8 * 5.67e-8 * (K ** 4 - 250 ** 4) * area;
      const C = it.skin * 900;
      it.temp = Math.max(-60, it.temp + ((qIn - qOut) / C) * dt);
      if (it.shield) it.temp = Math.min(it.temp, 2900);   // ablates instead of melting
      if (it.temp > it.melt) burnt.push(it);
    }
    if (b === this.vehicle && lead && b.vUp < 0 && v / speedOfSound(Math.max(0, b.alt)) > 5 && flux > 1e7 && !this.flags.has('plasma')) {
      this.flags.add('plasma');
      // wording only: plasma and radio blackout belong to orbital-speed re-entry (several km/s); below that it is hypersonic heating
      const head = v >= 3000 ? 'Re-entry plasma' : `Hypersonic heating (Mach ${(v / speedOfSound(Math.max(0, b.alt))).toFixed(1)})`;
      this.ev('plasma', `${head}: ${(flux / 1e6).toFixed(0)} MW/m² of flow energy hitting the ${lead.name.toLowerCase()}.${shielded ? ' The heat shield is doing its job.' : ' Nothing is shielding it.'}`);
    }
    if (b === this.vehicle && this.zombie) {
      const seat = b.items.find((i) => i.uid === this.seatUid);
      if (seat && !this.eva) { this.zombie.heat(seat.temp, this.seatState()); this.drainZombie(); }
    }
    if (burnt.length) {
      for (const it of burnt) this.ev('burnup', `${it.name} burns up at ${it.temp.toFixed(0)} °C.`);
      this.explode(b, burnt);
      if (b === this.vehicle) this.breakUp(new Set(burnt.map((i) => i.uid)));
      else { b.items = b.items.filter((i) => !burnt.includes(i)); if (b.items.length) b.rebuild(); else b.landed = true; }
    }
  }

  /** Blow up some parts of a body: fireball, shockwave, and fireworks for any salts aboard */
  private explode(b: Body, items: Item[], firework = false) {
    if (!items.length) return;
    let mx = 0, my = 0, m = 0, prop = 0;
    for (const it of items) { const [x, y] = b.toWorld(it.x, it.y); const w = it.dry + it.prop; mx += x * w; my += y * w; m += w; prop += it.prop; }
    const colors = [...new Set(items.map((i) => i.engine?.salt ?? i.part.salt).filter(Boolean))].map((sl) => toCss(flameColour({ amounts: { [sl as string]: 1 }, contamination: 0 })));
    this.pushFx({ t: this.t, kind: 'explode', x: mx / (m || 1), y: Math.max(0.5, my / (m || 1)), vx: b.vx, vy: b.vy, size: firework ? 2 : 1.5 + Math.cbrt(m * 0.2 + prop * 2) * 0.6, colors, firework });
  }

  /** A solid motor with a firework salt bursts at burnout (a Bang Fai tradition) */
  private firework(b: Body, it: Item) {
    const salt = it.engine?.salt;
    if (!salt || b.landed) return;
    this.explode(b, [it], true);
    if (b === this.vehicle) this.ev('firework', `Pop! The ${it.name.toLowerCase()}’s ${salt} charge bursts ${({ Sr: 'red', Ba: 'green', Cu: 'blue', Na: 'yellow', Li: 'crimson' } as Record<string, string>)[salt] ?? ''} at ${(Math.max(0, b.alt) / 1000).toFixed(2)} km.`);
  }

  /** Per-step observations on the vehicle: g-loads, zombie, events, structure, chutes, roll */
  private observe(dt: number) {
    const b = this.vehicle;
    if (!this.airborne || b.landed) return;
    const vmag = Math.hypot(b.vx, b.vy);
    const c = Math.cos(b.th), s = Math.sin(b.th);

    // Roll: canted fins
    const rho = RHO0 * Math.exp(-Math.max(0, b.alt) / H_SCALE);
    if (b.aero.panels.some((pn) => pn.cant)) {
      const u = c * b.vx + s * b.vy, v = -s * b.vx + c * b.vy;
      const r = aeroLoads(b.aero, { u, v, om: b.om, cx: b.cx, cy: b.cy, rho, a: speedOfSound(b.alt), p: b.p });
      b.p += (r.roll / b.Ix) * dt;
    }

    // Max-Q (and spin stability there)
    if (b.q > this.maxQ) this.maxQ = b.q;
    else if (!this.flags.has('max-q') && this.maxQ > 1000) {
      this.flags.add('max-q');
      this.ev('max-q', `Max-Q: ${(this.maxQ / 1000).toFixed(1)} kPa at Mach ${b.mach.toFixed(2)}.`);
      if (Math.abs(b.p) > SPIN_MIN) this.spinSg = gyroFactor(b, rho, speedOfSound(b.alt));
    }

    // Felt acceleration at the seat: a_CoM + α×r − ω²r
    const [ax, ay] = this.lastAccel;
    this.maxG = Math.max(this.maxG, b.gLoad);
    const seat = this.seatUid !== null ? b.items.find((i) => i.uid === this.seatUid) : undefined;
    if (seat) {
      const rbx = seat.x - b.cx, rby = seat.y - b.cy;
      const rwx = c * rbx - s * rby, rwy = s * rbx + c * rby;
      const al = this.lastAlpha;
      const sax = ax - al * rwy - b.om * b.om * rwx, say = ay + al * rwx - b.om * b.om * rwy;
      this.seatG = Math.hypot(sax, say) / G0;
      this.maxSeatG = Math.max(this.maxSeatG, this.seatG);
      this.seatWorld = { x: b.x + rwx, y: b.y + rwy, vx: b.vx - b.om * rwy, vy: b.vy + b.om * rwx };
      if (this.zombie && !this.eva) {
        const shed = this.zombie.update(this.seatState(), dt);
        if (shed > 0) {
          seat.dry -= shed;
          this.areaLoss.set(seat.uid, this.zombie.v.area - this.zombie.area);
        }
        this.drainZombie();
      }
    }

    const tilt = Math.abs(b.pitch / D2R);
    this.maxTilt = Math.max(this.maxTilt, tilt);
    this.maxAoa = Math.max(this.maxAoa, Math.abs(b.aoa / D2R));
    this.maxRate = Math.max(this.maxRate, Math.abs(b.om / D2R));
    this.maxAlt = Math.max(this.maxAlt, b.alt);
    this.maxSpeed = Math.max(this.maxSpeed, vmag);

    const once = (k: string, kind: string, text: string) => { if (!this.flags.has(k)) { this.flags.add(k); this.ev(kind, text); } };
    if (b.stalled > 0.5 && vmag > 20) once('stall', 'stall', `Fins stalled at ${Math.abs(b.aoa / D2R).toFixed(0)}° angle of attack — no more restoring force.`);
    if (tilt > 90 && Math.abs(b.aoa) > 45 * D2R && !(this.controls.sas && this.controls.sasMode === 'retrograde') && !b.items.some((i) => i.chute && i.chute.state !== 'packed')) once('tumble', 'tumble', `Tumbling: tilt passed 90° at ${(b.alt / 1000).toFixed(1)} km.`);
    const thrusting = b.thrust > 0;
    if (Math.abs(b.aoa) > 150 * D2R && vmag > 30 && thrusting) once('reverse', 'reverse', b.aero.panels.some((pn) => pn.kind === 'plate')
      ? `Flying tail-first at ${vmag.toFixed(0)} m/s — the fins are now at the front, pushing the wrong way.`
      : `Flying tail-first at ${vmag.toFixed(0)} m/s.`);
    if (Math.abs(b.om) > 2 * Math.PI && vmag > 10) once('cartwheel', 'cartwheel', `Cartwheeling at ${(Math.abs(b.om) / (2 * Math.PI)).toFixed(1)} rev/s.`);
    if (b.alt > KARMAN) once('karman', 'karman', 'Crossed the Kármán line (100 km).');
    if (b.vUp < 0 && b.alt > 50) once('apogee', 'apogee', `Apogee ${(b.alt / 1000).toFixed(2)} km.`);
    if (this.controls.sas && b.gimbals.some((g) => Math.abs(Math.abs(g.engine!.delta) - g.engine!.gimbal) < 1e-3) && thrusting && vmag > 50)
      once('gimbal-limit', 'gimbal', 'Gimbal at full deflection — the autopilot is running out of authority.');

    // Structure: launch loads scale with the felt g
    for (const it of b.items) {
      const i = this.integ.get(it.uid);
      if (!i || i.mode !== 'load' || !(i.loadN > 0)) continue;
      if (i.safetyFactor * (this.n0 / Math.max(b.gLoad, 1e-3)) < 1 && !this.flags.has(`fail-${it.uid}`)) {
        this.flags.add(`fail-${it.uid}`);
        this.ev('failure', `${it.name} buckles at ${b.gLoad.toFixed(1)} g — the vehicle breaks up.`);
        this.breakUp(new Set([it.uid]));
        break;
      }
    }

    // Parachutes: automatic deployment on the way down
    if (this.controls.autoChute && b.vUp < 0 && b.alt < 3000) {
      const packed = b.items.filter((i) => i.chute?.state === 'packed');
      if (packed.length) {
        const limit = Math.min(...packed.map((i) => i.chute!.maxSpeed));
        if (vmag < limit * 0.95 || b.alt < 400) this.deployChutes();
      }
    }

    // Auto staging is driven by simulateFlight (headless); the player stages by hand.
  }

  private touchdown(b: Body, sp: number) {
    b.touch = { sp, vx: b.vx, vy: b.vy, t: this.t };
    b.landed = true;
    b.vx = 0; b.vy = 0; b.om = 0; b.p = 0;
    for (const it of b.items) if (it.engine) it.engine.out = true;
    if (sp > 40) this.explode(b, b.items);
    if (b !== this.vehicle) {
      if (sp < 3) return;
      this.ev('debris', `${b.items.length > 1 ? 'Spent stage' : b.items[0].name} hits the ground at ${sp.toFixed(0)} m/s, ${(Math.abs(b.downrange) / 1000).toFixed(1)} km downrange.`);
      return;
    }
    if (this.outcome && this.outcome !== 'structural-failure') return;
    this.impactSpeed = sp;
    const chute = b.items.some((i) => i.chute && (i.chute.state === 'open' || i.chute.state === 'opening'));
    const soft = sp < 15;
    if (soft) this.ev('landed', `Touchdown at ${sp.toFixed(1)} m/s${chute ? ' under canopy' : ''}, ${(Math.abs(b.downrange) / 1000).toFixed(2)} km from the pad.`);
    else this.ev('impact', `Ground impact at ${sp.toFixed(0)} m/s, ${(Math.abs(b.downrange) / 1000).toFixed(1)} km from the pad.`);
    if (this.outcome !== 'structural-failure') this.outcome = soft ? 'landed' : 'impact';
    for (const it of b.items) if (it.chute && it.chute.state !== 'packed' && it.chute.state !== 'shredded') it.chute.state = 'cut';
    if (this.zombie && !this.eva) { this.zombie.land(this.seatState(), sp); this.drainZombie(); }
    if (b.items.some((i) => i.heater?.lit && !i.heater.out)) this.ev('lantern-ground-fire', 'It came down with the flame still burning. This is how sky lanterns start roof and field fires.');
    this.record();
  }

  /**
   * Split the vehicle by removing parts (fired decouplers, a failed part).
   * The piece with the seat (or else the heaviest) stays "the vehicle";
   * everything else flies on as debris. Removed parts go with the debris.
   */
  private split(remove: Set<number>, why: 'stage' | 'failure') {
    const v = this.vehicle;
    if (![...remove].some((u) => v.items.some((i) => i.uid === u))) return;
    v.massProps();
    const keepParts = v.items.filter((i) => !remove.has(i.uid)).map((i) => i.part);
    const comps = components(keepParts);
    const pick = comps.find((cp) => cp.some((p) => p.uid === this.seatUid))
      ?? comps.reduce((a, b2) => (mass(b2) > mass(a) ? b2 : a), comps[0] ?? []);
    function mass(cp: PlacedPart[]) { return cp.reduce((s, p) => s + (v.items.find((i) => i.uid === p.uid)!.dry + v.items.find((i) => i.uid === p.uid)!.prop), 0); }
    const removed = v.items.filter((i) => remove.has(i.uid));
    const groups: Item[][] = comps.filter((cp) => cp !== pick).map((cp) => cp.map((p) => v.items.find((i) => i.uid === p.uid)!));
    // Fired decouplers ride with the debris they touched
    for (const r of removed) {
      const g = groups.find((gr) => joints([r.part, ...gr.map((i) => i.part)]).some((j) => j.a.uid === r.uid || j.b.uid === r.uid));
      if (g && why === 'stage') g.push(r); else groups.push([r]);
    }
    const keep = pick.map((p) => v.items.find((i) => i.uid === p.uid)!);
    if (!keep.length) return;

    const vCom = { x: v.x, y: v.y };
    const spawn = (items: Item[]): Body => {
      const nb = new Body(this.nextBodyId++, items);
      nb.massProps();
      [nb.x, nb.y] = v.toWorld(nb.cx, nb.cy);
      [nb.vx, nb.vy] = v.velocityAt(nb.cx, nb.cy);
      nb.th = v.th; nb.om = v.om; nb.p = v.p;
      nb.landed = v.landed;
      return nb;
    };
    const debris = groups.filter((gr) => gr.length).map(spawn);
    const core = spawn(keep);
    core.isVehicle = true;
    // Separation push: 2 m/s apart
    for (const d of debris) {
      const dx = d.x - vCom.x, dy = d.y - vCom.y, L = Math.hypot(dx, dy) || 1;
      const share = core.M / (core.M + d.M);
      d.vx += (dx / L) * 2 * share; d.vy += (dy / L) * 2 * share;
    }
    this.bodies = this.bodies.filter((bb) => bb !== v).concat(core, debris);
    this.vehicle = core;
  }

  /**
   * How close a part is to failing, for the renderer's damage flicker: 0 relaxed, 1 at the
   * breaking point. Worst of structural load (felt g vs its safety factor) and heat. Read-only.
   */
  strain(b: Body, it: Item): number {
    let s = 0;
    const i = this.integ.get(it.uid);
    if (i && i.mode === 'load' && i.loadN > 0) s = Math.max(b.gLoad, 1e-3) / (i.safetyFactor * this.n0);
    if (!it.shield && it.melt > 0) s = Math.max(s, it.temp / it.melt);
    return s;
  }

  /** A part fails: engines shut down and the vehicle comes apart there */
  private breakUp(failed: Set<number>) {
    const v = this.vehicle;
    if (!this.flags.has(`boom-${[...failed].join(',')}`)) { this.flags.add(`boom-${[...failed].join(',')}`); this.explode(v, v.items.filter((i) => failed.has(i.uid))); }
    for (const b of this.bodies) for (const it of b.items) if (it.engine) it.engine.out = true;
    this.split(failed, 'failure');
  }

  /* ---------- Helpers ---------- */

  private twrNow() {
    const v = this.vehicle; v.massProps();
    const F = v.items.reduce((s, i) => s + (i.engine && !this.armed.has(i.uid) ? i.engine.fSL : 0), 0);
    return F / (v.M * G0);
  }
  private seatState(): SeatState {
    return { t: this.t, g: this.seatG, ...this.seatWorld, alt: Math.max(0, this.vehicle.alt) };
  }
  private drainZombie() {
    if (!this.zombie) return;
    for (const l of this.zombie.log.splice(0)) this.ev(`zombie-${l.kind}`, l.text, l.t);
    for (const f of this.zombie.fx.splice(0)) this.pushFx({ ...f, inside: this.seat === 'pod' });
  }
  private pushFx(f: FlightFx) { this.fxQueue.push(f); this.fxAll.push(f); }
  ev(kind: string, text: string, t = this.t) { this.events.push({ t: +t.toFixed(1), kind, text }); }

  private record() {
    const b = this.vehicle;
    const gim = b.gimbals[0]?.engine?.delta ?? 0;
    this.samples.push({
      t: +this.t.toFixed(2), x: b.downrange, alt: Math.max(0, b.alt), speed: Math.hypot(b.vx, b.vy),
      tiltDeg: b.pitch / D2R, aoaDeg: b.aoa / D2R, pitchRate: b.om / D2R, spinRps: b.p / (2 * Math.PI),
      gLoad: this.airborne ? b.gLoad : 1, seatG: this.airborne ? this.seatG : 1, mass: b.M, thrust: b.thrust,
      mach: b.mach, q: b.q, stalled: b.stalled, gimbalDeg: gim / D2R,
    });
  }

  /** Apogee prediction: vertical point-mass with the current drag area, coasting (no thrust). */
  predictApogee(): number {
    const b = this.vehicle;
    let y = b.alt, vy = b.vUp, vx = b.vEast;
    if (vy <= 0) return Math.max(this.maxAlt, y);
    const CdA = Math.max(0, b.dragArea), M = Math.max(1, b.M), h = 0.25;
    for (let i = 0; i < 4000 && vy > 0; i++) {
      const rho = RHO0 * Math.exp(-Math.max(0, y) / H_SCALE), V = Math.hypot(vx, vy);
      const k = (0.5 * rho * CdA * V) / M;
      vx -= k * vx * h; vy -= (G0 * (R_EARTH / (R_EARTH + y)) ** 2 + k * vy) * h; y += vy * h;
    }
    return y;
  }

  result(): FlightResult {
    const z = this.zombie;
    return {
      outcome: this.outcome ?? 'timeout',
      samples: this.samples, events: [...this.events].sort((a, b) => a.t - b.t), fx: this.fxAll,
      maxAlt: this.maxAlt, maxSpeed: this.maxSpeed, maxG: this.maxG, maxSeatG: this.maxSeatG,
      impactSpeed: this.impactSpeed, range: Math.abs(this.vehicle.downrange),
      maxTiltDeg: this.maxTilt, maxAoaDeg: this.maxAoa, maxPitchRate: this.maxRate, spinSg: this.spinSg,
      seat: this.seat, zombie: this.zombieId,
      zombieVerdict: z ? (this.airborne ? z.verdict() : 'Zombie waited on the pad. Nothing happened. It’s used to that.') : 'No payload.',
    };
  }
}

/**
 * Gyroscopic stability factor Sg = (Ix·p)² / (4·I·Mα). Infinity = the
 * airframe is statically stable anyway.
 */
function gyroFactor(b: Body, rho: number, a: number): number {
  const V = Math.hypot(b.vx, b.vy), d = 0.02;
  const at = (al: number) => aeroLoads(b.aero, { u: V * Math.sin(al), v: V * Math.cos(al), om: 0, cx: b.cx, cy: b.cy, rho, a, centreline: true }).m;
  const mAlpha = (at(d) - at(-d)) / (2 * d);
  if (mAlpha <= 0) return Infinity;
  return (b.Ix * b.p) ** 2 / (4 * b.I * mAlpha);
}

/**
 * Staged Δv estimate (vacuum): walk the stage plan; each stage burns the
 * propellant of the parts it drops, the last one everything left.
 * Isp = vacuum Isp of the engines in that stage (or of the remaining vehicle).
 */
export function stagedDeltaV(parts: PlacedPart[]): { total: number; stages: number[] } {
  const f = new Flight(parts, { wind: 0 });
  const out: number[] = [];
  const ispOf = (items: Item[]) => {
    const es = items.filter((i) => i.engine).map((i) => i.engine!);
    if (!es.length) return 0;
    const F = es.reduce((s2, e) => s2 + e.fVac, 0);
    return F / es.reduce((s2, e) => s2 + e.fVac / e.ispVac, 0);
  };
  for (let guard = 0; guard < 12; guard++) {
    const v = f.vehicle; v.massProps();
    const before = new Set(v.items.map((i) => i.uid));
    const all = v.items;
    const m0 = v.M;
    const next = f.stages[0];
    if (!next || next === 'chutes') {
      const prop = all.reduce((s2, i) => s2 + i.prop, 0);
      const isp = ispOf(all);
      if (isp > 0 && prop > 0) out.push(isp * G0 * Math.log(m0 / (m0 - prop)));
      break;
    }
    f.stage();
    const kept = new Set(f.vehicle.items.map((i) => i.uid));
    const dropped = all.filter((i) => before.has(i.uid) && !kept.has(i.uid));
    const prop = dropped.reduce((s2, i) => s2 + i.prop, 0);
    const isp = ispOf(dropped) || ispOf(all);
    if (isp > 0 && prop > 0) out.push(isp * G0 * Math.log(m0 / (m0 - prop)));
  }
  return { total: out.reduce((a, b) => a + b, 0), stages: out };
}

/** Rough Δv to reach a low orbit from the ground: 7.8 km/s + ~1.6 km/s of gravity and drag losses */
export const LEO_DV = 9400;

/** Headless flight to the end (tests, previews). */
export function simulateFlight(parts: PlacedPart[], opts: FlightOptions = {}): FlightResult {
  const f = new Flight(parts, { ...opts, site: SITES.pad });
  const maxTime = opts.maxTime ?? 900;
  f.ignite();
  const autoStage = opts.autoStage ?? true;
  while (!f.outcome && f.t < maxTime) {
    f.step();
    if (autoStage && f.airborne && f.stages.length && f.stages[0] !== 'chutes') {
      const lit = f.vehicle.engines.filter((i) => i.engine!.lit);
      if (lit.length && lit.every((i) => i.engine!.out)) f.stage();
    }
  }
  return f.result();
}
