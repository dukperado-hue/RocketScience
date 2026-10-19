import { describe, it, expect } from 'vitest';
import { Flight, simulateFlight } from './flight2d';
import { attach, type PlacedPart } from '@/phases/assembly/model/vehicle';
import { PRESETS } from '@/phases/assembly/model/presets';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.build();
/** Put a flight straight into a coasting state, e.g. re-entering */
function coast(parts: PlacedPart[], s: { y: number; vx: number; vy: number; th?: number }) {
  const f = new Flight(parts, { wind: 0 });
  f.ignite();
  for (const it of f.vehicle.items) if (it.engine) it.engine.out = true;
  (f as any).airborne = true; (f as any).railClear = true;
  Object.assign(f.vehicle, { x: 0, y: s.y, vx: s.vx, vy: s.vy, th: s.th ?? 0, om: 0 });
  return f;
}
const pod = (shield: boolean): PlacedPart[] => {
  const p: PlacedPart[] = [{ uid: 1, defId: 'pod-mk1', x: 0, y: 0, rot: 0 }];
  if (shield) attach(p, 'heat-shield', p[0], 'bottom', 'top');
  return p;
};

describe('throttle', () => {
  it('zero throttle gives no liquid thrust; half throttle burns about twice as long', () => {
    const f = new Flight(preset('liquid'), { wind: 0 });
    f.controls.throttle = 0; f.ignite(); f.advance(3);
    expect(f.airborne).toBe(false);
    const burn = (thr: number) => { const g = new Flight(preset('liquid'), { wind: 0, sas: true }); g.controls.throttle = thr; g.ignite();
      while (!g.vehicle.engines.every((i) => i.engine!.out) && g.t < 400) g.step(); return g.t; };
    expect(burn(0.6) / burn(1)).toBeCloseTo(1 / 0.6, 0);
  });
});

describe('RCS', () => {
  it('turns the pod in vacuum with no engine, and uses up monopropellant', () => {
    const f = coast(pod(true), { y: 150_000, vx: 0, vy: 100 });
    f.controls.sas = true; f.controls.target = 90 * Math.PI / 180;   // swing it to horizontal
    const mono0 = f.mono;
    f.advance(15);
    expect(Math.abs(-f.vehicle.th * 180 / Math.PI - 90)).toBeLessThan(10);
    expect(f.mono).toBeLessThan(mono0);
    expect(f.fxAll.some((x) => x.kind === 'rcs')).toBe(true);
  });
});

describe('re-entry heating', () => {
  it('at 5 km/s a pod coming in heat-shield first survives; flying nose first it burns up (and cooks its zombie)', () => {
    const entry = { y: 75_000, vx: 4000, vy: -3000 };
    const ang = Math.atan2(entry.vx, entry.vy);         // shield first: nose points against the motion
    const safe = coast(pod(true), { ...entry, th: -(ang + Math.PI) });
    safe.controls.sas = true; safe.controls.sasMode = 'retrograde';
    while (!safe.done && safe.t < 400) safe.step();
    expect(safe.events.some((e) => e.kind === 'burnup')).toBe(false);
    const bad = coast(pod(false), { ...entry, th: -ang });
    bad.controls.sas = true; bad.controls.sasMode = 'prograde';
    while (!bad.done && bad.t < 400) bad.step();
    expect(bad.events.some((e) => e.kind === 'burnup')).toBe(true);
    expect(bad.fxAll.some((x) => x.kind === 'explode')).toBe(true);
    expect(bad.events.some((e) => /cremated|crispy/.test(e.text))).toBe(true);
  });
  it('ascent heating stays below the recovery temperature — aluminium survives Mach 3', () => {
    const r = simulateFlight(preset('liquid'), { sas: true });
    expect(r.events.some((e) => e.kind === 'burnup')).toBe(false);
  });
});

describe('fireworks', () => {
  it('a strontium charge bursts red at burnout; a crash with salts aboard bursts in their colours', () => {
    const p: PlacedPart[] = [{ uid: 1, defId: 'srb-s', x: 0, y: 0, rot: 0, salt: 'Sr' }];
    attach(p, 'nose-s', p[0], 'top', 'bottom', { mat: 'steel' });   // paper would burn up at Mach 5
    attach(p, 'fin-s', p[0], 'right', 'root', { mat: 'steel' }); attach(p, 'fin-s', p[0], 'left', 'root', { fx: true, mat: 'steel' });
    const r = simulateFlight(p, { wind: 0 });
    const fw = r.fx.find((x) => x.kind === 'explode' && (x as any).firework) as any;
    expect(!!fw).toBe(true);
    const [rr, gg, bb] = fw.colors[0].match(/\d+/g).map(Number);
    expect(rr).toBeGreaterThan(gg); expect(rr).toBeGreaterThan(bb);   // red
    expect(r.events.some((e) => e.kind === 'firework')).toBe(true);
  });
});
