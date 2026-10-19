/**
 * 2D flight plane → 3D globe, as pure data (no Three.js, no WebGL).
 *
 * The physics is planar: an Earth-centred plane where +Y points at the pad and +X is
 * downrange. Here that plane is placed on the real, textured Earth:
 *
 *   pad    → the launch site's latitude/longitude on the sphere (default: Yasothon,
 *            home of the Bang Fai rocket festival)
 *   +X     → local east at the pad (a due-east launch — the orbit's inclination equals
 *            the site latitude, exactly as for a real due-east launch)
 *   +Y     → local vertical at the pad
 *
 * `snapshot()` reads a Flight (and an optional maneuver plan) and returns plain,
 * frozen scene data. The 3D view consumes ONLY this — it never touches the Flight,
 * so it cannot change the simulation (architectural invariant, tested).
 *
 * Scene units: 1 unit = 1000 km. Axes follow Three.js (Y up = north pole) and its
 * SphereGeometry UV convention (u = 0 at longitude −180°).
 */
import { R_EARTH, type Flight } from '@/physics/flight2d';
import { orbitPath, stateAt, timeTo, type Orbit, type Vec2 } from './kepler';
import type { ManeuverPlan } from './maneuver';
import type { OrbitClass, MissionPhase, PropagationMode } from './state';

export type Vec3 = readonly [number, number, number];
export const SCENE_UNIT = 1e6;
export const EARTH_R = R_EARTH / SCENE_UNIT;
export interface GeoSite { name: string; lat: number; lon: number }
export const YASOTHON: GeoSite = { name: 'Yasothon (Bang Fai festival)', lat: 15.79, lon: 104.15 };
/** Haad Rin beach pad (the spirit-house range) — same point as the lantern site in law/samui.ts */
export const KOH_PHANGAN: GeoSite = { name: 'Koh Phangan (Haad Rin)', lat: 9.6775, lon: 100.0652 };
/** Launch ranges the player can pick for rockets; a due-east launch gives inclination = latitude */
export const LAUNCH_RANGES: readonly { id: 'yasothon' | 'phangan'; site: GeoSite }[] = [
  { id: 'yasothon', site: YASOTHON },
  { id: 'phangan', site: KOH_PHANGAN },
];

const D2R = Math.PI / 180;

/** Unit vector for a latitude/longitude, matching THREE.SphereGeometry's texture mapping */
export function latLonToUnit(lat: number, lon: number): Vec3 {
  const phi = (lon + 180) * D2R, theta = (90 - lat) * D2R;
  return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
}

export function unitToLatLon([x, y, z]: Vec3): { lat: number; lon: number } {
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, y))) / D2R;
  let lon = Math.atan2(z, -x) / D2R - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/** The flight plane on the globe */
export class PlaneFrame {
  readonly up: Vec3;
  readonly east: Vec3;
  /** Orbit normal (up × east): the plane's angular-momentum direction for an eastward orbit */
  readonly normal: Vec3;
  constructor(readonly site: GeoSite = YASOTHON) {
    this.up = latLonToUnit(site.lat, site.lon);
    const phi = (site.lon + 180) * D2R;
    this.east = [Math.sin(phi), 0, Math.cos(phi)];
    const [ux, uy, uz] = this.up, [ex, ey, ez] = this.east;
    this.normal = [uy * ez - uz * ey, uz * ex - ux * ez, ux * ey - uy * ex];
  }
  /** Earth-centred flight-plane point (metres) → scene units */
  toWorld(X: number, Y: number): Vec3 {
    const k = 1 / SCENE_UNIT, e = this.east, u = this.up;
    return [(X * e[0] + Y * u[0]) * k, (X * e[1] + Y * u[1]) * k, (X * e[2] + Y * u[2]) * k];
  }
  /** A direction in the flight plane (any length) → unit vector in the scene */
  dir(dx: number, dy: number): Vec3 {
    const e = this.east, u = this.up;
    const v: [number, number, number] = [dx * e[0] + dy * u[0], dx * e[1] + dy * u[1], dx * e[2] + dy * u[2]];
    const n = Math.hypot(...v) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
  }
  /** Inclination of the flight plane to the equator (deg) */
  get inclination() { return Math.acos(Math.abs(this.normal[1])) / D2R; }
}

export interface Apsis { pos: Vec3; alt: number; t: number }
export interface PathData {
  pts: Vec3[];
  closed: boolean;
  hitsGround: boolean;
  impact: Vec3 | null;
  ap: Apsis | null;
  pe: Apsis | null;
}

export interface SceneSnapshot {
  t: number;
  airborne: boolean;
  vehicle: { pos: Vec3; nose: Vec3; prograde: Vec3; speed: number; alt: number; landed: boolean };
  debris: Vec3[];
  orbit: PathData | null;
  plan: (PathData & { node: Vec3; dv: number }) | null;
  orbitClass: OrbitClass;
  missionPhase: MissionPhase;
  propagationMode: PropagationMode;
  e: number;
  inclination: number;
  /** The spacewalker, if a payload has left the ship */
  eva: { pos: Vec3; orbit: PathData | null; jarred: boolean; ended: boolean } | null;
}

/** Orbit polyline + apsides in scene space. Closed ellipses draw the whole ring; open paths start at `startNu`. */
export function pathData(o: Orbit, frame: PlaneFrame, n = 360, whole = true): PathData {
  const closed = o.kind === 'ellipse' && o.rA < 40 * R_EARTH;
  // a whole ring only when it never touches the ground; otherwise forward from the vehicle (periapsis may be underground)
  const src = closed && whole && o.rP > R_EARTH ? { ...o, nu: 0 } : o;
  const path = orbitPath(src, R_EARTH, n);
  // end the arc exactly on the surface: interpolate between the last sample above and the first below
  if (path.hitsGround && path.pts.length >= 2) {
    const a = path.pts[path.pts.length - 2], b = path.pts[path.pts.length - 1];
    const ra = Math.hypot(a.x, a.y), rb = Math.hypot(b.x, b.y);
    const t = ra === rb ? 1 : (ra - R_EARTH) / (ra - rb);
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, k = R_EARTH / Math.hypot(x, y);
    path.pts[path.pts.length - 1] = { x: x * k, y: y * k };
  }
  const W = (p: Vec2) => frame.toWorld(p.x, p.y);
  const pts = path.pts.map(W);
  const apsis = (nu: number, r: number, which: 'apo' | 'peri'): Apsis => { const s = stateAt(o, nu).r; return { pos: W(s), alt: r - R_EARTH, t: timeTo(o, which) }; };
  return {
    pts,
    closed: closed && !path.hitsGround,
    hitsGround: path.hitsGround,
    impact: path.hitsGround ? pts[pts.length - 1] : null,
    ap: closed ? apsis(Math.PI, o.rA, 'apo') : null,
    pe: o.rP > R_EARTH * 0.2 ? apsis(0, o.rP, 'peri') : null,
  };
}

const freeze = <T>(x: T): T => Object.freeze(x);

/** Read-only scene data for one frame. Never writes to `f`. */
export function snapshot(f: Flight, frame: PlaneFrame, plan: ManeuverPlan | null = null): SceneSnapshot {
  const v = f.vehicle;
  const Y = v.y + R_EARTH;
  const sp = Math.hypot(v.vx, v.vy);
  const flying = f.airborne && !v.landed;
  const o = flying ? f.orbit : null;
  let planData: SceneSnapshot['plan'] = null;
  if (plan && flying) {
    // the planned conic, drawn forward from the node
    const pd = pathData(plan.after, frame, 360, false);
    planData = freeze({ ...pd, node: frame.toWorld(plan.rNode.x, plan.rNode.y), dv: plan.dvPro });
  }
  return freeze({
    t: f.t,
    airborne: f.airborne,
    vehicle: freeze({
      pos: frame.toWorld(v.x, Y),
      nose: frame.dir(-Math.sin(v.th), Math.cos(v.th)),
      prograde: frame.dir(v.vx, v.vy),
      speed: sp, alt: v.alt, landed: v.landed,
    }),
    debris: freeze(f.bodies.filter((b) => b !== v).map((b) => frame.toWorld(b.x, b.y + R_EARTH))),
    orbit: o ? freeze(pathData(o, frame)) : null,
    plan: planData,
    orbitClass: f.orbitClass,
    missionPhase: f.missionPhase,
    propagationMode: f.propagationMode,
    e: o ? o.e : 0,
    inclination: frame.inclination,
    eva: f.eva ? freeze({
      pos: frame.toWorld(f.eva.body.x, f.eva.body.y + R_EARTH),
      orbit: f.eva.ended ? null : freeze(pathData(f.eva.orbit, frame, 240)),
      jarred: f.eva.jarred, ended: !!f.eva.ended,
    }) : null,
  });
}
