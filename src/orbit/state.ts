/**
 * Gate B — the three orbital state variables, kept strictly apart:
 *
 *   orbitClass       what the conic IS         stable | decaying | suborbital | escape
 *   propagationMode  how we ADVANCE it         physics (100 Hz, drag, thrust) | rails (exact Kepler)
 *   missionPhase     where the STORY is        ascent → orbital ⇄ deorbit → landed
 *
 * `classifyOrbit` is a pure function with sharp boundaries (tested at the edges).
 * `OrbitStateMachine` adds hysteresis so a periapsis wobbling on a boundary (drag,
 * round-off, a feathered throttle) can't make CAPCOM and the achievements flicker.
 * Story events come ONLY from the transitions this machine reports.
 */
import type { Orbit } from './kepler';

export type OrbitClass = 'stable' | 'decaying' | 'suborbital' | 'escape';
export type PropagationMode = 'physics' | 'rails';
export type MissionPhase = 'ascent' | 'orbital' | 'deorbit' | 'landed';

/** Periapsis above this: no measurable drag — the orbit lasts (and rails are allowed above it) */
export const PE_STABLE = 140_000;
/** Periapsis below this: the air wins within a pass — it's coming down */
export const PE_DECAY = 70_000;
/** Earth's sphere of influence (m): a bound orbit reaching past it is an escape in practice */
export const R_SOI = 9.24e8;
/** Hysteresis on periapsis boundaries (m) */
export const PE_BAND = 500;

const RANK: Record<Exclude<OrbitClass, 'escape'>, number> = { suborbital: 0, decaying: 1, stable: 2 };

/** Class from periapsis altitude alone (bound orbits). Boundaries: (140 km, ∞) stable · (70, 140] decaying · (−∞, 70] suborbital */
export function classByPeriapsis(pe: number): Exclude<OrbitClass, 'escape'> {
  return pe > PE_STABLE ? 'stable' : pe > PE_DECAY ? 'decaying' : 'suborbital';
}

export function classifyOrbit(o: Orbit, R: number): OrbitClass {
  if (o.kind !== 'ellipse' || o.rA > R_SOI) return 'escape';
  return classByPeriapsis(o.rP - R);
}

export type Transition =
  | { kind: 'class'; from: OrbitClass; to: OrbitClass }
  | { kind: 'phase'; from: MissionPhase; to: MissionPhase };

export class OrbitStateMachine {
  orbitClass: OrbitClass = 'suborbital';
  missionPhase: MissionPhase = 'ascent';

  constructor(private R: number, private band = PE_BAND) {}

  /** Feed the current osculating orbit; returns what changed, in order (class first, then phase) */
  update(o: Orbit, grounded: boolean): Transition[] {
    const out: Transition[] = [];
    if (this.missionPhase === 'landed') return out;
    if (grounded) { out.push({ kind: 'phase', from: this.missionPhase, to: 'landed' }); this.missionPhase = 'landed'; return out; }

    // ---- orbitClass, with hysteresis on the periapsis boundaries ----
    const raw = classifyOrbit(o, this.R);
    let next = this.orbitClass;
    if (raw === 'escape' || this.orbitClass === 'escape') next = raw;
    else if (raw !== this.orbitClass) {
      const pe = o.rP - this.R;
      const up = RANK[raw] > RANK[this.orbitClass];
      // Only move if the class still holds after pushing pe back toward the old class by the band
      if (classByPeriapsis(up ? pe - this.band : pe + this.band) === raw) next = raw;
    }
    if (next !== this.orbitClass) { out.push({ kind: 'class', from: this.orbitClass, to: next }); this.orbitClass = next; }

    // ---- missionPhase ----
    const c = this.orbitClass, p = this.missionPhase;
    let np: MissionPhase = p;
    if (p === 'ascent' && (c === 'stable' || c === 'escape')) np = 'orbital';
    else if (p === 'orbital' && c === 'suborbital') np = 'deorbit';
    else if (p === 'deorbit' && (c === 'stable' || c === 'escape')) np = 'orbital';
    if (np !== p) { out.push({ kind: 'phase', from: p, to: np }); this.missionPhase = np; }
    return out;
  }
}
