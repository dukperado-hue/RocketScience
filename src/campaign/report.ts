/**
 * Flight → FlightReport. Pure read: never writes to the Flight (same rule as frame3d.snapshot).
 */
import type { Flight } from '@/physics/flight2d';
import { R_EARTH } from '@/physics/flight2d';
import { PART } from '@/phases/assembly/model/catalog';
import type { FlightReport, RangeId } from './campaign';

export interface LaunchContext {
  range: RangeId;
  lanternSite?: string;
  island?: 'phangan' | 'samui';
  /** Airspace alert ids fired so far (AirspaceMonitor.alerts) */
  airspace: string[];
}

export function flightReport(f: Flight, partIds: string[], ctx: LaunchContext): FlightReport {
  const kinds = new Set(f.events.map((e) => e.kind));
  const stable = f.reachedOrbit;
  const z = f.zombie;
  return {
    partIds: [...partIds],
    maxTier: partIds.reduce((t, id) => Math.max(t, PART[id]?.tier ?? 0), 0),
    range: ctx.range,
    lanternSite: ctx.lanternSite,
    island: ctx.island,
    apogeeM: f.maxAlt,
    karman: f.reachedSpace,
    orbit: f.airborne ? { stable, peM: f.orbit.rP - R_EARTH } : null,
    // 'zombie-sat' fires only when a stable orbit is reached with an intact zombie aboard
    zombieAboard: kinds.has('zombie-sat') || (!!z && z.state !== 'pieces' && !f.eva),
    eva: !!f.eva || kinds.has('eva'),
    airspace: [...ctx.airspace],
  };
}
