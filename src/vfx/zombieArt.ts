/**
 * Cartoon zombie drawings in local metres (+y up, origin at the seat centre),
 * cel-shaded. Front view, sitting. Also exports single limbs, which the gore
 * particles draw as they tumble away.
 */
import { ZOMBIES, type Limb, type ZombieId } from '@/payload/zombies';
import { CEL, celFill, shade } from './celStyle';

const ALL: Limb[] = ['left arm', 'right arm', 'left leg', 'right leg', 'head'];
export const BONE = '#f6f1e3', BONE_SHADE = '#d9cfb4';

/**
 * Optional painted overlays (Gemini art). If a file exists it is drawn instead of the
 * vector version, scaled to the same size; until then the vector art below is used.
 */
const ART: Record<'boneStub' | 'jar', HTMLImageElement | null> = (() => {
  if (typeof Image === 'undefined') return { boneStub: null, jar: null };
  const load = (src: string) => { const i = new Image(); i.src = src; return i; };
  return { boneStub: load('assets/zombie/fx_bone_stub.png'), jar: load('assets/zombie/zombie_jarred.png') };
})();
const ready = (i: HTMLImageElement | null): i is HTMLImageElement => !!i && i.complete && i.naturalWidth > 0;

/** Draw a raster in the y-up art frame, centred at (x, y), `h` metres tall, rotated by `a` */
function drawArt(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, h: number, a = 0) {
  const w = (h * img.naturalWidth) / img.naturalHeight;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, -1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * Cartoon bone stub: a short white shaft ending in a two-knob joint, sticking out of a
 * ragged ring of green slime with one drip. PG-13: bone and slime, never red.
 * (x, y) = joint socket on the body; `a` = direction the limb used to point (rad).
 */
export function drawBoneStub(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, w: number, lw: number) {
  if (ready(ART.boneStub)) { drawArt(ctx, ART.boneStub, x + Math.cos(a) * w * 0.9, y + Math.sin(a) * w * 0.9, w * 2.6, a - Math.PI / 2); return; }
  const L = w * 1.35, r = w * 0.36;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  // slime collar: wobbly ring + one drip hanging "down" in world space
  const collar = new Path2D();
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI * 2, rr = w * (0.62 + 0.1 * Math.sin(t * 3 + 1));
    const px = Math.cos(t) * rr * 0.55, py = Math.sin(t) * rr;
    i ? collar.lineTo(px, py) : collar.moveTo(px, py);
  }
  collar.closePath();
  celFill(ctx, collar, CEL.slime, lw);
  // shaft
  ctx.fillStyle = BONE; ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.8;
  ctx.beginPath(); ctx.rect(0, -r * 0.55, L, r * 1.1); ctx.fill(); ctx.stroke();
  // epiphysis: two knobs
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(L + r * 0.35, k * r * 0.62, r * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = BONE; ctx.fillRect(L - r * 0.2, -r * 0.5, r * 0.8, r);          // hide the seam
  ctx.strokeStyle = BONE_SHADE; ctx.lineWidth = lw * 1.2;
  ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.2); ctx.lineTo(L - r * 0.3, -r * 0.2); ctx.stroke();   // shading line
  ctx.restore();
  // drip, always downward
  ctx.fillStyle = CEL.slime; ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.4;
  ctx.beginPath(); ctx.moveTo(x - w * 0.12, y - w * 0.3);
  ctx.quadraticCurveTo(x - w * 0.05, y - w * 1.0, x, y - w * 1.05);
  ctx.quadraticCurveTo(x + w * 0.1, y - w * 0.95, x + w * 0.12, y - w * 0.3);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

/**
 * The jarred zombie: a glass jar with a screw lid, packed with compressed green zombie;
 * two eyeballs squished flat against the glass, slime smeared on the inside, a label.
 * Origin at the jar's base centre, `h` metres tall.
 */
export function drawJar(ctx: CanvasRenderingContext2D, id: ZombieId, h: number, lw: number, t = 0) {
  if (ready(ART.jar)) { drawArt(ctx, ART.jar, 0, h / 2, h); return; }
  const w = h * 0.72, z = ZOMBIES[id];
  const body = new Path2D(); body.roundRect(-w / 2, 0, w, h * 0.82, [w * 0.12, w * 0.12, w * 0.2, w * 0.2]);
  // contents: the compressed zombie
  ctx.save(); ctx.clip(body);
  ctx.fillStyle = z.skin; ctx.fillRect(-w / 2, 0, w, h * 0.74);
  ctx.fillStyle = shade(z.skin, 0.22);
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(-w * 0.3 + i * w * 0.15, h * (0.15 + (i % 2) * 0.3), w * 0.12, h * 0.07, i, 0, Math.PI * 2); ctx.fill(); }
  // folded shirt scrap and a squashed hand
  ctx.fillStyle = id === 'fat' ? '#c9785a' : id === 'brittle' ? '#8a7f6a' : '#5f7fa8';
  ctx.beginPath(); ctx.ellipse(w * 0.15, h * 0.12, w * 0.24, h * 0.08, -0.3, 0, Math.PI * 2); ctx.fill();
  // eyeballs pressed against the glass (flattened ellipses, pupils looking at us)
  for (const [ex, ey, er] of [[-w * 0.17, h * 0.47, w * 0.17], [w * 0.16, h * 0.44, w * 0.14]] as const) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.5;
    ctx.beginPath(); ctx.ellipse(ex, ey, er * 1.15, er * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CEL.ink; ctx.beginPath(); ctx.arc(ex + er * 0.15 * Math.sin(t * 0.7), ey - er * 0.1, er * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + er * 0.3, ey + er * 0.15, er * 0.12, 0, Math.PI * 2); ctx.fill();
  }
  // slime smears on the inside of the glass
  ctx.fillStyle = CEL.slime; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.ellipse(-w * 0.3, h * 0.66, w * 0.16, h * 0.05, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w * 0.28, h * 0.72); ctx.quadraticCurveTo(w * 0.33, h * 0.5, w * 0.3, h * 0.38); ctx.lineTo(w * 0.36, h * 0.38); ctx.quadraticCurveTo(w * 0.4, h * 0.55, w * 0.38, h * 0.72); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  // glass: tint, reflections, outline
  ctx.fillStyle = 'rgba(200,235,255,0.18)'; ctx.fill(body);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw * 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-w * 0.36, h * 0.12); ctx.lineTo(-w * 0.36, h * 0.66); ctx.stroke();
  ctx.lineWidth = lw * 1.2; ctx.beginPath(); ctx.moveTo(-w * 0.28, h * 0.6); ctx.lineTo(-w * 0.28, h * 0.7); ctx.stroke();
  ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 2.4; ctx.stroke(body);
  // lid
  const lid = new Path2D(); lid.roundRect(-w * 0.44, h * 0.8, w * 0.88, h * 0.17, w * 0.04);
  celFill(ctx, lid, '#c94f3d', lw, { x: w * 0.3, y: h * 0.8, r: h * 0.12 }, { x: -w * 0.25, y: h * 0.92, r: lw * 2 });
  ctx.strokeStyle = shade('#c94f3d', 0.35); ctx.lineWidth = lw;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.11, h * 0.82); ctx.lineTo(i * w * 0.11, h * 0.95); ctx.stroke(); }
  // label
  const lab = new Path2D(); lab.rect(-w * 0.3, h * 0.04, w * 0.6, h * 0.13);
  ctx.fillStyle = '#fff7df'; ctx.fill(lab); ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw; ctx.stroke(lab);
  ctx.save(); ctx.scale(1, -1); ctx.fillStyle = CEL.ink; ctx.font = `bold ${h * 0.08}px Inter, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('ZOMBIE', 0, -h * 0.075); ctx.restore();
}

/** Where each limb joins the body, and which way it pointed — for the bone stubs */
function socket(limb: Exclude<Limb, 'head'>, b: Build): { x: number; y: number; a: number } {
  const sx = b.torsoW / 2;
  switch (limb) {
    case 'left arm': return { x: -sx, y: 0.26, a: Math.atan2(0.12, -0.16) };
    case 'right arm': return { x: sx, y: 0.26, a: Math.atan2(0.12, 0.16) };
    case 'left leg': return { x: -sx * 0.55, y: -0.04, a: Math.atan2(-0.38, -sx * 0.15) };
    case 'right leg': return { x: sx * 0.55, y: -0.04, a: Math.atan2(-0.38, sx * 0.15) };
  }
}

export interface Build { torsoW: number; torsoH: number; headR: number; limbW: number }
export const BUILD: Record<ZombieId, Build> = {
  standard: { torsoW: 0.3, torsoH: 0.42, headR: 0.11, limbW: 0.07 },
  fat: { torsoW: 0.44, torsoH: 0.44, headR: 0.12, limbW: 0.09 },
  brittle: { torsoW: 0.24, torsoH: 0.4, headR: 0.1, limbW: 0.055 },
};

export const capsule = (x0: number, y0: number, x1: number, y1: number, w: number) => {
  const p = new Path2D();
  const a = Math.atan2(y1 - y0, x1 - x0), n = a + Math.PI / 2, r = w / 2;
  p.moveTo(x0 + Math.cos(n) * r, y0 + Math.sin(n) * r);
  p.lineTo(x1 + Math.cos(n) * r, y1 + Math.sin(n) * r);
  p.arc(x1, y1, r, n, n - Math.PI, true);
  p.lineTo(x0 - Math.cos(n) * r, y0 - Math.sin(n) * r);
  p.arc(x0, y0, r, n + Math.PI, n, true);
  p.closePath();
  return p;
};

/** Limb geometry relative to the seat centre (sitting pose, arms reaching forward/out) */
function limbPath(limb: Limb, b: Build, cx = 0, cy = 0): Path2D {
  const sx = b.torsoW / 2;
  switch (limb) {
    case 'left arm': return capsule(cx - sx, cy + 0.26, cx - sx - 0.16, cy + 0.38, b.limbW);
    case 'right arm': return capsule(cx + sx, cy + 0.26, cx + sx + 0.16, cy + 0.38, b.limbW);
    case 'left leg': return capsule(cx - sx * 0.55, cy - 0.04, cx - sx * 0.7, cy - 0.42, b.limbW * 1.15);
    case 'right leg': return capsule(cx + sx * 0.55, cy - 0.04, cx + sx * 0.7, cy - 0.42, b.limbW * 1.15);
    case 'head': { const p = new Path2D(); p.arc(cx, cy + b.torsoH + b.headR * 0.55, b.headR, 0, Math.PI * 2); return p; }
  }
}

/** Face in the y-up art frame: eyes above, stitched grin below */
export function face(ctx: CanvasRenderingContext2D, id: ZombieId, x: number, y: number, r: number, lw: number) {
  // Mismatched eyes, stitched grin
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = CEL.ink;
  ctx.lineWidth = lw * 1.4;
  for (const [ex, er] of [[-0.38, 0.3], [0.36, 0.22]] as const) {
    ctx.beginPath(); ctx.arc(x + ex * r, y + 0.15 * r, er * r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CEL.ink;
    ctx.beginPath(); ctx.arc(x + ex * r + er * r * 0.25, y + 0.1 * r, er * r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
  }
  ctx.beginPath();
  ctx.moveTo(x - 0.45 * r, y - 0.4 * r);
  for (let i = 1; i <= 6; i++) ctx.lineTo(x - 0.45 * r + (0.9 * r * i) / 6, y - 0.4 * r + (i % 2 ? -0.1 : 0.05) * r);
  ctx.stroke();
  if (id === 'brittle') {
    // a worm, waving from the forehead
    ctx.strokeStyle = CEL.wormDark; ctx.lineWidth = lw * 3.2;
    ctx.beginPath(); ctx.moveTo(x + 0.2 * r, y + 0.75 * r); ctx.quadraticCurveTo(x + 0.6 * r, y + 1.25 * r, x + 0.25 * r, y + 1.45 * r); ctx.stroke();
    ctx.strokeStyle = CEL.worm; ctx.lineWidth = lw * 1.8; ctx.stroke();
  }
}

/** Seated zombie, origin at the seat top centre. `limbs` = what's still attached. */
export function drawZombie(ctx: CanvasRenderingContext2D, id: ZombieId, lw: number, limbs: ReadonlySet<Limb> = new Set(ALL)) {
  const z = ZOMBIES[id], b = BUILD[id];
  const skin = z.skin, shirt = id === 'fat' ? '#c9785a' : id === 'brittle' ? '#8a7f6a' : '#5f7fa8';
  // Legs behind the torso
  for (const l of ['left leg', 'right leg'] as Limb[]) if (limbs.has(l)) celFill(ctx, limbPath(l, b), '#4b5568', lw);
  // Torso (shirt)
  const torso = new Path2D();
  const r = b.torsoW * 0.35;
  torso.roundRect(-b.torsoW / 2, -0.06, b.torsoW, b.torsoH, [r, r, r * 0.6, r * 0.6]);
  celFill(ctx, torso, shirt, lw, { x: b.torsoW * 0.55, y: -0.1, r: b.torsoH * 0.75 }, { x: -b.torsoW * 0.25, y: b.torsoH * 0.7, r: lw * 2.2 });
  if (id === 'fat') { ctx.strokeStyle = shade(shirt, 0.45); ctx.lineWidth = lw * 1.3; ctx.beginPath(); ctx.arc(0, 0.12, b.torsoW * 0.28, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  // Arms, or a bone stub where one has gone
  for (const l of ['left arm', 'right arm'] as const) {
    if (limbs.has(l)) celFill(ctx, limbPath(l, b), skin, lw, null, null);
    else { const k = socket(l, b); drawBoneStub(ctx, k.x, k.y, k.a, b.limbW, lw); }
  }
  // Leg stubs poke out in front of the torso
  for (const l of ['left leg', 'right leg'] as const) if (!limbs.has(l)) { const k = socket(l, b); drawBoneStub(ctx, k.x, k.y, k.a, b.limbW * 1.15, lw); }
  if (limbs.has('head')) {
    const hy = b.torsoH + b.headR * 0.55;
    celFill(ctx, limbPath('head', b), skin, lw, { x: b.headR * 0.7, y: hy - b.headR * 0.6, r: b.headR }, { x: -b.headR * 0.4, y: hy + b.headR * 0.45, r: lw * 2 });
    face(ctx, id, 0, hy, b.headR, lw);
  } else {
    // neck: a vertebra stub straight up
    drawBoneStub(ctx, 0, b.torsoH - 0.04, Math.PI / 2, b.limbW * 0.95, lw);
  }
}

/** A zombie face filling a circle of radius r at the origin (the pod window) */
export function drawZombieFace(ctx: CanvasRenderingContext2D, id: ZombieId, r: number, lw: number) {
  const p = new Path2D(); p.arc(0, -r * 0.1, r * 0.82, 0, Math.PI * 2);
  celFill(ctx, p, ZOMBIES[id].skin, lw * 0.6, { x: r * 0.5, y: -r * 0.6, r: r * 0.8 }, null);
  face(ctx, id, 0, -r * 0.1, r * 0.82, lw * 0.6);
}

/** One loose limb, centred on the origin — for gore particles */
export function drawLimb(ctx: CanvasRenderingContext2D, id: ZombieId, limb: Limb, lw: number) {
  const b = BUILD[id];
  if (limb === 'head') {
    const p = new Path2D(); p.arc(0, 0, b.headR, 0, Math.PI * 2);
    celFill(ctx, p, ZOMBIES[id].skin, lw, { x: b.headR * 0.7, y: -b.headR * 0.6, r: b.headR }, null);
    face(ctx, id, 0, 0, b.headR, lw);
    return;
  }
  const leg = limb.endsWith('leg');
  const len = leg ? 0.38 : 0.2, w = b.limbW * (leg ? 1.15 : 1);
  // the torn end shows the other half of the bone: a short shaft with a knob, in slime
  ctx.fillStyle = BONE; ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.6;
  ctx.beginPath(); ctx.rect(-len / 2 - w * 0.55, -w * 0.18, w * 0.6, w * 0.36); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(-len / 2 - w * 0.6, 0, w * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  celFill(ctx, capsule(-len / 2, 0, len / 2, 0, w), leg ? '#4b5568' : ZOMBIES[id].skin, lw);
  ctx.fillStyle = CEL.slime;
  ctx.beginPath(); ctx.ellipse(-len / 2, 0, w * 0.22, w * 0.5, 0, 0, Math.PI * 2); ctx.fill();
}
