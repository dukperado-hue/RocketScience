import { describe, it, expect } from 'vitest';
import { mul, tr, apply, angleOf, IDENTITY } from './boneRig';
import { ZombieRig } from './zombieRig';
import { BUILD } from '@/vfx/zombieArt';

const G = 9.81;
const run = (r: ZombieRig, felt: { x: number; y: number }, s: number, spin = 0) => { for (let t = 0; t < s; t += 1 / 60) r.update(1 / 60, felt, spin); };
const deg = (a: number) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return (d * 180) / Math.PI; };

describe('bone rig maths', () => {
  it('matrices compose like canvas transforms (translate, then rotate)', () => {
    const m = mul(tr(1, 2, Math.PI / 2), tr(3, 0, 0));
    const [x, y] = apply(m, 0, 0);
    expect(x).toBeCloseTo(1, 12); expect(y).toBeCloseTo(5, 12);       // 3 along a bone that points up
    expect(angleOf(m)).toBeCloseTo(Math.PI / 2, 12);
    expect(mul(IDENTITY, m)).toEqual(m);
  });
});

describe('zombie rig — FK and poses', () => {
  it('at rest it reproduces the old seated drawing: hands, feet and neck where drawZombie put them', () => {
    const r = new ZombieRig('standard'), sx = BUILD.standard.torsoW / 2;
    const [hx, hy] = r.rig.point('lowerArmL', 0.1, 0);
    expect(hx).toBeCloseTo(-sx - 0.16, 6); expect(hy).toBeCloseTo(0.38, 6);
    const [rx, ry] = r.rig.point('lowerArmR', 0.1, 0);
    expect(rx).toBeCloseTo(sx + 0.16, 6); expect(ry).toBeCloseTo(0.38, 6);
    const [fx, fy] = r.rig.point('calfL', 0.19, 0);
    expect(fx).toBeCloseTo(-sx * 0.7, 2); expect(fy).toBeCloseTo(-0.42, 2);
    const [nx, ny] = r.rig.point('head');
    expect(nx).toBeCloseTo(0, 9); expect(ny).toBeCloseTo(BUILD.standard.torsoH - 0.04, 9);
  });

  it('sitting on the pad (1 g) it holds the pose exactly — the springs are referenced to 1 g', () => {
    const r = new ZombieRig('standard'), a0 = r.rig.worldAngle('lowerArmL');
    run(r, { x: 0, y: -G }, 3);
    expect(Math.abs(deg(r.rig.worldAngle('lowerArmL') - a0))).toBeLessThan(6);   // only the idle breath
    expect(r.weights.idle).toBeGreaterThan(0.95);
  });

  it('5 g of thrust: high-G pose blends in and the arms are dragged down', () => {
    const r = new ZombieRig('standard'), a0 = r.rig.worldAngle('upperArmL');
    run(r, { x: 0, y: -5 * G }, 2);
    expect(r.weights.highG).toBeGreaterThan(0.6);
    expect(deg(r.rig.worldAngle('upperArmL') - a0)).toBeGreaterThan(40);     // left arm swings down (CCW from up-left)
    const [, hy] = r.rig.point('lowerArmL', 0.1, 0);
    expect(hy).toBeLessThan(0.3);                                          // the hand dropped
  });

  it('free fall: the float pose blends in, arms drift up', () => {
    const r = new ZombieRig('standard'), a0 = r.rig.worldAngle('upperArmL');
    run(r, { x: 0, y: 0 }, 2);
    expect(r.weights.float).toBeGreaterThan(0.85);
    expect(deg(r.rig.worldAngle('upperArmL') - a0)).toBeLessThan(-20);
  });

  it('a jolt sets the forearm wobbling (overshoot, back-swing), then it settles', () => {
    const r = new ZombieRig('standard');
    run(r, { x: 0, y: -G }, 1);
    const rest = r.rig.bones.lowerArmL.a;
    run(r, { x: 30, y: -12 * G }, 0.08);                                   // a crash-sized kick for 80 ms
    const trace: number[] = [];
    for (let i = 0; i < 180; i++) { r.update(1 / 60, { x: 0, y: -G }, 0); trace.push(r.rig.bones.lowerArmL.a - rest); }
    let crossings = 0;
    for (let i = 1; i < trace.length; i++) if (Math.sign(trace[i]) !== Math.sign(trace[i - 1])) crossings++;
    expect(Math.max(...trace.map(Math.abs))).toBeGreaterThan(0.15);
    expect(crossings).toBeGreaterThanOrEqual(2);
    run(r, { x: 0, y: -G }, 4);
    expect(Math.abs(r.rig.bones.lowerArmL.a - rest)).toBeLessThan(0.03);
  });

  it('a sideways shove swings both arms the same way (they hang toward where things fall)', () => {
    const r = new ZombieRig('standard');
    const l0 = r.rig.worldAngle('upperArmL'), r0 = r.rig.worldAngle('upperArmR');
    run(r, { x: 0.7 * G, y: -0.7 * G }, 1.5);                              // ~1 g, tilted: pull to the lower right (no pose change)
    expect(r.rig.worldAngle('upperArmL') - l0).toBeLessThan(0);           // left arm rotates clockwise (toward right)
    expect(r.rig.worldAngle('upperArmR') - r0).toBeLessThan(0);
  });

  it('a sudden spin makes the limbs trail behind, then catch up (follow-through, no permanent offset)', () => {
    const r = new ZombieRig('standard');
    run(r, { x: 0, y: -G }, 1);
    const rest = r.rig.bones.lowerArmL.a;
    let worst = 0;
    for (let i = 0; i < 30; i++) { r.update(1 / 60, { x: 0, y: -G }, 0); r.update(1 / 60, { x: 0, y: -G }, 8); worst = Math.min(worst, r.rig.bones.lowerArmL.a - rest); }
    expect(worst).toBeLessThan(-0.02);                                       // CCW spin → the forearm lags clockwise
  });
});

describe('zombie rig — limbs coming off', () => {
  it('detaching an arm takes the whole subtree; the fragment keeps flopping; a second detach is a no-op', () => {
    const r = new ZombieRig('standard');
    const f = r.detach('left arm')!;
    expect(f.ids).toEqual(['upperArmL', 'lowerArmL']);
    expect(r.attached('left arm')).toBe(false);
    expect(r.rig.isAttached('lowerArmL')).toBe(false);
    expect(r.attached('right arm')).toBe(true);
    const a0 = f.angle('lowerArmL');
    f.spin = 12; for (let i = 0; i < 60; i++) f.step(1 / 60);
    expect(Math.abs(f.angle('lowerArmL') - a0)).toBeGreaterThan(0.01);
    expect(r.detach('left arm')).toBe(null);
  });

  it('sync() removes limbs the flight already lost; detached limbs no longer move', () => {
    const r = new ZombieRig('standard', new Set(['right arm', 'left leg', 'right leg', 'head']));
    expect(r.attached('left arm')).toBe(false);
    const a = r.rig.bones.upperArmL.a;
    run(r, { x: 0, y: -6 * G }, 1);
    expect(r.rig.bones.upperArmL.a).toBe(a);
  });
});
