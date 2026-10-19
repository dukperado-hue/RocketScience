/**
 * The build area: a pannable, zoomable grid where parts are dragged, snapped
 * to attach nodes, flipped, and inspected.
 *
 * Input
 *   - drag a part from the inventory or the canvas → snaps to the nearest
 *     compatible free node, else lands on the 5 cm grid (as a loose part)
 *   - while holding a part: R rotates, H flips left↔right, V flips top↔bottom
 *   - drop a placed part back on the inventory → removed
 *   - drag empty space / right-drag → pan · wheel or pinch → zoom
 */
import { PART, materialFor } from '../model/catalog';
import {
  riderOf,
  analyse, findSnap, freeNodes, hitTest, mirrored, nodesCompatibleFor, orient, partBounds, snapToGrid, worldHull,
  type PlacedPart, type SnapResult,
} from '../model/vehicle';
import type { VehicleStore } from '../store';
import { drawPart, drawThumb } from './drawParts';
import { modelSprites } from '@/assets/modelSprites';

interface Drag {
  defId: string;
  rot: PlacedPart['rot'];
  fx: boolean;
  fy: boolean;
  mat?: string;
  uid: number | null;          // null = new part from the inventory
  offX: number; offY: number;  // pointer → part centre, world metres
  sx: number; sy: number;      // pointer, client px
  overCanvas: boolean;
  overTrash: boolean;
  snap: SnapResult | null;
  pos: { x: number; y: number } | null;
}

// Sky background from the first version: soft light-blue radial gradient,
// with translucent blue graph-paper rulings in three weights on top
const SKY = { top: '#e7f0ff', edge: '#d9e4f5' };
const C = {
  bg: SKY.edge, fine: 'rgba(40,80,160,0.045)', grid: 'rgba(40,80,160,0.085)', gridMajor: 'rgba(40,80,160,0.18)', ink: '#1b2230', muted: '#8a94a6',
  thrust: '#f08c2e', bad: '#d93644', good: '#1f9d5a', warn: '#e0a100', select: '#1f5fd1', yellow: '#f5c518',
};
const FONT = '"Inter", "Sarabun", system-ui, sans-serif';

export class FactoryCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0;
  cam = { x: 0, y: 0, zoom: 140 };   // zoom = px per metre
  mirror = false;
  /** Colour parts by structural safety factor */
  stress = false;
  private drag: Drag | null = null;
  private pending: { uid: number; sx: number; sy: number } | null = null;
  private pan: { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; zoom: number } | null = null;
  private ghost: HTMLCanvasElement;
  private raf = 0;
  private lastW = 0;
  private cleanup: (() => void)[] = [];

  constructor(private wrap: HTMLElement, private store: VehicleStore, private trash: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', 'Build area. Drag parts here; they snap to attachment points.');
    wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ghost = document.createElement('canvas');
    this.ghost.className = 'drag-ghost';
    document.body.appendChild(this.ghost);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(wrap);
    this.cleanup.push(() => ro.disconnect(), () => this.ghost.remove(), this.store.on(() => this.invalidate()), modelSprites.onReady(() => this.invalidate()) as () => void);

    this.listen(this.canvas, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    this.listen(window, 'pointermove', (e) => this.onMove(e as PointerEvent));
    this.listen(window, 'pointerup', (e) => this.onUp(e as PointerEvent));
    this.listen(window, 'pointercancel', (e) => this.onUp(e as PointerEvent));
    this.listen(this.canvas, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen(this.canvas, 'contextmenu', (e) => e.preventDefault());
    this.resize();
    if (store.parts.length) this.frame();
  }

  dispose() { cancelAnimationFrame(this.raf); this.cleanup.forEach((f) => f()); this.canvas.remove(); }

  private listen(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) {
    t.addEventListener(type, fn, opts);
    this.cleanup.push(() => t.removeEventListener(type, fn, opts));
  }

  /* ---------- Camera ---------- */

  private resize() {
    const r = this.wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.canvas.style.width = `${r.width}px`; this.canvas.style.height = `${r.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.lastW && Math.abs(r.width - this.lastW) / this.lastW > 0.3 && this.store.parts.length) this.frame();
    this.lastW = r.width;
    this.invalidate();
  }

  toScreen(x: number, y: number) { return { x: this.w / 2 + (x - this.cam.x) * this.cam.zoom, y: this.h / 2 - (y - this.cam.y) * this.cam.zoom }; }
  toWorld(sx: number, sy: number) { return { x: this.cam.x + (sx - this.w / 2) / this.cam.zoom, y: this.cam.y - (sy - this.h / 2) / this.cam.zoom }; }
  private local(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  }

  frame() {
    const ps = this.store.parts;
    if (!ps.length) { this.cam = { x: 0, y: 0, zoom: 140 }; this.invalidate(); return; }
    const bs = ps.map(partBounds);
    const x0 = Math.min(...bs.map((b) => b.x - b.w / 2)), x1 = Math.max(...bs.map((b) => b.x + b.w / 2));
    const y0 = Math.min(...bs.map((b) => b.y - b.h / 2)), y1 = Math.max(...bs.map((b) => b.y + b.h / 2));
    const zoom = Math.min((this.w * 0.7) / Math.max(0.5, x1 - x0), (this.h * 0.75) / Math.max(0.5, y1 - y0));
    this.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom: clamp(zoom, 8, 600) };
    this.invalidate();
  }

  zoomBy(f: number, sx = this.w / 2, sy = this.h / 2) {
    const before = this.toWorld(sx, sy);
    this.cam.zoom = clamp(this.cam.zoom * f, 8, 600);
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
    this.invalidate();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = this.local(e);
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }

  /* ---------- Dragging ---------- */

  beginNewDrag(defId: string, e: PointerEvent, mat?: string) {
    this.drag = { defId, rot: 0, fx: false, fy: false, mat, uid: null, offX: 0, offY: 0, sx: e.clientX, sy: e.clientY, overCanvas: false, overTrash: false, snap: null, pos: null };
    drawThumb(this.ghost, PART[defId], materialFor(PART[defId], mat), 64);
    this.updateDrag(e);
  }

  rotateHeld(): boolean {
    if (!this.drag) return false;
    this.drag.rot = ((this.drag.rot + 1) % 4) as PlacedPart['rot'];
    this.updateDrag({ clientX: this.drag.sx, clientY: this.drag.sy });
    return true;
  }

  flipHeld(axis: 'x' | 'y'): boolean {
    if (!this.drag) return false;
    if (axis === 'x') this.drag.fx = !this.drag.fx; else this.drag.fy = !this.drag.fy;
    this.updateDrag({ clientX: this.drag.sx, clientY: this.drag.sy });
    return true;
  }

  cancelDrag() {
    this.drag = null; this.pending = null;
    this.ghost.style.display = 'none';
    this.trash.classList.remove('trash-hot');
    document.body.classList.remove('factory-dragging');
    this.store.setPreview(null);
  }

  get dragging() { return this.drag !== null; }

  private onDown(e: PointerEvent) {
    const p = this.local(e);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: p.x, y: p.y });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.cam.zoom };
        this.pending = null; this.pan = null;
        return;
      }
    }
    const wpt = this.toWorld(p.x, p.y);
    const hit = e.button === 0 ? [...this.store.parts].reverse().find((q) => hitTest(q, wpt.x, wpt.y, 3 / this.cam.zoom)) : undefined;
    if (hit) {
      this.pending = { uid: hit.uid, sx: e.clientX, sy: e.clientY };
      this.store.select(hit.uid);
    } else {
      this.pan = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
    }
  }

  private onMove(e: PointerEvent) {
    if (this.touches.has(e.pointerId)) {
      const p = this.local(e);
      this.touches.set(e.pointerId, { x: p.x, y: p.y });
      if (this.pinch && this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomBy((this.pinch.zoom * (d / this.pinch.d)) / this.cam.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
    }
    if (this.pending && Math.hypot(e.clientX - this.pending.sx, e.clientY - this.pending.sy) > 5) {
      const part = this.store.get(this.pending.uid)!;
      const start = this.local({ clientX: this.pending.sx, clientY: this.pending.sy });
      const w0 = this.toWorld(start.x, start.y);
      this.drag = {
        defId: part.defId, rot: part.rot, fx: !!part.fx, fy: !!part.fy, mat: part.mat, uid: part.uid,
        offX: part.x - w0.x, offY: part.y - w0.y, sx: e.clientX, sy: e.clientY, overCanvas: true, overTrash: false, snap: null, pos: null,
      };
      drawThumb(this.ghost, PART[part.defId], materialFor(PART[part.defId], part.mat), 64, riderOf(part));
      this.pending = null;
    }
    if (this.drag) { this.updateDrag(e); return; }
    if (this.pan) {
      const dx = e.clientX - this.pan.sx, dy = e.clientY - this.pan.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.pan.moved = true;
      this.cam.x = this.pan.cx - dx / this.cam.zoom;
      this.cam.y = this.pan.cy + dy / this.cam.zoom;
      this.invalidate();
    } else {
      const p = this.local(e);
      if (p.inside) {
        const wpt = this.toWorld(p.x, p.y);
        this.canvas.style.cursor = this.store.parts.some((q) => hitTest(q, wpt.x, wpt.y)) ? 'grab' : 'default';
      }
    }
  }

  private held(): Omit<PlacedPart, 'uid'> | null {
    const d = this.drag;
    if (!d?.pos) return null;
    return { defId: d.defId, x: d.pos.x, y: d.pos.y, rot: d.rot, ...(d.fx ? { fx: true } : {}), ...(d.fy ? { fy: true } : {}), ...(d.mat ? { mat: d.mat } : {}) };
  }

  private updateDrag(e: { clientX: number; clientY: number }) {
    const d = this.drag!;
    d.sx = e.clientX; d.sy = e.clientY;
    const p = this.local(e);
    const tr = this.trash.getBoundingClientRect();
    d.overTrash = e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom;
    d.overCanvas = p.inside && !d.overTrash;
    this.trash.classList.toggle('trash-hot', d.overTrash && d.uid !== null);
    document.body.classList.add('factory-dragging');

    this.ghost.style.display = d.overCanvas ? 'none' : 'block';
    this.ghost.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 32}px) rotate(${-d.rot * 90}deg) scale(${d.fx ? -1 : 1}, ${d.fy ? -1 : 1})`;

    if (d.overCanvas) {
      const wpt = this.toWorld(p.x, p.y);
      const want = { x: wpt.x + d.offX, y: wpt.y + d.offY };
      d.snap = findSnap(this.store.parts, d.defId, { rot: d.rot, fx: d.fx, fy: d.fy }, want.x, want.y, 26 / this.cam.zoom, d.uid ?? -1);
      d.pos = d.snap ? { x: d.snap.x, y: d.snap.y } : { x: snapToGrid(want.x), y: snapToGrid(want.y) };
      this.store.setPreview(this.previewParts());
    } else {
      d.snap = null; d.pos = null;
      this.store.setPreview(d.uid !== null ? this.store.parts.filter((q) => q.uid !== d.uid) : null);
    }
    this.invalidate();
  }

  private previewParts(): PlacedPart[] {
    const d = this.drag!;
    const h = this.held();
    if (!h) return this.store.parts;
    const others = this.store.parts.filter((q) => q.uid !== d.uid);
    const me: PlacedPart = { ...h, uid: d.uid ?? 1e6 };
    const out = [...others, me];
    const m = this.mirrorCopy(me, others);
    if (m) out.push({ ...m, uid: 1e6 + 1 });
    return out;
  }

  /** Mirror twin across the vehicle centreline — a true reflection, so fins come out handed correctly */
  private mirrorCopy(me: PlacedPart, others: PlacedPart[]): Omit<PlacedPart, 'uid'> | null {
    const d = this.drag;
    if (!this.mirror || !d || d.uid !== null || !d.snap) return null;
    const root = analyse(others).root;
    if (!root) return null;
    const m = mirrored(me, root.x);
    if (Math.abs(m.x - me.x) < 0.01) return null;
    const s = findSnap([...others, me], m.defId, { rot: m.rot, fx: m.fx, fy: m.fy }, m.x, m.y, 0.03);
    return s ? { ...m, x: s.x, y: s.y } : null;
  }

  private onUp(e: PointerEvent) {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    const d = this.drag;
    if (d) {
      this.updateDrag(e);
      const h = this.held();
      if (d.overTrash && d.uid !== null) {
        this.store.remove(d.uid);
      } else if (d.overCanvas && h) {
        const others = this.store.parts.filter((q) => q.uid !== d.uid);
        if (d.uid !== null) {
          this.store.place(d.uid, h);
        } else {
          const twin = this.mirrorCopy({ ...h, uid: -1 }, others);
          const [added] = this.store.add(h, ...(twin ? [twin] : []));
          this.store.select(added.uid);
        }
      }
      this.cancelDrag();
    } else if (this.pan && !this.pan.moved && e.button === 0) {
      this.store.select(null);
    }
    this.pending = null;
    this.pan = null;
  }

  /* ---------- Rendering ---------- */

  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  private render() {
    const { ctx, w, h } = this;
    const z = this.cam.zoom;
    const sky = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, Math.max(w, h) * 0.75);
    sky.addColorStop(0, SKY.top); sky.addColorStop(1, SKY.edge);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    this.drawGrid();

    const d = this.drag;
    const parts = this.store.parts.filter((p) => !d || p.uid !== d.uid);
    const st = analyse(this.store.preview ?? this.store.parts);
    const tel = this.store.telemetry;

    if (st.active.length) {
      const yb = Math.min(...st.active.map((p) => { const b = partBounds(p); return b.y - b.h / 2; }));
      const s = this.toScreen(0, yb);
      ctx.strokeStyle = C.muted; ctx.setLineDash([8, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, s.y + 0.5); ctx.lineTo(w, s.y + 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.muted; ctx.font = `12px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('Launch pad', 12, s.y - 6);
    }

    for (const uid of tel.blocked) {
      const p = this.store.parts.find((q) => q.uid === uid);
      if (!p || (d && p.uid === d.uid)) continue;
      const def = PART[p.defId];
      const len = Math.max(1, def.h * 2);
      const [ox, oy] = orient(p, 0, -def.h / 2 - len / 2);
      const swap = p.rot % 2 === 1;
      const pw = swap ? len : def.w * 0.8, ph = swap ? def.w * 0.8 : len;
      const s0 = this.toScreen(p.x + ox - pw / 2, p.y + oy + ph / 2);
      ctx.fillStyle = 'rgba(217,54,68,0.14)';
      ctx.fillRect(s0.x, s0.y, pw * z, ph * z);
    }

    for (const p of parts) {
      const loose = !st.overlapping.has(p.uid) && !st.connected.has(p.uid);
      const alpha = st.overlapping.has(p.uid) ? 0.3 : loose ? 0.5 : 1;
      this.drawPlaced(p, alpha);
      if (this.stress && !loose && !st.overlapping.has(p.uid)) this.stressTint(p);
      if (st.overlapping.has(p.uid) || loose) this.outline(p, st.overlapping.has(p.uid) ? C.bad : C.muted, true);
      if (p.uid === this.store.selected) this.outline(p, C.select, false);
    }

    const free = freeNodes(parts);
    for (const n of free) {
      const s = this.toScreen(n.x, n.y);
      const ok = !d || nodesCompatibleFor(d.defId, n.node.size);
      ctx.fillStyle = d ? (ok ? C.select : 'rgba(138,148,166,0.3)') : 'rgba(27,34,48,0.35)';
      ctx.beginPath(); ctx.arc(s.x, s.y, d && ok ? 4.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    }

    const hld = this.held();
    if (d && hld) {
      const me: PlacedPart = { ...hld, uid: -1 };
      this.drawPlaced(me, 0.92);
      this.outline(me, d.snap ? C.good : C.select, !d.snap);
      if (d.snap) {
        const s = this.toScreen(d.snap.to.x, d.snap.to.y);
        ctx.strokeStyle = C.good; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
      }
      const twin = this.mirrorCopy(me, this.store.parts.filter((q) => q.uid !== d.uid));
      if (twin) { const t = { ...twin, uid: -2 }; this.drawPlaced(t, 0.55); this.outline(t, C.good, true); }
    }

    this.drawForces();
  }

  private drawGrid() {
    const { ctx, w, h } = this;
    const z = this.cam.zoom;
    const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
    const step = steps.find((st) => st * z >= 18) ?? 10;     // minor ruling, ≥18 px apart
    const tl = this.toWorld(0, 0), br = this.toWorld(w, h);
    const line = (vertical: boolean, v: number, color: string) => {
      ctx.strokeStyle = color;
      const p = this.toScreen(vertical ? v : 0, vertical ? 0 : v);
      const c = Math.round(vertical ? p.x : p.y) + 0.5;
      ctx.beginPath();
      if (vertical) { ctx.moveTo(c, 0); ctx.lineTo(c, h); } else { ctx.moveTo(0, c); ctx.lineTo(w, c); }
      ctx.stroke();
    };
    ctx.lineWidth = 1;
    // Fine rulings (fifths) only when they're far enough apart to read as texture
    const fine = step / 5;
    if (fine * z >= 6) {
      for (let x = Math.floor(tl.x / fine) * fine; x <= br.x; x += fine) line(true, x, C.fine);
      for (let y = Math.floor(br.y / fine) * fine; y <= tl.y; y += fine) line(false, y, C.fine);
    }
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) line(true, x, Math.abs(Math.round(x / step) % 5) === 0 ? C.gridMajor : C.grid);
    for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) line(false, y, Math.abs(Math.round(y / step) % 5) === 0 ? C.gridMajor : C.grid);

    // Scale bar = one major square
    ctx.fillStyle = C.muted; ctx.strokeStyle = C.muted; ctx.font = `12px ${FONT}`; ctx.textAlign = 'left';
    const bar = step * 5, px = bar * z;
    ctx.beginPath(); ctx.moveTo(14, h - 16); ctx.lineTo(14 + px, h - 16); ctx.moveTo(14, h - 20); ctx.lineTo(14, h - 12); ctx.moveTo(14 + px, h - 20); ctx.lineTo(14 + px, h - 12); ctx.stroke();
    ctx.fillText(bar >= 1 ? `${bar} m` : `${Math.round(bar * 100)} cm`, 20 + px, h - 12);
  }

  private drawPlaced(p: PlacedPart, alpha: number) {
    const { ctx } = this;
    const def = PART[p.defId];
    const s = this.toScreen(p.x, p.y);
    const z = this.cam.zoom;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(-p.rot * Math.PI / 2);
    ctx.scale(z, -z);
    ctx.scale(p.fx ? -1 : 1, p.fy ? -1 : 1);
    drawPart(ctx, def, 1.3 / z, materialFor(def, p.mat), riderOf(p));
    ctx.restore();
  }

  /** Stress view: tint by safety factor and label the weak ones */
  private stressTint(p: PlacedPart) {
    const i = this.store.telemetry.integrity.get(p.uid);
    if (!i) return;
    const sf = i.safetyFactor;
    const col = sf < 1 ? 'rgba(217,54,68,0.5)' : sf < 1.5 ? 'rgba(224,161,0,0.45)' : 'rgba(31,157,90,0.28)';
    const { ctx } = this;
    ctx.fillStyle = col;
    for (const r of worldHull(p)) {
      const a = this.toScreen(r.x - r.w / 2, r.y + r.h / 2);
      ctx.fillRect(a.x, a.y, r.w * this.cam.zoom, r.h * this.cam.zoom);
    }
    if (sf < 1.5) {
      const s = this.toScreen(p.x, p.y);
      ctx.fillStyle = sf < 1 ? C.bad : '#8a6200';
      ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(`×${sf.toFixed(2)}`, s.x, s.y + 4);
    }
  }

  private outline(p: PlacedPart, color: string, dashed: boolean) {
    const { ctx } = this;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    if (dashed) ctx.setLineDash([5, 4]);
    for (const r of worldHull(p)) {
      const a = this.toScreen(r.x - r.w / 2, r.y + r.h / 2);
      ctx.strokeRect(a.x - 2, a.y - 2, r.w * this.cam.zoom + 4, r.h * this.cam.zoom + 4);
    }
    ctx.setLineDash([]);
  }

  private drawForces() {
    const { ctx } = this;
    const t = this.store.telemetry;
    if (t.cot && t.thrustDir && t.com) {
      const c = this.toScreen(t.cot.x, t.cot.y);
      const far = this.toScreen(t.cot.x + t.thrustDir.x * 60, t.cot.y + t.thrustDir.y * 60);
      ctx.strokeStyle = 'rgba(240,140,46,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(far.x, far.y); ctx.stroke(); ctx.setLineDash([]);
      const len = clamp(t.twr, 0.2, 3) * 46;
      const ang = Math.atan2(-t.thrustDir.y, t.thrustDir.x);
      const tip = { x: c.x + Math.cos(ang) * len, y: c.y + Math.sin(ang) * len };
      ctx.strokeStyle = C.thrust; ctx.fillStyle = C.thrust; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - 11 * Math.cos(ang - 0.45), tip.y - 11 * Math.sin(ang - 0.45));
      ctx.lineTo(tip.x - 11 * Math.cos(ang + 0.45), tip.y - 11 * Math.sin(ang + 0.45));
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('CoT', c.x + 10, c.y + 16);
    }
    if (t.com) {
      const s = this.toScreen(t.com.x, t.com.y);
      const r = 8;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? C.ink : C.yellow;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, r, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = `600 12px ${FONT}`; ctx.textAlign = 'right';
      ctx.fillText('CoM', s.x - 12, s.y - 8);
    }
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
