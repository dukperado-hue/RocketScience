import { describe, it, expect } from 'vitest';
import { Flight } from '@/physics/flight2d';
import { PRESETS } from '@/phases/assembly/model/presets';
import { attach, telemetry, type PlacedPart } from '@/phases/assembly/model/vehicle';
import { checks } from '@/phases/assembly/ui/TelemetryPanel';
import { airTemp, buoyantLift, carriedAirMass, heatStep, steadyTin, floatTin, CP_AIR } from './buoyancy';
import { VTSM, FUNNELS, LANTERN_SITES, inCTR, inFunnelPlan, funnelCoords, NM } from '@/law/samui';
import { AirspaceMonitor } from '@/law/airspaceMonitor';
import { distanceM } from '@/law/zones';

const lantern = (env: string, heater: string, ring = 'bamboo-ring', burners = ['bottom']): PlacedPart[] => {
  const parts: PlacedPart[] = [{ uid: 1, defId: env, x: 0, y: 0, rot: 0 }];
  const hoop = attach(parts, ring, parts[0], 'bottom', 'top');
  for (const n of burners) attach(parts, heater, hoop, n, 'top');
  return parts;
};
function fly(parts: PlacedPart[], wind = 4, T = 3600) {
  const f = new Flight(parts, { site: { rail: 0, railAngleDeg: 0, wind } as any });
  f.ignite();
  let maxAlt = 0, liftAt = -1, vUpMax = 0;
  while (!f.done && f.t < T) { f.step(); if (f.airborne && liftAt < 0) liftAt = f.t; maxAlt = Math.max(maxAlt, f.vehicle.alt); vUpMax = Math.max(vUpMax, f.vehicle.vUp); }
  return { f, maxAlt, liftAt, vUpMax, kinds: f.events.map((e) => e.kind) };
}

describe('buoyancy maths', () => {
  it('Archimedes: lift = (ρ_out − ρ_in) g V with ρ_in = ρ_out T_out/T_in; zero when not heated', () => {
    expect(buoyantLift(1, 1.2, 288, 288)).toBe(0);
    expect(buoyantLift(1, 1.2, 400, 288)).toBeCloseTo(1.2 * (1 - 288 / 400) * 9.80665, 9);
    expect(buoyantLift(2, 1.2, 400, 288)).toBeCloseTo(2 * buoyantLift(1, 1.2, 400, 288), 9);
  });

  it('heat balance: exact exponential step reaches T_out + P/UA, and agrees with tiny Euler steps', () => {
    const P = 1800, UA = 12.5, V = 0.3, rho = 1.2, Tout = 288;
    let T = Tout;
    for (let i = 0; i < 6000; i++) T = heatStep(T, Tout, P, UA, V, rho, 0.1);
    expect(T).toBeCloseTo(steadyTin(P, UA, Tout), 6);
    // one big exact step vs many small explicit-Euler steps (ρ_in held per step)
    let e = Tout, x = Tout;
    for (let i = 0; i < 10_000; i++) { const rin = rho * Tout / e; e += (P - UA * (e - Tout)) / (rin * V * CP_AIR) * 0.001; }
    for (let i = 0; i < 10; i++) x = heatStep(x, Tout, P, UA, V, rho, 1);
    expect(Math.abs(e - x)).toBeLessThan(0.5);
  });

  it('carried air: the hot air inside plus ½ ρV of displaced air move with the lantern', () => {
    expect(carriedAirMass(1, 1.2, 288, 288)).toBeCloseTo(1.2 + 0.6, 9);
    expect(floatTin(0.09, 0.3, 1.2, 288)).toBeCloseTo(288 / (1 - 0.25), 6);
    expect(airTemp(0)).toBeCloseTo(288.15, 6); expect(airTemp(1000)).toBeCloseTo(281.65, 6);
  });
});

describe('Tier 0 lanterns in flight', () => {
  it('a standard khom loi warms up, floats at 1–3 m/s, peaks at a few hundred metres, drifts downwind, comes down after burnout', () => {
    const r = fly(PRESETS.find((p) => p.id === 'khom-loi')!.build());
    expect(r.liftAt).toBeGreaterThan(5); expect(r.liftAt).toBeLessThan(120);
    expect(r.vUpMax).toBeGreaterThan(0.8); expect(r.vUpMax).toBeLessThan(3.5);
    expect(r.maxAlt).toBeGreaterThan(300); expect(r.maxAlt).toBeLessThan(1500);
    expect(r.kinds).toContain('lantern-burnout');
    expect(r.f.outcome).toBe('landed');
    expect(r.f.vehicle.downrange).toBeGreaterThan(2000);            // the wind took it kilometres away
    expect(r.f.impactSpeed).toBeLessThan(5);
  });

  it('a tea-light can’t lift a lantern; a smoke flare sets a lantern on fire', () => {
    expect(fly(lantern('envelope-m', 'tealight'), 0, 400).f.outcome).toBe('no-liftoff');
    expect(fly(lantern('envelope-m', 'smoke-flare'), 0, 600).kinds).toContain('lantern-fire');
  });

  it('a cotton balloon needs three fuel cells', () => {
    expect(fly(lantern('envelope-cloth', 'fuel-cell', 'bamboo-frame', ['bottom']), 0, 400).f.outcome).toBe('no-liftoff');
    expect(fly(PRESETS.find((p) => p.id === 'cloth-balloon')!.build(), 0, 600).liftAt).toBeGreaterThan(0);
  });

  it('no wind → no drift; the flight plane only carries the lantern where the wind blows', () => {
    const r = fly(PRESETS.find((p) => p.id === 'khom-loi')!.build(), 0, 900);
    expect(Math.abs(r.f.vehicle.downrange)).toBeLessThan(5);
  });
});

describe('Samui airspace (AIP VTSM) and the monitor', () => {
  it('geometry matches the AIP: RWY 17/35 points ~1.6 km apart on 174.5°, CTR 5 NM around the NDB', () => {
    const [r17, r35] = VTSM.runways;
    expect(distanceM(r17.thr, r35.thr)).toBeGreaterThan(1500); expect(distanceM(r17.thr, r35.thr)).toBeLessThan(2100);
    expect(VTSM.ctr.radius).toBeCloseTo(5 * NM, 6);
    expect(inCTR(VTSM.arp, 100)).toBe(true);
    expect(inCTR(VTSM.arp, 700)).toBe(false);                        // above 2000 ft AGL
  });

  it('Haad Rin sits ~13.5 km out under the RWY 17 extended centreline; Thong Sala does not', () => {
    const f17 = FUNNELS.find((f) => f.rwy === '17')!;
    const hr = LANTERN_SITES.find((s) => s.id === 'haad-rin')!.pos;
    const c = funnelCoords(f17, hr);
    expect(c.along / 1000).toBeGreaterThan(12.5); expect(c.along / 1000).toBeLessThan(14.5);
    expect(inFunnelPlan(f17, hr)).toBe(true);
    expect(inFunnelPlan(f17, LANTERN_SITES.find((s) => s.id === 'thong-sala')!.pos)).toBe(false);
    expect(inCTR(LANTERN_SITES.find((s) => s.id === 'chaweng')!.pos, 50)).toBe(true);
  });

  it('a lantern from Haad Rin on a NNE wind triggers the approach-path violation and, without a permit, the fine — once each', () => {
    const m = new AirspaceMonitor(LANTERN_SITES[0], 15, false);
    expect(m.update(0, 0, 0, false)).toEqual([]);                   // on the ground: nothing
    const a = m.update(10, 20, 150, true);
    expect(a.map((x) => x.id)).toContain('app-17');
    expect(a.map((x) => x.id)).toContain('fine');
    expect(m.fines).toBe(60_000);
    expect(m.update(11, 25, 160, true)).toEqual([]);                // one-shot
    // drift ~5 km downwind (toward 195°) at 300 m: into the control zone
    const b = m.update(1500, 5200, 300, true);
    expect(b.map((x) => x.id)).toContain('ctr');
  });

  it('with the permit and tower notified, the violations still log but no fine', () => {
    const m = new AirspaceMonitor(LANTERN_SITES[0], 15, true);
    m.update(10, 20, 150, true);
    expect(m.fines).toBe(0);
    expect(m.alerts.map((x) => x.id)).toContain('app-17');
  });

  it('Thong Sala on the NE monsoon drifts out to sea — clear', () => {
    const m = new AirspaceMonitor(LANTERN_SITES[1], 45, false);
    for (let d = 0; d <= 12_000; d += 500) m.update(d / 4, d, 600, true);
    expect(m.alerts.length).toBe(0);
  });
});

describe('Factory pre-flight for hot-air builds (v0.18)', () => {
  const pre = (parts: PlacedPart[]) => checks(telemetry(parts), parts.length, () => '', parts.map((p) => p.defId));
  const sevs = (parts: PlacedPart[]) => pre(parts).map((c) => c.sev);

  it('a khom loi can roll out (no motor needed) and the forecast says it floats', () => {
    const c = pre(PRESETS.find((p) => p.id === 'khom-loi')!.build());
    expect(c.some((x) => x.sev === 'error')).toBe(false);
    expect(c.map((x) => x.msg).join(' ')).toContain('floats above');
  });
  it('the forecast agrees with the pad: tea-light too weak, flare and small-lantern fuel cell catch fire', () => {
    expect(pre(lantern('envelope-m', 'tealight')).map((x) => x.msg).join(' ')).toContain('Not enough heat');
    expect(pre(lantern('envelope-m', 'smoke-flare')).map((x) => x.msg).join(' ')).toContain('catches fire');
    expect(pre(lantern('envelope-s', 'fuel-cell')).map((x) => x.msg).join(' ')).toContain('catches fire');
    expect(sevs(lantern('envelope-m', 'tealight'))).not.toContain('error');      // you may still try it — and learn
  });
  it('an envelope with no heat source cannot roll out', () => {
    const parts: PlacedPart[] = [{ uid: 1, defId: 'envelope-m', x: 0, y: 0, rot: 0 }];
    attach(parts, 'bamboo-ring', parts[0], 'bottom', 'top');
    expect(sevs(parts)).toContain('error');
  });
});
