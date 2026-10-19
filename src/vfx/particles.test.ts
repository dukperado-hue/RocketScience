import { describe, it, expect } from 'vitest';
import { ParticleSystem, type Particle } from './particles';

const limbFx = (x: number) => ({ t: 0, kind: 'limb', x, y: 4, vx: 0, vy: 0, limb: 'left arm', n: 1 }) as never;
const settle = (ps: ParticleSystem) => { for (let i = 0; i < 600; i++) ps.update(1 / 60); };

describe('severed limbs meet the real ground', () => {
  it('a limb thrown over a crater comes to rest on the crater floor, not at the old flat y = 0', () => {
    const ps = new ParticleSystem(50);
    ps.groundAt = (x) => (Math.abs(x) < 3 ? -1.2 : 0);
    ps.spawn(limbFx(0));
    settle(ps);
    const p = ps.pool.find((q) => q.alive && q.kind === 'limb')!;
    expect(p.grounded).toBe(true);
    expect(p.y).toBeCloseTo(-1.2, 6);
  });
  it('a limb that comes to rest is reported once (the view turns sea landings into a splash + shark)', () => {
    const ps = new ParticleSystem(50), rested: Particle[] = [];
    ps.onRest = (p) => rested.push(p);
    ps.spawn(limbFx(10));
    settle(ps);
    expect(rested.length).toBe(1);
    expect(rested[0].limb).toBe('left arm');
  });
  it('flat ground by default (no terrain): unchanged behaviour', () => {
    const ps = new ParticleSystem(50);
    ps.spawn(limbFx(0)); settle(ps);
    expect(ps.pool.find((q) => q.alive && q.kind === 'limb')!.y).toBe(0);
  });
});
