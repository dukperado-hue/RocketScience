/**
 * BoneRig — a tiny 2D forward-kinematics skeleton with springy secondary motion (Phase J3).
 *
 * Pure maths (no DOM): each bone has a LOCAL angle relative to its parent; world transforms are
 * composed parent-first; drawing sets ONE canvas matrix per bone with ctx.setTransform().
 *
 *   FK          world(bone) = world(parent) · T(at) · R(angle)          (root: frame · T(at) · R(angle))
 *   pose        target = rest + Σ weight_p · pose_p[bone]   — weights ease toward their targets (tweening)
 *   secondary   every bone is an angular spring integrated with Verlet:
 *
 *                 θ_new = θ + (θ − θ_prev)·(1 − damp·dt) + α·dt² − lag·(Δφ_parent − Δφ_parent,prev)
 *                 α     = −stiff·(θ − target) + inertia · 2 · (d × ΔF)
 *
 *               d   = the bone's direction in the rig frame
 *               ΔF  = apparent gravity the rig FEELS minus 1 g "down" (so a rig at rest on the pad
 *                     holds its pose exactly; extra g sags limbs, free fall lets them float up,
 *                     a jolt sets them swinging). ΔF also gets the centrifugal pull ω²·r of a spin.
 *               lag = how much a bone keeps its WORLD angular velocity when its parent's rotation
 *                     CHANGES (drag on a sudden turn, follow-through when it stops — no offset in a
 *                     steady spin, and independent of the step size)
 *
 * Detaching a bone returns a Fragment: that subtree keeps its pose and goes on flopping on its own
 * (a limb flying off), while the rig draws a stub where it was.
 */

/** 2D affine matrix in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
export function mul(p: Mat, q: Mat): Mat {
  return [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
}
/** translate(x, y) then rotate(a) */
export const tr = (x: number, y: number, a: number): Mat => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, x, y]; };
export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** Angle of the matrix's x axis */
export const angleOf = (m: Mat) => Math.atan2(m[1], m[0]);

export interface BoneSpec<Id extends string> {
  id: Id;
  parent: Id | null;
  /** Pivot in the parent's bone frame (x along the parent bone), metres */
  at: [number, number];
  len: number;
  /** Rest angle relative to the parent (rad) */
  rest: number;
  /** Spring stiffness (1/s²) and damping (1/s) */
  stiff: number;
  damp: number;
  /** How strongly felt acceleration swings it (0 = rigid) */
  inertia: number;
  /** 0–1: how much it keeps its world angle when the parent rotates (follow-through) */
  lag: number;
  /** Swing limit around the target (rad) */
  limit?: number;
}

export type Drawer = (ctx: CanvasRenderingContext2D, len: number) => void;

interface Bone<Id extends string> { spec: BoneSpec<Id>; a: number; aPrev: number; target: number; world: Mat; prevWorldAngle: number; dParPrev: number; attached: boolean }

const G = 9.81;

export class BoneRig<Id extends string, P extends string = string> {
  readonly bones = {} as Record<Id, Bone<Id>>;
  readonly order: Id[];
  /** Pose offsets from rest, per pose name */
  readonly poses: Record<P, Partial<Record<Id, number>>>;
  /** Current and target blend weights */
  readonly weights = {} as Record<P, number>;
  private want = {} as Record<P, number>;
  /** Extra per-bone target offsets set by the owner every frame (walk cycles, aiming) */
  readonly extra: Partial<Record<Id, number>> = {};
  /** Apparent gravity felt in the rig frame (m/s², y up). At rest on the ground: (0, −g). */
  felt = { x: 0, y: -G };
  /** Rig frame spin (rad/s) and its accumulated angle (drives follow-through of every bone) */
  spin = 0;
  private frameAngle = 0;
  private frameAnglePrev = 0;
  /** Easing time of pose blends (s) */
  blendTau = 0.25;
  /** Root frame matrix (where the rig sits in its owner's drawing frame) */
  frame: Mat = IDENTITY;

  constructor(specs: BoneSpec<Id>[], poses: Record<P, Partial<Record<Id, number>>>, start: P) {
    this.poses = poses;
    for (const p of Object.keys(poses) as P[]) { this.weights[p] = p === start ? 1 : 0; this.want[p] = this.weights[p]; }
    // parents first
    const left = [...specs], order: Id[] = [];
    while (left.length) {
      const i = left.findIndex((s) => s.parent === null || order.includes(s.parent));
      if (i < 0) throw new Error('BoneRig: cycle or missing parent');
      const s = left.splice(i, 1)[0];
      order.push(s.id);
      this.bones[s.id] = { spec: s, a: s.rest, aPrev: s.rest, target: s.rest, world: IDENTITY, prevWorldAngle: 0, dParPrev: 0, attached: true };
    }
    this.order = order;
    this.solve();
    for (const id of order) this.bones[id].prevWorldAngle = angleOf(this.bones[id].world);
  }

  /** Blend toward these pose weights (they are normalised) */
  blendTo(w: Partial<Record<P, number>>) {
    let sum = 0;
    for (const p of Object.keys(this.want) as P[]) { this.want[p] = Math.max(0, w[p] ?? 0); sum += this.want[p]; }
    if (sum <= 0) return;
    for (const p of Object.keys(this.want) as P[]) this.want[p] /= sum;
  }

  /** Feed the felt acceleration (rig frame, m/s², the way things FALL — y up) and spin rate */
  feel(fx: number, fy: number, spin = 0) {
    const m = 60 * G, L = Math.hypot(fx, fy);
    const k = L > m ? m / L : 1;
    this.felt.x = fx * k; this.felt.y = fy * k; this.spin = spin;
  }

  /** Advance the springs by dt seconds (sub-stepped for stability) */
  step(dt: number) {
    if (!(dt > 0)) return;
    const e = 1 - Math.exp(-dt / this.blendTau);
    for (const p of Object.keys(this.weights) as P[]) this.weights[p] += (this.want[p] - this.weights[p]) * e;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
  }

  private substep(h: number) {
    this.frameAnglePrev = this.frameAngle;
    this.frameAngle += this.spin * h;
    const dFx = this.felt.x, dFy = this.felt.y + G;                 // ΔF = felt − (0, −g)
    for (const id of this.order) {
      const b = this.bones[id], s = b.spec;
      if (!b.attached) continue;
      let target = s.rest + (this.extra[id] ?? 0);
      for (const p of Object.keys(this.weights) as P[]) target += this.weights[p] * (this.poses[p][id] ?? 0);
      b.target = target;
      // direction of the bone in the rig frame, and its pivot (for the centrifugal pull)
      const wa = angleOf(b.world), dx = Math.cos(wa), dy = Math.sin(wa);
      const px = b.world[4] - this.frame[4], py = b.world[5] - this.frame[5];
      const Fx = dFx + this.spin * this.spin * px, Fy = dFy + this.spin * this.spin * py;
      const alpha = -s.stiff * (b.a - target) + s.inertia * 2 * (dx * Fy - dy * Fx);
      // follow-through: keep part of the world angle when the parent (or the whole frame) turns
      const parentNow = s.parent ? angleOf(this.bones[s.parent].world) : this.frameAngle;
      const parentPrev = s.parent ? this.bones[s.parent].prevWorldAngle : this.frameAnglePrev;
      let dPar = parentNow - parentPrev;
      if (dPar > Math.PI) dPar -= 2 * Math.PI; else if (dPar < -Math.PI) dPar += 2 * Math.PI;
      const vel = (b.a - b.aPrev) * Math.max(0, 1 - s.damp * h);
      let next = b.a + vel + alpha * h * h - s.lag * (dPar - b.dParPrev);
      b.dParPrev = dPar;
      const lim = s.limit ?? 2.2;
      next = Math.max(target - lim, Math.min(target + lim, next));
      b.aPrev = b.a; b.a = next;
    }
    for (const id of this.order) this.bones[id].prevWorldAngle = angleOf(this.bones[id].world);
    this.solve();
  }

  /** Forward kinematics: compose world matrices parent-first */
  solve() {
    for (const id of this.order) {
      const b = this.bones[id], s = b.spec;
      const parent = s.parent ? this.bones[s.parent].world : this.frame;
      b.world = mul(parent, tr(s.at[0], s.at[1], b.a));
    }
  }

  /** World position of a point in a bone's frame */
  point(id: Id, x = 0, y = 0) { return apply(this.bones[id].world, x, y); }
  worldAngle(id: Id) { return angleOf(this.bones[id].world); }

  /** Every bone below (and including) `id` */
  subtree(id: Id): Id[] {
    const out: Id[] = [id];
    for (const o of this.order) if (o !== id && this.bones[o].spec.parent && out.includes(this.bones[o].spec.parent!)) out.push(o);
    return out;
  }

  /** Cut a subtree off the rig; it keeps flopping as a Fragment */
  detach(id: Id, drawers: Partial<Record<Id, Drawer>>): Fragment<Id> | null {
    if (!this.bones[id]?.attached) return null;
    const ids = this.subtree(id);
    for (const o of ids) this.bones[o].attached = false;
    return new Fragment(ids.map((o) => ({ ...this.bones[o].spec, parent: o === id ? null : this.bones[o].spec.parent, at: o === id ? [0, 0] as [number, number] : this.bones[o].spec.at, a0: o === id ? 0 : this.bones[o].a, v0: this.bones[o].a - this.bones[o].aPrev })), drawers);
  }

  isAttached(id: Id) { return this.bones[id].attached; }

  /**
   * Draw: for each attached bone in `drawOrder`, set the canvas matrix to base · world(bone)
   * with ctx.setTransform and call its drawer in the bone's own frame (x along the bone).
   */
  draw(ctx: CanvasRenderingContext2D, drawers: Partial<Record<Id, Drawer>>, drawOrder: Id[] = this.order) {
    const T = ctx.getTransform(), base: Mat = [T.a, T.b, T.c, T.d, T.e, T.f];
    for (const id of drawOrder) {
      const b = this.bones[id], d = drawers[id];
      if (!b.attached || !d) continue;
      const m = mul(base, b.world);
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      d(ctx, b.spec.len);
    }
    ctx.setTransform(T);
  }
}

interface FragBone<Id extends string> extends BoneSpec<Id> { a0: number; v0: number }

/**
 * A piece that came off: same bones, now limp (low stiffness toward its pose at the moment it
 * broke), tumbling with whatever holds it (a particle). Drawn centred on its own middle.
 */
export class Fragment<Id extends string> {
  private bones: { spec: FragBone<Id>; a: number; aPrev: number; world: Mat }[];
  private t = 0;
  /** spin of the carrier (rad/s) — flings the joints */
  spin = 0;
  private centre: [number, number] = [0, 0];

  constructor(specs: FragBone<Id>[], private drawers: Partial<Record<Id, Drawer>>) {
    this.bones = specs.map((s) => ({ spec: s, a: s.a0, aPrev: s.a0 - s.v0, world: IDENTITY }));
    this.solve();
    // centre the piece on the midpoint of its chain, so it tumbles about its middle
    const ends = this.bones.map((b) => apply(b.world, b.spec.len, 0));
    const xs = [0, ...ends.map((e) => e[0])], ys = [0, ...ends.map((e) => e[1])];
    this.centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  }

  get ids() { return this.bones.map((b) => b.spec.id); }

  private solve() {
    for (const b of this.bones) {
      const parent = b.spec.parent ? this.bones.find((p) => p.spec.id === b.spec.parent)!.world : IDENTITY;
      b.world = mul(parent, tr(b.spec.at[0], b.spec.at[1], b.a));
    }
  }

  step(dt: number) {
    if (!(dt > 0)) return;
    this.t += dt;
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) for (const b of this.bones) {
      if (!b.spec.parent) continue;                                   // the root rides the carrier
      // limp: a quarter of the stiffness, plus the carrier's spin flinging the joint open
      const alpha = -b.spec.stiff * 0.25 * (b.a - b.spec.a0) + this.spin * this.spin * 0.08 * Math.sin(b.a) + 6 * Math.sin(this.t * 7 + b.spec.len * 40);
      const vel = (b.a - b.aPrev) * Math.max(0, 1 - b.spec.damp * 0.6 * h);
      const next = b.a + vel + alpha * h * h;
      b.aPrev = b.a; b.a = Math.max(b.spec.a0 - 2.4, Math.min(b.spec.a0 + 2.4, next));
    }
    this.solve();
  }

  draw(ctx: CanvasRenderingContext2D) {
    const T = ctx.getTransform(), base = mul([T.a, T.b, T.c, T.d, T.e, T.f], tr(-this.centre[0], -this.centre[1], 0));
    for (const b of this.bones) {
      const d = this.drawers[b.spec.id];
      if (!d) continue;
      const m = mul(base, b.world);
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      d(ctx, b.spec.len);
    }
    ctx.setTransform(T);
  }

  /** Angle of a joint (for tests) */
  angle(id: Id) { return this.bones.find((b) => b.spec.id === id)!.a; }
}
