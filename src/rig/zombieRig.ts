/**
 * The zombie on a bone rig (Phase J3): 10 bones, three blended poses, springy limbs that feel
 * the rocket's real acceleration, and limbs that come off as flopping Fragments.
 *
 *   torso ─┬─ head
 *          ├─ upperArmL ── lowerArmL        ├─ thighL ── calfL
 *          └─ upperArmR ── lowerArmR        └─ thighR ── calfR
 *
 * Frame: the seat frame used by drawZombie (metres, y up, origin at the seat-top centre, front
 * view), so it drops into the chair exactly where the old static drawing was. Geometry, colours
 * and the face come from vfx/zombieArt.ts.
 *
 *   idle    sitting, breathing a little
 *   highG   pressed into the seat: arms dragged down, legs splayed (blends in from ~1.8 g)
 *   float   zero g: arms drift up and forward, legs drift apart (blends in below ~0.6 g)
 */
import { BoneRig, Fragment, type BoneSpec, type Drawer } from './boneRig';
import { BUILD, BONE, capsule, face, drawBoneStub } from '@/vfx/zombieArt';
import { celFill, CEL } from '@/vfx/celStyle';
import { ZOMBIES, type Limb, type ZombieId } from '@/payload/zombies';
import { ZSPR, drawSprite, loadZombieSprites, spritesReady } from './zombieSprites';

export type ZBone = 'torso' | 'head' | 'upperArmL' | 'lowerArmL' | 'upperArmR' | 'lowerArmR' | 'thighL' | 'calfL' | 'thighR' | 'calfR';
export type ZPose = 'idle' | 'highG' | 'float';

const LIMB_ROOT: Record<Limb, ZBone> = { 'left arm': 'upperArmL', 'right arm': 'upperArmR', 'left leg': 'thighL', 'right leg': 'thighR', head: 'head' };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const PANTS = '#4b5568';

/** Bones laid out to reproduce drawZombie's seated pose exactly (see the comments for the world numbers) */
export function zombieSkeleton(id: ZombieId): BoneSpec<ZBone>[] {
  const b = BUILD[id], sx = b.torsoW / 2;
  const legRel = Math.atan2(-0.38, -sx * 0.15) - Math.PI / 2;       // world leg angle relative to the torso (pointing up)
  const legRelR = Math.atan2(-0.38, sx * 0.15) - Math.PI / 2;
  const armRel = Math.atan2(0.12, -0.16) - Math.PI / 2;              // ≈ +53°: arms reach up and out
  const L = (o: Partial<BoneSpec<ZBone>> & Pick<BoneSpec<ZBone>, 'id' | 'parent' | 'at' | 'len' | 'rest'>): BoneSpec<ZBone> => ({ stiff: 120, damp: 4, inertia: 1, lag: 0.5, ...o });
  return [
    // torso pivot at the seat (world 0, −0.06), pointing up; stiff and nearly rigid (it is strapped in)
    L({ id: 'torso', parent: null, at: [0, -0.06], len: b.torsoH, rest: Math.PI / 2, stiff: 420, inertia: 0.12, lag: 0, limit: 0.25 }),
    // torso frame: x = up, y = left.  neck at world (0, torsoH − 0.04)
    L({ id: 'head', parent: 'torso', at: [b.torsoH + 0.02, 0], len: b.headR * 1.6, rest: 0, stiff: 160, inertia: 0.55, lag: 0.4, limit: 0.7 }),
    // shoulders at world (∓sx, 0.26) → torso frame (0.32, ±sx)
    // the old arm was 0.2 m (0.16 out, 0.12 up): two 0.1 m bones
    L({ id: 'upperArmL', parent: 'torso', at: [0.32, sx], len: 0.1, rest: armRel }),
    L({ id: 'lowerArmL', parent: 'upperArmL', at: [0.1, 0], len: 0.1, rest: 0, stiff: 90, inertia: 1.2, lag: 0.7 }),
    L({ id: 'upperArmR', parent: 'torso', at: [0.32, -sx], len: 0.1, rest: -armRel }),
    L({ id: 'lowerArmR', parent: 'upperArmR', at: [0.1, 0], len: 0.1, rest: 0, stiff: 90, inertia: 1.2, lag: 0.7 }),
    // hips at world (∓0.55 sx, −0.04) → torso frame (0.02, ±0.55 sx)
    L({ id: 'thighL', parent: 'torso', at: [0.02, sx * 0.55], len: 0.19, rest: legRel, stiff: 170, inertia: 0.5, lag: 0.2, limit: 1.2 }),
    L({ id: 'calfL', parent: 'thighL', at: [0.19, 0], len: 0.19, rest: 0, stiff: 100, inertia: 0.8, lag: 0.5, limit: 1.4 }),
    L({ id: 'thighR', parent: 'torso', at: [0.02, -sx * 0.55], len: 0.19, rest: legRelR, stiff: 170, inertia: 0.5, lag: 0.2, limit: 1.2 }),
    L({ id: 'calfR', parent: 'thighR', at: [0.19, 0], len: 0.19, rest: 0, stiff: 100, inertia: 0.8, lag: 0.5, limit: 1.4 }),
  ];
}

/** Pose offsets from rest (rad, counter-clockwise positive in the y-up frame) */
export const ZOMBIE_POSES: Record<ZPose, Partial<Record<ZBone, number>>> = {
  idle: {},
  highG: { upperArmL: 1.0, lowerArmL: 0.6, upperArmR: -1.0, lowerArmR: -0.6, thighL: -0.45, thighR: 0.45, head: 0.22 },
  float: { upperArmL: -0.6, lowerArmL: -0.25, upperArmR: 0.6, lowerArmR: 0.25, thighL: -0.7, calfL: 0.5, thighR: 0.7, calfR: -0.5, head: -0.15 },
};

export class ZombieRig {
  readonly rig: BoneRig<ZBone, ZPose>;
  private drawers: Record<ZBone, Drawer>;
  private lw = 0.01;
  private t = 0;
  /** Bones that came off: their last angle relative to the torso (where the stub points) */
  private stubs = new Map<ZBone, number>();

  constructor(readonly id: ZombieId, limbs: ReadonlySet<Limb> = new Set(Object.keys(LIMB_ROOT) as Limb[])) {
    this.rig = new BoneRig<ZBone, ZPose>(zombieSkeleton(id), ZOMBIE_POSES, 'idle');
    loadZombieSprites();
    const vector = this.makeDrawers(), art = this.makeArtDrawers();
    // painted parts once they have loaded; the vector cartoon until then (and in tests)
    this.drawers = Object.fromEntries((Object.keys(vector) as ZBone[]).map((k) => [k, ((ctx, len) => (spritesReady() ? art[k] : vector[k])(ctx, len)) as Drawer])) as Record<ZBone, Drawer>;
    this.sync(limbs);
  }

  /** How much of each pose we are blending (for the HUD / tests) */
  get weights() { return this.rig.weights; }

  /**
   * Feel the flight. `felt` = apparent gravity in the seat frame (m/s², y up: (0, −9.81) sitting on
   * the pad, (0, −49) at 5 g of thrust, (0, 0) in free fall); `spin` = rad/s.
   */
  update(dt: number, felt: { x: number; y: number }, spin = 0) {
    if (!(dt > 0)) return;
    this.t += dt;
    const g = Math.hypot(felt.x, felt.y) / 9.81;
    const float = 1 - smooth(0.15, 0.6, g), high = smooth(1.8, 5, g);
    this.rig.blendTo({ idle: Math.max(0.0001, 1 - float - high), highG: high, float });
    // idle life: a slow breath in the arms and a slight head wobble (zombies breathe? apparently)
    const br = Math.sin(this.t * 1.9) * 0.05;
    Object.assign(this.rig.extra, { upperArmL: br, upperArmR: -br, head: Math.sin(this.t * 1.3) * 0.04 });
    this.rig.feel(felt.x, felt.y, spin);
    this.rig.step(dt);
  }

  /** Make the rig match the flight's limb list (limbs lost without a Fragment) */
  sync(limbs: ReadonlySet<Limb>) {
    for (const l of Object.keys(LIMB_ROOT) as Limb[]) if (!limbs.has(l) && this.rig.isAttached(LIMB_ROOT[l])) this.cut(l);
  }

  /** A limb comes off: the subtree leaves the rig as a Fragment (null if it was already gone) */
  detach(limb: Limb): Fragment<ZBone> | null {
    if (!this.rig.isAttached(LIMB_ROOT[limb])) return null;
    const root = LIMB_ROOT[limb];
    const fd: Partial<Record<ZBone, Drawer>> = { ...this.drawers };
    const base = this.drawers[root];
    fd[root] = (ctx, len) => { if (spritesReady()) this.tornEndArt(ctx); else this.tornEnd(ctx, root === 'head' ? 0.04 : 0); base(ctx, len); };
    const frag = this.rig.detach(root, fd);
    this.stubs.set(root, this.rig.bones[root].a);
    return frag;
  }

  private cut(limb: Limb) { const root = LIMB_ROOT[limb]; this.stubs.set(root, this.rig.bones[root].a); this.rig.detach(root, {}); }

  attached(limb: Limb) { return this.rig.isAttached(LIMB_ROOT[limb]); }

  /** Draw in the seat frame (same origin and scale as drawZombie) */
  draw(ctx: CanvasRenderingContext2D, lw: number) {
    this.lw = lw;
    this.rig.draw(ctx, this.drawers, ['thighL', 'calfL', 'thighR', 'calfR', 'torso', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'head']);
  }

  /* ---------- drawers: each runs in its bone's frame (x along the bone) ---------- */
  private makeDrawers(): Record<ZBone, Drawer> {
    const z = ZOMBIES[this.id], b = BUILD[this.id], skin = z.skin;
    const shirt = this.id === 'fat' ? '#c9785a' : this.id === 'brittle' ? '#8a7f6a' : '#5f7fa8';
    const upright = (ctx: CanvasRenderingContext2D) => ctx.rotate(-Math.PI / 2);   // bone frame → y-up art frame
    const limb = (col: string, w: number, hand?: 'hand' | 'shoe'): Drawer => (ctx, len) => {
      celFill(ctx, capsule(0, 0, len, 0, w), col, this.lw);
      if (hand === 'hand') { const p = new Path2D(); p.arc(len, 0, w * 0.62, 0, Math.PI * 2); celFill(ctx, p, skin, this.lw); }
      if (hand === 'shoe') { const p = new Path2D(); p.ellipse(len + w * 0.2, -w * 0.15, w * 0.85, w * 0.55, 0, 0, Math.PI * 2); celFill(ctx, p, '#2e2a26', this.lw); }
    };
    return {
      torso: (ctx) => {
        ctx.save(); upright(ctx);
        const r = b.torsoW * 0.35, torso = new Path2D();
        torso.roundRect(-b.torsoW / 2, 0, b.torsoW, b.torsoH, [r, r, r * 0.6, r * 0.6]);
        celFill(ctx, torso, shirt, this.lw, { x: b.torsoW * 0.55, y: -0.04, r: b.torsoH * 0.75 }, { x: -b.torsoW * 0.25, y: b.torsoH * 0.76, r: this.lw * 2.2 });
        // stubs where limbs came off (drawn in this upright torso frame: socket + last direction)
        for (const [bone, a] of this.stubs) {
          const s = this.rig.bones[bone].spec;
          if (bone === 'head') { drawBoneStub(ctx, 0, b.torsoH + 0.02, Math.PI / 2, b.limbW * 0.95, this.lw); continue; }
          drawBoneStub(ctx, -s.at[1], s.at[0], a + Math.PI / 2, bone.startsWith('thigh') ? b.limbW * 1.15 : b.limbW, this.lw);
        }
        ctx.restore();
      },
      head: (ctx) => {
        ctx.save(); upright(ctx);
        const cy = b.headR * 0.55 + 0.04, p = new Path2D(); p.arc(0, cy, b.headR, 0, Math.PI * 2);
        celFill(ctx, p, skin, this.lw, { x: b.headR * 0.7, y: cy - b.headR * 0.6, r: b.headR }, { x: -b.headR * 0.4, y: cy + b.headR * 0.45, r: this.lw * 2 });
        face(ctx, this.id, 0, cy, b.headR, this.lw);
        ctx.restore();
      },
      upperArmL: limb(skin, b.limbW), lowerArmL: limb(skin, b.limbW * 0.95, 'hand'),
      upperArmR: limb(skin, b.limbW), lowerArmR: limb(skin, b.limbW * 0.95, 'hand'),
      thighL: limb(PANTS, b.limbW * 1.15), calfL: limb(PANTS, b.limbW * 1.1, 'shoe'),
      thighR: limb(PANTS, b.limbW * 1.15), calfR: limb(PANTS, b.limbW * 1.1, 'shoe'),
    };
  }

  /* ---------- painted parts (zombie_body / zombie_arms sheets) ---------- */
  private makeArtDrawers(): Record<ZBone, Drawer> {
    const b = BUILD[this.id], brittle = this.id === 'brittle';
    const shirt = brittle ? ZSPR.shirtRibs : ZSPR.shirt, head = brittle ? ZSPR.headBrain : ZSPR.head;
    const arm = (mirror: boolean): Drawer => (ctx, len) => drawSprite(ctx, ZSPR.upperArm, len * 1.45, { x0: -len * 0.3, w: b.limbW * 1.55, mirror });
    const fore = (mirror: boolean): Drawer => (ctx, len) => drawSprite(ctx, ZSPR.forearm, len * 1.6, { x0: -len * 0.25, w: b.limbW * 1.9, mirror });
    const thigh = (mirror: boolean): Drawer => (ctx, len) => drawSprite(ctx, ZSPR.thigh, len * 1.1, { x0: -len * 0.05, w: b.limbW * 1.45, mirror });
    const calf = (mirror: boolean): Drawer => (ctx, len) => {
      drawSprite(ctx, ZSPR.foot, 0.12, { x0: len - 0.025, w: b.limbW * 1.7, mirror });
      drawSprite(ctx, ZSPR.shin, len * 1.05, { x0: -len * 0.03, w: b.limbW * 1.2, mirror });
    };
    return {
      torso: (ctx, len) => {
        drawSprite(ctx, ZSPR.shorts, 0.22, { x0: -0.13, w: b.torsoW * 1.12 });
        drawSprite(ctx, shirt, len + 0.02, { x0: -0.02, w: b.torsoW * 1.4 });
        for (const [bone, a] of this.stubs) {
          if (bone === 'head') { this.stubArt(ctx, len + 0.02, 0, 0, b.limbW * 1.1, true); continue; }
          const sp = this.rig.bones[bone].spec;
          this.stubArt(ctx, sp.at[0], sp.at[1], a, bone.startsWith('thigh') ? b.limbW * 1.35 : b.limbW * 1.15, false);
        }
      },
      head: (ctx, len) => drawSprite(ctx, head, len * 1.15, { x0: -len * 0.12, w: b.headR * 2.2 }),
      upperArmL: arm(false), lowerArmL: fore(false), upperArmR: arm(true), lowerArmR: fore(true),
      thighL: thigh(false), calfL: calf(false), thighR: thigh(true), calfR: calf(true),
    };
  }

  /** A bone stub with green slime where a limb was, drawn in the torso frame (x up the torso) */
  private stubArt(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, w: number, neck: boolean) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    if (!neck) drawSprite(ctx, ZSPR.stump, 0.045, { w });
    drawSprite(ctx, ZSPR.bone, 0.055, { x0: neck ? -0.005 : 0.03, w: w * 0.7 });
    // slime: a wet collar on the cut and one drip that hangs toward the seat
    ctx.fillStyle = CEL.slime; ctx.strokeStyle = CEL.ink; ctx.lineWidth = this.lw * 1.2;
    ctx.beginPath(); ctx.ellipse(neck ? 0.004 : 0.042, 0, w * 0.18, w * 0.52, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(neck ? -0.02 : 0.03, -w * 0.45, w * 0.12, w * 0.22, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Torn end of a flying painted limb: the bone pokes out of the pivot, in a ring of slime */
  private tornEndArt(ctx: CanvasRenderingContext2D) {
    const w = BUILD[this.id].limbW;
    drawSprite(ctx, ZSPR.bone, -0.05, { w: w * 0.8 });
    ctx.fillStyle = CEL.slime; ctx.strokeStyle = CEL.ink; ctx.lineWidth = this.lw * 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.2, w * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  /** The torn end of a flying limb: the other half of the bone, in a ring of slime */
  private tornEnd(ctx: CanvasRenderingContext2D, off: number) {
    const w = BUILD[this.id].limbW;
    ctx.fillStyle = BONE; ctx.strokeStyle = CEL.ink; ctx.lineWidth = this.lw * 1.6;
    ctx.beginPath(); ctx.rect(-w * 0.55 - off, -w * 0.18, w * 0.6, w * 0.36); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-w * 0.6 - off, 0, w * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CEL.slime; ctx.beginPath(); ctx.ellipse(-off, 0, w * 0.22, w * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  }
}
