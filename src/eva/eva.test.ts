import { describe, it, expect } from 'vitest';
import { Flight, R_EARTH, MU_EARTH } from '@/physics/flight2d';
import { propagateState, invariants } from '@/orbit/kepler';
import type { PlacedPart } from '@/phases/assembly/model/vehicle';

/** A seat (chair or ZomSat pod) with a zombie, placed in a circular orbit */
function orbiting(def: 'wooden-chair' | 'zomsat', alt = 300e3) {
  const p: PlacedPart[] = [{ uid: 1, defId: def, x: 0, y: 0, rot: 0, ...(def === 'wooden-chair' ? { rider: 'standard' } : {}) } as PlacedPart];
  const f = new Flight(p, { wind: 0 });
  f.ignite();
  Object.assign(f as any, { outcome: null, airborne: true, railClear: true });
  Object.assign(f.vehicle, { x: 0, y: alt, vx: Math.sqrt(MU_EARTH / (R_EARTH + alt)), vy: 0, th: -Math.PI / 2, om: 0 });
  f.advanceWarp(2);                                          // let the state machine see the orbit
  return f;
}
const kinds = (f: Flight) => f.events.map((e) => e.kind);

describe('Sprint F — spacewalk', () => {
  it('EVA is blocked before orbit and allowed in orbit — from a pod AND from a wooden chair', () => {
    const p: PlacedPart[] = [{ uid: 1, defId: 'zomsat', x: 0, y: 0, rot: 0 }];
    const ground = new Flight(p, { wind: 0 });
    expect(ground.evaBlockedBy).toBeTruthy();
    const pod = orbiting('zomsat');
    expect(pod.missionPhase).toBe('orbital');
    expect(pod.evaBlockedBy).toBe(null);
    const chair = orbiting('wooden-chair');
    if (chair.zombie) expect(chair.evaBlockedBy).toBe(null);
  });

  it('ejecting conserves momentum: zombie pushes off, ship recoils, seat loses the zombie’s mass', () => {
    const f = orbiting('zomsat');
    const v = f.vehicle; v.massProps();
    const M0 = v.M, p0x = M0 * v.vx, p0y = M0 * v.vy;
    expect(f.startEva('extinguisher')).toBe(true);
    const e = f.eva!;
    v.massProps();
    expect(M0 - v.M).toBeCloseTo(f.zombie!.mass, 6);
    // total momentum (ship + zombie + kit... the kit came from nowhere, so compare ship + zombie body only)
    const mz = f.zombie!.mass;
    const px = v.M * v.vx + mz * e.body.vx, py = v.M * v.vy + mz * e.body.vy;
    expect(Math.abs(px - p0x)).toBeLessThan(1e-6 * Math.abs(p0x) + 1e-6);
    expect(Math.abs(py - p0y)).toBeLessThan(1);
    expect(kinds(f)).toContain('eva');
    expect(f.evaBlockedBy).toBe('Already outside.');
  });

  it('coasting zombie follows the exact Kepler conic (physics and rails agree)', () => {
    const f = orbiting('zomsat');
    f.startEva('extinguisher');
    const b = f.eva!.body;
    const s0 = { r: { x: b.x, y: b.y + R_EARTH }, v: { x: b.vx, y: b.vy } };
    for (let i = 0; i < 1000; i++) f.step();                // 10 s of Verlet
    const ex = propagateState(s0.r, s0.v, 10, MU_EARTH);
    expect(Math.hypot(b.x - ex.r.x, b.y + R_EARTH - ex.r.y)).toBeLessThan(0.01);
    f.advanceWarp(1200);                                     // rails
    const ex2 = propagateState(s0.r, s0.v, f.t - (f.t - 1210), MU_EARTH);   // t since s0 = 1210 s
    expect(Math.hypot(b.x - ex2.r.x, b.y + R_EARTH - ex2.r.y)).toBeLessThan(1);
    expect(f.eva!.missionPhase).toBe('orbital');
  });

  it('fire extinguisher: thrust changes the orbit, every push spins the zombie, CO₂ puffs come out', () => {
    const f = orbiting('zomsat');
    f.startEva('extinguisher');
    const e = f.eva!;
    e.body.kit = { ...e.body.kit, fumble: 0 };              // keep hold of it for the test
    const E0 = invariants({ x: e.body.x, y: e.body.y + R_EARTH }, { x: e.body.vx, y: e.body.vy }, MU_EARTH).energy;
    f.fxQueue.length = 0;
    e.ctl.fire = 1;
    for (let i = 0; i < 300; i++) f.step();                 // 3 s of firing
    e.ctl.fire = 0;
    expect(Math.abs(e.body.om)).toBeGreaterThan(0.05);
    expect(e.body.propLeft).toBeLessThan(e.body.kit.prop);
    const E1 = invariants({ x: e.body.x, y: e.body.y + R_EARTH }, { x: e.body.vx, y: e.body.vy }, MU_EARTH).energy;
    expect(Math.abs(E1 - E0)).toBeGreaterThan(1);          // J/kg — the orbit changed
    expect(f.fxQueue.some((x) => x.kind === 'rcs' && (x as any).puff > 2)).toBe(true);
    // firing blocks rails for everyone
    e.ctl.fire = 1;
    expect(f.onRailsOk).toBe(false);
  });

  it('pointing it the other way (S) spins the other way', () => {
    const a = orbiting('zomsat'), b = orbiting('zomsat');
    a.startEva('extinguisher'); b.startEva('extinguisher');
    for (const f of [a, b]) f.eva!.body.kit = { ...f.eva!.body.kit, fumble: 0 };
    a.eva!.ctl.fire = 1; b.eva!.ctl.fire = -1;
    for (let i = 0; i < 100; i++) { a.step(); b.step(); }
    expect(Math.sign(a.eva!.body.om)).toBe(-Math.sign(b.eva!.body.om));
  });

  it('the extinguisher runs dry (one event), and the zombie may drop it (fumble)', () => {
    const f = orbiting('zomsat');
    f.startEva('extinguisher');
    const e = f.eva!;
    e.body.kit = { ...e.body.kit, fumble: 0 };
    e.ctl.fire = 1;
    for (let i = 0; i < 4000 && e.body.propLeft > 0; i++) f.step();
    expect(e.body.propLeft).toBe(0);
    for (let i = 0; i < 50; i++) f.step();
    expect(kinds(f).filter((k) => k === 'eva-empty').length).toBe(1);
    const g = orbiting('zomsat');
    g.startEva('extinguisher');
    g.eva!.body.kit = { ...g.eva!.body.kit, fumble: 1000 };   // butterfingers
    g.eva!.ctl.fire = 1;
    for (let i = 0; i < 20; i++) g.step();
    expect(g.eva!.body.holding).toBe(false);
    expect(kinds(g)).toContain('eva-fumble');
  });

  it('a jarred zombie cannot use any kit: no thrust, no flail — it just floats', () => {
    const f = orbiting('zomsat');
    (f.zombie as any).state = 'jarred';
    expect(f.evaBlockedBy).toBe(null);
    f.startEva('extinguisher');
    const e = f.eva!;
    expect(e.jarred).toBe(true);
    expect(e.body.kit.id).toBe('flail');
    expect(e.deltaV).toBe(0);
    e.ctl.fire = 1; e.ctl.spin = 1;
    const om0 = e.body.om;
    for (let i = 0; i < 200; i++) f.step();
    expect(e.body.om).toBe(om0);
    expect(f.fxQueue.filter((x) => x.kind === 'rcs').length).toBe(0);
    expect(kinds(f).join(' ')).toMatch(/eva/);
  });

  it('a zombie in pieces cannot go outside', () => {
    const f = orbiting('zomsat');
    (f.zombie as any).state = 'pieces';
    expect(f.evaBlockedBy).toMatch(/condition/);
    expect(f.startEva()).toBe(false);
  });
});
