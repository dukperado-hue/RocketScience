/**
 * Full-envelope (360° angle-of-attack) aerodynamics for planar rigid bodies.
 *
 * Strip / component build-up — every part is its own aerodynamic panel and
 * sees its OWN local airflow, which includes the body's rotation (v + ω × r).
 * That one detail gives pitch damping, cartwheel braking and the fin that
 * stalls on the downswing for free; there is no fudge "damping" term.
 *
 *   Leading end (nose or tail — whichever meets the air first)
 *     slender-body normal force  CN = CNα_lead · sin αL · cos αL   (Barrowman CNα = 2)
 *     acts at the leading end: 0.466 L back from a cone tip, at the face for a blunt end.
 *     Folded leading-edge angle αL ∈ [0°, 90°] → works nose-first AND tail-first.
 *
 *   Bodies (tubes, tanks, chairs, engines) — viscous crossflow (Allen–Perkins)
 *     F⊥ = −½ ρ · Cdc(Mc) · A_side · u⊥ |u⊥|          (∝ sin²α, peaks flying sideways)
 *     Cdc rises from 1.2 to 1.7 as the crossflow Mach number goes transonic.
 *
 *   Plates (fins, wings) — flat plate with stall, separation and reverse flow
 *     attached:  CN = CLα · sin α cos α,  CLα = 2πA / (2 + √(A² + 4))   (Helmbold, low-A)
 *                supersonic CLα = 4 / √(M² − 1)                          (Ackeret)
 *     separated: CN = CD90 · sin α                                        (Hoerner flat plate)
 *     blended by a stall sigmoid at αs(A); reverse flow (trailing edge first):
 *       CLα × 0.8 and stall at 0.6 αs → "reverse lift" with an early stall
 *     centre of pressure walks from the Barrowman point (attached) to the planform
 *     centroid (separated), measured from whichever edge is leading; body–fin
 *     interference 1 + R/(s + R).
 *     Canted fins add roll torque → spin (Bang Fai / Talai spin stabilisation).
 *
 *   Axial drag — whole vehicle, frontal area, separate Cd nose-first / tail-first,
 *     transonic drag rise.
 *
 * Pure maths: no imports from the factory, so the factory's pre-flight check
 * and the flight simulator use exactly the same model.
 */

export interface AeroPanel {
  uid: number;
  kind: 'body' | 'plate';
  /** Centre in the body frame (m) */
  x: number; y: number;
  /** Unit axis in the body frame: tube axis / plate chord, pointing to the part's designed leading edge */
  ax: number; ay: number;
  /** Side-on (or planform) area, m² */
  area: number;
  /** Length along the axis, m */
  chord: number;
  /** Plates: aspect ratio of the exposed fin (span² / area) */
  aspect: number;
  /** Plates: cant angle (rad) → roll torque; radial distance of the fin's centre from the roll axis */
  cant: number;
  rollArm: number;
  /** Plates: centre of pressure as a fraction of chord from the designed leading edge,
   *  attached flow (Barrowman) and fully separated flow (planform area centroid) */
  xcpAtt: number;
  xcpSep: number;
  /** Plates: body–fin interference factor 1 + R/(s + R) (Barrowman) */
  interference: number;
}

export interface AeroBody {
  panels: AeroPanel[];
  frontArea: number;
  /** Frontal-area x-centroid (body frame) — where axial drag pushes */
  frontX: number;
  cdFwd: number;   // nose-first
  cdAft: number;   // tail-first
  /** Ends of the stack and how pointed they are */
  topY: number; bottomY: number;
  topCone: number;     // length of a pointed nose at the top (0 = blunt)
  bottomCone: number;
}

export interface FlowState {
  /** Air-relative velocity of the reference point, body frame (m/s) */
  u: number; v: number;
  /** Pitch rate (rad/s) */
  om: number;
  /** Reference point the moment is taken about (the CoM), body frame */
  cx: number; cy: number;
  rho: number;
  /** Speed of sound (m/s) */
  a: number;
  /** Roll rate about the long axis (rad/s) — for canted-fin roll damping */
  p?: number;
  /** Treat every panel as on the centreline (for the out-of-plane yaw plane) */
  centreline?: boolean;
  /** Extra side area removed per panel uid (lost zombie limbs…) */
  areaLoss?: Map<number, number>;
}

export interface AeroLoads {
  /** Force in the body frame (N) and pitching moment about (cx, cy) (N·m), +CCW */
  fx: number; fy: number; m: number;
  /** Roll torque (N·m) */
  roll: number;
  /** Whole-vehicle angle of attack (rad, −π…π): 0 = nose-first, ±π = tail-first */
  alpha: number;
  mach: number;
  /** Fraction of fin area whose flow has separated (0…1) */
  stalled: number;
  /** True if the flow meets the tail first */
  reversed: boolean;
}

const TWO_PI = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Transonic drag rise on the axial drag coefficient */
export function waveDrag(M: number): number {
  if (M <= 1.1) return 1 + 1.2 * smooth(0.75, 1.1, M);
  return 1 + 1.2 * (1.1 / M) ** 1.5;
}

/** Crossflow drag coefficient of a circular body vs crossflow Mach number */
export const crossflowCd = (Mc: number) => 1.2 + 0.5 * smooth(0.4, 1.2, Mc);

/** Lift-curve slope of a low-aspect-ratio flat plate (per rad) */
export function plateCLa(aspect: number, M: number): number {
  const sub = (TWO_PI * aspect) / (2 + Math.sqrt(aspect * aspect + 4));
  if (M < 1.05) return sub;
  return Math.min(sub, 4 / Math.sqrt(Math.max(1e-3, M * M - 1)));
}

/** Stall angle of a flat plate (rad): low aspect ratios stall later */
export const plateStall = (aspect: number) => ((12 + 18 / (1 + aspect)) * Math.PI) / 180;

/**
 * Flat-plate normal-force coefficient for ANY angle (rad, folded to 0…90° internally),
 * plus the separated fraction and the centre-of-pressure position (fraction of chord
 * from the leading edge).
 */
export function plateCN(alpha: number, aspect: number, M: number, reversed: boolean, xcpAtt = 0.25, xcpSep = 0.5) {
  const af = Math.atan2(Math.abs(Math.sin(alpha)), Math.abs(Math.cos(alpha)));   // 0…π/2
  const cla = plateCLa(aspect, M) * (reversed ? 0.8 : 1);
  const as = plateStall(aspect) * (reversed ? 0.6 : 1);
  const attached = 1 / (1 + Math.exp((af - as) / 0.035));                       // ≈2° wide stall
  const cnAtt = cla * Math.sin(af) * Math.cos(af);
  const cnSep = 1.2 * Math.sin(af);                                            // CD90 ≈ 1.2, low-A plate
  return {
    cn: attached * cnAtt + (1 - attached) * cnSep,
    separated: 1 - attached,
    // Flown backwards the plate's geometry is reversed: quarter-chord when attached,
    // the mirrored area centroid when separated
    xcp: reversed ? 0.25 * attached + (1 - xcpSep) * (1 - attached) : xcpAtt * attached + xcpSep * (1 - attached),
  };
}

/** Loads on the whole vehicle for one flow state. */
export function aeroLoads(b: AeroBody, s: FlowState): AeroLoads {
  let fx = 0, fy = 0, m = 0, roll = 0, stalledA = 0, plateA = 0;
  const V = Math.hypot(s.u, s.v);
  const M = V / s.a;
  const alpha = Math.atan2(s.u, s.v);           // 0 = moving nose-first along +y
  const reversed = s.v < 0;
  const add = (Fx: number, Fy: number, px: number, py: number) => {
    fx += Fx; fy += Fy;
    m += (px - s.cx) * Fy - (py - s.cy) * Fx;
  };
  if (V < 1e-6) return { fx, fy, m, roll, alpha: 0, mach: 0, stalled: 0, reversed: false };

  // 1) Axial drag on the frontal area, nose-first or tail-first Cd
  const cd = (reversed ? b.cdAft : b.cdFwd) * waveDrag(M);
  add(0, -0.5 * s.rho * b.frontArea * cd * s.v * Math.abs(s.v), s.centreline ? s.cx : b.frontX, s.cy);

  // 2) Leading-end slender-body normal force (nose-first: the top; tail-first: the bottom)
  const aL = Math.atan2(Math.abs(s.u), Math.abs(s.v));
  const q = 0.5 * s.rho * V * V;
  const nLead = q * b.frontArea * 2 * Math.sin(aL) * Math.cos(aL);
  const cone = reversed ? b.bottomCone : b.topCone;
  const yLead = reversed ? b.bottomY + 0.466 * cone : b.topY - 0.466 * cone;
  add(-Math.sign(s.u) * nLead, 0, s.centreline ? s.cx : 0, yLead);

  // 3) Panels, each in its own local flow (includes rotation)
  for (const pn of b.panels) {
    const px = s.centreline ? s.cx : pn.x;
    const rx = px - s.cx, ry = pn.y - s.cy;
    const lu = s.u - s.om * ry, lv = s.v + s.om * rx;      // panel velocity through the air
    const ua = lu * pn.ax + lv * pn.ay;                    // along the axis
    const nx = -pn.ay, ny = pn.ax;                         // in-plane normal
    const un = lu * nx + lv * ny;
    const vl2 = ua * ua + un * un;
    if (vl2 < 1e-9) continue;
    const area = Math.max(0, pn.area - (s.areaLoss?.get(pn.uid) ?? 0));
    if (pn.kind === 'body') {
      const Mc = Math.abs(un) / s.a;
      const Fn = -0.5 * s.rho * crossflowCd(Mc) * area * un * Math.abs(un);
      add(Fn * nx, Fn * ny, px, pn.y);
      continue;
    }
    const ql = 0.5 * s.rho * vl2;
    const rev = ua < 0;                                   // flow meets the trailing edge first
    const pa = Math.atan2(un, ua);
    const Ml = Math.sqrt(vl2) / s.a;
    const { cn, separated, xcp } = plateCN(pa, pn.aspect, Ml, rev, pn.xcpAtt, pn.xcpSep);
    const Fn = -Math.sign(un) * ql * area * cn * (s.centreline ? 1 : pn.interference);
    const Fa = -Math.sign(ua) * ql * area * 0.02;          // skin friction along the chord
    // CP measured from the edge that is leading right now
    const lead = rev ? -1 : 1;
    const off = lead * (0.5 - xcp) * pn.chord;
    add(Fn * nx + Fa * pn.ax, Fn * ny + Fa * pn.ay, px + off * pn.ax, pn.y + off * pn.ay);
    plateA += area; stalledA += area * separated;
    // Canted fin: roll drive minus roll damping (only meaningful with attached-ish forward flow)
    if (pn.cant !== 0 && !rev) {
      const cla = plateCLa(pn.aspect, Ml);
      const p = s.p ?? 0;
      const Vax = Math.max(1, Math.abs(ua));
      roll += ql * area * cla * (pn.cant - (p * pn.rollArm) / Vax) * pn.rollArm * (1 - separated);
    }
  }
  return { fx, fy, m, roll, alpha, mach: M, stalled: plateA > 0 ? stalledA / plateA : 0, reversed };
}

/**
 * Centre of pressure (body-frame y) from the same model, as the secant
 * between ±4° — small enough for fins to be attached, large enough that the
 * crossflow drag of a Bang Fai's tail stick counts. Used by the factory's
 * pre-flight check, so the warning and the flight agree.
 */
export function linearCP(b: AeroBody, cy: number, a = 340, deg = 4): number | null {
  const V = 100, d = (deg * Math.PI) / 180;
  const at = (al: number) => aeroLoads(b, { u: V * Math.sin(al), v: V * Math.cos(al), om: 0, cx: 0, cy, rho: 1.225, a });
  const p = at(d), n = at(-d);
  const dN = p.fx - n.fx;
  if (Math.abs(dN) < 1e-9) return null;
  // m = −(y_cp − cy)·Fx  →  y_cp = cy − dm/dFx
  return cy - (p.m - n.m) / dN;
}
