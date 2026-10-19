/**
 * Zombie body-part art for the bone rig (Early Access art pass).
 *
 * The parts were cut from the two painted sheets (zombie_body / zombie_arms) into
 * public/assets/zombie/rig/*.png. Each sprite knows two anchor points in its own pixels:
 *   a — the pivot (where the bone starts: shoulder, hip, knee, the seat for the torso)
 *   b — the tip   (where the bone ends: elbow, knee, ankle, the neck)
 * `drawSprite` maps a → (0, 0) and b → (len, 0) in the bone frame, so a sprite follows its
 * bone whatever the bone's length, and the same art serves every zombie build. Optional `w`
 * forces the width across the bone (fat / brittle builds); otherwise the scale is uniform.
 *
 * Images load lazily, once. Until every sprite is in (or in tests, with no DOM), `ready` is
 * false and the rig keeps drawing its vector cartoon.
 */
export interface Sprite { src: string; a: [number, number]; b: [number, number]; img?: HTMLImageElement }

const S = (name: string, a: [number, number], b: [number, number]): Sprite => ({ src: `assets/zombie/rig/${name}.png`, a, b });

export const ZSPR = {
  // torso: shirt hem → collar; shorts: crotch → waist (drawn on the torso bone)
  shirt: S('shirt', [92, 172], [92, 14]),
  shirtRibs: S('shirt_ribs', [92, 172], [92, 14]),
  shorts: S('shorts', [65, 122], [65, 10]),
  head: S('head', [54, 112], [54, 4]),
  headBrain: S('head_brain', [54, 112], [54, 4]),
  upperArm: S('upper_arm', [28, 14], [28, 146]),
  forearm: S('forearm', [10, 27], [134, 29]),
  thigh: S('thigh', [29, 8], [29, 127]),
  shin: S('shin', [24, 10], [24, 124]),
  foot: S('foot', [28, 6], [28, 96]),
  stump: S('stump', [22, 3], [22, 51]),
  bone: S('bone', [24, 40], [10, 6]),
};
export type SpriteId = keyof typeof ZSPR;

let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
const listeners: (() => void)[] = [];

/** Start loading (idempotent). Resolves the `ready` flag; never throws. */
export function loadZombieSprites(): void {
  if (state !== 'idle' || typeof Image === 'undefined') return;
  state = 'loading';
  const all = Object.values(ZSPR);
  let left = all.length;
  for (const s of all) {
    const img = new Image();
    img.onload = () => { s.img = img; if (--left === 0) { state = 'ready'; listeners.splice(0).forEach((f) => f()); } };
    img.onerror = () => { state = 'failed'; };
    img.src = s.src;
  }
}
export const spritesReady = () => state === 'ready';
export function onSpritesReady(f: () => void) { if (state === 'ready') f(); else listeners.push(f); }

/**
 * Draw sprite `s` along the current bone frame (x along the bone, y to the bone's left, y-up
 * world) so that anchor a sits at (x0, 0) and anchor b at (x0 + len, 0).
 * `w` (metres): width across the bone; `mirror`: flip across the bone axis (left vs right limbs).
 */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, len: number, opts: { x0?: number; w?: number; mirror?: boolean } = {}) {
  const img = s.img; if (!img) return;
  const du = s.b[0] - s.a[0], dv = s.b[1] - s.a[1], L = Math.hypot(du, dv) || 1;
  const k = len / L;
  // the art's extent across its own a→b axis, in px
  const across = Math.abs(du / L) * (img.naturalHeight || 1) + Math.abs(dv / L) * (img.naturalWidth || 1);
  const kw = opts.w ? opts.w / (across || 1) : k;
  ctx.save();
  ctx.translate(opts.x0 ?? 0, 0);
  if (opts.mirror) ctx.scale(1, -1);
  // image px (v down) → bone frame: rotate the art's a→b axis onto +x, flip v to y-up
  ctx.rotate(-Math.atan2(-dv, du));
  // after the rotation, the art's own axes: along = a→b, across = perpendicular
  const ax = du / L, ay = -dv / L;                              // the a→b direction in y-up image space
  // scale along and across the art axis separately (k along, kw across)
  ctx.transform(ax * ax * k + ay * ay * kw, ax * ay * (k - kw), ax * ay * (k - kw), ay * ay * k + ax * ax * kw, 0, 0);
  ctx.scale(1, -1);
  ctx.drawImage(img, -s.a[0], -s.a[1]);
  ctx.restore();
}
