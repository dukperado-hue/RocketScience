/**
 * Orbital map (Phase 3 scaffold) — a top-down view of the flight plane.
 *
 * Earth-centred, north up: X = x, Y = y + R. Draws Earth, the atmosphere and the
 * Kármán line, the predicted conic from `orbit/kepler.ts` (cyan if it stays up,
 * orange-dashed where it meets the ground), Ap/Pe markers with time-to-go, the
 * vehicle (attitude + prograde arrow) and tracked debris.
 *
 * Same interface the Three.js map will implement later (frame(flight, dt), zoom),
 * so LaunchPhase doesn't change when the 3D globe replaces this.
 */
import { R_EARTH, type Flight } from '@/physics/flight2d';
import { orbitPath, stateAt, timeTo } from '@/orbit/kepler';
import type { ManeuverPlan } from '@/orbit/maneuver';

const STARS = Array.from({ length: 260 }, (_, i) => ({ x: Math.abs(Math.sin(i * 91.7) * 1e4) % 1, y: Math.abs(Math.sin(i * 47.3) * 1e4) % 1, r: 0.4 + (i % 4) * 0.3 }));
const INK = '#1b2230';

export const fmtDur = (s: number) => {
  if (!Number.isFinite(s)) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`;
};
const fmtKm = (m: number) => (Number.isFinite(m) ? `${(m / 1000).toFixed(m < 1e6 ? 0 : 0)} km` : '∞');

export class MapView {
  zoom = 1;
  private ctx: CanvasRenderingContext2D;
  private w = 1; private h = 1; private dpr = 1;
  private ro: ResizeObserver;
  private fit = R_EARTH * 1.4;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }
  dispose() { this.ro.disconnect(); }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
  }

  /** Planned burn to preview (dotted); never alters the flight */
  plan: ManeuverPlan | null = null;

  frame(f: Flight, realDt: number) {
    // the canvas may have just been un-hidden (3D → 2D): pick up its real size before drawing
    if (Math.abs(this.canvas.clientWidth - this.w) > 0.5 || Math.abs(this.canvas.clientHeight - this.h) > 0.5) this.resize();
    const { ctx, w, h } = this;
    const v = f.vehicle;
    const o = f.orbit;
    // Auto-fit: the whole orbit (capped for escapes) or at least Earth + the vehicle
    const r = v.r;
    const pa = this.plan?.after;
    const want = Math.min(R_EARTH * 12, Math.max(R_EARTH * 1.25, r * 1.2, o.bound ? o.rA * 1.12 : r * 1.6, pa && pa.bound ? pa.rA * 1.12 : 0));
    this.fit += (want - this.fit) * (1 - Math.exp(-realDt * 2));
    const k = (Math.min(w, h) * 0.46) / this.fit * this.zoom;
    const cx = w / 2, cy = h / 2;
    const S = (X: number, Y: number): [number, number] => [cx + X * k, cy - Y * k];

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#060a17'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    for (const s of STARS) { ctx.globalAlpha = 0.35 + 0.4 * ((s.x * 7) % 1); ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;

    // Atmosphere (to 100 km) and Earth
    ctx.fillStyle = 'rgba(110,170,255,0.18)';
    ctx.beginPath(); ctx.arc(cx, cy, (R_EARTH + 100_000) * k, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx - R_EARTH * k * 0.35, cy - R_EARTH * k * 0.35, R_EARTH * k * 0.1, cx, cy, R_EARTH * k);
    g.addColorStop(0, '#5d9cf0'); g.addColorStop(1, '#2457b8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R_EARTH * k, 0, Math.PI * 2); ctx.fill();
    // cel continents (decorative)
    ctx.fillStyle = '#7fb069';
    for (const [a, rr, s] of [[0.2, 0.55, 0.32], [2.1, 0.4, 0.25], [3.6, 0.62, 0.2], [4.9, 0.3, 0.28]] as const) {
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R_EARTH * k * rr, cy - Math.sin(a) * R_EARTH * k * rr, R_EARTH * k * s, R_EARTH * k * s * 0.6, a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, R_EARTH * k, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(160,200,255,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, (R_EARTH + 100_000) * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);

    // Launch pad
    const [px, py] = S(0, R_EARTH);
    ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(px, py - 7); ctx.lineTo(px - 5, py + 2); ctx.lineTo(px + 5, py + 2); ctx.closePath(); ctx.fill();

    // Predicted path
    if (!v.landed && f.airborne) {
      const path = orbitPath(o, R_EARTH, 360);
      if (path.pts.length > 1) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = path.hitsGround ? '#ff9a3c' : '#4fd8ff';
        if (path.hitsGround) ctx.setLineDash([8, 6]);
        ctx.beginPath();
        path.pts.forEach((p, i) => { const [x, y] = S(p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke(); ctx.setLineDash([]);
        if (path.hitsGround) { const end = path.pts[path.pts.length - 1]; const [ex, ey] = S(end.x, end.y); this.cross(ex, ey, '#ff5a3c'); }
      }
      // Apsides
      const pe = stateAt(o, 0).r;
      if (o.rP > R_EARTH * 0.2) this.marker(...S(pe.x, pe.y), 'Pe', `${fmtKm(o.rP - R_EARTH)} · ${fmtDur(timeTo(o, 'peri'))}`, o.rP < R_EARTH + 140_000 ? '#ff9a3c' : '#9fe6ff');
      if (o.bound) { const ap = stateAt(o, Math.PI).r; this.marker(...S(ap.x, ap.y), 'Ap', `${fmtKm(o.rA - R_EARTH)} · ${fmtDur(timeTo(o, 'apo'))}`, '#ffe08a'); }
    }

    // Planned burn: dotted conic from the node, the node itself, and the new apsides
    const pl = this.plan;
    if (pl && !v.landed && f.airborne) {
      const a = pl.after;
      const path = orbitPath(a, R_EARTH, 360);
      ctx.save();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff7ad9'; ctx.setLineDash([0.1, 6]); ctx.lineCap = 'round';
      ctx.beginPath();
      path.pts.forEach((p, i) => { const [x, y] = S(p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
      if (path.hitsGround) { const end = path.pts[path.pts.length - 1]; const [ex, ey] = S(end.x, end.y); this.cross(ex, ey, '#ff7ad9'); }
      const [nx, ny] = S(pl.rNode.x, pl.rNode.y);
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ff7ad9'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
      const peN = stateAt(a, 0).r;
      if (a.rP > R_EARTH * 0.2) this.marker(...S(peN.x, peN.y), 'new Pe', fmtKm(a.rP - R_EARTH), '#ff7ad9', 24);
      if (a.bound && a.rA < R_EARTH * 40) { const apN = stateAt(a, Math.PI).r; this.marker(...S(apN.x, apN.y), 'new Ap', fmtKm(a.rA - R_EARTH), '#ff7ad9', 24); }
    }

    // Spacewalker: its own conic (green) and a dot
    if (f.eva && !f.eva.ended) {
      const eo = orbitPath(f.eva.orbit, R_EARTH, 240);
      ctx.strokeStyle = '#7cff8a'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.85;
      ctx.beginPath(); eo.pts.forEach((p, i) => { const [x, y] = S(p.x, p.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
      ctx.globalAlpha = 1;
      const [ex, ey] = S(f.eva.body.x, f.eva.body.y + R_EARTH);
      ctx.fillStyle = '#7cff8a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ex, ey + 12, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Debris and vehicle
    for (const b of f.bodies) {
      if (b === v) continue;
      const [x, y] = S(b.x, b.y + R_EARTH);
      ctx.fillStyle = b.landed ? '#6b7280' : '#c7cdd6'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    const [vx, vy] = S(v.x, v.y + R_EARTH);
    // prograde arrow
    const sp = Math.hypot(v.vx, v.vy);
    if (sp > 1) {
      const ux = v.vx / sp, uy = v.vy / sp;
      ctx.strokeStyle = '#7CFF8A'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + ux * 26, vy - uy * 26); ctx.stroke();
    }
    // vehicle: a triangle along its nose direction (body +y in world = (−sin θ, cos θ))
    const nx = -Math.sin(v.th), ny = Math.cos(v.th);
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(Math.atan2(nx, ny));
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Legend
    ctx.font = '12px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`Map · ${f.orbitClass} · ${f.missionPhase} · ${f.propagationMode === 'rails' ? 'on rails (Kepler)' : 'full physics'} · e = ${o.e.toFixed(3)}`, 16, h - 84);
  }

  private marker(x: number, y: number, tag: string, text: string, col: string, dy = 0) {
    const { ctx } = this;
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    y += dy;   // planned-orbit labels sit below the current ones so they never overlap
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    const label = `${tag} ${text}`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(x + 9, y - 10, tw + 10, 20);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x + 9, y - 10, tw + 10, 20);
    ctx.fillStyle = INK; ctx.fillText(label, x + 14, y + 4);
  }

  private cross(x: number, y: number, col: string) {
    const { ctx } = this;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
  }
}
