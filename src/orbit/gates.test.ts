/**
 * Engineering gates for the orbital phase.
 *   Gate A — physics ⇄ rails handoff is seamless; ground-crossing orbits leave rails
 *            at the atmosphere interface; near-parabolic / highly elliptic / radial cases.
 *   Gate B — orbitClass boundaries, hysteresis, missionPhase transitions, and story
 *            events driven only by transitions.
 */
import { describe, it, expect } from 'vitest';
import { Flight, R_EARTH, MU_EARTH, RAILS_ALT, SEAM_TOL, gravityAt } from '@/physics/flight2d';
import { elements, propagateState, timeToRadiusDescending, invariants, type Vec2 } from './kepler';
import { classifyOrbit, classByPeriapsis, OrbitStateMachine, PE_STABLE, PE_DECAY, R_SOI } from './state';
import { planManeuver, circularizeDv } from './maneuver';
import { profileElevation, PROFILE_TIER4 } from './ascent';
import type { PlacedPart } from '@/phases/assembly/model/vehicle';

const MU = MU_EARTH, R = R_EARTH;

/** A lone ZomSat placed on a trajectory: periapsis-ish state at altitude `alt` with horizontal speed `v` */
function sat(alt: number, v: number, vUp = 0) {
  const p: PlacedPart[] = [{ uid: 1, defId: 'zomsat', x: 0, y: 0, rot: 0 }];
  const f = new Flight(p, { wind: 0 });
  f.ignite();
  (f as any).outcome = null; (f as any).airborne = true; (f as any).railClear = true;
  (f as any).flags.add('karman');
  Object.assign(f.vehicle, { x: 0, y: alt, vx: v, vy: vUp, th: -Math.PI / 2, om: 0 });
  return f;
}
const circ = (alt: number) => Math.sqrt(MU / (R + alt));
/** Speed at periapsis radius rp for apoapsis radius ra */
const vPeri = (rp: number, ra: number) => Math.sqrt(MU * (2 / rp - 2 / (rp + ra)));
const state = (f: Flight) => ({ r: { x: f.vehicle.x, y: f.vehicle.y + R }, v: { x: f.vehicle.vx, y: f.vehicle.vy } });
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Independent reference: classical RK4 on pure two-body gravity, tiny step */
function rk4(r0: Vec2, v0: Vec2, T: number, h = 0.05) {
  let x = r0.x, y = r0.y, vx = v0.x, vy = v0.y;
  const acc = (X: number, Y: number) => { const r3 = Math.hypot(X, Y) ** 3; return [-MU * X / r3, -MU * Y / r3]; };
  const n = Math.round(T / h); h = T / n;
  for (let i = 0; i < n; i++) {
    const [a1x, a1y] = acc(x, y);
    const [a2x, a2y] = acc(x + vx * h / 2, y + vy * h / 2);
    const [a3x, a3y] = acc(x + (vx + a1x * h / 2) * h / 2, y + (vy + a1y * h / 2) * h / 2);
    const [a4x, a4y] = acc(x + (vx + a2x * h / 2) * h, y + (vy + a2y * h / 2) * h);
    const k1 = [vx, vy], k2 = [vx + a1x * h / 2, vy + a1y * h / 2], k3 = [vx + a2x * h / 2, vy + a2y * h / 2], k4 = [vx + a3x * h, vy + a3y * h];
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    vx += (h / 6) * (a1x + 2 * a2x + 2 * a3x + a4x); vy += (h / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
  }
  return { r: { x, y }, v: { x: vx, y: vy } };
}

describe('Gate A — propagator agreement', () => {
  it('gravity field is exactly −μ r/|r|³ (physics and rails use the same μ)', () => {
    const [gx, gy] = gravityAt(0, 300_000);
    expect(gx).toBe(-0);
    expect(-gy).toBeCloseTo(MU / (R + 300_000) ** 2, 12);
  });

  it('universal-variable rails match an independent RK4 reference: circular, e = 0.5, e = 0.97, hyperbolic', () => {
    const cases: [string, Vec2, Vec2, number][] = [
      ['circular 300 km', { x: R + 300e3, y: 0 }, { x: 0, y: circ(300e3) }, 3000],
      ['e≈0.5', { x: R + 300e3, y: 0 }, { x: 0, y: vPeri(R + 300e3, 3 * (R + 300e3)) }, 9000],
      ['e≈0.97', { x: R + 200e3, y: 0 }, { x: 0, y: vPeri(R + 200e3, 65 * (R + 200e3)) }, 20_000],
      ['hyperbolic', { x: R + 300e3, y: 0 }, { x: 0, y: Math.sqrt(2 * MU / (R + 300e3)) * 1.2 }, 20_000],
    ];
    for (const [, r0, v0, T] of cases) {
      const a = propagateState(r0, v0, T, MU), b = rk4(r0, v0, T, 0.05);
      expect(dist(a.r, b.r)).toBeLessThan(5);            // metres after hours of flight
      expect(dist(a.v, b.v)).toBeLessThan(0.01);
    }
  });

  it('one physics step equals one rails step (local seam error < 1 mm, < 0.1 mm/s)', () => {
    const f = sat(400_000, circ(400_000) * 1.01);
    const s0 = state(f);
    f.step();
    const k = propagateState(s0.r, s0.v, 0.01, MU);
    const s1 = state(f);
    expect(dist(s1.r, k.r)).toBeLessThan(1e-3);
    expect(dist(s1.v, k.v)).toBeLessThan(1e-4);
  });

  it('every physics ⇄ rails switch is recorded, validated, and inside tolerance', () => {
    const f = sat(300_000, circ(300_000) * 1.02);
    for (let i = 0; i < 40; i++) {                       // alternate: 1 s physics, 120 s rails
      for (let k = 0; k < 100; k++) f.step();
      expect(f.propagationMode).toBe('physics');
      f.advanceWarp(120);
      expect(f.propagationMode).toBe('rails');
    }
    const hs = f.handoffs;
    expect(hs.length).toBeGreaterThanOrEqual(79);
    expect(hs.every((h) => h.validated)).toBe(true);
    expect(f.seamsOk).toBe(true);
    const worst = hs.reduce((m, h) => ({ dr: Math.max(m.dr, h.dr), dv: Math.max(m.dv, h.dv), dE: Math.max(m.dE, h.dE) }), { dr: 0, dv: 0, dE: 0 });
    expect(worst.dr).toBeLessThan(SEAM_TOL.dr);
    expect(worst.dv).toBeLessThan(SEAM_TOL.dv);
    expect(worst.dE).toBeLessThan(SEAM_TOL.rel);
  });

  it('mixed physics/rails over a full lap lands where pure rails does (and conserves energy)', () => {
    const v0 = circ(300_000) * 1.02;
    const mixed = sat(300_000, v0), pure = sat(300_000, v0);
    const s0 = state(pure), E0 = invariants(s0.r, s0.v, MU).energy;
    const T = elements(s0.r, s0.v, MU).period;
    let t = 0;
    while (t < T - 1e-9) {                               // 10 s physics, 190 s rails, repeated
      const p = Math.min(10, T - t); for (let k = 0; k < Math.round(p / 0.01); k++) mixed.step(); t += Math.round(p / 0.01) * 0.01;
      const r = Math.min(190, T - t); if (r > 0) { mixed.advanceWarp(r); t += r; }
    }
    pure.advanceWarp(mixed.t - pure.t);
    const a = state(mixed), b = state(pure);
    expect(dist(a.r, b.r)).toBeLessThan(50);             // < 50 m after ~43 000 km of flight
    expect(Math.abs(invariants(a.r, a.v, MU).energy - E0) / Math.abs(E0)).toBeLessThan(1e-7);
  });

  it('Verlet physics alone holds a circular orbit for 3 laps (symplectic: no energy drift)', () => {
    const f = sat(400_000, circ(400_000));
    const s0 = state(f), E0 = invariants(s0.r, s0.v, MU).energy;
    const T = elements(s0.r, s0.v, MU).period;
    for (let k = 0; k < Math.round((3 * T) / 0.01); k++) f.step();
    const s = state(f);
    expect(Math.abs(invariants(s.r, s.v, MU).energy - E0) / Math.abs(E0)).toBeLessThan(1e-7);
    expect(Math.abs(f.vehicle.alt - 400_000)).toBeLessThan(200);
  });
});

describe('Gate A — ground intersection & edge cases', () => {
  it('a ground-crossing orbit leaves rails exactly at the atmosphere interface; physics flies the crash', () => {
    // 600 km apogee, periapsis deep underground, released at apogee
    const ra = R + 600_000, rp = R - 2_000_000;
    const f = sat(600_000, Math.sqrt(MU * (2 / ra - 2 / (rp + ra))));
    expect(f.orbit.rP).toBeLessThan(R);
    expect(f.onRailsOk).toBe(true);
    let minRailsAlt = Infinity;
    for (let i = 0; i < 2000 && !f.done; i++) {
      f.advanceWarp(5);
      if (f.propagationMode === 'rails') minRailsAlt = Math.min(minRailsAlt, f.vehicle.alt);
      else if (f.vehicle.alt < RAILS_ALT - 1) expect(f.onRailsOk).toBe(false);
    }
    expect(minRailsAlt).toBeGreaterThan(RAILS_ALT - 1);   // never on rails below the interface
    const exit = f.handoffs.find((h) => h.from === 'rails' && h.to === 'physics')!;
    expect(Math.abs(exit.alt - RAILS_ALT)).toBeLessThan(1);       // handed over AT 140 km (±1 m)
    expect(exit.ok).toBe(true);
    expect(['impact', 'structural-failure', 'landed']).toContain(f.outcome);   // physics did the ending
    expect(f.missionPhase).toBe('landed');
  });

  it('time-to-interface is exact for every conic type', () => {
    const rt = R + RAILS_ALT;
    const cases: [Vec2, Vec2][] = [
      [{ x: 0, y: R + 600e3 }, { x: 5000, y: 0 }],                                   // suborbital ellipse at apogee
      [{ x: 0, y: R + 600e3 }, { x: 3000, y: 500 }],                                  // still climbing first
      [{ x: R + 900e3, y: 0 }, { x: -0.95 * Math.sqrt(2 * MU / (R + 900e3)), y: -0.3122499 * Math.sqrt(2 * MU / (R + 900e3)) }],  // near-parabolic, falling
      [{ x: R + 900e3, y: 0 }, { x: -9000, y: -6000 }],                               // hyperbolic, falling
    ];
    for (const [r, v] of cases) {
      const t = timeToRadiusDescending(elements(r, v, MU), r, v, rt);
      expect(Number.isFinite(t)).toBe(true);
      const s = propagateState(r, v, t, MU);
      expect(Math.abs(Math.hypot(s.r.x, s.r.y) - rt)).toBeLessThan(1);
      expect(s.r.x * s.v.x + s.r.y * s.v.y).toBeLessThan(0);   // descending through it
    }
    // never crosses: stable orbit, or an escape already climbing
    const o1 = elements({ x: R + 300e3, y: 0 }, { x: 0, y: circ(300e3) }, MU);
    expect(timeToRadiusDescending(o1, { x: R + 300e3, y: 0 }, { x: 0, y: circ(300e3) }, rt)).toBe(Infinity);
    const r2 = { x: R + 300e3, y: 0 }, v2 = { x: 3000, y: 12_000 };
    expect(timeToRadiusDescending(elements(r2, v2, MU), r2, v2, rt)).toBe(Infinity);
  });

  it('near-parabolic: e = 1 ± 1e-9 propagates smoothly on both sides and matches RK4', () => {
    const r0 = { x: R + 500e3, y: 0 }, vesc = Math.sqrt(2 * MU / (R + 500e3));
    for (const k of [1 - 1e-9, 1, 1 + 1e-9]) {
      const v0 = { x: 0, y: vesc * k };
      const o = elements(r0, v0, MU);
      expect(o.kind).toBe('parabola');
      expect(classifyOrbit(o, R)).toBe('escape');
      const a = propagateState(r0, v0, 30_000, MU), b = rk4(r0, v0, 30_000, 0.1);
      expect(dist(a.r, b.r)).toBeLessThan(5);
      const E0 = invariants(r0, v0, MU).energy, E1 = invariants(a.r, a.v, MU).energy;
      expect(Math.abs(E1 - E0)).toBeLessThan(1e-3);       // J/kg, with |μ/r| ≈ 6e7
    }
  });

  it('highly elliptical (e ≈ 0.97): back to the start after 1 and after 25 periods', () => {
    const r0 = { x: R + 200e3, y: 0 }, v0 = { x: 0, y: vPeri(R + 200e3, 65 * (R + 200e3)) };
    const o = elements(r0, v0, MU);
    expect(o.e).toBeGreaterThan(0.96);
    for (const n of [1, 25]) {
      const s = propagateState(r0, v0, n * o.period, MU);
      expect(dist(s.r, r0)).toBeLessThan(1);
    }
  });

  it('radial / degenerate states (h ≈ 0, on the pad) classify as suborbital, never escape or NaN', () => {
    for (const vUp of [0, 50, 3000]) {
      const o = elements({ x: 0, y: R }, { x: 1e-9, y: vUp }, MU);
      expect(Number.isFinite(o.rP)).toBe(true);
      expect(o.kind).toBe('ellipse');
      expect(classifyOrbit(o, R)).toBe('suborbital');
    }
  });

  it('a big hyperbolic warp stays finite and conserves energy', () => {
    const r0 = { x: R + 300e3, y: 0 }, v0 = { x: 0, y: 15_000 };
    const s = propagateState(r0, v0, 5e6, MU);
    expect(Number.isFinite(s.r.x) && Number.isFinite(s.v.y)).toBe(true);
    expect(Math.abs(invariants(s.r, s.v, MU).energy - invariants(r0, v0, MU).energy)).toBeLessThan(1e-2);
  });
});

/** Orbit with a chosen periapsis altitude (apoapsis 600 km) */
const withPe = (pe: number) => elements({ x: R + pe, y: 0 }, { x: 0, y: vPeri(R + pe, R + 600e3) }, MU);

describe('Gate B — orbitClass boundaries', () => {
  it('periapsis boundaries are sharp: (140 km, ∞) stable · (70, 140] decaying · (−∞, 70] suborbital', () => {
    expect(classByPeriapsis(PE_STABLE + 0.001)).toBe('stable');
    expect(classByPeriapsis(PE_STABLE)).toBe('decaying');
    expect(classByPeriapsis(PE_DECAY + 0.001)).toBe('decaying');
    expect(classByPeriapsis(PE_DECAY)).toBe('suborbital');
    expect(classByPeriapsis(-R)).toBe('suborbital');
    expect(classifyOrbit(withPe(140_001), R)).toBe('stable');
    expect(classifyOrbit(withPe(139_999), R)).toBe('decaying');
    expect(classifyOrbit(withPe(70_001), R)).toBe('decaying');
    expect(classifyOrbit(withPe(69_999), R)).toBe('suborbital');
  });

  it('escape: hyperbolic, parabolic, or bound but reaching past the sphere of influence', () => {
    const r = R + 300e3, vesc = Math.sqrt(2 * MU / r);
    expect(classifyOrbit(elements({ x: r, y: 0 }, { x: 0, y: vesc * 1.01 }, MU), R)).toBe('escape');
    expect(classifyOrbit(elements({ x: r, y: 0 }, { x: 0, y: vesc }, MU), R)).toBe('escape');
    const soi = elements({ x: r, y: 0 }, { x: 0, y: vPeri(r, R_SOI * 1.1) }, MU);
    expect(soi.bound).toBe(true);
    expect(classifyOrbit(soi, R)).toBe('escape');
    const moonish = elements({ x: r, y: 0 }, { x: 0, y: vPeri(r, R_SOI * 0.5) }, MU);
    expect(classifyOrbit(moonish, R)).toBe('stable');
  });

  it('hysteresis: a periapsis wobbling ±0.3 km on 140 km does not flicker', () => {
    const m = new OrbitStateMachine(R);
    m.update(withPe(160_000), false);
    expect(m.orbitClass).toBe('stable');
    for (const pe of [139_800, 140_200, 139_700, 140_300]) { expect(m.update(withPe(pe), false)).toEqual([]); expect(m.orbitClass).toBe('stable'); }
    m.update(withPe(139_400), false);
    expect(m.orbitClass).toBe('decaying');
    m.update(withPe(140_300), false);
    expect(m.orbitClass).toBe('decaying');
    m.update(withPe(140_600), false);
    expect(m.orbitClass).toBe('stable');
  });

  it('missionPhase: ascent → orbital ⇄ deorbit → landed (terminal); decaying never counts as orbit', () => {
    const m = new OrbitStateMachine(R);
    m.update(withPe(-3_000_000), false); expect(m.missionPhase).toBe('ascent');
    m.update(withPe(120_000), false); expect(m.missionPhase).toBe('ascent');      // decaying ≠ orbit
    m.update(withPe(200_000), false); expect(m.missionPhase).toBe('orbital');
    m.update(withPe(100_000), false); expect(m.missionPhase).toBe('orbital');     // decaying: warning only
    m.update(withPe(50_000), false); expect(m.missionPhase).toBe('deorbit');
    m.update(withPe(200_000), false); expect(m.missionPhase).toBe('orbital');     // re-boost
    m.update(withPe(50_000), false); m.update(withPe(50_000), true);
    expect(m.missionPhase).toBe('landed');
    expect(m.update(withPe(500_000), false)).toEqual([]);                          // terminal
  });

  it('story events come only from transitions: decaying orbit earns nothing, stable earns once', () => {
    const f = sat(135_000, circ(135_000));                // circular at 135 km: decaying
    f.advanceWarp(30);
    const kinds = () => f.events.map((e) => e.kind);
    expect(kinds()).not.toContain('orbit');
    expect(kinds()).not.toContain('zombie-sat');
    expect(f.orbitClass).toBe('decaying');
    expect(f.missionPhase).toBe('ascent');
    // boost to a 200 × 200 km orbit
    Object.assign(f.vehicle, { x: 0, y: 200_000, vx: circ(200_000), vy: 0 });   // re-place over the pad: pure horizontal speed
    f.advanceWarp(30);
    expect(f.orbitClass).toBe('stable');
    expect(f.missionPhase).toBe('orbital');
    expect(kinds().filter((k) => k === 'orbit').length).toBe(1);
    expect(kinds().filter((k) => k === 'zombie-sat').length).toBe(1);
    // lower periapsis to ~100 km: decaying warning, still orbital, no de-orbit
    const peNow = () => (f.orbit.rP - R) / 1000;
    const retro = (k: number) => { f.vehicle.vx *= k; f.vehicle.vy *= k; };
    retro(0.9962);
    expect(peNow()).toBeGreaterThan(75); expect(peNow()).toBeLessThan(135);
    f.advanceWarp(30);
    expect(f.orbitClass).toBe('decaying');
    expect(kinds()).toContain('decaying');
    expect(kinds()).not.toContain('deorbit');
    // and below 70 km: de-orbit
    retro(0.996);
    expect(peNow()).toBeLessThan(69);
    f.advanceWarp(5);
    expect(f.orbitClass).toBe('suborbital');
    expect(f.missionPhase).toBe('deorbit');
    expect(kinds().filter((k) => k === 'deorbit').length).toBe(1);
    expect(kinds().filter((k) => k === 'zombie-sat').length).toBe(1);
  });
});

describe('Maneuver Node Lite & Ascent Assist', () => {
  it('planning a burn never touches the ship', () => {
    const f = sat(300_000, circ(300_000) * 1.03);
    const before = JSON.stringify(state(f));
    const s = state(f);
    const plan = planManeuver(s.r, s.v, MU, R, 'apo', 250);
    expect(plan.after.rA).toBeGreaterThan(plan.before.rA);
    expect(JSON.stringify(state(f))).toBe(before);
  });

  it('circularise at apoapsis: Δv from circularizeDv gives e ≈ 0 at the Ap radius', () => {
    const r = { x: R + 200e3, y: 0 }, v = { x: 0, y: vPeri(R + 200e3, R + 800e3) };
    const dv = circularizeDv(r, v, MU, 'apo');
    expect(dv).toBeGreaterThan(0);
    const p = planManeuver(r, v, MU, R, 'apo', dv);
    expect(p.after.e).toBeLessThan(1e-6);
    expect((p.after.rP - R) / 1000).toBeCloseTo(800, 0);
    expect(p.afterClass).toBe('stable');
  });

  it('prograde at periapsis raises apoapsis only; retrograde at apoapsis can de-orbit', () => {
    const r = { x: R + 250e3, y: 0 }, v = { x: 0, y: vPeri(R + 250e3, R + 500e3) };
    const up = planManeuver(r, v, MU, R, 'peri', 100);
    expect(up.after.rA).toBeGreaterThan(up.before.rA + 300e3);
    expect(Math.abs(up.after.rP - up.before.rP)).toBeLessThan(10);
    const down = planManeuver(r, v, MU, R, 'apo', -150);
    expect(down.afterClass).toBe('suborbital');
  });

  it('ascent profile interpolates its waypoints and is monotone', () => {
    expect(profileElevation(PROFILE_TIER4, 0)).toBe(90);
    expect(profileElevation(PROFILE_TIER4, 100_000)).toBeCloseTo(0, 6);
    let last = 91;
    for (let a = 0; a <= 120_000; a += 2500) { const e = profileElevation(PROFILE_TIER4, a); expect(e).toBeLessThan(last + 1e-9); last = e; }
  });
});
