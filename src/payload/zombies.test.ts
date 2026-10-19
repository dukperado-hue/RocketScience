import { describe, it, expect } from 'vitest';
import { ZombiePayload, ZOMBIES, zombieForecast } from './zombies';

const seat = (t: number, g: number) => ({ t, g, x: 0, y: 100, vx: 0, vy: 50, alt: 100 });
const ride = (z: ZombiePayload, g: number, seconds: number, t0 = 0) => {
  for (let t = t0; t < t0 + seconds; t += 0.01) z.update(seat(t, g), 0.01);
};

describe('zombie payloads', () => {
  it('variants match the spec: standard 15 g, fat 20 g, brittle limbs at 8 g', () => {
    expect(ZOMBIES.standard.fallApartG).toBe(15);
    expect(ZOMBIES.fat.fallApartG).toBe(20);
    expect(ZOMBIES.fat.mass).toBeGreaterThan(ZOMBIES.standard.mass);
    expect(ZOMBIES.brittle.limbG).toBe(8);
    expect(ZOMBIES.brittle.mass).toBeLessThan(ZOMBIES.standard.mass);
  });

  it('a one-step spike does not count; a sustained load does', () => {
    const z = new ZombiePayload('brittle');
    z.update(seat(0, 30), 0.01);
    for (let t = 0.01; t < 1; t += 0.01) z.update(seat(t, 1), 0.01);
    expect(z.limbs.size).toBe(5);
    ride(z, 9, 0.5, 1);
    expect(z.limbs.size).toBeLessThan(5);
    expect(z.log.some((l) => l.kind === 'limb')).toBe(true);
  });

  it('standard zombie: intact at 10 g, in pieces above 15 g', () => {
    const a = new ZombiePayload('standard'); ride(a, 10, 3);
    expect(a.state).toBe('intact');
    const b = new ZombiePayload('standard'); ride(b, 16, 1);
    expect(b.state).toBe('pieces');
    expect(b.mass).toBe(0);
    expect(b.verdict()).toMatch(/died… again/);
  });

  it('fat zombie survives 18 g that destroys a standard one, and bounces on landing', () => {
    const f = new ZombiePayload('fat'); ride(f, 18, 1);
    expect(f.state).not.toBe('pieces');
    f.land(seat(10, 1), 25);
    expect(f.state).not.toBe('pieces');
    expect(f.log.some((l) => /bounced/.test(l.text))).toBe(true);
  });

  it('brittle zombie loses its worms in action, and every limb makes a VFX request', () => {
    const z = new ZombiePayload('brittle'); ride(z, 13, 1);
    expect(z.state).toBe('pieces');
    expect(z.verdict()).toBe('Zombie died… again. 574 symbiotic worms lost in action.');
    expect(z.fx.filter((f) => f.kind === 'limb')).toHaveLength(5);
    expect(z.fx.some((f) => f.kind === 'worms')).toBe(true);
  });

  it('losing limbs lightens the payload and its side area', () => {
    const z = new ZombiePayload('standard'); ride(z, 11.5, 0.5);
    expect(z.mass).toBeLessThan(70);
    expect(z.area).toBeLessThan(ZOMBIES.standard.area);
  });

  it('pre-flight forecast', () => {
    expect(zombieForecast('standard', 4)).toBeNull();
    expect(zombieForecast('brittle', 9)).toMatch(/shedding limbs/);
    expect(zombieForecast('standard', 16)).toMatch(/comes apart/);
  });
});
