import { describe, it, expect } from 'vitest';
import { simulateFlight, Flight } from './flight2d';
import { attach, telemetry, type PlacedPart } from '@/phases/assembly/model/vehicle';
import { PRESETS } from '@/phases/assembly/model/presets';

const chair = (rider?: PlacedPart['rider']): PlacedPart[] => [{ uid: 1, defId: 'wooden-chair', x: 0, y: 0, rot: 0, ...(rider ? { rider } : {}) }];
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.build();
const oneSided = (rider?: PlacedPart['rider']) => {
  const p = chair(rider);
  const t = attach(p, 'tank-m', p[0], 'right-low', 'left');
  attach(p, 'engine-lv45', t, 'bottom', 'top');
  return p;
};
/** Finless nose + steel cast motor: statically unstable, short and fat enough for spin to matter */
const dart = (): PlacedPart[] => { const p: PlacedPart[] = [{ uid: 1, defId: 'cast-motor', x: 0, y: 0, rot: 0, mat: 'steel' }]; attach(p, 'nose-s', p[0], 'top', 'bottom'); return p; };

describe('flight2d', () => {
  it('the finned liquid rocket climbs straight through max-Q in calm air and passes 100 km', () => {
    const r = simulateFlight(preset('liquid'), { wind: 0 });
    expect(r.maxAlt).toBeGreaterThan(100_000);
    expect(r.maxTiltDeg).toBeLessThan(5);
  });

  it('…but in a crosswind it weathercocks, then flips when its fins lose bite past Mach 2.5', () => {
    const r = simulateFlight(preset('liquid'), { wind: 2 });
    const tumble = r.events.find((e) => e.kind === 'tumble')!;
    const s = r.samples.find((q) => q.t >= tumble.t - 1.5)!;
    expect(s.mach).toBeGreaterThan(2.5);
    expect(telemetry(preset('liquid')).cpAboveComLate).toBeGreaterThan(0);   // the factory warns about it
  });

  it('a chair with one tank + LV-45 on one side flips almost at once', () => {
    const r = simulateFlight(oneSided());
    expect(r.events.find((e) => e.kind === 'tumble')!.t).toBeLessThan(3);
    expect(r.maxAlt).toBeLessThan(500);
  });

  it('no engine, no liftoff — the zombie waits on the pad', () => {
    const r = simulateFlight(chair());
    expect(r.outcome).toBe('no-liftoff');
    expect(r.zombieVerdict).toMatch(/pad/);
  });

  it('a bamboo tank splits before liftoff', () => {
    const parts = preset('liquid').map((p) => (p.defId.startsWith('tank') ? { ...p, mat: 'bamboo' } : p));
    expect(simulateFlight(parts).outcome).toBe('structural-failure');
  });

  it('the cartwheeling chair spins its zombie apart (ω²r at the seat), with gore fx', () => {
    const r = simulateFlight(oneSided('brittle'));
    expect(r.maxSeatG).toBeGreaterThan(r.maxG);                 // the seat feels more than the CoM
    expect(r.events.some((e) => e.kind === 'zombie-limb')).toBe(true);
    expect(r.fx.some((f) => f.kind === 'limb')).toBe(true);
    expect(r.fx.some((f) => f.kind === 'worms')).toBe(true);
    expect(r.zombieVerdict).toMatch(/worms lost in action/);
  });

  it('a fat zombie keeps more limbs than a brittle one on the same flight', () => {
    const lost = (z: 'fat' | 'brittle') => simulateFlight(oneSided(z), { seed: 3 }).events.filter((e) => e.kind === 'zombie-limb').length;
    expect(lost('fat')).toBeLessThan(lost('brittle') + 1);
    expect(simulateFlight(oneSided('brittle')).fx.filter((f) => f.kind === 'limb').length).toBeGreaterThan(
      simulateFlight(oneSided('fat')).fx.filter((f) => f.kind === 'limb').length - 1);
  });

  it('spin stabilisation: an unstable dart tumbles at Sg < 1 and flies straight at Sg > 1', () => {
    const slow = simulateFlight(dart(), { spinRps: 300 });
    const fast = simulateFlight(dart(), { spinRps: 1500 });
    expect(slow.spinSg!).toBeLessThan(1);
    expect(slow.events.some((e) => e.kind === 'tumble' && e.t < 3.1)).toBe(true);
    expect(fast.spinSg!).toBeGreaterThan(1);
    const climb = fast.samples.filter((s) => s.speed > 50 && s.alt > 20);
    expect(Math.max(...climb.filter((s) => s.t < 3).map((s) => Math.abs(s.tiltDeg)))).toBeLessThan(10);
  });

  it('canted fins spin the rocket up from rest', () => {
    const p: PlacedPart[] = [{ uid: 1, defId: 'srb-s', x: 0, y: 0, rot: 0 }];
    attach(p, 'fin-canted', p[0], 'right', 'root');
    attach(p, 'fin-canted', p[0], 'left', 'root', { fx: true });
    const r = simulateFlight(p, { wind: 0 });
    expect(Math.max(...r.samples.map((s) => Math.abs(s.spinRps)))).toBeGreaterThan(1);
  });

  it('TVC + SAS: the gimballed liquid rocket holds its line through Mach 3 in a crosswind and reaches space', () => {
    const r = simulateFlight(preset('liquid'), { wind: 2, sas: true });
    expect(r.maxAlt).toBeGreaterThan(100_000);
    const climb = r.samples.filter((s) => s.thrust > 0 && s.t > 2);
    expect(Math.max(...climb.map((s) => Math.abs(s.tiltDeg)))).toBeLessThan(10);
    expect(Math.max(...climb.map((s) => Math.abs(s.gimbalDeg)))).toBeLessThan(6.01);   // within the LV-45's ±6°
  });

  it('SAS can pitch the rocket over on command (gravity turn)', () => {
    const r = simulateFlight(preset('liquid'), { wind: 0, sas: true, pitchDeg: 30 });
    const late = r.samples.filter((s) => s.thrust > 0 && s.t > 20);
    expect(late[late.length - 1].tiltDeg).toBeCloseTo(30, -1);
    expect(r.range).toBeGreaterThan(20_000);
  });

  it('Bang Fai off a 25 m ramp: twin tails fly kilometres, and the carved nozzle rescues the single-tail one too', () => {
    const fly = (id: string) => { const f = new Flight(preset(id), { site: { rail: 25, railAngleDeg: 10, wind: 2 } }); f.ignite(); while (!f.outcome && f.t < 300) f.step(); return f.result(); };
    const one = fly('bang-fai'), two = fly('bang-fai-twin');
    expect(two.maxAlt).toBeGreaterThan(1000);
    expect(one.maxAlt).toBeGreaterThan(1000);                          // thrust line trimmed through the CoM
    expect(one.events.some((e) => e.kind === 'trim')).toBe(true);
    expect(one.events.some((e) => e.kind === 'rail' && /bamboo ramp/.test(e.text))).toBe(true);
  });

  it('staging: boosters drop away as separate bodies and hit the ground on their own', () => {
    const f = new Flight(preset('boosters'));
    f.ignite();
    f.advance(10);
    const before = f.bodies.length;
    expect(f.stage()).toBe('Boosters');
    expect(f.bodies.length).toBeGreaterThan(before);
    expect(f.vehicle.items.some((i) => i.part.defId === 'srb-l')).toBe(false);
    while (!f.done && f.t < 900) f.step();
    expect(f.events.some((e) => e.kind === 'debris')).toBe(true);
  });

  it('the parachute brings the pod and its zombie down intact', () => {
    const r = simulateFlight(preset('liquid'), { sas: true });
    expect(r.outcome).toBe('landed');
    expect(r.impactSpeed).toBeLessThan(12);
    expect(r.events.some((e) => e.kind === 'chute')).toBe(true);
    expect(/died/.test(r.zombieVerdict)).toBe(false);
  });

  it('a parachute opened too fast shreds', () => {
    const f = new Flight(preset('liquid'), { sas: true, autoChute: false });
    f.ignite();
    f.advance(50);           // supersonic
    f.deployChutes();
    expect(f.events.some((e) => /shredded/.test(e.text))).toBe(true);
  });
});
