/**
 * Maneuver Node "Lite" — plan a prograde/retrograde burn and preview the result.
 *
 * Pure: takes a copy of the state and returns a new orbit; the Flight is never
 * touched. The burn is impulsive (instantaneous Δv at the node); the HUD also
 * shows how long the real burn takes with the current engines, and the usual
 * rule of starting half of it before the node.
 */
import { elements, propagateState, timeTo, type Orbit, type Vec2 } from './kepler';
import { classifyOrbit, type OrbitClass } from './state';

export type NodeAt = 'now' | 'apo' | 'peri';

export interface ManeuverPlan {
  at: NodeAt;
  /** Seconds from now to the node */
  tNode: number;
  /** Δv along the velocity at the node (m/s, + prograde / − retrograde) */
  dvPro: number;
  /** State at the node, before and after the impulse (Earth-centred) */
  rNode: Vec2; vBefore: Vec2; vAfter: Vec2;
  before: Orbit;
  after: Orbit;
  afterClass: OrbitClass;
}

export function planManeuver(r: Vec2, v: Vec2, mu: number, R: number, at: NodeAt, dvPro: number): ManeuverPlan {
  const now = elements(r, v, mu);
  let tNode = at === 'now' ? 0 : timeTo(now, at === 'apo' ? 'apo' : 'peri');
  if (!Number.isFinite(tNode)) tNode = 0;              // no apoapsis on an escape: burn now
  const s = propagateState(r, v, tNode, mu);
  const sp = Math.hypot(s.v.x, s.v.y) || 1;
  const vAfter = { x: s.v.x + (dvPro * s.v.x) / sp, y: s.v.y + (dvPro * s.v.y) / sp };
  const before = elements(s.r, s.v, mu);
  const after = elements(s.r, vAfter, mu);
  return { at, tNode, dvPro, rNode: s.r, vBefore: s.v, vAfter, before, after, afterClass: classifyOrbit(after, R) };
}

/** Prograde Δv at the node that circularises at the node's radius */
export function circularizeDv(r: Vec2, v: Vec2, mu: number, at: NodeAt): number {
  const o = elements(r, v, mu);
  let t = at === 'now' ? 0 : timeTo(o, at === 'apo' ? 'apo' : 'peri');
  if (!Number.isFinite(t)) t = 0;
  const s = propagateState(r, v, t, mu);
  const rm = Math.hypot(s.r.x, s.r.y);
  const vt = Math.abs(s.r.x * s.v.y - s.r.y * s.v.x) / rm;   // horizontal speed
  return Math.sqrt(mu / rm) - vt;
}

/** Burn time for |Δv| with thrust F (N) from mass m (kg) at exhaust speed ve = Isp·g₀ (rocket equation) */
export function burnTime(dv: number, m: number, F: number, ve: number): number {
  if (F <= 0) return Infinity;
  const mdot = F / ve;
  return (m * (1 - Math.exp(-Math.abs(dv) / ve))) / mdot;
}
