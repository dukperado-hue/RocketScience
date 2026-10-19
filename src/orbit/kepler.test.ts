import { describe, it, expect } from 'vitest';
import { elements, propagate, stateAt, timeTo, orbitPath, apsides } from './kepler';

const MU = 3.986004418e14, R = 6_371_000;

describe('kepler', () => {
  it('circular orbit at 200 km: e ≈ 0, Ap = Pe = 200 km, period ≈ 88.4 min', () => {
    const r = R + 200_000, v = Math.sqrt(MU / r);
    const o = elements({ x: r, y: 0 }, { x: 0, y: v }, MU);
    expect(o.e).toBeLessThan(1e-9);
    const { ap, pe } = apsides(o, R);
    expect(ap / 1000).toBeCloseTo(200, 3);
    expect(pe / 1000).toBeCloseTo(200, 3);
    expect(o.period / 60).toBeCloseTo(88.4, 0);
  });

  it('elements ↔ state round-trip, both directions of travel', () => {
    for (const vy of [7900, -7900]) {
      const r0 = { x: 3e6, y: 6.1e6 }, v0 = { x: -2500, y: vy * 0.9 };
      const o = elements(r0, v0, MU);
      const s = stateAt(o, o.nu);
      expect(s.r.x).toBeCloseTo(r0.x, 1); expect(s.r.y).toBeCloseTo(r0.y, 1);
      expect(s.v.x).toBeCloseTo(v0.x, 4); expect(s.v.y).toBeCloseTo(v0.y, 4);
    }
  });

  it('propagation conserves energy and comes back after one period', () => {
    const o = elements({ x: R + 300_000, y: 0 }, { x: 0, y: 8100 }, MU);
    const half = propagate(o, o.period / 2), full = propagate(o, o.period);
    expect(half.orbit.energy).toBeCloseTo(o.energy, 3);
    expect(Math.hypot(half.r.x, half.r.y)).toBeCloseTo(o.rA, -1);     // half a turn from periapsis = apoapsis
    expect(full.r.x).toBeCloseTo(R + 300_000, -1);
    expect(timeTo(o, 'apo')).toBeCloseTo(o.period / 2, 0);
  });

  it('a hyperbolic escape is unbound and its path runs off to large radius', () => {
    const r = R + 300_000;
    const o = elements({ x: r, y: 0 }, { x: 0, y: Math.sqrt(2 * MU / r) * 1.1 }, MU);
    expect(o.bound).toBe(false);
    expect(o.e).toBeGreaterThan(1);
    const path = orbitPath(o, R);
    expect(Math.hypot(path.pts.at(-1)!.x, path.pts.at(-1)!.y)).toBeGreaterThan(10 * R);
    const later = propagate(o, 3600);
    expect(later.orbit.energy).toBeCloseTo(o.energy, 2);
  });

  it('a suborbital hop: periapsis below the ground and the drawn path stops at the surface', () => {
    const o = elements({ x: 0, y: R + 100_000 }, { x: 3000, y: 500 }, MU);
    expect(apsides(o, R).pe).toBeLessThan(0);
    expect(orbitPath(o, R).hitsGround).toBe(true);
  });
});
