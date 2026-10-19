import { describe, it, expect } from 'vitest';
// @ts-ignore — vitest runs in Node; the app's tsconfig has no Node types on purpose
import { readFileSync } from 'node:fs';
import { Flight, R_EARTH, MU_EARTH } from '@/physics/flight2d';
import { elements } from './kepler';
import { planManeuver } from './maneuver';
import { PlaneFrame, YASOTHON, KOH_PHANGAN, LAUNCH_RANGES, latLonToUnit, unitToLatLon, pathData, snapshot, SCENE_UNIT, EARTH_R, type Vec3 } from './frame3d';
import type { PlacedPart } from '@/phases/assembly/model/vehicle';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(...a);
const F = new PlaneFrame();

function sat(alt: number, v: number, vUp = 0) {
  const p: PlacedPart[] = [{ uid: 1, defId: 'zomsat', x: 0, y: 0, rot: 0 }];
  const f = new Flight(p, { wind: 0 });
  f.ignite();
  Object.assign(f as any, { outcome: null, airborne: true, railClear: true });
  Object.assign(f.vehicle, { x: 0, y: alt, vx: v, vy: vUp, th: -Math.PI / 2, om: 0 });
  return f;
}

describe('3D frame — flight plane on the globe', () => {
  it('lat/lon ↔ unit vector round-trips and follows the SphereGeometry texture convention', () => {
    for (const [lat, lon] of [[0, 0], [15.79, 104.15], [-33.9, 151.2], [64.1, -21.9], [0, 179.5]]) {
      const u = latLonToUnit(lat, lon);
      expect(len(u)).toBeCloseTo(1, 12);
      const back = unitToLatLon(u);
      expect(back.lat).toBeCloseTo(lat, 9); expect(back.lon).toBeCloseTo(lon, 9);
    }
    expect(latLonToUnit(90, 0)[1]).toBeCloseTo(1, 12);          // north pole is +Y
    expect(latLonToUnit(0, -180)[0]).toBeCloseTo(-1, 12);       // u = 0 seam at −180°
  });

  it('pad lands on Yasothon; +X is due east; the plane’s inclination equals the site latitude', () => {
    const pad = F.toWorld(0, R_EARTH);
    expect(len(pad)).toBeCloseTo(EARTH_R, 9);
    const ll = unitToLatLon([pad[0] / EARTH_R, pad[1] / EARTH_R, pad[2] / EARTH_R]);
    expect(ll.lat).toBeCloseTo(YASOTHON.lat, 9); expect(ll.lon).toBeCloseTo(YASOTHON.lon, 9);
    expect(dot(F.up, F.east)).toBeCloseTo(0, 12);
    expect(len(F.normal)).toBeCloseTo(1, 12);
    const east = unitToLatLon(F.dir(1e-4, 1)) ;                 // a step downrange goes east, not north
    expect(east.lon).toBeGreaterThan(YASOTHON.lon);
    expect(F.inclination).toBeCloseTo(YASOTHON.lat, 9);
  });

  it('a circular orbit draws as a closed ring at the right radius, flat in the flight plane', () => {
    const r = R_EARTH + 300e3, o = elements({ x: r, y: 0 }, { x: 0, y: Math.sqrt(MU_EARTH / r) }, MU_EARTH);
    const p = pathData(o, F);
    expect(p.closed).toBe(true);
    expect(p.hitsGround).toBe(false);
    for (const q of p.pts) { expect(len(q)).toBeCloseTo(r / SCENE_UNIT, 6); expect(Math.abs(dot(q, F.normal))).toBeLessThan(1e-9); }
    expect(p.ap).toBeTruthy(); expect(p.pe).toBeTruthy();
  });

  it('a suborbital arc starts at the vehicle and ends at the impact point on the ground', () => {
    const f = sat(400e3, 3000, 200);
    const s = snapshot(f, F);
    const o = s.orbit!;
    expect(o.hitsGround).toBe(true);
    expect(o.closed).toBe(false);
    const d0 = Math.hypot(o.pts[0][0] - s.vehicle.pos[0], o.pts[0][1] - s.vehicle.pos[1], o.pts[0][2] - s.vehicle.pos[2]);
    expect(d0).toBeLessThan(1e-6);
    expect(len(o.impact!)).toBeCloseTo(EARTH_R, 9);             // exactly on the surface (interpolated)
  });

  it('the maneuver preview node sits where the plan says, in scene space', () => {
    const f = sat(300e3, Math.sqrt(MU_EARTH / (R_EARTH + 300e3)) * 1.02);
    const v = f.vehicle;
    const plan = planManeuver({ x: v.x, y: v.y + R_EARTH }, { x: v.vx, y: v.vy }, MU_EARTH, R_EARTH, 'peri', 120);   // prograde at Pe raises Ap
    const s = snapshot(f, F, plan);
    const want = F.toWorld(plan.rNode.x, plan.rNode.y);
    expect(Math.hypot(s.plan!.node[0] - want[0], s.plan!.node[1] - want[1], s.plan!.node[2] - want[2])).toBeLessThan(1e-12);
    expect(s.plan!.ap!.alt).toBeGreaterThan(s.orbit!.ap!.alt);
  });
});

describe('3D frame — launch ranges', () => {
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /** Inclination of the DRAWN orbit: normal from two path points, angle to the north pole */
  const drawnInc = (pts: readonly Vec3[]) => {
    const n = cross(pts[0], pts[Math.floor(pts.length / 4)]);
    return Math.acos(Math.abs(n[1]) / len(n)) * 180 / Math.PI;
  };

  for (const { id, site } of LAUNCH_RANGES) {
    it(`${id}: the pad sits on ${site.name} and a flown due-east orbit is drawn at i = ${site.lat.toFixed(2)}°`, () => {
      const Fr = new PlaneFrame(site);
      const pad = unitToLatLon(Fr.up);
      expect(pad.lat).toBeCloseTo(site.lat, 9); expect(pad.lon).toBeCloseTo(site.lon, 9);
      const f = sat(300e3, Math.sqrt(MU_EARTH / (R_EARTH + 300e3)) * 1.01);
      for (let i = 0; i < 600; i++) f.step();                   // actually fly it through the integrator first
      const s = snapshot(f, Fr);
      expect(s.inclination).toBeCloseTo(site.lat, 9);
      expect(drawnInc(s.orbit!.pts)).toBeCloseTo(site.lat, 6);
      for (const q of s.orbit!.pts) expect(Math.abs(dot(q, Fr.normal))).toBeLessThan(1e-9);
    });
  }

  it('Yasothon gives the 15.8° orbit; Koh Phangan gives 9.7° — the physics is identical, only the drawing moves', () => {
    expect(new PlaneFrame(YASOTHON).inclination).toBeCloseTo(15.79, 2);
    expect(new PlaneFrame(KOH_PHANGAN).inclination).toBeCloseTo(9.68, 2);
    const f = sat(300e3, Math.sqrt(MU_EARTH / (R_EARTH + 300e3)) * 1.05);
    const a = snapshot(f, new PlaneFrame(YASOTHON)), b = snapshot(f, new PlaneFrame(KOH_PHANGAN));
    expect(a.orbit!.ap!.alt).toBe(b.orbit!.ap!.alt);                // same Ap/Pe numbers, same timing
    expect(a.orbit!.pe!.alt).toBe(b.orbit!.pe!.alt);
    expect(len(a.orbit!.ap!.pos)).toBeCloseTo(len(b.orbit!.ap!.pos), 12);
  });

  it('impact, Ap and node markers pin to the right radii at either range', () => {
    const Fr = new PlaneFrame(KOH_PHANGAN);
    const sub = snapshot(sat(400e3, 3000, 200), Fr);
    expect(len(sub.orbit!.impact!)).toBeCloseTo(EARTH_R, 9);       // on the ground
    const f = sat(300e3, Math.sqrt(MU_EARTH / (R_EARTH + 300e3)) * 1.02), v = f.vehicle;
    const plan = planManeuver({ x: v.x, y: v.y + R_EARTH }, { x: v.vx, y: v.vy }, MU_EARTH, R_EARTH, 'apo', 50);
    const s = snapshot(f, Fr, plan);
    expect(len(s.orbit!.ap!.pos) * SCENE_UNIT - R_EARTH).toBeCloseTo(s.orbit!.ap!.alt, 3);
    expect(len(s.plan!.node) * SCENE_UNIT).toBeCloseTo(Math.hypot(plan.rNode.x, plan.rNode.y), 3);
  });
});

describe('3D frame — rendering-only invariant', () => {
  it('snapshot() never changes the flight and returns frozen data', () => {
    const f = sat(300e3, Math.sqrt(MU_EARTH / (R_EARTH + 300e3)) * 1.02);
    for (let i = 0; i < 50; i++) f.step();
    const state = () => JSON.stringify({ t: f.t, v: [f.vehicle.x, f.vehicle.y, f.vehicle.vx, f.vehicle.vy, f.vehicle.th, f.vehicle.om], ev: f.events.length, c: f.controls, h: f.handoffs.length, cls: f.orbitClass, ph: f.missionPhase, pm: f.propagationMode, laps: f.laps });
    const before = state();
    let s = snapshot(f, F);
    for (let i = 0; i < 100; i++) s = snapshot(f, F);
    expect(state()).toBe(before);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.vehicle)).toBe(true);
    expect(Object.isFrozen(s.orbit)).toBe(true);
  });

  it('the Three.js view imports no simulation code (types only from the frame module)', () => {
    const src = readFileSync('src/phases/launch/GlobeView.ts', 'utf8');
    const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)].map((m) => ({ typeOnly: !!m[1], from: m[2] }));
    expect(imports.some((i) => /physics|flight2d|state'|kepler|maneuver/.test(i.from))).toBe(false);
    const frame = imports.find((i) => i.from === '@/orbit/frame3d')!;
    expect(frame).toBeTruthy();
    expect(/\bsnapshot\b/.test(src.split('\n').filter((l: string) => l.startsWith('import')).join('\n'))).toBe(false);
  });
});
