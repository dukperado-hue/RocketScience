/**
 * Part drawings in local metres (+y up, origin at the part centre). The
 * caller applies position, rotation and flip; this draws the part's shape in
 * its material's colours so a bamboo tank and a carbon tank look different.
 * Placeholder art — swap any case for a sprite later.
 */
import { TETHER, type FactoryPartDef } from '../model/catalog';
import { MATERIALS, type Material } from '@/data/materials';
import type { Limb, ZombieId } from '@/payload/zombies';
import { drawZombie, drawZombieFace, drawJar } from '@/vfx/zombieArt';
import { modelSprites } from '@/assets/modelSprites';

const INK = '#1b2230';
const METAL = MATERIALS.steel;

/** J3: anything that can draw the seated rider in the seat frame (the flight view's bone rig) */
export interface RiderRig { draw(ctx: CanvasRenderingContext2D, lw: number): void }

export function drawPart(ctx: CanvasRenderingContext2D, d: FactoryPartDef, lw: number, mat: Material, rider: ZombieId | null = null, limbs?: ReadonlySet<Limb>, roll = 0, jarred = false, rig: RiderRig | null = null) {
  const w = d.w, h = d.h, x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  const fillFor = (m: Material) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, m.colorDark); g.addColorStop(0.38, m.color); g.addColorStop(1, m.colorDark);
    return g;
  };
  const poly = (pts: [number, number][], fill: string | CanvasGradient) => {
    ctx.fillStyle = fill; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  const box = (x: number, y: number, bw: number, bh: number, fill: string | CanvasGradient) => {
    ctx.fillStyle = fill; ctx.fillRect(x, y, bw, bh); ctx.strokeRect(x, y, bw, bh);
  };
  const texture = (x: number, y: number, bw: number, bh: number) => {
    // Bamboo shows its nodes; carbon fibre shows its weave
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.clip();
    if (mat.id === 'bamboo') {
      ctx.strokeStyle = mat.colorDark; ctx.lineWidth = lw * 1.2;
      const step = Math.max(0.12, Math.min(0.45, bh / 5));
      for (let yy = y + step; yy < y + bh; yy += step) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + bw, yy); ctx.stroke(); }
    } else if (mat.id === 'carbon') {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = lw;
      const s = Math.max(0.03, Math.min(bw, bh) / 8);
      for (let k = -bh; k < bw + bh; k += s) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + bh, y + bh); ctx.stroke(); }
    }
    ctx.restore();
  };
  const bell = (topW: number, botW: number, yTop: number, yBot: number) => {
    const g = ctx.createLinearGradient(-botW / 2, 0, botW / 2, 0);
    g.addColorStop(0, '#4a515c'); g.addColorStop(0.45, '#c3cad3'); g.addColorStop(1, '#3d434d');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-topW / 2, yTop); ctx.lineTo(topW / 2, yTop);
    ctx.quadraticCurveTo(botW * 0.2, (yTop + yBot) / 2, botW / 2, yBot);
    ctx.lineTo(-botW / 2, yBot);
    ctx.quadraticCurveTo(-botW * 0.2, (yTop + yBot) / 2, -topW / 2, yTop);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };

  switch (d.shape) {
    case 'chair': {
      const dark = mat.colorDark;
      box(-0.4, -0.65, 0.08, 0.45, dark); box(0.32, -0.65, 0.08, 0.45, dark);
      box(-0.4, -0.2, 0.8, 0.1, mat.color);
      box(-0.4, -0.1, 0.07, 0.75, mat.color); box(0.33, -0.1, 0.07, 0.75, mat.color);
      // the lantern cord on the backrest (v0.22.1): rings tie on at its loop
      ctx.save(); ctx.strokeStyle = 'rgba(120,90,40,0.85)'; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(0, 0.6); ctx.lineTo(0, 0.65 + TETHER - 0.03); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0.65 + TETHER - 0.015, 0.015, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      box(-0.4, 0.55, 0.8, 0.1, mat.color);
      for (const yy of [0.1, 0.3]) box(-0.33, yy, 0.66, 0.05, dark);
      if (rider && jarred) { ctx.save(); ctx.translate(0, -0.1); drawJar(ctx, rider, 0.36, lw, performance.now() / 1000); ctx.restore(); }
      else if (rider) { ctx.save(); ctx.translate(0, -0.1); if (rig) rig.draw(ctx, lw); else drawZombie(ctx, rider, lw, limbs); ctx.restore(); }
      box(-0.4, -0.2, 0.8, 0.1, mat.color);         // seat front edge in front of the legs
      break;
    }
    case 'pod': {
      poly([[x0, y0], [x1, y0], [w * 0.28, y1], [-w * 0.28, y1]], fillFor(mat));
      ctx.fillStyle = '#2a4a6b'; ctx.beginPath(); ctx.arc(0, h * 0.02, w * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (rider) {
        ctx.save(); ctx.beginPath(); ctx.arc(0, h * 0.02, w * 0.12, 0, Math.PI * 2); ctx.clip();
        ctx.translate(0, h * 0.02);
        if (jarred) { const r = w * 0.12; ctx.translate(0, -r * 0.85); drawJar(ctx, rider, r * 1.7, lw * 0.6, performance.now() / 1000); }
        else drawZombieFace(ctx, rider, w * 0.12, lw);
        ctx.restore();
        ctx.beginPath(); ctx.arc(0, h * 0.02, w * 0.12, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'nose': case 'nose-ogive': case 'fairing': {
      const k = d.shape === 'nose' ? 0.55 : 0.85;
      ctx.fillStyle = fillFor(mat); ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0, y0 + h * k, -w * 0.12, y1, 0, y1);
      ctx.bezierCurveTo(w * 0.12, y1, x1, y0 + h * k, x1, y0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (d.shape === 'fairing') { ctx.setLineDash([lw * 4, lw * 3]); ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(0, y1 - h * 0.05); ctx.stroke(); ctx.setLineDash([]); }
      break;
    }
    // Fins and wings: root on the LEFT edge (x0). Flip to use on the other side.
    case 'fin': poly([[x0, y1], [x1, y0 + h * 0.35], [x1, y0], [x0, y0]], fillFor(mat)); break;
    case 'fin-swept': poly([[x0, y1], [x1, y0 + h * 0.15], [x1, y0], [x0, y0 + h * 0.3]], fillFor(mat)); break;
    case 'fin-delta': poly([[x0, y1], [x1, y0], [x0, y0]], fillFor(mat)); break;
    case 'wing': poly([[x0, y1], [x1, h * 0.3], [x1, -h * 0.3], [x0, y0]], fillFor(mat)); break;
    case 'wing-delta': poly([[x0, y1], [x1, y0 + h * 0.08], [x1, y0], [x0, y0]], fillFor(mat)); break;
    case 'tank': {
      box(x0, y0, w, h, fillFor(mat)); texture(x0, y0, w, h);
      ctx.fillStyle = 'rgba(27,34,48,0.55)';
      ctx.fillRect(x0, y0 + h * 0.06, w, Math.min(0.06, h * 0.05)); ctx.fillRect(x0, y1 - h * 0.06 - Math.min(0.06, h * 0.05), w, Math.min(0.06, h * 0.05));
      break;
    }
    case 'tank-radial': {
      const r = w / 2;
      ctx.fillStyle = fillFor(mat); ctx.beginPath();
      ctx.moveTo(x0, y1 - r); ctx.arc(0, y1 - r, r, Math.PI, 0, true); ctx.lineTo(x1, y0 + r); ctx.arc(0, y0 + r, r, 0, Math.PI, true); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillRect(x0, -0.04, w * 0.15, 0.08);  // mount on the root side
      break;
    }
    case 'tank-adapter': case 'adapter':
      poly([[x0, y0], [x1, y0], [w / 4, y1], [-w / 4, y1]], fillFor(mat)); break;
    case 'tube': case 'cast-motor': {
      box(x0, y0 + h * 0.08, w, h * 0.92, fillFor(mat)); texture(x0, y0 + h * 0.08, w, h * 0.92);
      ctx.fillStyle = d.shape === 'tube' ? '#b8402f' : '#2f5fa3';
      ctx.fillRect(x0, y0 + h * 0.62, w, h * 0.08);
      box(-w * 0.32, y0, w * 0.64, h * 0.08, '#3a3f47');
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(0, y1 + h * 0.06); ctx.stroke();
      break;
    }
    case 'bangfai': {
      box(x0, y0 + 0.08, w, h - 0.18, fillFor(mat)); texture(x0, y0 + 0.08, w, h - 0.18);
      ctx.fillStyle = 'rgba(80,50,20,0.55)';
      for (let yy = y0 + 0.25; yy < y1 - 0.15; yy += 0.28) ctx.fillRect(x0, yy, w, 0.035);   // rattan lashing
      box(-w * 0.35, y0, w * 0.7, 0.08, '#3a3f47');
      poly([[x0, y1 - 0.1], [x1, y1 - 0.1], [x1, y1], [x0, y1]], '#c4473a');
      break;
    }
    case 'srb': {
      box(x0, y0 + h * 0.06, w, h * 0.94, fillFor(mat)); texture(x0, y0 + h * 0.06, w, h * 0.94);
      ctx.fillStyle = '#e8eaee';
      for (const f of [0.2, 0.5, 0.8]) ctx.fillRect(x0, y0 + h * f, w, h * 0.03);
      bell(w * 0.4, w * 0.8, y0 + h * 0.06, y0 - h * 0.02);
      break;
    }
    case 'engine-small': case 'engine': case 'engine-turbo': {
      const plateH = h * 0.22;
      box(x0 + w * 0.1, y1 - plateH, w * 0.8, plateH, fillFor(METAL));
      if (d.shape === 'engine-turbo') box(x1 - w * 0.32, y1 - plateH - h * 0.22, w * 0.22, h * 0.22, '#7a838e');
      ctx.fillStyle = '#5b6370'; ctx.fillRect(-w * 0.12, y1 - plateH - h * 0.14, w * 0.24, h * 0.14);
      bell(w * 0.24, w * 0.84, y1 - plateH - h * 0.14, y0);
      break;
    }
    case 'engine-vac': {
      box(-w * 0.3, y1 - h * 0.15, w * 0.6, h * 0.15, fillFor(METAL));
      bell(w * 0.18, w * 0.98, y1 - h * 0.15, y0);
      break;
    }
    case 'truss': {
      ctx.strokeStyle = mat.colorDark; ctx.lineWidth = lw * 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.moveTo(x1, y0); ctx.lineTo(x1, y1);
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = y0 + (h * i) / n, b = y0 + (h * (i + 1)) / n;
        ctx.moveTo(x0, a); ctx.lineTo(x1, b); ctx.moveTo(x0, a); ctx.lineTo(x1, a);
      }
      ctx.moveTo(x0, y1); ctx.lineTo(x1, y1);
      ctx.stroke();
      break;
    }
    case 'decoupler': {
      box(x0, y0, w, h, fillFor(mat));
      ctx.setLineDash([lw * 3, lw * 2]); ctx.strokeStyle = '#d93644';
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'decoupler-radial': {
      poly([[x0, y1], [x1, y1 - h * 0.25], [x1, y0 + h * 0.25], [x0, y0]], fillFor(mat));
      ctx.strokeStyle = '#d93644'; ctx.beginPath(); ctx.moveTo(x1 - w * 0.15, y1 - h * 0.25); ctx.lineTo(x1 - w * 0.15, y0 + h * 0.25); ctx.stroke();
      break;
    }
    case 'stick': {
      box(x0, y0, w, h, mat.color);
      ctx.beginPath();
      for (let yy = y0 + 0.45; yy < y1; yy += 0.45) { ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); }
      ctx.stroke();
      break;
    }
    case 'shield': {
      ctx.fillStyle = fillFor(mat); ctx.beginPath();
      ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.quadraticCurveTo(x1, y0 - h * 0.6, 0, y0 - h * 0.2); ctx.quadraticCurveTo(x0, y0 - h * 0.6, x0, y1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'payload': {
      // 3D model baked to a sprite (see assets/modelSprites.ts); vector stand-in while it bakes
      const m = ctx.getTransform();
      const px = d.h * Math.hypot(m.c, m.d);
      const sprite = modelSprites.get(d, px, roll);
      if (sprite) {
        ctx.save(); ctx.scale(1, -1);                 // our frame is y-up; images are y-down
        ctx.drawImage(sprite, x0, -y1, w, h);
        ctx.restore();
      } else drawPayloadFallback(ctx, d, lw, poly, box);
      if (rider && d.payload3d?.placeholder === 'sputnik') {
        const r = w * 0.12, cy = h * 0.11;
        ctx.save(); ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2); ctx.clip();
        ctx.translate(0, cy);
        if (jarred) { ctx.translate(0, -r * 0.85); drawJar(ctx, rider, r * 1.7, lw * 0.6, performance.now() / 1000); }
        else drawZombieFace(ctx, rider, r, lw);
        ctx.restore();
        ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'chute': {
      // Packed canopy: canister + orange cap
      box(x0 + w * 0.1, y0, w * 0.8, h * 0.6, fillFor(METAL));
      ctx.fillStyle = '#ff8a1f'; ctx.beginPath();
      ctx.moveTo(x0 + w * 0.1, y0 + h * 0.6); ctx.quadraticCurveTo(0, y1 + h * 0.2, x1 - w * 0.1, y0 + h * 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'chute-radial': {
      box(x0, y0, w, h, fillFor(METAL));
      ctx.fillStyle = '#ff8a1f'; ctx.fillRect(x0 + w * 0.2, y1 - h * 0.35, w * 0.6, h * 0.3); ctx.strokeRect(x0 + w * 0.2, y1 - h * 0.35, w * 0.6, h * 0.3);
      break;
    }
    case 'envelope': {
      // paper lantern: slightly wider at the top, rounded crown, open mouth; ribs and a seam band
      const cloth = d.id === 'envelope-cloth';
      const base = cloth ? '#f3e6c9' : '#fbf1dc', dark = cloth ? '#d9c39a' : '#e8d3a6';
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, dark); g.addColorStop(0.4, base); g.addColorStop(1, dark);
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(-w * 0.4, y0);
      ctx.lineTo(-w * 0.5, y1 - w * 0.35);
      ctx.quadraticCurveTo(-w * 0.5, y1, 0, y1);
      ctx.quadraticCurveTo(w * 0.5, y1, w * 0.5, y1 - w * 0.35);
      ctx.lineTo(w * 0.4, y0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(160,120,60,0.45)'; ctx.lineWidth = lw * 0.8;
      for (const fx of [-0.25, 0, 0.25]) { ctx.beginPath(); ctx.moveTo(fx * w * 0.8, y0); ctx.lineTo(fx * w, y1); ctx.stroke(); }
      ctx.fillStyle = cloth ? 'rgba(200,80,60,0.55)' : 'rgba(225,70,60,0.5)';
      ctx.fillRect(x0, y0 + h * 0.12, w, h * 0.07);
      ctx.restore();
      // the crown's tether string (the next lantern of an "Up!" cluster ties on at its loop)
      ctx.save(); ctx.strokeStyle = 'rgba(120,90,40,0.8)'; ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(0, y1 + TETHER - 0.03); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, y1 + TETHER - 0.015, 0.015, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      break;
    }
    case 'lantern-ring': {
      ctx.fillStyle = mat.color;
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2, Math.max(h / 2, w * 0.06), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#071a2b'; ctx.globalAlpha = 0.25;
      ctx.beginPath(); const irx = w / 2 - lw * 3, iry = Math.max(h / 2, w * 0.06) - lw * 2;
      if (irx > 0 && iry > 0) { ctx.ellipse(0, 0, irx, iry, 0, 0, Math.PI * 2); ctx.fill(); }   // too small to show when zoomed far out
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(x0 + w * 0.1, 0); ctx.lineTo(x1 - w * 0.1, 0); ctx.stroke();      // the crossed wire
      break;
    }
    case 'heater': {
      const k = d.heater?.kind;
      if (k === 'flare') { box(x0, y0, w, h, '#e2483d'); box(x0, y1 - h * 0.18, w, h * 0.18, '#2b2f36'); }
      else if (k === 'candle') { box(x0, y0, w, h, '#f6f1e3'); ctx.fillStyle = '#c0c4cc'; ctx.fillRect(x0, y0, w, h * 0.3); }
      else { box(x0, y0, w, h, '#f1e6c8'); ctx.strokeStyle = 'rgba(120,90,40,0.6)'; for (const fx of [-0.25, 0, 0.25]) { ctx.beginPath(); ctx.moveTo(fx * w, y0); ctx.lineTo(fx * w, y1); ctx.stroke(); } }
      break;
    }
    case 'kite': {
      poly([[0, y1], [w * 0.33, h * 0.1], [0, -h * 0.25], [-w * 0.33, h * 0.1]], mat.id === 'paper' ? '#d94f4f' : mat.color);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(0, y0); ctx.moveTo(-w * 0.33, h * 0.1); ctx.lineTo(w * 0.33, h * 0.1); ctx.stroke();
      break;
    }
  }
}

/** Draw a part centred in a small canvas (inventory cards, drag ghost). */
export function drawThumb(canvas: HTMLCanvasElement, d: FactoryPartDef, mat: Material, size = 56, rider: ZombieId | null = d.crew ? 'standard' : null) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const k = (size * 0.84) / Math.max(d.w, d.h);
  ctx.translate(size / 2, size / 2);
  ctx.scale(k, -k);
  drawPart(ctx, d, 1.1 / k, mat, rider);
}

/** Thumbnail of a zombie on its own (inventory payload cards) */
export function drawZombieThumb(canvas: HTMLCanvasElement, id: ZombieId, size = 44) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = size * dpr; canvas.height = size * dpr;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const k = (size * 0.84) / 0.95;
  ctx.translate(size / 2, size * 0.66);
  ctx.scale(k, -k);
  drawZombie(ctx, id, 0.5 / k);   // thinner ink at thumbnail size
}

/** Flat cel drawings of the payload placeholders — thumbnails, and while the 3D sprite bakes */
function drawPayloadFallback(ctx: CanvasRenderingContext2D, d: FactoryPartDef, lw: number,
  poly: (pts: [number, number][], fill: string | CanvasGradient) => void, box: (x: number, y: number, w: number, h: number, fill: string | CanvasGradient) => void) {
  const w = d.w, h = d.h;
  const kind = d.payload3d?.placeholder;
  if (kind === 'sputnik') {
    ctx.lineWidth = lw;
    for (const sx of [-1, 1]) for (const k of [0.6, 1]) { ctx.beginPath(); ctx.moveTo(sx * w * 0.12, -h * 0.1); ctx.lineTo(sx * w * 0.5 * k, -h * 0.5); ctx.stroke(); }
    ctx.lineWidth = lw * 1.3;
    ctx.fillStyle = '#d9dee6'; ctx.beginPath(); ctx.arc(0, h * 0.11, w * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-w * 0.12, h * 0.22, w * 0.07, 0, Math.PI * 2); ctx.fill();
    box(-w * 0.22, -h * 0.5, w * 0.44, h * 0.1, '#2a3140');
  } else if (kind === 'satellite') {
    for (const sx of [-1, 1]) { box(sx > 0 ? w * 0.2 : -w * 0.5, -h * 0.2, w * 0.3, h * 0.5, '#2c4f9e'); }
    box(-w * 0.19, -h * 0.28, w * 0.38, h * 0.55, '#d8a83a');
    poly([[-w * 0.16, h * 0.3], [w * 0.16, h * 0.3], [0, h * 0.48]], '#d9dee6');
    box(-w * 0.13, -h * 0.5, w * 0.26, h * 0.12, '#2a3140');
  } else {
    for (const sx of [-1, 1]) box(sx > 0 ? w * 0.36 : -w * 0.48, -h * 0.25, w * 0.12, h * 0.55, '#2c4f9e');
    box(-w * 0.34, -h * 0.2, w * 0.68, h * 0.66, '#d9dee6');
    box(-w * 0.4, -h * 0.5, w * 0.8, h * 0.3, '#d8a83a');
    poly([[-w * 0.34, h * 0.46], [w * 0.34, h * 0.46], [w * 0.3, h * 0.5], [-w * 0.34, h * 0.5]], '#2a3140');
  }
}
