import { describe, it, expect } from 'vitest';
import { Heightfield, craterSize, PAD_HALF, CHUNK, DX } from './terrain';
import { Flight } from '@/physics/flight2d';
import { PRESETS } from '@/phases/assembly/model/presets';
import type { PlacedPart } from '@/phases/assembly/model/vehicle';

describe('1D terrain heightfield', () => {
  it('crater size grows with energy; lanterns and soft landings leave no crater', () => {
    expect(craterSize(0.5 * 0.1 * 3 * 3)).toBe(null);                 // a lantern
    const bangFai = craterSize(0.5 * 20 * 100 * 100)!, heavy = craterSize(0.5 * 1000 * 100 * 100)!;
    expect(bangFai.r).toBeGreaterThan(1.5); expect(bangFai.r).toBeLessThan(4);
    expect(heavy.r).toBeGreaterThan(bangFai.r * 2);
    expect(heavy.depth).toBeCloseTo(heavy.r * 0.32, 9);
  });

  it('carve makes a parabolic bowl; heightAt interpolates; overlapping craters keep the deeper floor', () => {
    const t = new Heightfield();
    expect(t.heightAt(50)).toBe(0);
    t.carve(50, 4, 2);
    expect(t.heightAt(50)).toBeCloseTo(-2, 2);
    expect(t.heightAt(52)).toBeCloseTo(-2 * (1 - 0.25), 2);
    expect(t.heightAt(54.5)).toBe(0);
    t.carve(51, 2, 0.5);                                                  // shallower, inside: no change at the centre
    expect(t.heightAt(50)).toBeCloseTo(-2, 2);
    t.carve(53, 3, 3);                                                    // deeper: wins where it is deeper
    expect(t.heightAt(53)).toBeCloseTo(-3, 2);
    expect(t.craters.length).toBe(2);                                   // the shallow one changed nothing, so it left no record
  });

  it('the concrete pad never craters; chunk boundaries are continuous; negative ground distance works', () => {
    const t = new Heightfield();
    t.carve(0, 8, 3);
    for (let x = -PAD_HALF; x <= PAD_HALF; x += 0.5) expect(t.heightAt(x)).toBe(0);
    expect(t.heightAt(6)).toBeLessThan(0); expect(t.heightAt(-6)).toBeLessThan(0);
    const edge = CHUNK * DX;
    t.carve(edge, 3, 1);
    const a = t.heightAt(edge - 0.01), b = t.heightAt(edge + 0.01);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });
});

describe('flight2d ground contact with terrain (feature flag)', () => {
  const run = (opts: object) => {
    const f = new Flight(PRESETS.find((p) => p.id === 'bang-fai-twin')!.build(), { site: { rail: 22, railAngleDeg: 6, wind: 2 }, ...opts });
    f.ignite();
    const trace: number[] = [];
    while (!f.done && f.t < 300) { f.step(); trace.push(f.vehicle.x, f.vehicle.y, f.vehicle.vx, f.vehicle.vy, f.vehicle.th); }
    return { trace, out: f.outcome };
  };

  it('no terrain, or an empty heightfield → bit-identical flight to the flat ground', () => {
    const a = run({}), b = run({ terrain: new Heightfield() });
    expect(b.out).toBe(a.out);
    expect(b.trace.length).toBe(a.trace.length);
    let same = true;
    for (let i = 0; i < a.trace.length; i++) if (a.trace[i] !== b.trace[i]) { same = false; break; }
    expect(same).toBe(true);
  });

  it('a body dropped over a crater comes to rest on the crater floor, not on the old ground line', () => {
    const drop = (t?: Heightfield) => {
      const parts: PlacedPart[] = [{ uid: 1, defId: 'tank-s', x: 0, y: 0, rot: 0, mat: 'aluminium' } as PlacedPart];
      const f = new Flight(parts, { wind: 0, terrain: t });
      f.ignite();
      Object.assign(f as any, { airborne: true, railClear: true, outcome: null });
      Object.assign(f.vehicle, { x: 30, y: 20, vx: 0, vy: -4, th: 0, om: 0 });
      while (!f.vehicle.landed && f.t < 30) f.step();
      return f.vehicle.lowestAlt();
    };
    const t = new Heightfield();
    t.carve(30, 6, 2.5);
    expect(drop()).toBeGreaterThan(-0.05);                               // flat: rests on altitude 0
    const floor = drop(t);
    expect(floor).toBeLessThan(-2);                                      // rests ~2.4 m below the old ground line
    expect(floor).toBeGreaterThan(-2.6);
  });
});
