import { describe, it, expect } from 'vitest';
import { Flight } from './flight2d';
import { buoyantLift, steadyTin, U_ENVELOPE, G0 } from './buoyancy';
import { upCluster, PRESETS } from '@/phases/assembly/model/presets';
import { analyse, autoAttach, attach, type PlacedPart } from '@/phases/assembly/model/vehicle';
import { PART } from '@/phases/assembly/model/catalog';

const site = { rail: 0, railAngleDeg: 0, wind: 0 } as never;
/** Heat on the pad for `s` seconds (lanterns warm up before they float) and return the flight */
const warm = (parts: PlacedPart[], s: number) => { const f = new Flight(parts, { site }); f.ignite(); while (f.t < s && !f.done) f.step(); return f; };

describe('v0.22.1 — lanterns tie to the Wan Hu chair (attachment nodes)', () => {
  it('a full lantern (envelope + ring + fuel cell on a side hook) ties onto the chair’s backrest hook', () => {
    const parts: PlacedPart[] = [{ uid: 1, defId: 'wooden-chair', x: 0, y: 0, rot: 0 }];
    const ring = attach(parts, 'bamboo-ring', parts[0], 'lantern-top', 'bottom');
    attach(parts, 'envelope-l', ring, 'top', 'bottom');
    attach(parts, 'fuel-cell', ring, 'burner-r', 'top');
    const st = analyse(parts);
    expect(st.active.length).toBe(4);                       // all four joined to the chair
    expect(st.overlapping?.size ?? 0).toBe(0);
  });
  it('tap-to-add finds a free lantern spot on a bare chair (the Factory no longer refuses it)', () => {
    const parts: PlacedPart[] = [{ uid: 1, defId: 'wooden-chair', x: 0, y: 0, rot: 0 }];
    expect(autoAttach(parts, 'bamboo-ring')).not.toBe(null);
  });
  it('lanterns tie side by side (ring loops) and stack (ring → crown) without overlapping', () => {
    const parts = upCluster(4, 3);
    const st = analyse(parts);
    expect(st.active.length).toBe(parts.length);            // one connected vehicle
    expect(st.overlapping?.size ?? 0).toBe(0);
    expect(parts.filter((p) => p.defId === 'envelope-l').length).toBe(12);
  });
  it('the old blueprints are unchanged: a classic khom loi still hangs its fuel cell under the ring', () => {
    const parts: PlacedPart[] = [{ uid: 1, defId: 'envelope-m', x: 0, y: 0, rot: 0 }];
    const ring = attach(parts, 'bamboo-ring', parts[0], 'bottom', 'top');
    attach(parts, 'fuel-cell', ring, 'bottom', 'top');
    expect(analyse(parts).active.length).toBe(3);
  });
});

describe('v0.22.1 — buoyancy stacks: every lantern’s F_b adds up', () => {
  it('N identical lanterns: same inside temperature, exactly N × the lift of one', () => {
    // no zombie, so nothing floats away mid-measurement: hold on the pad and compare the lift
    const lift = (cols: number, rows: number) => { const f = warm(upCluster(cols, rows, 'brittle'), 30); return { F: f.vehicle.hot!.lift, T: f.vehicle.hot!.tIn }; };
    const one = lift(1, 1), four = lift(2, 2), twelve = lift(4, 3);
    // (a taller cluster's centre sits a few metres higher, in very slightly cooler air: ~1e-5 K)
    expect(four.T).toBeCloseTo(one.T, 2);
    expect(twelve.T).toBeCloseTo(one.T, 2);
    expect(four.F / one.F).toBeCloseTo(4, 3);
    expect(twelve.F / one.F).toBeCloseTo(12, 3);
  });
  it('and it matches Archimedes: F_b = N · (ρ_out − ρ_in) g V at the steady temperature', () => {
    const e = PART['envelope-l'].envelope!, P = PART['fuel-cell'].heater!.power;
    const f = warm(upCluster(4, 3, 'brittle'), 290);         // the pad hold gives up at 300 s (12 can't lift a chair)
    const Tout = 288.15 - 0.0065 * Math.max(0, f.vehicle.alt), tIn = f.vehicle.hot!.tIn;
    // heading for the one-lantern steady state: 12 heaters into 12 envelopes = 1 into 1
    expect(tIn).toBeGreaterThan(Tout + 0.97 * (steadyTin(P, U_ENVELOPE * e.area, Tout) - Tout));
    expect(f.vehicle.hot!.lift / (12 * buoyantLift(e.volume, 1.225, tIn, Tout))).toBeCloseTo(1, 2);
  });
  it('enough lanterns lift the chair and the zombie (400 festival lanterns × 2 fuel cells, brittle zombie)', () => {
    const f = new Flight(upCluster(), { site }); f.ignite();
    let liftAt = -1, maxAlt = 0;
    const t0 = Date.now();
    while (f.t < 400 && !f.done) { f.step(); if (f.airborne && liftAt < 0) liftAt = f.t; maxAlt = Math.max(maxAlt, f.vehicle.alt); }
    const kgLift = f.vehicle.hot!.lift / G0;
    expect(liftAt).toBeGreaterThan(0);                       // it floated…
    expect(maxAlt).toBeGreaterThan(30);                      // …and climbed
    expect(f.zombie?.limbs.size).toBe(5);                    // gently: the zombie is in one piece
    expect(kgLift).toBeGreaterThan(62);
    expect(Date.now() - t0).toBeLessThan(60_000);            // 640 lanterns are still simulable
  });
  it('too few lanterns cannot: 150 of them never leave the ground', () => {
    const f = warm(upCluster(15, 10, 'brittle'), 400);
    expect(f.airborne).toBe(false);
    expect(f.outcome).toBe('no-liftoff');
  });
});

describe('v0.22.1 — a big cluster in the wind', () => {
  it('the hot and displaced air share a gust: from the rail in 6 m/s wind nothing buckles; once free it drifts with the wind at ~1 g', () => {
    const f = new Flight(upCluster(), { site: { rail: 6, railAngleDeg: 0, wind: 6 } as never }); f.ignite();
    let maxAlt = 0, maxG = 0;
    while (f.t < 200 && !f.done) { f.step(); maxAlt = Math.max(maxAlt, f.vehicle.alt); if (f.events.some((e) => e.kind === 'rail') && f.t > 80) maxG = Math.max(maxG, f.vehicle.gLoad); }
    expect(f.events.filter((e) => e.kind === 'failure').length).toBe(0);
    expect(maxG).toBeLessThan(1.5);
    expect(maxAlt).toBeGreaterThan(200);
  });
  it('the game launches a lantern chair from the pad rail, and at the default 4 m/s it climbs away', async () => {
    const { defaultSite } = await import('@/phases/launch/LaunchPhase');
    const d = defaultSite(upCluster());
    expect(d.id).toBe('pad');
    const f = new Flight(upCluster(), { site: d.site }); f.ignite();
    let maxAlt = 0; while (f.t < 200 && !f.done) { f.step(); maxAlt = Math.max(maxAlt, f.vehicle.alt); }
    expect(maxAlt).toBeGreaterThan(200);
    expect(defaultSite(upCluster(1, 1).filter((p) => p.defId !== 'wooden-chair')).id).toBe('ground');   // a single khom loi: as before
  });
  it('rockets are untouched: with no envelope the g-load is still |F| / M (a sounding rocket pulls several g)', () => {
    const f = new Flight(PRESETS.find((p) => p.id === 'sounding')!.build(), { site }); f.ignite();
    let maxG = 0; while (f.t < 20 && !f.done) { f.step(); maxG = Math.max(maxG, f.vehicle.gLoad); }
    expect(maxG).toBeGreaterThan(3);
  });
});
