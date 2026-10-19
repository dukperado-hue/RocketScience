import { describe, it, expect } from 'vitest';
import { Flight } from '@/physics/flight2d';
import { PRESETS } from '@/phases/assembly/model/presets';
import { FF_CHUNK, ffAllowed, fastForward } from './fastForward';

const lantern = () => PRESETS.find((p) => p.id === 'khom-loi')!.build();
const make = (parts = lantern(), wind = 4) => { const f = new Flight(parts, { site: { rail: 0, railAngleDeg: 0, wind } as never }); f.ignite(); return f; };

/** everything the player could see or the mission checks could read */
const snap = (f: Flight) => ({
  t: f.t, x: f.vehicle.x, y: f.vehicle.y, vx: f.vehicle.vx, vy: f.vehicle.vy, alt: f.vehicle.alt, downrange: f.vehicle.downrange,
  maxAlt: f.maxAlt, outcome: f.outcome, done: f.done, airborne: f.airborne, temps: f.vehicle.items.map((i) => i.temp),
  events: f.events.map((e) => `${e.t}|${e.kind}|${e.text}`),
});

describe('fast-forward runs the same physics, just more of it per frame', () => {
  it('is bit-identical to stepping one step at a time (a lantern flight)', () => {
    const N = 12_000;                                   // 120 s of flight time: through warm-up and lift-off
    const a = make(); for (let i = 0; i < N; i++) a.step();
    const b = make();
    const r = fastForward(b, { maxSteps: N, budgetMs: 1e9, check: () => null });
    expect(r.steps).toBe(N);
    expect(snap(b)).toEqual(snap(a));
  });

  it('chunking and the wall-clock budget change nothing: many short calls give the same flight', () => {
    const a = make(); for (let i = 0; i < 9_000; i++) a.step();
    const b = make();
    let clock = 0;                                      // a fake clock: each chunk "costs" 1 ms, budget 3 ms → 3 chunks per call
    const now = () => clock;
    let calls = 0;
    while (b.t < a.t - 1e-9 && calls++ < 1000) {
      clock = 0;
      fastForward(b, { maxSteps: 9_000 - Math.round(b.t / 0.01), budgetMs: 2.5, now: () => (clock += 1), check: () => null });
    }
    void now;
    expect(snap(b)).toEqual(snap(a));
  });

  it('runs only whole chunks between checks, and stops when the check says so', () => {
    const f = make();
    let checks = 0;
    const r = fastForward(f, { maxSteps: 100_000, budgetMs: 1e9, check: () => (++checks === 3 ? 'airspace' : null) });
    expect(r.stop).toBe('airspace');
    expect(r.steps).toBe(3 * FF_CHUNK);
  });

  it('stops by itself at the end of the flight, with the same outcome as real time', () => {
    const a = make(); while (!a.done && a.t < 3600) a.step();
    const b = make();
    let r = fastForward(b, { maxSteps: 1_000_000, budgetMs: 1e9, check: () => null });
    for (let guard = 0; r.stop === 'event' && guard < 50; guard++) r = fastForward(b, { maxSteps: 1_000_000, budgetMs: 1e9, check: () => null });
    expect(b.done).toBe(true);
    expect(b.outcome).toBe(a.outcome);
    expect(b.t).toBe(a.t);
  });

  it('is not offered, and does nothing, while an engine is running', () => {
    const rocket = make(PRESETS.find((p) => p.id === 'sounding')!.build(), 0);
    for (let i = 0; i < 300; i++) rocket.step();        // 3 s into the burn
    expect(rocket.vehicle.thrust).toBeGreaterThan(0);
    expect(ffAllowed(rocket)).toBe(false);
    const t = rocket.t;
    expect(fastForward(rocket, { maxSteps: 1000, budgetMs: 1e9, check: () => null })).toEqual({ steps: 0, stop: 'thrust' });
    expect(rocket.t).toBe(t);
  });

  it('is offered to a floating lantern, and not before ignition', () => {
    const f = new Flight(lantern(), { site: { rail: 0, railAngleDeg: 0, wind: 4 } as never });
    expect(ffAllowed(f)).toBe(false);                   // still on the pad
    f.ignite(); for (let i = 0; i < 100; i++) f.step();
    expect(ffAllowed(f)).toBe(true);
  });
});
