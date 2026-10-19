/**
 * Two-body orbital mechanics in the flight plane (Earth-centred, 2D).
 *
 *   state (r, v)  ⇄  elements { a, e, ω, ν, M }      via h = r × v,  e = (v × h)/μ − r̂
 *   propagation   universal variables (Stumpff C, S) — one formula for ellipse,
 *                 parabola and hyperbola, so near-parabolic orbits need no special case
 *   timing        Kepler (ellipse) / hyperbolic Kepler / Barker (parabola) for HUD clocks
 *   path          sampled conic for the map view, clipped where it hits the ground
 *
 * Frame: the flight sim's frame shifted to Earth's centre — X = x, Y = y + R.
 * Angles are CCW from +X. h > 0 means the orbit runs counter-clockwise.
 */

export interface Vec2 { x: number; y: number }
export type ConicKind = 'ellipse' | 'parabola' | 'hyperbola';

export interface Orbit {
  mu: number;
  /** Semi-major axis (m) — negative for a hyperbola, Infinity for a parabola */
  a: number;
  e: number;
  kind: ConicKind;
  /** Semi-latus rectum p = h²/μ (m) — finite for every conic */
  p: number;
  /** Argument of periapsis: direction of periapsis, CCW from +X (rad) */
  omega: number;
  /** True anomaly now (rad): [0, 2π) for an ellipse, (−π, π) otherwise */
  nu: number;
  /** Specific angular momentum (signed, m²/s) and orbital energy (J/kg) */
  h: number;
  energy: number;
  /** Periapsis / apoapsis radius from Earth's centre (m). rA = Infinity when not bound */
  rP: number;
  rA: number;
  /** Period (s); Infinity when not bound */
  period: number;
  /** "Mean motion" and "mean anomaly" so that time since periapsis = M / n (all conics) */
  n: number;
  M: number;
  bound: boolean;
}

const TWO_PI = Math.PI * 2;
const wrap2Pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
const wrapPi = (a: number) => wrap2Pi(a + Math.PI) - Math.PI;
/** |e − 1| below this is treated as a parabola for timing (propagation never needs it) */
export const PARABOLIC_TOL = 1e-7;

export function elements(r: Vec2, v: Vec2, mu: number): Orbit {
  const rm = Math.hypot(r.x, r.y);
  const v2 = v.x * v.x + v.y * v.y;
  const h = r.x * v.y - r.y * v.x;                    // z of r × v
  const rv = r.x * v.x + r.y * v.y;
  const ex = ((v2 - mu / rm) * r.x - rv * v.x) / mu;
  const ey = ((v2 - mu / rm) * r.y - rv * v.y) / mu;
  let e = Math.hypot(ex, ey);
  const energy = v2 / 2 - mu / rm;
  // The conic type is decided by ENERGY, never by e alone: a nearly radial ellipse
  // (h ≈ 0, e.g. sitting on the pad) has e ≈ 1 but is firmly bound.
  const eps = (energy * rm) / mu;                       // dimensionless energy
  const kind: ConicKind = Math.abs(eps) < PARABOLIC_TOL ? 'parabola' : energy < 0 ? 'ellipse' : 'hyperbola';
  const bound = energy < 0;
  if (kind === 'ellipse' && e >= 1) e = 1 - 1e-15;
  if (kind === 'hyperbola' && e <= 1) e = 1 + 1e-15;
  if (kind === 'parabola') e = 1;
  const p = (h * h) / mu;
  const a = kind === 'parabola' ? Infinity : -mu / (2 * energy);
  const dir = h >= 0 ? 1 : -1;
  const omega = e > 1e-10 ? Math.atan2(ey, ex) : Math.atan2(r.y, r.x);   // circular: measure from here
  const nu0 = wrap2Pi(dir * (Math.atan2(r.y, r.x) - omega));
  const rP = kind === 'parabola' ? p / 2 : a * (1 - e);
  const rA = kind === 'ellipse' ? 2 * a - rP : Infinity;
  const o: Orbit = { mu, a, e, kind, p, omega, nu: kind === 'ellipse' ? nu0 : wrapPi(nu0), h, energy, rP, rA, period: Infinity, n: 0, M: 0, bound };
  o.n = kind === 'parabola' ? 2 * Math.sqrt(mu / (p * p * p)) : Math.sqrt(mu / Math.abs(a) ** 3);
  if (kind === 'ellipse') o.period = TWO_PI / o.n;
  o.M = meanAnomaly(o, o.nu);
  return o;
}

/** Mean anomaly for true anomaly ν: time since periapsis = M / n */
export function meanAnomaly(o: Orbit, nu: number): number {
  const e = o.e;
  if (o.kind === 'ellipse') {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    return wrap2Pi(E - e * Math.sin(E));
  }
  const n = wrapPi(nu);
  if (o.kind === 'parabola') { const D = Math.tan(n / 2); return D + (D * D * D) / 3; }
  const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(n / 2));
  return e * Math.sinh(H) - H;
}

/** Solve Kepler's equation for the eccentric (or hyperbolic) anomaly */
export function eccentricAnomaly(M: number, e: number): number {
  if (e < 1) {
    let E = e < 0.8 ? M : Math.PI;
    for (let i = 0; i < 50; i++) {
      const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-13) break;
    }
    return E;
  }
  let H = Math.asinh(M / e);
  for (let i = 0; i < 60; i++) {
    const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return H;
}

/** True anomaly → state vectors */
export function stateAt(o: Orbit, nu: number): { r: Vec2; v: Vec2 } {
  const rm = o.p / (1 + o.e * Math.cos(nu));
  const dir = o.h >= 0 ? 1 : -1;
  const ang = o.omega + dir * nu;
  const r = { x: rm * Math.cos(ang), y: rm * Math.sin(ang) };
  // velocity: radial vr = μ/h e sin ν, tangential vt = μ/h (1 + e cos ν)
  const k = o.mu / Math.abs(o.h);
  const vr = k * o.e * Math.sin(nu), vt = k * (1 + o.e * Math.cos(nu));
  const ur = { x: Math.cos(ang), y: Math.sin(ang) };
  const ut = { x: -dir * Math.sin(ang), y: dir * Math.cos(ang) };
  return { r, v: { x: vr * ur.x + vt * ut.x, y: vr * ur.y + vt * ut.y } };
}

/* ---------- Universal-variable propagation ---------- */

/** Stumpff functions C(z), S(z) — series near z = 0 so near-parabolic orbits stay exact */
export function stumpff(z: number): { C: number; S: number } {
  if (Math.abs(z) < 1e-3) {
    return {
      C: 1 / 2 - z / 24 + (z * z) / 720 - (z * z * z) / 40320,
      S: 1 / 6 - z / 120 + (z * z) / 5040 - (z * z * z) / 362880,
    };
  }
  if (z > 0) { const s = Math.sqrt(z); return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * z) }; }
  const s = Math.sqrt(-z);
  return { C: (Math.cosh(s) - 1) / -z, S: (Math.sinh(s) - s) / (s * -z) };
}

/**
 * Exact two-body propagation of a state by dt (any sign) with universal variables.
 * The universal Kepler equation F(χ) is strictly increasing (F′(χ) = r > 0), so a
 * bracketed Newton/bisection hybrid always converges — no failure cases at e ≈ 1.
 */
export function propagateState(r0: Vec2, v0: Vec2, dt: number, mu: number): { r: Vec2; v: Vec2 } {
  if (dt === 0) return { r: { ...r0 }, v: { ...v0 } };
  const r0m = Math.hypot(r0.x, r0.y);
  const vr0 = (r0.x * v0.x + r0.y * v0.y) / r0m;
  const alpha = 2 / r0m - (v0.x * v0.x + v0.y * v0.y) / mu;   // 1/a
  const sq = Math.sqrt(mu);
  // Bound orbits are periodic: reduce dt to (−P/2, P/2] for precision over many laps
  if (alpha > 1e-15) {
    const P = TWO_PI / Math.sqrt(mu * alpha * alpha * alpha);
    if (Number.isFinite(P) && Math.abs(dt) > P) dt -= P * Math.round(dt / P);
  }
  const A = (r0m * vr0) / sq, B = 1 - alpha * r0m;
  // F is strictly increasing, so where the hyperbolic Stumpff terms overflow (∞·0 = NaN)
  // its value is simply ±∞ on the side of x — that keeps the bracket honest at huge warps.
  const F = (x: number) => {
    const z = alpha * x * x, { C, S } = stumpff(z);
    const f = A * x * x * C + B * x * x * x * S + r0m * x - sq * dt;
    return Number.isFinite(f) ? f : x > 0 ? Infinity : -Infinity;
  };
  const dF = (x: number) => { const z = alpha * x * x, { C, S } = stumpff(z); const d = A * x * (1 - z * S) + B * x * x * C + r0m; return Number.isFinite(d) && d > 0 ? d : Infinity; };
  // Bracket the root: F(0) = −√μ dt, F increasing
  const sgn = Math.sign(dt);
  let lo = 0, hi = sgn * Math.max(1e-6, alpha > 0 ? sq * dt * alpha : (sq * Math.abs(dt)) / r0m);
  for (let i = 0; i < 200 && sgn * F(hi) < 0; i++) { lo = hi; hi *= 2; }
  if (lo > hi) [lo, hi] = [hi, lo];
  // rtsafe (Numerical Recipes): Newton where it converges at least as fast as bisection,
  // bisection otherwise — Newton alone crawls down the exponential side of a hyperbola
  let x = (lo + hi) / 2, dxOld = hi - lo, dx = dxOld;
  let f = F(x), d = dF(x);
  for (let i = 0; i < 300; i++) {
    const newtonOut = ((x - hi) * d - f) * ((x - lo) * d - f) > 0;
    const slow = Math.abs(2 * f) > Math.abs(dxOld * d);
    dxOld = dx;
    if (newtonOut || slow || !Number.isFinite(f) || !Number.isFinite(d)) { dx = (hi - lo) / 2; x = lo + dx; }
    else { dx = f / d; x -= dx; }
    if (Math.abs(dx) <= 1e-12 * Math.max(1, Math.abs(x)) || hi - lo <= 1e-12 * Math.max(1, Math.abs(x))) break;
    f = F(x); d = dF(x);
    if (f === 0) break;
    if (f < 0) lo = x; else hi = x;
  }
  const z = alpha * x * x, { C, S } = stumpff(z);
  const fl = 1 - ((x * x) / r0m) * C;
  const g = dt - ((x * x * x) / sq) * S;
  const r = { x: fl * r0.x + g * v0.x, y: fl * r0.y + g * v0.y };
  const rm = Math.hypot(r.x, r.y);
  const fd = (sq / (rm * r0m)) * (alpha * x * x * x * S - x);
  const gd = 1 - ((x * x) / rm) * C;
  return { r, v: { x: fd * r0.x + gd * v0.x, y: fd * r0.y + gd * v0.y } };
}

/** Advance an orbit by dt seconds (analytic, exact for two bodies) */
export function propagate(o: Orbit, dt: number): { r: Vec2; v: Vec2; orbit: Orbit } {
  const s0 = stateAt(o, o.nu);
  const s = propagateState(s0.r, s0.v, dt, o.mu);
  return { ...s, orbit: elements(s.r, s.v, o.mu) };
}

/* ---------- Timing ---------- */

/** Seconds until the next apoapsis / periapsis (Infinity if it never comes) */
export function timeTo(o: Orbit, which: 'apo' | 'peri'): number {
  if (o.kind !== 'ellipse') return which === 'peri' && o.M < 0 ? -o.M / o.n : Infinity;
  const target = which === 'peri' ? 0 : Math.PI;
  return wrap2Pi(target - o.M) / o.n;
}

/**
 * Seconds until the orbit next comes DOWN through radius `rt` (Infinity if it never
 * does, e.g. periapsis above rt or an escape that is already climbing). Analytic
 * guess from the conic, then polished with Newton on the exact propagator.
 */
export function timeToRadiusDescending(o: Orbit, r: Vec2, v: Vec2, rt: number): number {
  if (o.rP >= rt) return Infinity;
  const rNow = Math.hypot(r.x, r.y);
  const vr = (r.x * v.x + r.y * v.y) / rNow;
  if (rNow <= rt) return 0;
  if (o.kind !== 'ellipse' && vr >= 0) return Infinity;        // open orbit, climbing away
  const cosNu = Math.max(-1, Math.min(1, (o.p / rt - 1) / o.e));
  const nuT = -Math.acos(cosNu);                                 // descending branch: ν ∈ (−π, 0)
  let t: number;
  if (o.kind === 'ellipse') {
    const Mt = meanAnomaly(o, wrap2Pi(nuT));
    t = wrap2Pi(Mt - o.M) / o.n;
  } else {
    t = (meanAnomaly(o, nuT) - o.M) / o.n;
  }
  if (!(t >= 0) || !Number.isFinite(t)) t = 0;
  // Polish: Newton on |r(t)| − rt with dr/dt = radial velocity
  for (let i = 0; i < 6; i++) {
    const s = propagateState(r, v, t, o.mu);
    const rm = Math.hypot(s.r.x, s.r.y);
    const rd = (s.r.x * s.v.x + s.r.y * s.v.y) / rm;
    if (Math.abs(rm - rt) < 1e-3 || Math.abs(rd) < 1e-6) break;
    t = Math.max(0, t - (rm - rt) / rd);
  }
  return t;
}

/**
 * Points along the conic for drawing, from the current position forward one
 * revolution (or out to `maxR` for an escape path), stopping where it meets
 * the ground (radius `rGround`).
 */
export function orbitPath(o: Orbit, rGround: number, n = 256, maxR = 40 * rGround): { pts: Vec2[]; hitsGround: boolean } {
  const pts: Vec2[] = [];
  const dir = o.h >= 0 ? 1 : -1;
  const closed = o.kind === 'ellipse' && o.rA < maxR;
  const nuMax = closed ? o.nu + TWO_PI : Math.acos(Math.max(-1, Math.min(1, (o.p / maxR - 1) / o.e)));
  const start = closed ? o.nu : wrapPi(o.nu);
  let hitsGround = false;
  if (!(nuMax > start)) return { pts: [stateAt(o, o.nu).r], hitsGround: o.rP < rGround };
  for (let i = 0; i <= n; i++) {
    const nu = start + ((nuMax - start) * i) / n;
    const den = 1 + o.e * Math.cos(nu);
    if (den <= 1e-9) break;
    const rm = o.p / den;
    if (rm > maxR) break;
    const ang = o.omega + dir * nu;
    pts.push({ x: rm * Math.cos(ang), y: rm * Math.sin(ang) });
    if (rm < rGround && i > 0) { hitsGround = true; break; }
  }
  return { pts, hitsGround };
}

/** Altitude-style summary for HUDs */
export function apsides(o: Orbit, R: number) {
  return { ap: o.bound ? o.rA - R : Infinity, pe: o.rP - R, period: o.period, e: o.e };
}

/** Specific energy and angular momentum of a state — the two-body invariants */
export function invariants(r: Vec2, v: Vec2, mu: number) {
  return { energy: (v.x * v.x + v.y * v.y) / 2 - mu / Math.hypot(r.x, r.y), h: r.x * v.y - r.y * v.x };
}
