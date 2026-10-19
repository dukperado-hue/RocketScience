/**
 * Damage flicker — a part's exact outline in solid white (the Metal Slug "hit flash").
 *
 * Canvas has no palette swap, so: draw the part once into a small offscreen canvas, then
 * fill it with 'source-in' white — only the part's own pixels stay. Cached per part + material.
 * The flight view draws it over the part, blinking, while the part is close to failing.
 */
import { drawPart } from '@/phases/assembly/ui/drawParts';
import type { FactoryPartDef } from '@/phases/assembly/model/catalog';
import type { Material } from '@/data/materials';

const cache = new Map<string, { c: HTMLCanvasElement; w: number; h: number }>();
const PX = 160;      // pixels along the longest side

export function silhouette(def: FactoryPartDef, mat: Material, key: string) {
  let s = cache.get(key);
  if (s) return s;
  const pad = 1.15, w = def.w * pad, h = def.h * pad, k = PX / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w * k)); c.height = Math.max(2, Math.ceil(h * k));
  const g = c.getContext('2d')!;
  g.translate(c.width / 2, c.height / 2); g.scale(k, -k);              // same y-up frame as the world
  drawPart(g, def, 1.6 / k, mat, null);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  s = { c, w, h };
  cache.set(key, s);
  return s;
}

/** Draw it in the part's own frame (y up), at alpha `a` */
export function drawSilhouette(ctx: CanvasRenderingContext2D, def: FactoryPartDef, mat: Material, key: string, a: number) {
  const s = silhouette(def, mat, key);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.scale(1, -1);                                                    // the canvas image is y-down
  ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
  ctx.restore();
}
