/**
 * Fast-forward: while nothing is burning (a lantern floating, a rocket coasting or hanging under its
 * parachute) the wait is long and there is nothing to do. This runs the SAME Flight.step() — same fixed
 * dt, same order — many times per frame, so the result is identical to playing it at 1×; only the
 * wall-clock time differs. It hands control back whenever something worth watching happens.
 */
import type { Flight } from '@/physics/flight2d';

/** One frame's work: this many steps between checks (1 s of flight time at the fixed 0.01 s step) */
export const FF_CHUNK = 100;

/** Flight events that are routine while coasting; any other new event stops the fast-forward */
const ROUTINE = new Set(['ignition', 'liftoff', 'rail', 'apogee', 'max-q', 'burnout', 'lantern-burnout', 'trim', 'gimbal', 'reverse', 'stall', 'lap', 'rcs', 'cartwheel']);

/** Fast-forward is only offered while no engine is running (and nobody is on a spacewalk) */
export function ffAllowed(f: Flight): boolean {
  return f.ignited && !f.done && f.vehicle.thrust <= 0 && !f.eva;
}

export type FfStop = 'done' | 'thrust' | 'event' | (string & {});

export interface FfOptions {
  /** Hard cap on steps this call (keeps one frame bounded) */
  maxSteps: number;
  /** Wall-clock budget for this call, ms */
  budgetMs: number;
  now?: () => number;
  /**
   * Called every FF_CHUNK steps: return a reason to stop (airspace alert, mission progress, ground close…),
   * or null to carry on.
   */
  check: () => string | null;
}

/** Advance the flight; returns how many steps ran and why it stopped (null = ran out of steps/budget, still fine to continue) */
export function fastForward(f: Flight, o: FfOptions): { steps: number; stop: FfStop | null } {
  const now = o.now ?? (() => performance.now());
  const t0 = now();
  let steps = 0;
  let seen = f.events.length;
  while (steps < o.maxSteps && now() - t0 < o.budgetMs) {
    for (let i = 0; i < FF_CHUNK; i++) {
      if (!ffAllowed(f)) return { steps, stop: f.done ? 'done' : 'thrust' };
      f.step();
      steps++;
    }
    for (; seen < f.events.length; seen++) if (!ROUTINE.has(f.events[seen].kind)) return { steps, stop: 'event' };
    if (f.done) return { steps, stop: 'done' };
    const why = o.check();
    if (why) return { steps, stop: why };
  }
  return { steps, stop: null };
}
