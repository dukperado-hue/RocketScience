/**
 * Capybara on a bone rig — the screen-wipe janitor (Phase J3), used until a painted sprite sheet
 * (assets/capcom/capybara_mop_sheet.png) exists. Same BoneRig engine as the zombie.
 *
 *   body ─┬─ head
 *         ├─ thighB ── footB          (far side, drawn darker, behind)
 *         ├─ thighF ── footF          (near side)
 *         ├─ armB ── pawB
 *         └─ armF ── pawF ── handle ── mopHead
 *
 * Units: 1 = the capybara's height, y up, origin on the ground under its middle, facing +x.
 * update(t) drives a waddle (legs swing in antiphase, body bobs and rocks) and a push–pull of the
 * mop (both arms, the handle aimed in WORLD angle). The mop head is a soft spring with high lag,
 * so the strands trail behind every push — that drag is the secondary motion.
 */
import { BoneRig, type BoneSpec, type Drawer, tr } from './boneRig';
import { celFill, CEL, shade } from '@/vfx/celStyle';

export type CBone = 'body' | 'head' | 'thighB' | 'footB' | 'thighF' | 'footF' | 'armB' | 'pawB' | 'armF' | 'pawF' | 'handle' | 'mopHead';

const FUR = '#b07a45', FUR_DARK = '#8a5a30', VEST = '#ff8a1f', STRIPE = '#eef3f6';
const HALF_PI = Math.PI / 2;

const capsule = (len: number, w: number) => { const p = new Path2D(); p.roundRect(-w / 2, -w / 2, len + w, w, w / 2); return p; };

export function capybaraSkeleton(): BoneSpec<CBone>[] {
  const B = (o: Partial<BoneSpec<CBone>> & Pick<BoneSpec<CBone>, 'id' | 'parent' | 'at' | 'len' | 'rest'>): BoneSpec<CBone> => ({ stiff: 700, damp: 32, inertia: 0, lag: 0, ...o })   // limbs track their drive tightly;
  return [
    B({ id: 'body', parent: null, at: [0, 0.36], len: 0.5, rest: 0, stiff: 400, lag: 0 }),
    B({ id: 'head', parent: 'body', at: [0.46, 0.14], len: 0.32, rest: 0.1, stiff: 150, damp: 6, lag: 0.55, limit: 0.5 }),
    B({ id: 'thighB', parent: 'body', at: [-0.2, -0.08], len: 0.15, rest: -HALF_PI }),
    B({ id: 'footB', parent: 'thighB', at: [0.15, 0], len: 0.09, rest: 0.35 }),
    B({ id: 'thighF', parent: 'body', at: [0.3, -0.08], len: 0.15, rest: -HALF_PI }),
    B({ id: 'footF', parent: 'thighF', at: [0.15, 0], len: 0.09, rest: 0.35 }),
    B({ id: 'armB', parent: 'body', at: [0.4, 0.06], len: 0.14, rest: -0.6 }),
    B({ id: 'pawB', parent: 'armB', at: [0.14, 0], len: 0.08, rest: 0.6 }),
    B({ id: 'armF', parent: 'body', at: [0.38, 0.03], len: 0.15, rest: -0.6 }),
    B({ id: 'pawF', parent: 'armF', at: [0.15, 0], len: 0.08, rest: 0.6 }),
    B({ id: 'handle', parent: 'pawF', at: [0.06, 0], len: 1.05, rest: 0, stiff: 500, damp: 8, lag: 0, limit: 1.6 }),
    B({ id: 'mopHead', parent: 'handle', at: [1.05, 0], len: 0.3, rest: -0.35, stiff: 45, damp: 3, lag: 0.85, limit: 1.4 }),
  ];
}

export class CapybaraRig {
  readonly rig = new BoneRig<CBone, 'walk'>(capybaraSkeleton(), { walk: {} }, 'walk');
  private lw = 0.004;
  private drawers = this.makeDrawers();
  /** Current mop push (−1 pulled back … +1 pushed out) */
  push = 0;

  /**
   * t: seconds; walk: stride phase speed (strides/s); pushHz: mop strokes per second;
   * reach: how far up (+) / down (−) the stroke aims, −1…1 (moves the wipe band); stroke: half-swing of the handle (rad)
   */
  update(t: number, dt: number, walk = 1.6, pushHz = 0.9, reach = 0, stroke = 0.42) {
    const ph = t * walk * Math.PI * 2;
    this.push = Math.sin(t * pushHz * Math.PI * 2);
    const e = this.rig.extra;
    // waddle: legs in antiphase, feet flick on the up-swing
    e.thighF = -0.5 * Math.sin(ph); e.thighB = 0.5 * Math.sin(ph);
    e.footF = 0.45 * Math.max(0, Math.sin(ph + 1.2)); e.footB = 0.45 * Math.max(0, Math.sin(ph + Math.PI + 1.2));
    // the mop: arms push out and pull back; the handle is aimed in world angle
    e.armF = 0.2 + 0.55 * this.push; e.pawF = -0.25 * this.push;
    e.armB = 0.1 + 0.45 * Math.sin(t * pushHz * Math.PI * 2 - 0.4); e.pawB = -0.2 * this.push;
    e.head = 0.06 * Math.sin(ph * 2) - 0.05 * this.push;
    // body: bob twice per stride, rock a little
    const rock = 0.035 * Math.sin(ph);
    this.rig.frame = tr(0, 0.022 * Math.abs(Math.sin(ph)), rock);
    // aim the handle in world angle, measured against the arm chain's TARGET (not its sprung
    // angle — that would feed the arm's wobble back into the aim and make the mop thrash)
    const B = this.rig.bones, wantHandle = -0.15 + 0.5 * reach + stroke * this.push;
    const pawTarget = rock + B.body.spec.rest + B.armF.spec.rest + (e.armF ?? 0) + B.pawF.spec.rest + (e.pawF ?? 0);
    e.handle = wantHandle - pawTarget;
    this.rig.feel(0, -9.81, 0);
    this.rig.step(dt);
  }

  /** Mop head centre in rig units (to erase slime there) */
  mopPoint(): [number, number] { return this.rig.point('mopHead', 0.18, 0); }

  draw(ctx: CanvasRenderingContext2D, lw: number) {
    this.lw = lw;
    this.rig.draw(ctx, this.drawers, ['armB', 'pawB', 'thighB', 'footB', 'body', 'thighF', 'footF', 'head', 'handle', 'mopHead', 'armF', 'pawF']);
  }

  private makeDrawers(): Record<CBone, Drawer> {
    const limb = (col: string, w: number): Drawer => (ctx, len) => celFill(ctx, capsule(len, w), col, this.lw);
    const foot = (col: string): Drawer => (ctx, len) => { const p = new Path2D(); p.ellipse(len * 0.5, 0, len * 0.75, 0.04, 0, 0, Math.PI * 2); celFill(ctx, p, col, this.lw); };
    return {
      thighB: limb(FUR_DARK, 0.1), footB: foot(shade(FUR_DARK, 0.25)),
      thighF: limb(FUR, 0.11), footF: foot(FUR_DARK),
      armB: limb(FUR_DARK, 0.075), pawB: foot(shade(FUR_DARK, 0.25)),
      armF: limb(FUR, 0.08), pawF: (ctx, len) => { const p = new Path2D(); p.ellipse(len * 0.4, 0, len * 0.7, 0.045, 0, 0, Math.PI * 2); celFill(ctx, p, FUR_DARK, this.lw); },
      body: (ctx) => {
        const barrel = new Path2D(); barrel.ellipse(0.13, 0.06, 0.42, 0.25, 0, 0, Math.PI * 2);
        celFill(ctx, barrel, FUR, this.lw, { x: 0.2, y: -0.12, r: 0.32 }, { x: 0.0, y: 0.22, r: this.lw * 3 });
        // hi-vis vest, clipped to the barrel
        ctx.save(); ctx.clip(barrel);
        ctx.fillStyle = VEST; ctx.fillRect(-0.02, -0.25, 0.36, 0.6);
        ctx.fillStyle = STRIPE; for (const x of [0.04, 0.24]) ctx.fillRect(x, -0.25, 0.045, 0.6);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-0.02, -0.25, 0.36, 0.12);
        ctx.restore();
        ctx.strokeStyle = CEL.ink; ctx.lineWidth = this.lw * 2; ctx.stroke(barrel);
        const tail = new Path2D(); tail.arc(-0.29, 0.1, 0.035, 0, Math.PI * 2); celFill(ctx, tail, FUR_DARK, this.lw);
      },
      head: (ctx) => {
        const h = new Path2D(); h.roundRect(-0.05, -0.11, 0.36, 0.22, [0.1, 0.12, 0.09, 0.08]);
        celFill(ctx, h, FUR, this.lw, { x: 0.18, y: -0.1, r: 0.16 }, { x: 0.05, y: 0.08, r: this.lw * 2.5 });
        const snout = new Path2D(); snout.roundRect(0.18, -0.1, 0.14, 0.15, 0.05); celFill(ctx, snout, shade(FUR, 0.18), this.lw);
        ctx.fillStyle = CEL.ink;
        ctx.beginPath(); ctx.ellipse(0.29, 0.02, 0.014, 0.01, 0, 0, Math.PI * 2); ctx.fill();               // nostril
        ctx.strokeStyle = CEL.ink; ctx.lineWidth = this.lw * 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0.11, 0.03, 0.03, Math.PI * 1.1, Math.PI * 1.9, true); ctx.stroke();      // serene closed eye
        ctx.beginPath(); ctx.moveTo(0.22, -0.06); ctx.quadraticCurveTo(0.26, -0.08, 0.3, -0.06); ctx.stroke();   // tiny smile
        const ear = new Path2D(); ear.ellipse(0.0, 0.11, 0.035, 0.028, -0.4, 0, Math.PI * 2); celFill(ctx, ear, FUR_DARK, this.lw);
        // headphones (it listens to lo-fi while it mops)
        ctx.strokeStyle = '#3d4450'; ctx.lineWidth = this.lw * 5;
        ctx.beginPath(); ctx.arc(0.06, 0.0, 0.13, Math.PI * 0.15, Math.PI * 0.75); ctx.stroke();
        const cup = new Path2D(); cup.roundRect(-0.01, -0.05, 0.07, 0.1, 0.03); celFill(ctx, cup, '#4b5563', this.lw);
      },
      handle: (ctx, len) => {
        ctx.strokeStyle = CEL.ink; ctx.lineWidth = this.lw * 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
        ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = this.lw * 4; ctx.stroke();
      },
      mopHead: (ctx, len) => {
        // red clamp, then strands fanning out and trailing (they bend more the faster it swings)
        const clamp = new Path2D(); clamp.roundRect(-0.03, -0.06, 0.06, 0.12, 0.015); celFill(ctx, clamp, '#e2483d', this.lw);
        const bend = (this.rig.bones.mopHead.a - this.rig.bones.mopHead.target) * 0.6;
        for (let i = -5; i <= 5; i++) {
          const y0 = i * 0.011, y1 = i * 0.03 + bend * 0.12, cy = i * 0.02 + bend * 0.06;
          ctx.strokeStyle = CEL.ink; ctx.lineWidth = this.lw * 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0.02, y0); ctx.quadraticCurveTo(len * 0.5, cy, len, y1); ctx.stroke();
          ctx.strokeStyle = i % 3 ? '#f2efe4' : shade(CEL.slime, 0.1); ctx.lineWidth = this.lw * 3; ctx.stroke();
        }
      },
    };
  }
}
