/**
 * Flight-view sky lantern: translucent paper lit from inside, fluttering in the wind.
 * (The factory keeps the flat drawing in drawParts.ts — this is the "on location" look.)
 *
 * Drawn in the part's own frame (metres, y up, mouth at y0 = −h/2, crown at y1 = +h/2):
 *
 *   halo      shadowBlur on one faint fill — the warm glow bleeding into the night air
 *   paper     translucent fill (the sky shows through an unlit lantern)
 *   fibre     a pre-rendered paper-fibre pattern, multiplied in at low alpha
 *   light     radial gradient from the flame up through the envelope, composited 'lighter'
 *             (and a 'screen' wash so the whole skin brightens, not just a hot spot)
 *   limb      darker edges: the paper is seen edge-on there, so less light gets through
 *   ribs      bamboo/paper ribs as backlit silhouettes, the red seam band glowing through
 *   flutter   every outline point rides two sine waves whose amplitude grows with wind
 *             speed, strongest at the open mouth (free edge), weakest at the glued crown
 */
import type { FactoryPartDef } from '@/phases/assembly/model/catalog';
import { CEL } from './celStyle';

let fibre: CanvasPattern | null | undefined;
function fibrePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (fibre !== undefined) return fibre;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {                       // long thin fibres, mostly vertical (mulberry paper)
    g.strokeStyle = `rgba(120,90,50,${0.08 + r() * 0.18})`; g.lineWidth = 0.4 + r() * 0.8;
    const x = r() * 64, y = r() * 64, a = Math.PI / 2 + (r() - 0.5) * 0.9, L = 6 + r() * 18;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  fibre = ctx.createPattern(c, 'repeat');
  return fibre;
}

export interface LanternLook {
  /** 0–1: how hot the air inside is (drives the inner light) */
  glow: number;
  /** seconds, for animation */
  t: number;
  /** wind at the lantern's altitude, m/s */
  wind: number;
  night: boolean;
  /** allow shadowBlur (switched off at low quality) */
  halo: boolean;
  /** cheap level of detail: no halo, clip or gradients */
  simple?: boolean;
}

/** Outline with flutter: returns flat [x, y, x, y, …] around the envelope */
function outline(w: number, h: number, look: LanternLook, phase: number): number[] {
  const y0 = -h / 2, y1 = h / 2, shoulder = y1 - w * 0.35, N = 9;
  const amp = w * (0.006 + 0.0045 * Math.min(10, look.wind));
  const fl = (u: number, side: number) => amp * (1 - 0.75 * u) * (Math.sin(look.t * (5 + look.wind * 0.6) + u * 7 + side * 1.9 + phase) + 0.5 * Math.sin(look.t * 11.3 + u * 13 + side));
  const pts: number[] = [];
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push(-(w * (0.4 + 0.1 * u)) + fl(u, -1), y0 + (shoulder - y0) * u); }     // left, mouth → shoulder
  for (let i = 1; i < 8; i++) { const a = Math.PI - (i / 8) * Math.PI; pts.push(Math.cos(a) * w * 0.5, shoulder + Math.sin(a) * (y1 - shoulder)); }  // crown
  for (let i = N; i >= 0; i--) { const u = i / N; pts.push(w * (0.4 + 0.1 * u) + fl(u, 1), y0 + (shoulder - y0) * u); }        // right, shoulder → mouth
  return pts;
}

function pathOf(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

export function drawLantern(ctx: CanvasRenderingContext2D, d: FactoryPartDef, lw: number, look: LanternLook, phase = 0) {
  const w = d.w, h = d.h, y0 = -h / 2, y1 = h / 2, k = Math.max(0, Math.min(1, look.glow));
  const cloth = d.id === 'envelope-cloth';
  const pts = outline(w, h, look, phase), path = pathOf(pts);
  if (look.simple) {
    // level of detail (an "Up!" cluster of hundreds, or a lantern a few pixels tall): one warm
    // translucent fill, the seam band and the outline — no halo blur, no clip, no gradients
    const base = cloth ? [243, 230, 201] : [251, 241, 220], hot = [255, 196, 120];
    const mix = (i: number) => (base[i] + (hot[i] - base[i]) * k) * (look.night ? 0.35 + 0.65 * k : 1) | 0;
    ctx.fillStyle = `rgba(${mix(0)},${mix(1)},${mix(2)},${cloth ? 0.88 : 0.8})`;
    ctx.fill(path);
    ctx.fillStyle = cloth ? 'rgba(200,80,60,0.6)' : 'rgba(225,60,50,0.55)';
    ctx.fillRect(-w * 0.47, y0 + h * 0.12, w * 0.94, h * 0.07);
    ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.4; ctx.stroke(path);
    return;
  }

  // 1. halo: one blurred fill, before anything else (shadowBlur is in device pixels)
  if (look.halo && k > 0.05) {
    ctx.save();
    ctx.shadowColor = `rgba(255,165,70,${(look.night ? 0.95 : 0.5) * k})`;
    ctx.shadowBlur = 18 + 42 * k;
    ctx.fillStyle = `rgba(255,190,110,${0.12 * k})`;
    ctx.fill(path);
    ctx.restore();
  }
  // 2. paper — translucent; unlit paper at night reads as a dark silhouette
  const base = cloth ? [243, 230, 201] : [251, 241, 220];
  const dim = look.night ? 0.35 + 0.65 * k : 1;
  ctx.fillStyle = `rgba(${base[0] * dim | 0},${base[1] * dim | 0},${base[2] * dim | 0},${cloth ? 0.85 : 0.62 + 0.25 * (1 - k)})`;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  // 3. fibre texture
  const pat = fibrePattern(ctx);
  if (pat) {
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.35;
    ctx.save(); ctx.scale(w / 90, h / 90); ctx.fillStyle = pat; ctx.fillRect(-60, -60, 120, 120); ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // 4. inner light: hot core above the flame, falling off toward the crown and the edges
  if (k > 0.02) {
    const flick = 0.92 + 0.08 * Math.sin(look.t * 23 + phase) * Math.sin(look.t * 7.1);
    const fy = y0 + h * 0.12;
    const g = ctx.createRadialGradient(0, fy, w * 0.04, 0, fy + h * 0.25, h * 0.95);
    g.addColorStop(0, `rgba(255,240,200,${0.7 * k * flick})`);
    g.addColorStop(0.3, `rgba(255,186,100,${0.5 * k * flick})`);
    g.addColorStop(0.75, `rgba(255,140,50,${0.28 * k})`);
    g.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(-w, y0 - h * 0.2, w * 2, h * 1.4);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255,160,70,${0.14 * k})`; ctx.fillRect(-w, y0, w * 2, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  // 5. limb darkening
  const lg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  lg.addColorStop(0, `rgba(120,60,20,${0.35 + 0.15 * k})`); lg.addColorStop(0.22, 'rgba(120,60,20,0)');
  lg.addColorStop(0.78, 'rgba(120,60,20,0)'); lg.addColorStop(1, `rgba(120,60,20,${0.35 + 0.15 * k})`);
  ctx.fillStyle = lg; ctx.fillRect(-w, y0, w * 2, h);
  // 6. ribs (follow the flutter) and the seam band
  ctx.strokeStyle = `rgba(110,62,25,${0.3 + 0.35 * k})`; ctx.lineWidth = lw * 1.1;
  const n = pts.length / 2, left = 0, right = n - 1;
  for (const f of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const lx = pts[(left + i) * 2], rx = pts[(right - i) * 2], yy = pts[(left + i) * 2 + 1];
      const x = (lx + rx) / 2 + ((rx - lx) / 2) * f;
      if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
    }
    ctx.lineTo(f * w * 0.2, y1); ctx.stroke();
  }
  ctx.fillStyle = cloth ? `rgba(200,80,60,${0.45 + 0.3 * k})` : `rgba(225,60,50,${0.38 + 0.35 * k})`;
  ctx.fillRect(-w, y0 + h * 0.12, w * 2, h * 0.07);
  ctx.restore();

  // 7. ink outline, lighter where the light leaks through
  ctx.strokeStyle = k > 0.3 && look.night ? 'rgba(80,40,15,0.85)' : CEL.ink;
  ctx.lineWidth = lw * 2;
  ctx.stroke(path);
  // the open mouth: a dark ellipse seen from slightly below
  ctx.fillStyle = `rgba(60,25,8,${0.5 - 0.3 * k})`;
  ctx.beginPath(); ctx.ellipse(0, y0, w * 0.4, Math.max(lw * 2, w * 0.035), 0, 0, Math.PI * 2); ctx.fill();
}

/** Charred, burning envelope: what is left after the paper catches */
export function drawBurntLantern(ctx: CanvasRenderingContext2D, d: FactoryPartDef, lw: number, t: number) {
  const w = d.w, h = d.h, y0 = -h / 2;
  const p = new Path2D();
  p.moveTo(-w * 0.4, y0);
  for (let i = 0; i <= 8; i++) { const x = -w * 0.45 + (i / 8) * w * 0.9; p.lineTo(x, y0 + h * (0.35 + 0.18 * Math.sin(i * 2.3 + t * 3))); }
  p.lineTo(w * 0.4, y0); p.closePath();
  ctx.fillStyle = 'rgba(30,22,18,0.9)'; ctx.fill(p);
  ctx.strokeStyle = 'rgba(255,120,40,0.85)'; ctx.lineWidth = lw * 2.5; ctx.stroke(p);    // glowing ember edge
}
