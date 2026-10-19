import { describe, it, expect } from 'vitest';
import { aeroLoads, plateCN, plateCLa, plateStall, waveDrag, type AeroBody } from './aero';

const D = Math.PI / 180;

/** A 4 m tube with a pair of fins at the bottom; CoM at the middle */
const finned: AeroBody = {
  panels: [
    { uid: 1, kind: 'body', x: 0, y: 0, ax: 0, ay: 1, area: 0.8, chord: 4, aspect: 0, cant: 0, rollArm: 0.1, xcpAtt: 0.25, xcpSep: 0.5, interference: 1 },
    { uid: 2, kind: 'plate', x: 0.3, y: -1.7, ax: 0, ay: 1, area: 0.12, chord: 0.5, aspect: 1.3, cant: 0, rollArm: 0.3, xcpAtt: 0.42, xcpSep: 0.55, interference: 1.2 },
    { uid: 3, kind: 'plate', x: -0.3, y: -1.7, ax: 0, ay: 1, area: 0.12, chord: 0.5, aspect: 1.3, cant: 0, rollArm: 0.3, xcpAtt: 0.42, xcpSep: 0.55, interference: 1.2 },
  ],
  frontArea: 0.03, frontX: 0, cdFwd: 0.35, cdAft: 1, topY: 2, bottomY: -2, topCone: 0.4, bottomCone: 0,
};
const at = (deg: number, om = 0) => aeroLoads(finned, { u: 100 * Math.sin(deg * D), v: 100 * Math.cos(deg * D), om, cx: 0, cy: 0, rho: 1.225, a: 340 });

describe('360° aerodynamics', () => {
  it('flat plate: linear at small angles, stalls, then rises again to the 90° flat-plate value', () => {
    const cn = (deg: number) => plateCN(deg * D, 1.3, 0.3, false).cn;
    const as = plateStall(1.3) / D;
    expect(cn(4) / (4 * D)).toBeCloseTo(plateCLa(1.3, 0.3), 1);
    // A wing (aspect ratio 4) has a sharp stall; a stubby fin (1.3) stalls softly — as real plates do
    const wing = (deg: number) => plateCN(deg * D, 4, 0.3, false).cn;
    const asW = plateStall(4) / D;
    expect(wing(asW + 6)).toBeLessThan(0.75 * wing(asW - 2));
    expect(cn(as + 6)).toBeGreaterThan(0.9 * cn(as - 2));
    expect(cn(90)).toBeCloseTo(1.2, 2);                      // Hoerner flat plate
    expect(plateCN(10 * D, 1.3, 0.3, false).separated).toBeLessThan(0.2);
    expect(plateCN(60 * D, 1.3, 0.3, false).separated).toBeGreaterThan(0.95);
  });

  it('reverse flow: lower lift slope and an earlier stall (reverse lift)', () => {
    const fwd = plateCN(170 * D, 1.3, 0.3, false), rev = plateCN(170 * D, 1.3, 0.3, true);
    expect(rev.cn).toBeLessThan(fwd.cn);
    expect(plateCN(14 * D, 1.3, 0.3, true).separated).toBeGreaterThan(plateCN(14 * D, 1.3, 0.3, false).separated);
  });

  it('fins behind the CoM restore nose-first and destabilise tail-first', () => {
    expect(at(5).m).toBeLessThan(0);         // α > 0 → clockwise restoring moment
    expect(at(-5).m).toBeGreaterThan(0);
    // 175° = 5° off tail-first. Restoring toward 180° would be CCW (m > 0); with the fins now
    // leading, the moment is CW — it drives the angle away from 180°, i.e. it flips back over.
    expect(at(175).m).toBeLessThan(0);
    expect(at(-175).m).toBeGreaterThan(0);
  });

  it('moment is continuous all the way round — no jumps at 90° or 180°', () => {
    let prev = at(-180).m, worst = 0;
    for (let d = -179; d <= 180; d++) { const m = at(d).m; worst = Math.max(worst, Math.abs(m - prev)); prev = m; }
    const scale = Math.max(...Array.from({ length: 361 }, (_, i) => Math.abs(at(i - 180).m)));
    expect(worst / scale).toBeLessThan(0.2);
  });

  it('broadside flight has far more drag than nose-first', () => {
    expect(Math.hypot(at(90).fx, at(90).fy)).toBeGreaterThan(10 * Math.hypot(at(0).fx, at(0).fy));
  });

  it('rotation is damped by the local flow alone (no fudge term)', () => {
    expect(at(0, 2).m).toBeLessThan(0);      // pitching CCW → aero pushes CW
    expect(at(0, -2).m).toBeGreaterThan(0);
  });

  it('transonic drag rise peaks near Mach 1.1 and falls off supersonic', () => {
    expect(waveDrag(0.5)).toBe(1);
    expect(waveDrag(1.1)).toBeGreaterThan(2);
    expect(waveDrag(3)).toBeLessThan(waveDrag(1.3));
  });
});
