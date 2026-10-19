import { describe, it, expect, beforeEach } from 'vitest';
import { Flight, R_EARTH, MU_EARTH, stagedDeltaV, LEO_DV } from '@/physics/flight2d';
import { PRESETS } from '@/phases/assembly/model/presets';
import { unlock, earned, _resetMilestones } from '@/core/milestones';
import type { PlacedPart } from '@/phases/assembly/model/vehicle';
import { AscentAssist } from './ascent';

/** A lone ZomSat placed straight into a circular orbit at `alt` */
function inOrbit(alt: number, speedK = 1) {
  const p: PlacedPart[] = [{ uid: 1, defId: 'zomsat', x: 0, y: 0, rot: 0 }];
  const f = new Flight(p, { wind: 0 });
  f.ignite();
  (f as any).outcome = null;            // no engines: ignite() calls it a no-liftoff
  (f as any).airborne = true; (f as any).railClear = true;
  (f as any).flags.add('karman');
  const r = R_EARTH + alt, v = Math.sqrt(MU_EARTH / r) * speedK;
  Object.assign(f.vehicle, { x: 0, y: alt, vx: v, vy: 0, th: 0, om: 0 });
  return f;
}

/** Fly with the Ascent Assist autopilot until engine cut-off */
function flyToOrbit(p: PlacedPart[]) {
  const f = new Flight(p, { sas: true });
  f.ignite();
  const A = new AscentAssist(); A.mode = 'auto';
  while (!f.done && f.t < 900 && A.phase !== 'cutoff') { A.update(f); f.step(); }
  return f;
}

describe('orbital phase', () => {
  beforeEach(() => _resetMilestones());

  it('Kepler rails and 100 Hz physics agree over a quarter orbit', () => {
    const a = inOrbit(250_000, 1.03), b = inOrbit(250_000, 1.03);
    const T = a.orbit.period / 4;
    expect(a.onRailsOk).toBe(true);
    a.advanceWarp(T);                                   // rails
    for (let i = 0; i < Math.round(T / 0.01); i++) b.step();   // integrator
    const d = Math.hypot(a.vehicle.x - b.vehicle.x, a.vehicle.y - b.vehicle.y);
    expect(d).toBeLessThan(2000);                       // < 2 km after ~1,400 km of travel
    expect(Math.abs(a.orbit.energy - b.orbit.energy) / Math.abs(a.orbit.energy)).toBeLessThan(1e-3);
  });

  it('rails at 10 000× stay on the same orbit for many laps', () => {
    const f = inOrbit(300_000, 1.02);
    const o0 = f.orbit;
    f.advanceWarp(o0.period * 5.25);
    const o = f.orbit;
    expect(o.rA).toBeCloseTo(o0.rA, -2);
    expect(o.rP).toBeCloseTo(o0.rP, -2);
    expect(f.laps).toBeGreaterThanOrEqual(4);
    expect(f.outcome).toBeFalsy();
  });

  it('a zombie in a stable orbit (Pe > 140 km) earns orbit + Zombie-Sat, once', () => {
    const f = inOrbit(200_000);
    f.advanceWarp(120);
    const kinds = f.events.map((e) => e.kind);
    expect(kinds).toContain('orbit');
    expect(kinds).toContain('zombie-sat');
    expect(kinds.filter((k) => k === 'zombie-sat').length).toBe(1);
    expect(unlock('zombie-sat')?.title).toBe('Zombie-Sat');
    expect(unlock('zombie-sat')).toBe(null);          // only the first time
    expect(earned().map((x) => x.m.id)).toEqual(['zombie-sat']);
  });

  it('a retrograde burn lowers periapsis into the air and logs de-orbit', () => {
    const f = inOrbit(200_000);
    f.advanceWarp(60);
    f.vehicle.vx *= 0.97;                             // ~230 m/s retrograde
    f.advanceWarp(5);
    expect(f.orbit.rP - R_EARTH).toBeLessThan(70_000);
    expect(f.events.map((e) => e.kind)).toContain('deorbit');
  });

  it('staged Δv: the orbital Naga closes the LEO budget; a lone ZomSat does not', () => {
    const naga = PRESETS.find((p) => p.id === 'naga-orbital')!.build();
    expect(stagedDeltaV(naga).total).toBeGreaterThan(LEO_DV);
    expect(stagedDeltaV([{ uid: 1, defId: 'zomsat', x: 0, y: 0, rot: 0 }]).total).toBeLessThan(500);
  });

  it('Ascent Assist flies Phaya Naga Orbital to a stable orbit (Pe > 140 km) with the zombie intact', () => {
    const f = flyToOrbit(PRESETS.find((p) => p.id === 'naga-orbital')!.build());
    const pe = f.orbit.rP - R_EARTH;
    expect(f.outcome).toBeFalsy();
    expect(pe).toBeGreaterThan(140_000);
    expect(f.orbitClass).toBe('stable');
    expect(f.missionPhase).toBe('orbital');
    expect(f.zombie?.state).not.toBe('pieces');
    expect(f.events.map((e) => e.kind)).toContain('zombie-sat');
  });
});
