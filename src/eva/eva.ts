/**
 * Spacewalk (EVA) groundwork — data structures + pure physics, no Flight changes yet.
 *
 * Idea: in orbit, the payload (a zombie, or a jar) can be pushed out of the seat and
 * become its own body, flown with whatever it has: a proper RCS backpack, a CO₂ fire
 * extinguisher (the Gravity / WALL·E method), or flailing (basically nothing).
 *
 * How it will plug in (next sprint), keeping the Gate A/B invariants:
 *   1. `Flight.split()` already turns a group of items into a separate Body. EVA uses
 *      the same path: the seat's rider becomes a one-item Body (`EvaBody`) with the
 *      mass/area of the zombie (or the jar) plus its kit.
 *   2. The EVA body is integrated by the SAME Verlet step as any body; its thrust comes
 *      from `evaThrust()` below instead of engines. On rails it follows Kepler like
 *      the vehicle (the seam checks then apply to it too).
 *   3. The camera / map can target it; the vehicle keeps flying on its own conic.
 *   4. Gate B: the EVA body gets its own `OrbitStateMachine`, so "Zombie-Sat" and
 *      friends can be earned by a zombie that left the ship.
 *
 * Everything here is pure and unit-tested; nothing touches the simulation.
 */
import type { ZombieId, ZombieState } from '@/payload/zombies';
import { ZOMBIES } from '@/payload/zombies';

const G0 = 9.80665;

export type EvaKitId = 'rcs-pack' | 'extinguisher' | 'flail';

export interface EvaKit {
  id: EvaKitId;
  name: string;
  /** Dry mass of the kit (kg) and propellant (kg) */
  dry: number;
  prop: number;
  /** Thrust (N) and specific impulse (s) */
  thrust: number;
  isp: number;
  /**
   * Thrust line offset from the centre of mass (m). A backpack is aligned; a fire
   * extinguisher held in two hands never quite is — every burn also spins you.
   */
  offset: number;
  /** Can it point the thrust anywhere (true) or only where the body faces (false)? */
  vectored: boolean;
  /** Comedy: chance per second of the operator losing grip / dropping the kit */
  fumble: number;
  blurb: string;
}

export const EVA_KITS: Record<EvaKitId, EvaKit> = {
  'rcs-pack': {
    id: 'rcs-pack', name: 'RCS backpack', dry: 22, prop: 8, thrust: 25, isp: 65, offset: 0, vectored: true, fumble: 0,
    blurb: 'Cold-gas nitrogen jets, MMU-style. Boring. Works.',
  },
  extinguisher: {
    id: 'extinguisher', name: 'Fire extinguisher (CO₂)', dry: 9, prop: 5, thrust: 70, isp: 35, offset: 0.18, vectored: false, fumble: 0.05,
    blurb: 'Five kilograms of CO₂ and a lot of confidence. Every push is also a spin.',
  },
  flail: {
    id: 'flail', name: 'Flailing', dry: 0, prop: 0, thrust: 0, isp: 0, offset: 0, vectored: false, fumble: 0,
    blurb: 'Newton’s third law says no. The zombie tries anyway.',
  },
};

/** What leaves the seat: a whole-ish zombie or a sealed jar */
export interface EvaPayload {
  zombie: ZombieId;
  state: Exclude<ZombieState, 'pieces'>;
  /** Mass still attached (kg) — from ZombiePayload.mass */
  mass: number;
  /** Side-on area (m²) — matters only if it re-enters */
  area: number;
}

/** Body state of the EVA'd payload, in the same Earth-centred plane as the Flight */
export interface EvaBody {
  id: number;
  payload: EvaPayload;
  kit: EvaKit;
  propLeft: number;
  /** position (m, flight frame: pad at origin), velocity (m/s), attitude (rad, rate rad/s) */
  x: number; y: number; vx: number; vy: number; th: number; om: number;
  /** moment of inertia about the CoM (kg m²) — a tumbling human-ish body */
  I: number;
  /** Who's flying it */
  control: 'player' | 'drift';
  /** Mission time of separation and the parent vehicle's body id */
  since: number;
  parent: number;
  /** Comedy state: holding the kit, or it floated away */
  holding: boolean;
}

/** Why EVA isn't possible right now (null = go) */
export function evaBlocker(o: { missionPhase: string; propagationMode: string; seat: string; zombieState: ZombieState | null; thrusting: boolean }): string | null {
  if (!o.zombieState) return 'Nobody aboard to step outside.';
  if (o.zombieState === 'pieces') return 'The passenger is… not in a condition to spacewalk.';
  if (o.seat === 'pod' && o.missionPhase !== 'orbital') return 'Open the hatch in orbit, not in the air.';
  if (o.missionPhase !== 'orbital') return 'EVA only from a stable or decaying orbit.';
  if (o.thrusting) return 'Engines off before anyone goes outside.';
  return null;
}

/** Build the EVA body from the vehicle's seat state. Pure: copies, never mutates. */
export function makeEvaBody(
  id: number, parent: number, t: number,
  seat: { x: number; y: number; vx: number; vy: number; th: number },
  payload: EvaPayload, kitId: EvaKitId,
  /** push-off speed relative to the vehicle (m/s), along the seat's local "up" */
  pushOff = 0.5,
): EvaBody {
  const kit = EVA_KITS[kitId];
  const m = payload.mass + kit.dry + kit.prop;
  // push-off direction: the seat's up axis in world, (−sin θ, cos θ)
  const ux = -Math.sin(seat.th), uy = Math.cos(seat.th);
  // a jar is a small cylinder; a zombie a 1.7 m rod
  const L = payload.state === 'jarred' ? 0.35 : 1.7;
  return {
    id, parent, since: t, payload, kit, propLeft: kit.prop,
    x: seat.x, y: seat.y, vx: seat.vx + ux * pushOff, vy: seat.vy + uy * pushOff, th: seat.th, om: 0,
    I: (m * L * L) / 12, control: 'player', holding: kitId !== 'flail',
  };
}

export const evaMass = (b: EvaBody) => b.payload.mass + (b.holding ? b.kit.dry + b.propLeft : 0);

/** Ideal Δv left in the kit (rocket equation) */
export function evaDeltaV(b: EvaBody): number {
  if (!b.holding || b.kit.isp <= 0 || b.propLeft <= 0) return 0;
  const m0 = evaMass(b), m1 = m0 - b.propLeft;
  return b.kit.isp * G0 * Math.log(m0 / m1);
}

/**
 * One burn step's force and torque. `dir` is the requested thrust direction (world,
 * rad); unvectored kits push along the body's facing instead. The offset turns part of
 * every burn into spin — the extinguisher joke, with real angular momentum.
 */
export function evaThrust(b: EvaBody, throttle: number, dir: number, dt: number): { fx: number; fy: number; torque: number; mdot: number } {
  const k = b.kit;
  if (!b.holding || k.thrust <= 0 || b.propLeft <= 0 || throttle <= 0) return { fx: 0, fy: 0, torque: 0, mdot: 0 };
  const F = k.thrust * Math.min(1, throttle);
  const mdot = F / (k.isp * G0);
  const scale = mdot * dt > b.propLeft ? b.propLeft / (mdot * dt) : 1;    // last puff
  const a = k.vectored ? dir : b.th + Math.PI / 2;
  return { fx: Math.cos(a) * F * scale, fy: Math.sin(a) * F * scale, torque: F * scale * k.offset, mdot: mdot * scale };
}

/** Advance attitude and propellant for one EVA step (translation is left to the shared integrator) */
export function evaStep(b: EvaBody, throttle: number, dir: number, dt: number, rnd = Math.random): { fx: number; fy: number; fumbled: boolean } {
  const th = evaThrust(b, throttle, dir, dt);
  b.propLeft = Math.max(0, b.propLeft - th.mdot * dt);
  b.om += (th.torque / b.I) * dt;
  b.th += b.om * dt;
  let fumbled = false;
  if (b.holding && b.kit.fumble > 0 && throttle > 0 && rnd() < b.kit.fumble * dt) { b.holding = false; fumbled = true; }
  return { fx: th.fx, fy: th.fy, fumbled };
}

/** Payload numbers for an EVA from the zombie variant (used before ZombiePayload is wired in) */
export function payloadFor(zombie: ZombieId, state: Exclude<ZombieState, 'pieces'>, massNow?: number): EvaPayload {
  const z = ZOMBIES[zombie];
  return { zombie, state, mass: massNow ?? z.mass, area: state === 'jarred' ? z.area * 0.08 : z.area };
}
