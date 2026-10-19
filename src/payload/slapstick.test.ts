import { describe, it, expect } from 'vitest';
import { ZombiePayload, ZOMBIES, ZOMBIE_IDS, isTerminal, type SeatState } from './zombies';
import { EVA_KITS, makeEvaBody, evaDeltaV, evaStep, evaBlocker, payloadFor, evaMass } from '@/eva/eva';
import { faceFor } from '@/phases/launch/capcom';
import { MILESTONES } from '@/core/milestones';

const seat = (t: number, g: number): SeatState => ({ t, g, x: 0, y: 1000, vx: 0, vy: -50, alt: 1000 });

/** Feed a g profile at 100 Hz */
function feed(z: ZombiePayload, profile: (t: number) => number, T: number) {
  for (let t = 0; t < T; t += 0.01) z.update(seat(t, profile(t)), 0.01);
}

describe('jarred: catastrophic g compresses instead of tearing', () => {
  it('every variant: limbG < fallApartG < jarG', () => {
    for (const id of ZOMBIE_IDS) { const v = ZOMBIES[id]; expect(v.limbG).toBeLessThan(v.fallApartG); expect(v.fallApartG).toBeLessThan(v.jarG); }
  });

  it('a savage spike (> 18 g) jars the standard zombie: limbs and mass stay, area collapses', () => {
    const z = new ZombiePayload('standard');
    feed(z, (t) => (t < 0.3 ? 1 : 25), 0.6);           // instant step to 25 g
    expect(z.state).toBe('jarred');
    expect(z.limbs.size).toBe(5);
    expect(z.mass).toBe(ZOMBIES.standard.mass);         // nothing leaves the seat
    expect(z.area).toBeLessThan(ZOMBIES.standard.area * 0.1);
    expect(z.log.some((l) => l.kind === 'jarred')).toBe(true);
    expect(z.fx.some((f) => f.kind === 'jar')).toBe(true);
  });

  it('a slow climb through fall-apart g still tears it apart (no jar)', () => {
    const z = new ZombiePayload('standard');
    feed(z, (t) => 1 + t * 8, 3.0);                     // 8 g/s ramp: ~0.4 s between 15 and 18 g
    expect(z.state).toBe('pieces');
  });

  it('a spike that passes 18 g inside the fall-apart window counts as compression', () => {
    const z = new ZombiePayload('standard');
    feed(z, (t) => (t < 0.2 ? 1 : t < 0.27 ? 16 : t < 0.35 ? 20 : 16), 0.6);   // 80 ms at 20 g on top of 16 g
    expect(z.state).toBe('jarred');
  });

  it('jarred is terminal: no more limbs, heat or landing damage — and a verdict to match', () => {
    const z = new ZombiePayload('fat');
    feed(z, () => 30, 0.3);
    expect(z.state).toBe('jarred');
    expect(isTerminal(z.state)).toBe(true);
    feed(z, () => 40, 1);
    z.heat(800, seat(2, 0));
    z.land(seat(3, 0), 90);
    expect(z.state).toBe('jarred');
    expect(z.limbs.size).toBe(5);
    expect(z.verdict()).toMatch(/Jarred at/);
  });

  it('the fat zombie needs more: 22 g for 0.5 s tears it apart instead of jarring it', () => {
    const z = new ZombiePayload('fat');
    feed(z, () => 22, 0.5);
    expect(z.state).toBe('pieces');
  });
});

describe('story hooks', () => {
  it('CAPCOM reacts to a jarring with a dizzy face; milestones exist for jar and mop', () => {
    expect(faceFor('zombie-jarred')).toBe('dizzy');
    expect(MILESTONES.map((m) => m.id)).toContain('zombie-jarred');
    expect(MILESTONES.map((m) => m.id)).toContain('palate');
  });
});

describe('EVA groundwork', () => {
  const base = { x: 0, y: 300e3, vx: 7700, vy: 0, th: 0 };

  it('EVA is allowed only in orbit, engines off, with a passenger who is in one piece (or one jar)', () => {
    const ok = { missionPhase: 'orbital', propagationMode: 'rails', seat: 'pod', zombieState: 'damaged' as const, thrusting: false };
    expect(evaBlocker(ok)).toBe(null);
    expect(evaBlocker({ ...ok, zombieState: 'jarred' })).toBe(null);
    expect(evaBlocker({ ...ok, zombieState: 'pieces' })).toMatch(/condition/);
    expect(evaBlocker({ ...ok, missionPhase: 'ascent' })).toBeTruthy();
    expect(evaBlocker({ ...ok, thrusting: true })).toMatch(/Engines/);
  });

  it('push-off adds a small relative velocity along the seat’s up axis; nothing else changes', () => {
    const b = makeEvaBody(9, 1, 100, base, payloadFor('standard', 'intact'), 'rcs-pack', 0.5);
    expect(b.vx).toBeCloseTo(7700, 9);
    expect(b.vy).toBeCloseTo(0.5, 9);
    expect(b.propLeft).toBe(EVA_KITS['rcs-pack'].prop);
  });

  it('Δv budgets follow the rocket equation: backpack tens of m/s (MMU-class), extinguisher less, flailing 0', () => {
    const pay = payloadFor('standard', 'intact');
    const dv = (k: 'rcs-pack' | 'extinguisher' | 'flail') => evaDeltaV(makeEvaBody(1, 0, 0, base, pay, k));
    expect(dv('rcs-pack')).toBeGreaterThan(20); expect(dv('rcs-pack')).toBeLessThan(60);
    expect(dv('extinguisher')).toBeGreaterThan(5); expect(dv('extinguisher')).toBeLessThan(dv('rcs-pack'));
    expect(dv('flail')).toBe(0);
  });

  it('the extinguisher spins you as it pushes; the backpack does not; propellant runs out', () => {
    const pay = payloadFor('standard', 'intact');
    const ext = makeEvaBody(1, 0, 0, base, pay, 'extinguisher'), rcs = makeEvaBody(2, 0, 0, base, pay, 'rcs-pack');
    for (let i = 0; i < 100; i++) { evaStep(ext, 1, 0, 0.01, () => 1); evaStep(rcs, 1, 0, 0.01, () => 1); }
    expect(Math.abs(ext.om)).toBeGreaterThan(0.05);
    expect(rcs.om).toBe(0);
    for (let i = 0; i < 100_000 && ext.propLeft > 0; i++) evaStep(ext, 1, 0, 0.01, () => 1);
    expect(ext.propLeft).toBe(0);
    expect(evaStep(ext, 1, 0, 0.01, () => 1).fx).toBe(0);
  });

  it('a jar is light and compact: same zombie mass, tiny moment of inertia', () => {
    const z = makeEvaBody(1, 0, 0, base, payloadFor('standard', 'intact'), 'flail');
    const j = makeEvaBody(2, 0, 0, base, payloadFor('standard', 'jarred'), 'flail');
    expect(evaMass(j)).toBe(evaMass(z));
    expect(j.I).toBeLessThan(z.I / 20);
  });
});
